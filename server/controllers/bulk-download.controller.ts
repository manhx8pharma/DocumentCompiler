import { Request, Response } from 'express';
import { eq, and, gte, lte, like, inArray, desc } from 'drizzle-orm';
import { db } from '@db';
import { documents, templates, documentFields, templateFields } from '@shared/schema';
import archiver from 'archiver';
import path from 'path';
import { sanitizeFilename } from '../utils/filename-encoder';
import { documentGeneratorCache } from '../services/document-generator-cache.service';
import * as XLSX from 'xlsx';

interface BulkDownloadFilters {
  searchQuery?: string;
  templateUuids?: string[];
  dateFrom?: string;
  dateTo?: string;
  dateType?: 'created' | 'updated';
  archived?: boolean;
}

interface BulkDownloadRequest {
  filters: BulkDownloadFilters;
}

export async function previewBulkDownload(req: Request, res: Response) {
  try {
    const filters: BulkDownloadFilters = req.body.filters || {};
    
    console.log('Preview bulk download filters:', filters);

    const conditions = [];
    
    if (filters.searchQuery && filters.searchQuery.trim()) {
      conditions.push(like(documents.name, `%${filters.searchQuery.trim()}%`));
    }

    if (filters.templateUuids && filters.templateUuids.length > 0) {
      conditions.push(inArray(documents.templateUuid, filters.templateUuids));
    }

    if (filters.dateFrom) {
      const dateField = filters.dateType === 'updated' ? documents.updatedAt : documents.createdAt;
      conditions.push(gte(dateField, new Date(filters.dateFrom)));
    }

    if (filters.dateTo) {
      const dateField = filters.dateType === 'updated' ? documents.updatedAt : documents.createdAt;
      const endDate = new Date(filters.dateTo);
      endDate.setHours(23, 59, 59, 999);
      conditions.push(lte(dateField, endDate));
    }

    if (typeof filters.archived === 'boolean') {
      conditions.push(eq(documents.archived, filters.archived));
    } else {
      conditions.push(eq(documents.archived, false));
    }

    const documentsToDownload = await db
      .select({
        uuid: documents.uuid,
        name: documents.name,
        createdAt: documents.createdAt,
        updatedAt: documents.updatedAt,
        templateName: templates.name,
        templateUuid: documents.templateUuid,
        templateFilePath: templates.filePath,
      })
      .from(documents)
      .leftJoin(templates, eq(documents.templateUuid, templates.uuid))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(documents.createdAt));

    console.log(`Found ${documentsToDownload.length} documents for bulk download`);

    const validDocuments = documentsToDownload.map(doc => ({
      ...doc,
      canGenerate: !!doc.templateFilePath,
      estimatedSize: 50000,
    }));

    const groupedByTemplate = validDocuments.reduce((acc, doc) => {
      const templateKey = doc.templateUuid || 'unknown';
      if (!acc[templateKey]) {
        acc[templateKey] = {
          templateName: doc.templateName || 'Unknown Template',
          templateUuid: doc.templateUuid,
          documents: [],
          count: 0,
        };
      }
      acc[templateKey].documents.push(doc);
      acc[templateKey].count++;
      return acc;
    }, {} as any);

    const canGenerate = validDocuments.filter(d => d.canGenerate).length;
    const orphaned = validDocuments.filter(d => !d.canGenerate).length;

    res.json({
      preview: true,
      totalDocuments: validDocuments.length,
      canGenerate,
      orphanedDocuments: orphaned,
      estimatedSizeMB: ((canGenerate * 50000) / (1024 * 1024)).toFixed(2),
      groupedByTemplate,
      documents: validDocuments.slice(0, 10),
      note: orphaned > 0 ? `${orphaned} documents cannot be generated (template deleted)` : undefined,
    });

  } catch (error) {
    console.error('Error in previewBulkDownload:', error);
    res.status(500).json({ 
      error: 'Failed to preview bulk download',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export async function executeBulkDownload(req: Request, res: Response) {
  try {
    const { filters }: BulkDownloadRequest = req.body;
    
    console.log('Execute bulk download with filters:', filters);

    const conditions = [];
    
    if (filters.searchQuery && filters.searchQuery.trim()) {
      conditions.push(like(documents.name, `%${filters.searchQuery.trim()}%`));
    }

    if (filters.templateUuids && filters.templateUuids.length > 0) {
      conditions.push(inArray(documents.templateUuid, filters.templateUuids));
    }

    if (filters.dateFrom) {
      const dateField = filters.dateType === 'updated' ? documents.updatedAt : documents.createdAt;
      conditions.push(gte(dateField, new Date(filters.dateFrom)));
    }

    if (filters.dateTo) {
      const dateField = filters.dateType === 'updated' ? documents.updatedAt : documents.createdAt;
      const endDate = new Date(filters.dateTo);
      endDate.setHours(23, 59, 59, 999);
      conditions.push(lte(dateField, endDate));
    }

    if (typeof filters.archived === 'boolean') {
      conditions.push(eq(documents.archived, filters.archived));
    } else {
      conditions.push(eq(documents.archived, false));
    }

    const documentsToDownload = await db
      .select({
        uuid: documents.uuid,
        name: documents.name,
        createdAt: documents.createdAt,
        templateName: templates.name,
        templateUuid: documents.templateUuid,
        templateFilePath: templates.filePath,
      })
      .from(documents)
      .leftJoin(templates, eq(documents.templateUuid, templates.uuid))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(documents.createdAt));

    const generableDocuments = documentsToDownload.filter(d => d.templateFilePath);

    if (generableDocuments.length === 0) {
      return res.status(404).json({ error: 'No documents can be generated (templates may be deleted)' });
    }

    console.log(`Creating ZIP archive for ${generableDocuments.length} documents (on-demand generation)`);

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const zipFileName = `documents-bulk-download-${timestamp}.zip`;
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);

    const archive = archiver('zip', {
      zlib: { level: 6 }
    });

    archive.on('error', (err) => {
      console.error('Archive error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to create archive' });
      }
    });

    archive.pipe(res);

    let addedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    for (const doc of generableDocuments) {
      try {
        const fields = await db
          .select({
            fieldName: documentFields.fieldName,
            fieldValue: documentFields.fieldValue,
          })
          .from(documentFields)
          .where(eq(documentFields.documentUuid, doc.uuid));

        const fieldMap: Record<string, string> = {};
        fields.forEach(f => {
          fieldMap[f.fieldName] = f.fieldValue;
        });

        const buffer = await documentGeneratorCache.getOrGenerate({
          documentUuid: doc.uuid,
          documentName: doc.name,
          templateFilePath: doc.templateFilePath!,
          fieldValues: fieldMap
        });

        const templateFolder = doc.templateName ? 
          sanitizeFilename(doc.templateName) : 
          'Unknown-Template';
        
        const documentName = sanitizeFilename(doc.name);
        const archivePath = `${templateFolder}/${documentName}.docx`;

        archive.append(buffer, { name: archivePath });
        addedCount++;
        
        console.log(`Generated and added: ${archivePath}`);
      } catch (error) {
        console.error(`Error generating document ${doc.uuid}:`, error);
        failedCount++;
        errors.push(`${doc.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    const skippedCount = documentsToDownload.length - generableDocuments.length;

    const summaryContent = `Bulk Download Summary (Generate-on-Demand)
==========================================
Download Date: ${new Date().toLocaleString()}
Total Documents Found: ${documentsToDownload.length}
Successfully Generated: ${addedCount}
Failed to Generate: ${failedCount}
Skipped (orphaned - template deleted): ${skippedCount}

Documents Included:
${generableDocuments.filter((_, i) => i < addedCount).map(doc => `- ${doc.name} (${doc.templateName || 'Unknown'}) - Created: ${new Date(doc.createdAt).toLocaleDateString()}`).join('\n')}

${errors.length > 0 ? `\nErrors:\n${errors.join('\n')}` : ''}
${skippedCount > 0 ? `\nNote: ${skippedCount} documents were skipped because their templates have been deleted.` : ''}
`;

    archive.append(summaryContent, { name: 'DOWNLOAD_SUMMARY.txt' });

    console.log(`Finalizing archive with ${addedCount} documents`);
    
    await archive.finalize();

  } catch (error) {
    console.error('Error in executeBulkDownload:', error);
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Failed to execute bulk download',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}

export async function getDocumentGeneratorCacheStats(req: Request, res: Response) {
  try {
    const stats = documentGeneratorCache.getStats();
    res.json(stats);
  } catch (error) {
    console.error('Error getting cache stats:', error);
    res.status(500).json({ error: 'Failed to get cache stats' });
  }
}

export async function exportBulkExcel(req: Request, res: Response) {
  try {
    const { filters }: BulkDownloadRequest = req.body;
    
    console.log('Export bulk Excel with filters:', filters);

    const conditions = [];
    
    if (filters.searchQuery && filters.searchQuery.trim()) {
      conditions.push(like(documents.name, `%${filters.searchQuery.trim()}%`));
    }

    if (filters.templateUuids && filters.templateUuids.length > 0) {
      conditions.push(inArray(documents.templateUuid, filters.templateUuids));
    }

    if (filters.dateFrom) {
      const dateField = filters.dateType === 'updated' ? documents.updatedAt : documents.createdAt;
      conditions.push(gte(dateField, new Date(filters.dateFrom)));
    }

    if (filters.dateTo) {
      const dateField = filters.dateType === 'updated' ? documents.updatedAt : documents.createdAt;
      const endDate = new Date(filters.dateTo);
      endDate.setHours(23, 59, 59, 999);
      conditions.push(lte(dateField, endDate));
    }

    if (typeof filters.archived === 'boolean') {
      conditions.push(eq(documents.archived, filters.archived));
    } else {
      conditions.push(eq(documents.archived, false));
    }

    const documentsToExport = await db
      .select({
        uuid: documents.uuid,
        name: documents.name,
        createdAt: documents.createdAt,
        updatedAt: documents.updatedAt,
        templateName: templates.name,
        templateUuid: documents.templateUuid,
      })
      .from(documents)
      .leftJoin(templates, eq(documents.templateUuid, templates.uuid))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(documents.createdAt));

    if (documentsToExport.length === 0) {
      return res.status(404).json({ error: 'No documents found matching criteria' });
    }

    console.log(`Exporting ${documentsToExport.length} documents to Excel`);

    const groupedByTemplate: Record<string, {
      templateName: string;
      templateUuid: string | null;
      documents: typeof documentsToExport;
    }> = {};

    for (const doc of documentsToExport) {
      const key = doc.templateUuid || 'unknown';
      if (!groupedByTemplate[key]) {
        groupedByTemplate[key] = {
          templateName: doc.templateName || 'Unknown Template',
          templateUuid: doc.templateUuid,
          documents: [],
        };
      }
      groupedByTemplate[key].documents.push(doc);
    }

    const templateGroups = Object.values(groupedByTemplate);

    const excelFiles: { filename: string; buffer: Buffer }[] = [];

    for (const group of templateGroups) {
      if (!group.templateUuid) continue;

      const fields = await db
        .select()
        .from(templateFields)
        .where(eq(templateFields.templateUuid, group.templateUuid));

      // Skip row_group (table) fields — they are not simple text values
      const regularFields = fields.filter(f => f.fieldType !== 'row_group');
      const fieldNames = regularFields.map(f => f.name);

      const checklistFieldsMap: Map<string, { colIndex: number; options: string[] }> = new Map();
      regularFields.forEach((field, index) => {
        if (field.fieldType === 'checklist' && field.options) {
          try {
            const options = JSON.parse(field.options);
            if (Array.isArray(options) && options.length > 0) {
              checklistFieldsMap.set(field.name, {
                colIndex: index + 1,
                options: options.map(String),
              });
            }
          } catch (e) {
            console.warn(`Failed to parse options for field ${field.name}:`, e);
          }
        }
      });

      const rows: any[] = [];

      for (const doc of group.documents) {
        const docFields = await db
          .select()
          .from(documentFields)
          .where(eq(documentFields.documentUuid, doc.uuid));

        const fieldMap: Record<string, string> = {};
        for (const df of docFields) {
          fieldMap[df.fieldName] = df.fieldValue || '';
        }

        const row: Record<string, string> = {
          'Document Name': doc.name,
        };

        for (const fieldName of fieldNames) {
          row[fieldName] = fieldMap[fieldName] || '';
        }

        rows.push(row);
      }

      const worksheet = XLSX.utils.json_to_sheet(rows);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Documents');

      if (checklistFieldsMap.size > 0) {
        const validationListData: string[][] = [];
        const validationRanges: { fieldName: string; colLetter: string; listCol: string; listLength: number }[] = [];
        
        let listColIndex = 0;
        const checklistEntries = Array.from(checklistFieldsMap.entries());
        for (const [fieldName, { colIndex, options }] of checklistEntries) {
          const listColLetter = XLSX.utils.encode_col(listColIndex);
          const dataColLetter = XLSX.utils.encode_col(colIndex);
          
          for (let i = 0; i < options.length; i++) {
            if (!validationListData[i]) validationListData[i] = [];
            validationListData[i][listColIndex] = options[i];
          }
          
          validationRanges.push({
            fieldName,
            colLetter: dataColLetter,
            listCol: listColLetter,
            listLength: options.length,
          });
          
          listColIndex++;
        }
        
        const validationSheet = XLSX.utils.aoa_to_sheet(validationListData);
        XLSX.utils.book_append_sheet(workbook, validationSheet, '_ValidationLists');
        
        const dataRowCount = rows.length + 1;
        const dataValidations: any[] = [];
        
        for (const range of validationRanges) {
          const startCell = `${range.colLetter}2`;
          const endCell = `${range.colLetter}${dataRowCount}`;
          const listRange = `'_ValidationLists'!$${range.listCol}$1:$${range.listCol}$${range.listLength}`;
          
          dataValidations.push({
            sqref: `${startCell}:${endCell}`,
            type: 'list',
            formula1: listRange,
            showDropDown: false,
            allowBlank: true,
          });
        }
        
        if (dataValidations.length > 0) {
          worksheet['!dataValidation'] = dataValidations;
        }
        
        if (workbook.Workbook && workbook.Workbook.Sheets) {
          const validationSheetIndex = workbook.SheetNames.indexOf('_ValidationLists');
          if (validationSheetIndex !== -1 && workbook.Workbook.Sheets[validationSheetIndex]) {
            (workbook.Workbook.Sheets[validationSheetIndex] as any).Hidden = 2;
          }
        } else {
          workbook.Workbook = { Sheets: [] };
          const sheets = workbook.Workbook.Sheets!;
          for (let i = 0; i < workbook.SheetNames.length; i++) {
            sheets.push({});
          }
          const validationSheetIndex = workbook.SheetNames.indexOf('_ValidationLists');
          if (validationSheetIndex !== -1) {
            (sheets[validationSheetIndex] as any) = { Hidden: 2 };
          }
        }
      }

      const colWidths = [{ wch: 40 }];
      for (const fieldName of fieldNames) {
        colWidths.push({ wch: Math.max(15, fieldName.length + 2) });
      }
      worksheet['!cols'] = colWidths;

      const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      const safeTemplateName = sanitizeFilename(group.templateName);
      
      excelFiles.push({
        filename: `${safeTemplateName}.xlsx`,
        buffer: excelBuffer,
      });
    }

    if (excelFiles.length === 0) {
      return res.status(404).json({ error: 'No valid documents to export' });
    }

    if (excelFiles.length === 1) {
      const file = excelFiles[0];
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(file.filename)}"`);
      return res.send(file.buffer);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const zipFileName = `documents-excel-export-${timestamp}.zip`;
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);

    const archive = archiver('zip', { zlib: { level: 6 } });

    archive.on('error', (err) => {
      console.error('Archive error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to create ZIP archive' });
      }
    });

    archive.pipe(res);

    for (const file of excelFiles) {
      archive.append(file.buffer, { name: file.filename });
    }

    await archive.finalize();

  } catch (error) {
    console.error('Error in exportBulkExcel:', error);
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Failed to export Excel',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }
}
