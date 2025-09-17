import { Request, Response } from 'express';
import { storage } from '../storage-uuid';
import {
  createBatchSession,
  getBatchSession,
  updateBatchDocumentStatus,
  getApprovedDocuments,
  deleteBatchSession
} from '../services/batch.service';
import { createCompleteDocument } from '../services/document-generator';
import { documentService } from '../services/document.service';
import archiver from 'archiver';
import fs from 'fs';
import path from 'path';

/**
 * Upload Excel và tạo batch session mới
 * POST /api/templates/:id/upload-batch
 */
export async function uploadBatchExcel(req: Request, res: Response) {
  try {
    console.log('=== BATCH UPLOAD REQUEST ===');
    console.log('Template ID/UUID (id):', req.params.id);
    console.log('Template ID/UUID (uuid):', req.params.uuid);
    console.log('Has file:', !!req.file);
    
    const templateUuid = req.params.uuid || req.params.id;
    
    if (!templateUuid) {
      return res.status(400).json({ message: 'Template UUID is required' });
    }
    
    // Get template by UUID using the UUID storage layer
    const template = await storage.getTemplateByUuid(templateUuid);
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }
    console.log('Template found:', template.uuid);
    
    if (!req.file) {
      return res.status(400).json({ message: 'No Excel file uploaded' });
    }

    console.log('File details:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      bufferLength: req.file.buffer?.length,
      hasPath: !!req.file.path,
      path: req.file.path
    });

    // Validate file type
    if (!req.file.originalname.match(/\.(xlsx|xls)$/)) {
      return res.status(400).json({ message: 'Only Excel files (.xlsx, .xls) are allowed' });
    }

    // Template already retrieved above

    const templateFields = await storage.getTemplateFields(templateUuid);
    if (!templateFields || templateFields.length === 0) {
      return res.status(400).json({ message: 'Template has no fields configured' });
    }

    console.log('Template fields:', templateFields.length);

    // Read file from disk for batch processing
    let fileBuffer: Buffer;
    if (req.file.buffer) {
      // Memory storage
      fileBuffer = req.file.buffer;
    } else if (req.file.path) {
      // Disk storage
      const fs = await import('fs');
      fileBuffer = await fs.promises.readFile(req.file.path);
    } else {
      throw new Error('No file buffer or path available');
    }

    // Create batch session with Excel data
    const batchData = await createBatchSession(
      template.uuid,
      req.file.originalname,
      fileBuffer,
      templateFields
    );

    console.log('Batch session created successfully:', batchData.sessionId);

    // Automatically create documents from the batch session
    try {
      const approvedDocs = await getApprovedDocuments(batchData.sessionId);
      
      if (approvedDocs.length === 0) {
        return res.status(400).json({ message: 'No documents found in batch session' });
      }

      console.log('Found', approvedDocs.length, 'documents to create');

      const results = [];
      const errors = [];

      // Create each document
      for (const batchDoc of approvedDocs) {
        try {
          console.log('Creating document:', batchDoc.name);
          
          // Transform fields format for document generator
          const fields = batchDoc.fields.map(f => ({
            fieldName: f.fieldName,
            fieldValue: f.fieldValue || ''
          }));

          // Prepare field values for document generation
          const fieldValues: Record<string, string> = {};
          fields.forEach(field => {
            fieldValues[field.fieldName] = field.fieldValue || '';
          });

          // Use complete document generation pipeline
          const document = await createCompleteDocument({
            templateUuid: template.uuid,
            templateFilePath: template.filePath,
            documentName: batchDoc.name,
            fieldValues,
            fields,
            storage
          });

          // Update batch document status and link to final document
          await updateBatchDocumentStatus(batchDoc.uuid, 'created');
          
          results.push({
            batchDocumentId: batchDoc.uuid,
            documentId: document.uuid,
            documentName: document.name,
            success: true
          });

          console.log('Document created successfully:', document.name);

        } catch (error) {
          console.error('Error creating document:', batchDoc.name, error);
          errors.push({
            batchDocumentId: batchDoc.uuid,
            documentName: batchDoc.name,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }

      console.log('Batch creation completed:', results.length, 'created,', errors.length, 'failed');

      return res.status(200).json({
        success: true,
        message: `Excel processed and documents created: ${results.length} created, ${errors.length} failed`,
        sessionId: batchData.sessionId,
        templateUuid: batchData.templateUuid,
        fileName: batchData.fileName,
        totalDocuments: batchData.documents.length,
        created: results.length,
        failed: errors.length,
        documentUuids: results.map(r => r.documentId),
        results,
        errors: errors.length > 0 ? errors : undefined
      });

    } catch (docCreationError) {
      console.error('Error in automatic document creation:', docCreationError);
      return res.status(200).json({
        success: true,
        message: 'Excel file processed successfully but document creation failed',
        sessionId: batchData.sessionId,
        templateUuid: batchData.templateUuid,
        fileName: batchData.fileName,
        totalDocuments: batchData.documents.length,
        documents: batchData.documents,
        error: docCreationError instanceof Error ? docCreationError.message : 'Unknown error'
      });
    }

  } catch (error) {
    console.error('Error in uploadBatchExcel:', error);
    return res.status(500).json({
      message: 'Failed to process Excel file',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Lấy thông tin batch session
 * GET /api/batch/:sessionId
 */
export async function getBatchSessionInfo(req: Request, res: Response) {
  try {
    const sessionId = req.params.sessionId;
    
    const session = await getBatchSession(sessionId);
    
    if (!session) {
      return res.status(404).json({ message: 'Batch session not found' });
    }
    
    // Transform data for frontend
    const documents = session.batchDocuments.map(doc => ({
      uuid: doc.uuid,
      rowIndex: doc.rowIndex,
      documentName: doc.name, // Use 'name' instead of 'documentName'
      status: doc.status,
      fields: doc.fields.map(f => ({
        fieldName: f.fieldName,
        fieldValue: f.fieldValue
      }))
    }));

    return res.status(200).json({
      sessionId: session.uuid,
      templateUuid: session.templateUuid,
      templateName: session.template?.name || 'Unknown Template',
      fileName: session.fileName,
      status: session.status,
      totalRows: session.totalRows,
      processedRows: session.processedRows,
      createdAt: session.createdAt,
      documents
    });

  } catch (error) {
    console.error('Error in getBatchSessionInfo:', error);
    return res.status(500).json({
      message: 'Failed to get batch session info',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Cập nhật trạng thái document trong batch
 * PUT /api/batch/documents/:documentId/status
 */
export async function updateDocumentStatus(req: Request, res: Response) {
  try {
    const documentId = req.params.documentId;
    const { status } = req.body;

    if (!['pending', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const updated = await updateBatchDocumentStatus(documentId, status);
    
    return res.status(200).json({
      success: true,
      document: updated
    });

  } catch (error) {
    console.error('Error in updateDocumentStatus:', error);
    return res.status(500).json({
      message: 'Failed to update document status',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Tạo documents từ các documents đã approved
 * POST /api/batch/:sessionId/create-documents
 */
export async function createDocumentsFromBatch(req: Request, res: Response) {
  try {
    const sessionId = req.params.sessionId;
    
    console.log('Creating documents from batch session:', sessionId);
    
    // Get approved documents
    const approvedDocs = await getApprovedDocuments(sessionId);
    
    if (approvedDocs.length === 0) {
      return res.status(400).json({ message: 'No approved documents found in batch session' });
    }

    console.log('Found', approvedDocs.length, 'approved documents');

    // Get session info for template UUID and template details
    const session = await getBatchSession(sessionId);
    if (!session) {
      return res.status(404).json({ message: 'Batch session not found' });
    }
    
    const templateUuid = session.templateUuid;
    
    // Get template details for file path
    const template = await storage.getTemplateByUuid(templateUuid);
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    const results = [];
    const errors = [];

    // Create each approved document
    for (const batchDoc of approvedDocs) {
      try {
        console.log('Creating document:', batchDoc.name);
        
        // Transform fields format for document generator
        const fields = batchDoc.fields.map(f => ({
          fieldName: f.fieldName,
          fieldValue: f.fieldValue || ''
        }));

        // Prepare field values for document generation
        const fieldValues: Record<string, string> = {};
        fields.forEach(field => {
          fieldValues[field.fieldName] = field.fieldValue || '';
        });

        // Use complete document generation pipeline
        const document = await createCompleteDocument({
          templateUuid,
          templateFilePath: template.filePath,
          documentName: batchDoc.name,
          fieldValues,
          fields,
          storage
        });

        // Update batch document status and link to final document
        await updateBatchDocumentStatus(batchDoc.uuid, 'created');
        
        results.push({
          batchDocumentId: batchDoc.uuid,
          documentId: document.uuid,
          documentName: document.name,
          success: true
        });

        console.log('Document created successfully:', document.name);

      } catch (error) {
        console.error('Error creating document:', batchDoc.name, error);
        errors.push({
          batchDocumentId: batchDoc.uuid,
          documentName: batchDoc.name,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    console.log('Batch creation completed:', results.length, 'created,', errors.length, 'failed');

    return res.status(200).json({
      success: true,
      message: `Documents created successfully: ${results.length} created, ${errors.length} failed`,
      total: approvedDocs.length,
      created: results.length,
      failed: errors.length,
      documentUuids: results.map(r => r.documentId),
      results,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Error in createDocumentsFromBatch:', error);
    return res.status(500).json({
      message: 'Failed to create documents from batch',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Xóa batch session
 * DELETE /api/batch/:sessionId
 */
export async function deleteBatchSessionController(req: Request, res: Response) {
  try {
    const sessionId = req.params.sessionId;
    
    await deleteBatchSession(sessionId);
    
    return res.status(200).json({
      success: true,
      message: 'Batch session deleted successfully'
    });

  } catch (error) {
    console.error('Error in deleteBatchSession:', error);
    return res.status(500).json({
      message: 'Failed to delete batch session',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Bulk update document statuses
 * PUT /api/batch/:sessionId/bulk-status
 */
export async function bulkUpdateStatus(req: Request, res: Response) {
  try {
    const sessionId = req.params.sessionId;
    const { documentIds, documentUuids, status } = req.body;
    const docIds = documentIds || documentUuids;

    if (!Array.isArray(docIds) || docIds.length === 0) {
      return res.status(400).json({ message: 'Document IDs array is required' });
    }

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }

    const results = [];
    
    for (const documentId of docIds) {
      try {
        const updated = await updateBatchDocumentStatus(documentId, status);
        results.push({ documentId, success: true, document: updated });
      } catch (error) {
        results.push({ 
          documentId, 
          success: false, 
          error: error instanceof Error ? error.message : 'Unknown error' 
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: `Bulk status update completed`,
      results
    });

  } catch (error) {
    console.error('Error in bulkUpdateStatus:', error);
    return res.status(500).json({
      message: 'Failed to bulk update status',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Download multiple documents as ZIP file using UUIDs
 * POST /api/batch/download-documents
 */
export async function downloadBatchDocuments(req: Request, res: Response) {
  try {
    const { documentUuids } = req.body;

    if (!documentUuids || !Array.isArray(documentUuids) || documentUuids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Document UUIDs array is required'
      });
    }

    console.log(`Downloading ${documentUuids.length} documents as ZIP`);

    // Get documents by UUIDs
    const documents = [];
    for (const uuid of documentUuids) {
      try {
        const doc = await storage.getDocumentByUuid(uuid);
        if (doc && doc.filePath) {
          documents.push(doc);
        }
      } catch (error) {
        console.error(`Error getting document ${uuid}:`, error);
      }
    }

    if (documents.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No valid documents found'
      });
    }

    // Set response headers for ZIP download
    const zipFileName = `documents-${new Date().toISOString().split('T')[0]}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);

    // Create ZIP archive
    const archive = archiver('zip', {
      zlib: { level: 9 } // Sets the compression level
    });

    // Handle archive errors
    archive.on('error', (err) => {
      console.error('Archive error:', err);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          message: 'Error creating ZIP archive'
        });
      }
    });

    // Pipe archive data to the response
    archive.pipe(res);

    // Add documents to archive
    for (const doc of documents) {
      const filePath = path.resolve(doc.filePath);
      
      if (fs.existsSync(filePath)) {
        const fileName = `${doc.name}.docx`;
        archive.file(filePath, { name: fileName });
        console.log(`Added to ZIP: ${fileName}`);
      } else {
        console.error(`File not found: ${filePath}`);
      }
    }

    // Finalize the archive
    await archive.finalize();
    console.log(`ZIP download completed: ${documents.length} documents`);

  } catch (error) {
    console.error('Error in downloadBatchDocuments:', error);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: 'Internal server error during download'
      });
    }
  }
}