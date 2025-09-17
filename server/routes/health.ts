import { Request, Response } from 'express';
import { storage } from '../storage-uuid';
import { FileManagerService } from '../services/file-manager.service';

/**
 * Health check endpoint for file integrity
 */
export async function checkFileIntegrity(req: Request, res: Response) {
  try {
    const templates = await storage.getTemplates({ archived: false });
    const documents = await storage.getDocuments({ archived: false });
    
    const results = {
      templates: {
        total: templates.length,
        valid: 0,
        invalid: 0,
        invalidFiles: [] as string[]
      },
      documents: {
        total: documents.length,
        valid: 0,
        invalid: 0,
        invalidFiles: [] as string[]
      },
      status: 'healthy' as 'healthy' | 'issues_found'
    };
    
    // Check template files
    for (const template of templates) {
      if (template.filePath) {
        const validation = await FileManagerService.validateFile(template.filePath);
        if (validation.isValid) {
          results.templates.valid++;
        } else {
          results.templates.invalid++;
          results.templates.invalidFiles.push(template.filePath);
        }
      } else {
        results.templates.invalid++;
        results.templates.invalidFiles.push(`Template ${template.uuid}: No file path`);
      }
    }
    
    // Check document files
    for (const document of documents) {
      if (document.filePath) {
        const validation = await FileManagerService.validateFile(document.filePath);
        if (validation.isValid) {
          results.documents.valid++;
        } else {
          results.documents.invalid++;
          results.documents.invalidFiles.push(document.filePath);
        }
      } else {
        results.documents.invalid++;
        results.documents.invalidFiles.push(`Document ${document.uuid}: No file path`);
      }
    }
    
    // Determine overall status
    if (results.templates.invalid > 0 || results.documents.invalid > 0) {
      results.status = 'issues_found';
    }
    
    res.json(results);
  } catch (error) {
    console.error('File integrity check failed:', error);
    res.status(500).json({ 
      error: 'Failed to perform file integrity check',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Fix invalid file references by attempting to find matching files
 */
export async function fixFileReferences(req: Request, res: Response) {
  try {
    const { templateUuids, documentUuids } = req.body;
    
    const results = {
      templatesFixed: 0,
      documentsFixed: 0,
      errors: [] as string[]
    };
    
    // Fix template references
    if (templateUuids && Array.isArray(templateUuids)) {
      for (const uuid of templateUuids) {
        try {
          const template = await storage.getTemplateByUuid(uuid);
          if (!template) continue;
          
          // Try to find a valid file in the templates directory
          // This is a simplified approach - in production you'd want more sophisticated matching
          const validation = await FileManagerService.validateFile(template.filePath);
          if (!validation.isValid) {
            // Mark as archived if file cannot be recovered
            await storage.updateTemplateByUuid(uuid, { 
              archived: true,
              description: `${template.description || ''} [AUTO-ARCHIVED: File missing]`
            });
            results.templatesFixed++;
          }
        } catch (error) {
          results.errors.push(`Template ${uuid}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }
    
    // Fix document references
    if (documentUuids && Array.isArray(documentUuids)) {
      for (const uuid of documentUuids) {
        try {
          const document = await storage.getDocumentByUuid(uuid);
          if (!document) continue;
          
          const validation = await FileManagerService.validateFile(document.filePath);
          if (!validation.isValid) {
            // Mark as archived if file cannot be recovered
            await storage.updateDocumentByUuid(uuid, { 
              archived: true
            });
            results.documentsFixed++;
          }
        } catch (error) {
          results.errors.push(`Document ${uuid}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }
    
    res.json(results);
  } catch (error) {
    console.error('File reference fix failed:', error);
    res.status(500).json({ 
      error: 'Failed to fix file references',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}