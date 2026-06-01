import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage-uuid";
import { db } from "@db";
import { templateTables } from "@shared/schema";
import { eq, inArray } from "drizzle-orm";

import * as templatesController from './controllers/templates.controller';
import * as documentsController from './controllers/documents.controller';
import * as batchController from './controllers/batch.controller';
import * as bulkDeleteController from './controllers/bulk-delete.controller';
import * as bulkDownloadController from './controllers/bulk-download.controller';
import * as tablesController from './controllers/tables.controller';
import * as advancedSearchController from './controllers/advanced-search.controller';
import { templatePreviewCache } from './services/template-preview-cache.service';
import { documentGeneratorCache } from './services/document-generator-cache.service';
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
  app.get('/api/templates/integrity-check', templatesController.checkTemplateIntegrity);
  app.get('/api/templates/cleanup-orphan-files', templatesController.cleanupOrphanFiles);
  app.post('/api/templates', templatesController.uploadTemplateMiddleware, templatesController.createTemplate);
  
  // Memory-storage multer for table Excel import (small files, no disk write needed)
  const uploadTableExcel = multer({
    storage: multer.memoryStorage(),
    fileFilter: (_req, file, cb) => {
      if (file.originalname.match(/\.(xlsx|xls)$/)) cb(null, true);
      else cb(null, false);
    },
    limits: { fileSize: 10 * 1024 * 1024 },
  });

  // Template table definition routes (BEFORE :uuid routes to avoid conflicts)
  app.get('/api/templates/:uuid/tables', tablesController.getTemplateTables);
  app.get('/api/templates/:uuid/tables/:name/excel', tablesController.downloadTemplateTableExcel);
  app.post('/api/templates/:uuid/tables/:name/excel/parse', uploadTableExcel.single('file'), tablesController.parseTemplateTableExcel);
  app.get('/api/templates/:uuid/tables/:name', tablesController.getTemplateTable);
  app.put('/api/templates/:uuid/tables/:name/columns', tablesController.updateTemplateTableColumns);

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
  app.put('/api/templates/:uuid/file', templatesController.replaceTemplateFileMiddleware, templatesController.replaceTemplateFile);
  app.put('/api/templates/:uuid/archive', templatesController.archiveTemplate);
  app.put('/api/templates/:uuid/unarchive', templatesController.unarchiveTemplate);
  app.delete('/api/templates/:uuid', templatesController.deleteTemplate);
  // Batch processing routes (using :uuid for consistency)
  app.get('/api/batch/:uuid', batchController.getBatchSessionInfo);
  app.put('/api/batch/documents/:documentUuid/status', batchController.updateDocumentStatus);
  app.post('/api/batch/:uuid/approve-all', batchController.approveAllDocuments);
  app.post('/api/batch/:uuid/create-documents', batchController.createDocumentsFromBatch);
  app.delete('/api/batch/:uuid', batchController.deleteBatchSessionController);
  app.put('/api/batch/:uuid/bulk-status', batchController.bulkUpdateStatus);
  app.post('/api/batch/download-documents', batchController.downloadBatchDocuments);
  
  // Document routes
  app.get('/api/documents', documentsController.getDocuments);
  app.get('/api/documents/stats', documentsController.getDocumentStats);
  app.post('/api/documents/preview', documentsController.previewDocumentCreation);
  app.post('/api/documents/preview-template', documentsController.previewTemplateWithFields);
  app.post('/api/documents/interactive-preview', documentsController.getInteractivePreview);
  app.post('/api/documents/download-direct', documentsController.downloadDirectDocument);
  app.post('/api/documents', documentsController.createDocument);

  // Advanced search routes — MUST come before UUID routes to avoid conflict
  app.get('/api/documents/search/fields', advancedSearchController.getSearchableFields);
  app.post('/api/documents/search/advanced', advancedSearchController.advancedSearch);
  
  // Bulk delete routes - MUST come before UUID routes to avoid conflict
  app.post('/api/documents/bulk-delete/preview', bulkDeleteController.previewBulkDelete);
  app.delete('/api/documents/bulk-delete', bulkDeleteController.executeBulkDelete);

  // Bulk download routes - MUST come before UUID routes to avoid conflict
  app.post('/api/documents/bulk-download/preview', bulkDownloadController.previewBulkDownload);
  app.post('/api/documents/bulk-download/execute', bulkDownloadController.executeBulkDownload);
  app.post('/api/documents/bulk-download/excel', bulkDownloadController.exportBulkExcel);
  
  // Document table data routes (BEFORE :uuid to avoid conflicts)
  app.get('/api/documents/:uuid/tables/:name/excel', tablesController.downloadDocumentTableExcel);
  app.post('/api/documents/:uuid/tables/:name/excel', uploadTableExcel.single('file'), tablesController.uploadDocumentTableExcel);
  app.get('/api/documents/:uuid/tables/:name', tablesController.getDocumentTableData);
  app.put('/api/documents/:uuid/tables/:name', tablesController.saveDocumentTableData);

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

  // Cache management endpoints (admin/debug)
  app.get('/api/admin/cache/stats', (req, res) => {
    const templateStats = templatePreviewCache.getStats();
    const documentStats = documentGeneratorCache.getStats();
    res.json({
      templatePreviewCache: {
        enabled: templatePreviewCache.isEnabled(),
        ...templateStats
      },
      documentGeneratorCache: {
        enabled: documentGeneratorCache.isEnabled(),
        ...documentStats
      }
    });
  });

  app.post('/api/admin/cache/clear', (req, res) => {
    templatePreviewCache.clear();
    documentGeneratorCache.clear();
    res.json({ message: 'All caches cleared successfully' });
  });

  app.post('/api/admin/cache/toggle', (req, res) => {
    const { enabled, cacheType } = req.body;
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ message: 'enabled must be a boolean' });
    }
    
    if (cacheType === 'template') {
      templatePreviewCache.setEnabled(enabled);
      res.json({ message: `Template cache ${enabled ? 'enabled' : 'disabled'}`, enabled });
    } else if (cacheType === 'document') {
      documentGeneratorCache.setEnabled(enabled);
      res.json({ message: `Document cache ${enabled ? 'enabled' : 'disabled'}`, enabled });
    } else {
      templatePreviewCache.setEnabled(enabled);
      documentGeneratorCache.setEnabled(enabled);
      res.json({ message: `All caches ${enabled ? 'enabled' : 'disabled'}`, enabled });
    }
  });

  // Mock user endpoint for non-auth version
  app.get('/api/user', (req, res) => {
    res.json({
      id: 1,
      username: 'user',
      email: 'user@example.com'
    });
  });

  // ============================================
  // External API for FlowForge integration
  // No authentication required during development
  // ============================================
  app.get('/api/external/templates', async (req, res) => {
    try {
      // Batch: 1 query for all templates (with fields via eager load)
      const allTemplates = await storage.getTemplates();

      if (allTemplates.length === 0) {
        return res.json({ success: true, count: 0, templates: [] });
      }

      const templateUuids = allTemplates.map(t => t.uuid);

      // Batch: 1 query for ALL templateTables across all templates (replaces N per-template queries)
      const allTableDefs = await db
        .select()
        .from(templateTables)
        .where(inArray(templateTables.templateUuid, templateUuids));

      // Group tableDefs by templateUuid for O(1) lookup
      const tableDefsByTemplate = new Map<string, Record<string, any[]>>();
      for (const tt of allTableDefs) {
        if (!tableDefsByTemplate.has(tt.templateUuid)) {
          tableDefsByTemplate.set(tt.templateUuid, {});
        }
        tableDefsByTemplate.get(tt.templateUuid)![tt.name] = (tt.columns as any[]) || [];
      }

      const templatesWithFields = allTemplates.map(template => {
        // fields already eagerly loaded by getTemplates()
        const fields = (template as any).fields ?? [];
        const tableColMap = tableDefsByTemplate.get(template.uuid) ?? {};

        return {
          uuid: template.uuid,
          name: template.name,
          description: template.description,
          category: template.category,
          fieldCount: template.fieldCount,
          archived: template.archived,
          createdAt: template.createdAt,
          updatedAt: template.updatedAt,
          fields: fields.map((field: any) => {
            if (field.fieldType === 'row_group') {
              return {
                uuid: field.uuid,
                name: field.name,
                type: 'table',
                fieldType: 'row_group',
                placeholder: field.placeholder,
                required: field.required,
                columns: tableColMap[field.name] ?? [],
                defaultValue: null,
                position: field.position
              };
            }
            return {
              uuid: field.uuid,
              name: field.name,
              type: field.type,
              fieldType: field.fieldType,
              placeholder: field.placeholder,
              required: field.required,
              options: field.options,
              defaultValue: field.defaultValue,
              position: field.position
            };
          })
        };
      });
      
      res.json({
        success: true,
        count: templatesWithFields.length,
        templates: templatesWithFields
      });
    } catch (error) {
      console.error('Error fetching templates for external API:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch templates' 
      });
    }
  });

  // Get single template by UUID for external integration
  app.get('/api/external/templates/:uuid', async (req, res) => {
    try {
      const { uuid } = req.params;
      const template = await storage.getTemplateByUuid(uuid);
      
      if (!template) {
        return res.status(404).json({ 
          success: false, 
          error: 'Template not found' 
        });
      }
      
      const [fields, tableDefs] = await Promise.all([
        storage.getTemplateFields(uuid),
        db.select().from(templateTables).where(eq(templateTables.templateUuid, uuid)),
      ]);
      // Build a name→columns map from templateTables for O(1) lookup
      const tableColMap: Record<string, any[]> = {};
      for (const tt of tableDefs) {
        tableColMap[tt.name] = (tt.columns as any[]) || [];
      }
      
      res.json({
        success: true,
        template: {
          uuid: template.uuid,
          name: template.name,
          description: template.description,
          category: template.category,
          fieldCount: template.fieldCount,
          archived: template.archived,
          createdAt: template.createdAt,
          updatedAt: template.updatedAt,
          fields: fields.map(field => {
            if (field.fieldType === 'row_group') {
              return {
                uuid: field.uuid,
                name: field.name,
                type: 'table',
                fieldType: 'row_group',
                placeholder: field.placeholder,
                required: field.required,
                columns: tableColMap[field.name] ?? [],
                defaultValue: null,
                position: field.position
              };
            }
            return {
              uuid: field.uuid,
              name: field.name,
              type: field.type,
              fieldType: field.fieldType,
              placeholder: field.placeholder,
              required: field.required,
              options: field.options,
              defaultValue: field.defaultValue,
              position: field.position
            };
          })
        }
      });
    } catch (error) {
      console.error('Error fetching template for external API:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch template' 
      });
    }
  });

  const httpServer = createServer(app);

  return httpServer;
}
