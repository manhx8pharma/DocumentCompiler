import { Request, Response } from 'express';
import { eq, and, gte, lte, like, inArray, desc } from 'drizzle-orm';
import { db } from '@db';
import { documents, templates } from '@shared/schema';
import archiver from 'archiver';
import path from 'path';
import fs from 'fs';

interface BulkDownloadFilters {
  searchQuery?: string;
  templateUuids?: string[];
  dateFrom?: string;
  dateTo?: string;
  dateType?: 'created' | 'updated'; // Filter by creation or update date
  archived?: boolean;
}

interface BulkDownloadRequest {
  filters: BulkDownloadFilters;
}

export async function previewBulkDownload(req: Request, res: Response) {
  try {
    const filters: BulkDownloadFilters = req.body.filters || {};
    
    console.log('Preview bulk download filters:', filters);

    // Build query conditions
    const conditions = [];
    
    // Search query filter
    if (filters.searchQuery && filters.searchQuery.trim()) {
      conditions.push(like(documents.name, `%${filters.searchQuery.trim()}%`));
    }

    // Template filter
    if (filters.templateUuids && filters.templateUuids.length > 0) {
      conditions.push(inArray(documents.templateUuid, filters.templateUuids));
    }

    // Date range filter
    if (filters.dateFrom) {
      const dateField = filters.dateType === 'updated' ? documents.updatedAt : documents.createdAt;
      conditions.push(gte(dateField, new Date(filters.dateFrom)));
    }

    if (filters.dateTo) {
      const dateField = filters.dateType === 'updated' ? documents.updatedAt : documents.createdAt;
      const endDate = new Date(filters.dateTo);
      endDate.setHours(23, 59, 59, 999); // End of day
      conditions.push(lte(dateField, endDate));
    }

    // Archived filter
    if (typeof filters.archived === 'boolean') {
      conditions.push(eq(documents.archived, filters.archived));
    } else {
      // Default to non-archived only
      conditions.push(eq(documents.archived, false));
    }

    // Execute query with template information
    const documentsToDownload = await db
      .select({
        uuid: documents.uuid,
        name: documents.name,
        filePath: documents.filePath,
        createdAt: documents.createdAt,
        updatedAt: documents.updatedAt,
        templateName: templates.name,
        templateUuid: documents.templateUuid,
      })
      .from(documents)
      .leftJoin(templates, eq(documents.templateUuid, templates.uuid))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(documents.createdAt));

    console.log(`Found ${documentsToDownload.length} documents for bulk download`);

    // Calculate total file size estimate
    let totalSizeEstimate = 0;
    const validDocuments = [];
    
    for (const doc of documentsToDownload) {
      if (doc.filePath && fs.existsSync(doc.filePath)) {
        try {
          const stats = fs.statSync(doc.filePath);
          totalSizeEstimate += stats.size;
          validDocuments.push({
            ...doc,
            fileSize: stats.size,
            exists: true
          });
        } catch (error) {
          console.warn(`Could not get file stats for ${doc.filePath}:`, error);
          validDocuments.push({
            ...doc,
            fileSize: 0,
            exists: false
          });
        }
      } else {
        validDocuments.push({
          ...doc,
          fileSize: 0,
          exists: false
        });
      }
    }

    // Group by template for better overview
    const groupedByTemplate = validDocuments.reduce((acc, doc) => {
      const templateKey = doc.templateUuid || 'unknown';
      if (!acc[templateKey]) {
        acc[templateKey] = {
          templateName: doc.templateName || 'Unknown Template',
          templateUuid: doc.templateUuid,
          documents: [],
          count: 0,
          totalSize: 0
        };
      }
      acc[templateKey].documents.push(doc);
      acc[templateKey].count++;
      acc[templateKey].totalSize += doc.fileSize;
      return acc;
    }, {} as any);

    res.json({
      preview: true,
      totalDocuments: validDocuments.length,
      totalSizeEstimate: totalSizeEstimate,
      totalSizeMB: (totalSizeEstimate / (1024 * 1024)).toFixed(2),
      validDocuments: validDocuments.filter(d => d.exists).length,
      missingFiles: validDocuments.filter(d => !d.exists).length,
      groupedByTemplate,
      documents: validDocuments.slice(0, 10), // Show first 10 for preview
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

    // Build query conditions (same as preview)
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

    // Get documents to download
    const documentsToDownload = await db
      .select({
        uuid: documents.uuid,
        name: documents.name,
        filePath: documents.filePath,
        createdAt: documents.createdAt,
        templateName: templates.name,
        templateUuid: documents.templateUuid,
      })
      .from(documents)
      .leftJoin(templates, eq(documents.templateUuid, templates.uuid))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(documents.createdAt));

    if (documentsToDownload.length === 0) {
      return res.status(404).json({ error: 'No documents found matching the criteria' });
    }

    console.log(`Creating ZIP archive for ${documentsToDownload.length} documents`);

    // Set response headers for ZIP download
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const zipFileName = `documents-bulk-download-${timestamp}.zip`;
    
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);

    // Create ZIP archive
    const archive = archiver('zip', {
      zlib: { level: 9 } // Maximum compression
    });

    // Handle archive errors
    archive.on('error', (err) => {
      console.error('Archive error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Failed to create archive' });
      }
    });

    // Pipe archive to response
    archive.pipe(res);

    let addedCount = 0;
    let skippedCount = 0;

    // Add documents to archive, organized by template
    for (const doc of documentsToDownload) {
      if (doc.filePath && fs.existsSync(doc.filePath)) {
        try {
          // Create folder structure: TemplateName/DocumentName.docx
          const templateFolder = doc.templateName ? 
            doc.templateName.replace(/[^\w\s-]/g, '').trim() : 
            'Unknown-Template';
          
          const documentName = doc.name.replace(/[^\w\s-]/g, '').trim();
          const fileExtension = path.extname(doc.filePath);
          const archivePath = `${templateFolder}/${documentName}${fileExtension}`;

          // Add file to archive
          archive.file(doc.filePath, { name: archivePath });
          addedCount++;
          
          console.log(`Added to archive: ${archivePath}`);
        } catch (error) {
          console.error(`Error adding file ${doc.filePath} to archive:`, error);
          skippedCount++;
        }
      } else {
        console.warn(`File not found: ${doc.filePath}`);
        skippedCount++;
      }
    }

    // Add a summary file
    const summaryContent = `Bulk Download Summary
====================
Download Date: ${new Date().toLocaleString()}
Total Documents Found: ${documentsToDownload.length}
Successfully Added: ${addedCount}
Skipped (missing files): ${skippedCount}

Documents Included:
${documentsToDownload.map(doc => `- ${doc.name} (${doc.templateName || 'Unknown Template'}) - Created: ${new Date(doc.createdAt).toLocaleDateString()}`).join('\n')}
`;

    archive.append(summaryContent, { name: 'DOWNLOAD_SUMMARY.txt' });

    console.log(`Finalizing archive with ${addedCount} documents`);
    
    // Finalize the archive
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