import { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { storage } from '../storage-uuid';
import { insertDocumentSchema } from '@shared/schema';
import { z } from 'zod';
import mammoth from 'mammoth';
import PizZip from 'pizzip';
import { createCompleteDocument } from '../services/document-generator';
import { FileManagerService } from '../services/file-manager.service';
import { documentGeneratorCache } from '../services/document-generator-cache.service';
import { ApiResponse } from '../utils/response-builders';
import { getEnhancedMammothOptions, getPreviewStyles } from '../services/template-processor.service';
import { createDocxTemplater, createDocxTemplaterPreview, highlightPreviewHtml, fieldHighlightStyles, generateInteractivePreviewData, type InteractivePreviewData } from '../utils/docx-parser';
import { injectTablesIntoZip, type TableData } from '../utils/table-injector';
import { getContentDispositionHeader } from '../utils/filename-encoder';
import { db } from '@db';
import { documentTableData, templateTables } from '@shared/schema';
import { eq } from 'drizzle-orm';

/**
 * Load table data AND chorus block data for a document, split by blockType.
 * - tableDataMap: for <<TABLE_NAME>> injection (blockType = 'table')
 * - blockDataMap: for {%#BLOCKNAME%}...{%/BLOCKNAME%} loop rendering (blockType = 'block')
 */
async function loadDocumentData(
  documentUuid: string,
  templateUuid: string
): Promise<{ tableDataMap: Record<string, TableData>; blockDataMap: Record<string, Array<Record<string, string>>> }> {
  try {
    const [tableRows, templateTablesRows] = await Promise.all([
      db.select().from(documentTableData).where(eq(documentTableData.documentUuid, documentUuid)),
      db.select().from(templateTables).where(eq(templateTables.templateUuid, templateUuid)),
    ]);

    const tableDataMap: Record<string, TableData> = {};
    const blockDataMap: Record<string, Array<Record<string, string>>> = {};

    for (const tt of templateTablesRows) {
      const docRow = tableRows.find(r => r.tableName === tt.name);
      if ((tt as any).blockType === 'block') {
        blockDataMap[tt.name] = docRow ? (docRow.rows as Array<Record<string, string>>) : [];
      } else {
        tableDataMap[tt.name] = {
          columns: tt.columns as Array<{ name: string; label: string }>,
          rows: docRow ? (docRow.rows as Array<Record<string, string>>) : [],
        };
      }
    }

    return { tableDataMap, blockDataMap };
  } catch (err) {
    console.error('[loadDocumentData] Error loading document data:', err);
    return { tableDataMap: {}, blockDataMap: {} };
  }
}

/** @deprecated use loadDocumentData instead */
async function loadTableDataMap(
  documentUuid: string,
  templateUuid: string
): Promise<Record<string, TableData>> {
  const { tableDataMap } = await loadDocumentData(documentUuid, templateUuid);
  return tableDataMap;
}

async function generateDocumentPreview(templateBuffer: Buffer, fieldValues: Record<string, string>): Promise<string> {
  try {
    const zip = new PizZip(templateBuffer);
    // Use PREVIEW factory that emits markers for field highlighting
    // This allows us to highlight ONLY the actual field positions, not matching text elsewhere
    const doc = createDocxTemplaterPreview(zip);

    doc.render(fieldValues);

    const buffer = doc.getZip().generate({ type: 'nodebuffer' });
    const { value: htmlContent } = await mammoth.convertToHtml({ buffer }, getEnhancedMammothOptions());
    
    // Convert markers to highlight spans: yellow for empty, green for filled
    const highlightedHtml = highlightPreviewHtml(htmlContent);
    
    return getPreviewStyles() + fieldHighlightStyles + highlightedHtml;
  } catch (error) {
    console.error('Error generating document preview:', error);
    throw error;
  }
}

export async function getDocuments(req: Request, res: Response) {
  try {
    const { searchQuery, templateUuid, archived, status, fromDate, toDate, page = '1', limit = '10' } = req.query;
    
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;

    // Only pass archived when explicitly provided — passing false unconditionally
    // would conflict with status-based archived filtering inside buildDocumentWhereCondition.
    const archivedFilter = archived !== undefined ? archived === 'true' : undefined;

    const documents = await storage.getDocuments({
      searchQuery: searchQuery as string,
      templateUuid: templateUuid as string,
      archived: archivedFilter,
      status: status as string,
      fromDate: fromDate as string,
      toDate: toDate as string,
      limit: limitNum,
      offset: offset,
    });

    // Get total count with same filters
    const totalCount = await storage.getDocumentsCount({
      searchQuery: searchQuery as string,
      templateUuid: templateUuid as string,
      archived: archivedFilter,
      status: status as string,
      fromDate: fromDate as string,
      toDate: toDate as string,
    });

    const totalPages = Math.ceil(totalCount / limitNum);

    res.json({
      documents,
      pagination: {
        currentPage: pageNum,
        totalPages: totalPages,
        totalItems: totalCount,
        itemsPerPage: limitNum,
        hasNextPage: pageNum < totalPages,
        hasPrevPage: pageNum > 1,
      },
    });
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ 
      message: 'Failed to fetch documents',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export async function getDocumentById(req: Request, res: Response) {
  try {
    const { uuid: documentUuid, id: documentId } = req.params;
    const documentUuid_ = documentUuid || documentId;
    
    const document = await storage.getDocumentByUuid(documentUuid_);
    
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    res.json(document);
  } catch (error) {
    console.error('Error fetching document:', error);
    res.status(500).json({ 
      message: 'Failed to fetch document',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export async function createDocument(req: Request, res: Response) {
  try {
    console.log('CREATE DOCUMENT REQUEST:', JSON.stringify(req.body, null, 2));
    const { templateUuid, name, fields, fieldValues, tableData, blockData } = req.body;

    if (!templateUuid || !name || (!fields && !fieldValues)) {
      console.log('Validation failed:', { templateUuid, name, fields: !!fields, fieldValues: !!fieldValues });
      return res.status(400).json({ 
        message: 'templateUuid, name, and fields (or fieldValues) are required' 
      });
    }

    const template = await storage.getTemplateByUuid(templateUuid);
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    let processedFields: { fieldName: string; fieldValue: string }[] = [];
    
    if (fieldValues && typeof fieldValues === 'object') {
      processedFields = Object.entries(fieldValues).map(([fieldName, fieldValue]) => ({
        fieldName,
        fieldValue: String(fieldValue || '')
      }));
    } else if (Array.isArray(fields)) {
      processedFields = fields;
    }

    console.log('Creating document (metadata only):', {
      templateUuid,
      documentName: name,
      fieldCount: processedFields.length
    });
    
    const document = await storage.createDocument({
      templateUuid,
      name,
      filePath: '',
    });

    for (const field of processedFields) {
      await storage.createDocumentField({
        documentUuid: document.uuid,
        fieldName: field.fieldName,
        fieldValue: field.fieldValue || '',
      });
    }

    // Save table row data (row_group fields) if provided
    if (tableData && typeof tableData === 'object') {
      for (const [tableName, rows] of Object.entries(tableData)) {
        if (Array.isArray(rows) && rows.length > 0) {
          await db.insert(documentTableData).values({
            documentUuid: document.uuid,
            tableName,
            rows: rows as any,
          });
        }
      }
    }

    // Save chorus block instances if provided
    if (blockData && typeof blockData === 'object') {
      for (const [blockName, instances] of Object.entries(blockData)) {
        if (Array.isArray(instances)) {
          await db.insert(documentTableData).values({
            documentUuid: document.uuid,
            tableName: blockName,
            rows: instances as any,
          }).onConflictDoUpdate({
            target: [documentTableData.documentUuid, documentTableData.tableName],
            set: { rows: instances as any },
          });
        }
      }
    }
    
    console.log('Document created successfully:', document.uuid);

    const createdDocument = await storage.getDocumentByUuid(document.uuid);
    
    res.status(201).json(createdDocument);
  } catch (error) {
    console.error('Error creating document:', error);
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.error('Request body:', req.body);
    res.status(500).json({ 
      message: 'Failed to create document',
      error: error instanceof Error ? error.message : 'Unknown error',
      details: error instanceof Error ? error.stack : undefined
    });
  }
}

export async function deleteDocument(req: Request, res: Response) {
  try {
    const { uuid: documentUuid, id: documentId } = req.params;
    const documentUuid_ = documentUuid || documentId;
    
    const document = await storage.getDocumentByUuid(documentUuid_);
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    documentGeneratorCache.invalidate(documentUuid_);

    await storage.deleteDocumentByUuid(documentUuid_);
    
    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ 
      message: 'Failed to delete document',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export async function getDocumentFields(req: Request, res: Response) {
  try {
    const { uuid: documentUuid, id: documentId } = req.params;
    const documentUuid_ = documentUuid || documentId;
    
    const document = await storage.getDocumentByUuid(documentUuid_);
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    const fields = await storage.getDocumentFields(documentUuid_);
    
    res.json(fields);
  } catch (error) {
    console.error('Error fetching document fields:', error);
    res.status(500).json({ 
      message: 'Failed to fetch document fields',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export async function downloadDocument(req: Request, res: Response) {
  try {
    const { uuid: documentUuid, id: documentId } = req.params;
    const documentUuid_ = documentUuid || documentId;
    
    const document = await storage.getDocumentByUuid(documentUuid_);
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    const template = await storage.getTemplateByUuid(document.templateUuid);
    if (!template) {
      return res.status(404).json({ message: 'Template not found - document may be orphaned' });
    }

    const documentFields = await storage.getDocumentFields(documentUuid_);
    
    const fieldMap: Record<string, string> = {};
    documentFields.forEach(field => {
      fieldMap[field.fieldName] = field.fieldValue;
    });

    // Load table data AND chorus block data for this document
    const { tableDataMap, blockDataMap } = await loadDocumentData(documentUuid_, document.templateUuid);

    const buffer = await documentGeneratorCache.getOrGenerate({
      documentUuid: documentUuid_,
      documentName: document.name,
      templateFilePath: template.filePath,
      fieldValues: fieldMap,
      tableDataMap,
      blockDataMap,
    });

    res.setHeader('Content-Disposition', getContentDispositionHeader(document.name, 'docx'));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.send(buffer);

  } catch (error) {
    console.error('Error downloading document:', error);
    res.status(500).json({ 
      message: 'Failed to download document',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export async function previewDocument(req: Request, res: Response) {
  try {
    const { templateUuid, name, fields } = req.body;

    if (!templateUuid || !Array.isArray(fields)) {
      return res.status(400).json({ 
        message: 'templateUuid and fields are required' 
      });
    }

    // Get template
    const template = await storage.getTemplateByUuid(templateUuid);
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    // Read template file from Object Storage or local
    const templateBuffer = await FileManagerService.readTemplateBuffer(template.filePath);
    
    // Prepare field values
    const fieldValues: Record<string, string> = {};
    fields.forEach((field: { fieldName: string; fieldValue: string }) => {
      fieldValues[field.fieldName] = field.fieldValue || '';
    });

    // Generate preview
    const htmlContent = await generateDocumentPreview(templateBuffer, fieldValues);
    
    // Use response builder for type-safe, consistent response structure
    return ApiResponse.preview(res, {
      html: htmlContent,
      document: {
        name: name || 'Preview Document',
        template: {
          uuid: template.uuid,
          name: template.name,
        }
      }
    });
  } catch (error) {
    console.error('Error generating document preview:', error);
    return ApiResponse.previewError(res, error, 'Failed to generate document preview');
  }
}

export async function getDocumentStats(req: Request, res: Response) {
  try {
    const stats = await storage.getDocumentStats();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching document stats:', error);
    res.status(500).json({ 
      message: 'Failed to fetch document stats',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export async function updateDocument(req: Request, res: Response) {
  try {
    const { uuid: documentUuid, id: documentId } = req.params;
    const documentUuid_ = documentUuid || documentId;
    const { name, templateUuid, fields, tableData, blockData } = req.body;

    const document = await storage.getDocumentByUuid(documentUuid_);
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    const updateData: any = {};
    let responseTemplate = document.template;
    
    if (name) updateData.name = name;
    if (templateUuid && templateUuid !== document.templateUuid) {
      const newTemplate = await storage.getTemplateByUuid(templateUuid);
      if (!newTemplate) {
        return res.status(404).json({ message: 'New template not found' });
      }
      updateData.templateUuid = templateUuid;
      responseTemplate = newTemplate; // Use the new template for response
    }

    if (Object.keys(updateData).length > 0) {
      await storage.updateDocumentByUuid(documentUuid_, updateData);
    }

    let insertedFields = document.fields || [];
    if (fields && Array.isArray(fields)) {
      insertedFields = await storage.replaceDocumentFields(documentUuid_, fields);
      documentGeneratorCache.invalidate(documentUuid_);
    }

    // Update table row data if provided
    if (tableData && typeof tableData === 'object') {
      for (const [tableName, rows] of Object.entries(tableData)) {
        if (Array.isArray(rows)) {
          await db.insert(documentTableData)
            .values({ documentUuid: documentUuid_, tableName, rows: rows as any })
            .onConflictDoUpdate({
              target: [documentTableData.documentUuid, documentTableData.tableName],
              set: { rows: rows as any },
            });
          documentGeneratorCache.invalidate(documentUuid_);
        }
      }
    }

    // Update chorus block instances if provided
    if (blockData && typeof blockData === 'object') {
      for (const [blockName, instances] of Object.entries(blockData)) {
        if (Array.isArray(instances)) {
          await db.insert(documentTableData)
            .values({ documentUuid: documentUuid_, tableName: blockName, rows: instances as any })
            .onConflictDoUpdate({
              target: [documentTableData.documentUuid, documentTableData.tableName],
              set: { rows: instances as any },
            });
          documentGeneratorCache.invalidate(documentUuid_);
        }
      }
    }

    res.json({
      ...document,
      name: name || document.name,
      templateUuid: templateUuid || document.templateUuid,
      fields: insertedFields,
      template: responseTemplate,
    });
  } catch (error) {
    console.error('Error updating document:', error);
    res.status(500).json({ 
      message: 'Failed to update document',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export async function previewDocumentCreation(req: Request, res: Response) {
  try {
    const { templateUuid, name, fields } = req.body;

    if (!templateUuid || !Array.isArray(fields)) {
      return res.status(400).json({ 
        message: 'templateUuid and fields are required' 
      });
    }

    // Get template
    const template = await storage.getTemplateByUuid(templateUuid);
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    // Get template fields for validation
    const templateFields = await storage.getTemplateFields(templateUuid);
    
    // Validate provided fields against template fields
    const missingRequiredFields = templateFields
      .filter(tf => tf.required)
      .filter(tf => !fields.find(f => f.fieldName === tf.name && f.fieldValue))
      .map(tf => tf.name);

    if (missingRequiredFields.length > 0) {
      return res.status(400).json({
        message: 'Missing required fields',
        missingFields: missingRequiredFields
      });
    }

    res.json({
      valid: true,
      template: {
        uuid: template.uuid,
        name: template.name,
        fieldCount: template.fieldCount,
      },
      document: {
        name: name || `${template.name} - New Document`,
        fieldCount: fields.length,
      },
      validation: {
        requiredFieldsProvided: templateFields.filter(tf => tf.required).length,
        totalFieldsProvided: fields.length,
        missingRequiredFields: [],
      }
    });
  } catch (error) {
    console.error('Error validating document creation:', error);
    res.status(500).json({ 
      message: 'Failed to validate document creation',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export async function downloadDirectDocument(req: Request, res: Response) {
  try {
    const { templateUuid, name, fields } = req.body;

    if (!templateUuid || !Array.isArray(fields)) {
      return res.status(400).json({ 
        message: 'templateUuid and fields are required' 
      });
    }

    // Get template
    const template = await storage.getTemplateByUuid(templateUuid);
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    // Read template file from Object Storage or local
    const templateBuffer = await FileManagerService.readTemplateBuffer(template.filePath);
    
    // Prepare field values with newline processing
    const fieldValues: Record<string, string> = {};
    fields.forEach((field: { fieldName: string; fieldValue: string }) => {
      const value = field.fieldValue || '';
      // Convert newlines to proper format for docxtemplater
      fieldValues[field.fieldName] = typeof value === 'string' 
        ? value.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
        : value;
    });

    // Generate document with table injection + custom parser for checklist/default values
    let zip = new PizZip(templateBuffer);
    // tableData can be passed in request body for direct downloads (no document UUID)
    const tableDataMap: Record<string, TableData> = req.body.tableData || {};
    zip = injectTablesIntoZip(zip, tableDataMap);
    const doc = createDocxTemplater(zip);

    doc.render(fieldValues);

    const documentBuffer = doc.getZip().generate({ type: 'nodebuffer' });
    
    const documentName = name || 'document';
    
    // Set Content-Disposition header with UTF-8 encoded filename (RFC 5987)
    res.setHeader('Content-Disposition', getContentDispositionHeader(documentName, 'docx'));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    
    res.send(documentBuffer);
  } catch (error) {
    console.error('Error generating direct download document:', error);
    res.status(500).json({ 
      message: 'Failed to generate document',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// New endpoint for real-time template preview during document creation
export async function previewTemplateWithFields(req: Request, res: Response) {
  try {
    const { templateUuid, fields } = req.body;

    if (!templateUuid) {
      return res.status(400).json({ message: 'templateUuid is required' });
    }

    const template = await storage.getTemplateByUuid(templateUuid);
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    // Get template fields for structure
    const templateFields = await storage.getTemplateFields(templateUuid);
    
    // Prepare field values with defaults - map by fieldName
    const processedFieldValues: Record<string, string> = {};
    
    // Create mapping from fieldName to value
    const fieldValueMap: Record<string, string> = {};
    if (fields && Array.isArray(fields)) {
      fields.forEach((field: any) => {
        fieldValueMap[field.fieldName] = field.fieldValue || '';
      });
    }
    
    // Map template fields to values with line break preservation
    templateFields.forEach(field => {
      const fieldValue = fieldValueMap[field.name] || '';
      // Keep original line breaks for preview display
      processedFieldValues[field.name] = fieldValue;
    });

    // Generate preview HTML with fallback handling
    let previewHtml = '';
    try {
      const templateBuffer = await FileManagerService.readTemplateBuffer(template.filePath);
      previewHtml = await generateDocumentPreview(templateBuffer, processedFieldValues);
    } catch (docxError) {
      console.warn('Docxtemplater failed, falling back to mammoth:', docxError);
      
      // Fallback: Use mammoth to convert to HTML and manually replace placeholders
      try {
        const mammoth = await import('mammoth');
        const templateBuffer = await FileManagerService.readTemplateBuffer(template.filePath);
        const result = await mammoth.convertToHtml({ 
          buffer: templateBuffer
        }, getEnhancedMammothOptions());
        
        let htmlContent = result.value;
        
        // Enhanced placeholder replacement with proper formatting preservation
        templateFields.forEach(field => {
          const placeholder = `{{${field.name}}}`;
          const value = processedFieldValues[field.name];
          
          if (value && value.trim()) {
            // Convert line breaks to HTML while preserving other formatting
            const processedValue = value
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/\r\n/g, '<br>')
              .replace(/\n/g, '<br>')
              .replace(/\r/g, '<br>');
            htmlContent = htmlContent.replace(
              new RegExp(escapeRegExp(placeholder), 'g'),
              `<span class="field-filled" style="white-space: pre-wrap; display: inline;">${processedValue}</span>`
            );
          } else {
            htmlContent = htmlContent.replace(
              new RegExp(escapeRegExp(placeholder), 'g'),
              `<span class="field-empty">${placeholder}</span>`
            );
          }
        });
        
        previewHtml = `
          ${getPreviewStyles()}
          ${fieldHighlightStyles}
          <div style="font-family: 'Times New Roman', serif; max-width: 100%; margin: 0; padding: 5px; line-height: 1.5; background: white;">
            ${htmlContent}
          </div>
        `;
      } catch (mammothError) {
        console.error('Mammoth also failed:', mammothError);
        previewHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
            <h2>Preview Unavailable</h2>
            <p>Unable to generate document preview. Template: ${template.name}</p>
            <div style="margin-top: 20px;">
              <h3>Template Fields:</h3>
              <ul>
                ${templateFields.map(field => 
                  `<li><strong>${field.name}:</strong> ${processedFieldValues[field.name] || '(empty)'}</li>`
                ).join('')}
              </ul>
            </div>
          </div>
        `;
      }
    }

    // Use response builder for type-safe, consistent response structure
    return ApiResponse.preview(res, {
      html: previewHtml,
      fields: templateFields.map(field => ({
        name: field.name,
        value: processedFieldValues[field.name],
        type: field.type,
        required: field.required
      })),
      template: {
        uuid: template.uuid,
        name: template.name,
        category: template.category
      }
    });
  } catch (error) {
    console.error('Error generating template preview:', error);
    return ApiResponse.previewError(res, error, 'Failed to generate template preview');
  }
}

// Helper function to escape regex special characters
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Generate raw HTML with markers for interactive preview mode.
 * This returns the HTML before marker-to-span conversion, allowing
 * the frontend to render input elements at field positions.
 */
async function generateInteractivePreviewHtml(templateBuffer: Buffer, fieldValues: Record<string, string>): Promise<string> {
  try {
    const zip = new PizZip(templateBuffer);
    const doc = createDocxTemplaterPreview(zip);
    doc.render(fieldValues);
    const buffer = doc.getZip().generate({ type: 'nodebuffer' });
    const { value: htmlContent } = await mammoth.convertToHtml({ buffer }, getEnhancedMammothOptions());
    return htmlContent;
  } catch (error) {
    console.error('Error generating interactive preview:', error);
    throw error;
  }
}

/**
 * Endpoint for interactive preview with structured token data.
 * Returns tokens that frontend can render with input elements.
 */
export async function getInteractivePreview(req: Request, res: Response) {
  try {
    const { templateUuid, fields } = req.body;

    if (!templateUuid) {
      return res.status(400).json({ message: 'templateUuid is required' });
    }

    const template = await storage.getTemplateByUuid(templateUuid);
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    // Get template fields for structure
    const templateFields = await storage.getTemplateFields(templateUuid);
    
    // Prepare field values
    const fieldValues: Record<string, string> = {};
    if (fields && Array.isArray(fields)) {
      fields.forEach((field: { fieldName: string; fieldValue: string }) => {
        fieldValues[field.fieldName] = field.fieldValue || '';
      });
    }

    // Generate HTML with markers (before conversion to spans)
    const templateBuffer = await FileManagerService.readTemplateBuffer(template.filePath);
    const markedHtml = await generateInteractivePreviewHtml(templateBuffer, fieldValues);
    
    // Parse into structured tokens
    const interactiveData = generateInteractivePreviewData(markedHtml);
    
    // Return structured data with template field metadata
    res.json({
      tokens: interactiveData.tokens,
      fieldOccurrences: interactiveData.fieldOccurrences,
      templateFields: templateFields.map(f => ({
        name: f.name,
        type: f.type,
        fieldType: f.fieldType,
        required: f.required,
        options: f.options ? JSON.parse(f.options) : null,
        defaultValue: f.defaultValue,
        placeholder: f.placeholder,
      })),
      styles: getPreviewStyles(),
      template: {
        uuid: template.uuid,
        name: template.name,
        category: template.category,
      }
    });
  } catch (error) {
    console.error('Error generating interactive preview:', error);
    res.status(500).json({ 
      message: 'Failed to generate interactive preview',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}