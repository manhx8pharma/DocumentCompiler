import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage-uuid";

import * as templatesController from './controllers/templates.controller';
import * as documentsController from './controllers/documents.controller';
import * as batchController from './controllers/batch.controller';
import * as bulkDeleteController from './controllers/bulk-delete.controller';
import * as bulkDownloadController from './controllers/bulk-download.controller';
import multer from 'multer';

export async function registerRoutes(app: Express): Promise<Server> {
  // Add mock authentication functions to prevent errors
  app.use((req, res, next) => {
    req.isAuthenticated = (() => true) as any;
    req.user = { id: 1, username: 'user', password: 'hashed_password', email: 'user@example.com' } as any;
    next();
  });

  // Multer middleware for Excel upload - using disk storage for batch processing
  const uploadExcel = multer({
    storage: multer.diskStorage({
      destination: (req, file, cb) => {
        cb(null, 'storage/temp/');
      },
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + '.xlsx');
      }
    }),
    fileFilter: (req, file, cb) => {
      if (file.originalname.match(/\.(xlsx|xls)$/)) {
        cb(null, true);
      } else {
        cb(null, false);
      }
    },
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
  });

  // Template routes
  app.get('/api/templates', templatesController.getTemplates);
  app.get('/api/templates/stats', templatesController.getTemplateStats);
  app.post('/api/templates', templatesController.uploadTemplateMiddleware, templatesController.createTemplate);
  
  // UUID-based template routes
  app.get('/api/templates/:uuid', templatesController.getTemplateById);
  app.get('/api/templates/:uuid/fields', templatesController.getTemplateFields);
  app.get('/api/templates/:uuid/download', templatesController.downloadTemplate);
  app.get('/api/templates/:uuid/preview', templatesController.previewTemplate);
  app.get('/api/templates/:uuid/export-excel', templatesController.exportTemplateToExcel);
  app.post('/api/templates/:uuid/upload-batch', uploadExcel.single('file'), batchController.uploadBatchExcel);
  app.post('/api/templates/:uuid/parse-excel', uploadExcel.single('file'), templatesController.parseExcelForPreview);
  app.get('/api/templates/:uuid/export-documents', templatesController.exportDocumentsByDateRange);
  app.put('/api/templates/:uuid', templatesController.updateTemplate);
  app.delete('/api/templates/:uuid', templatesController.deleteTemplate);
  // Batch processing routes
  app.get('/api/batch/:sessionId', batchController.getBatchSessionInfo);
  app.put('/api/batch/documents/:documentId/status', batchController.updateDocumentStatus);
  app.post('/api/batch/:sessionId/create-documents', batchController.createDocumentsFromBatch);
  app.delete('/api/batch/:sessionId', batchController.deleteBatchSessionController);
  app.put('/api/batch/:sessionId/bulk-status', batchController.bulkUpdateStatus);
  app.post('/api/batch/download-documents', batchController.downloadBatchDocuments);
  
  // Document routes
  app.get('/api/documents', documentsController.getDocuments);
  app.get('/api/documents/stats', documentsController.getDocumentStats);
  app.post('/api/documents/preview', documentsController.previewDocumentCreation);
  app.post('/api/documents/preview-template', documentsController.previewTemplateWithFields);
  app.post('/api/documents/download-direct', documentsController.downloadDirectDocument);
  app.post('/api/documents', documentsController.createDocument);
  
  // Bulk delete routes - MUST come before UUID routes to avoid conflict
  app.post('/api/documents/bulk-delete/preview', bulkDeleteController.previewBulkDelete);
  app.delete('/api/documents/bulk-delete', bulkDeleteController.executeBulkDelete);

  // Bulk download routes - MUST come before UUID routes to avoid conflict
  app.post('/api/documents/bulk-download/preview', bulkDownloadController.previewBulkDownload);
  app.post('/api/documents/bulk-download/execute', bulkDownloadController.executeBulkDownload);
  
  // UUID-based document routes  
  app.get('/api/documents/:uuid', documentsController.getDocumentById);
  app.get('/api/documents/:uuid/fields', documentsController.getDocumentFields);
  app.get('/api/documents/:uuid/download', documentsController.downloadDocument);
  app.get('/api/documents/:uuid/preview', documentsController.previewDocument);
  app.put('/api/documents/:uuid', documentsController.updateDocument);
  app.delete('/api/documents/:uuid', documentsController.deleteDocument);

  // Health check endpoints
  app.get('/api/health/file-integrity', async (req, res) => {
    const { checkFileIntegrity } = await import('./routes/health');
    return checkFileIntegrity(req, res);
  });
  
  app.post('/api/health/fix-file-references', async (req, res) => {
    const { fixFileReferences } = await import('./routes/health');
    return fixFileReferences(req, res);
  });

  // Mock user endpoint for non-auth version
  app.get('/api/user', (req, res) => {
    res.json({
      id: 1,
      username: 'user',
      email: 'user@example.com'
    });
  });

  const httpServer = createServer(app);

  return httpServer;
}
