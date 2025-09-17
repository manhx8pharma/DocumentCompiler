import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { storage } from '../storage-uuid';
import { processTemplateWithData } from './template-processor.service';

export interface RegenerationResult {
  buffer: Buffer;
  filePath: string;
  htmlPreview: string;
}

/**
 * Regenerate a document from its template and field data
 */
export async function regenerateDocument(documentUuid: string): Promise<RegenerationResult> {
  // Get document details
  const document = await storage.getDocumentByUuid(documentUuid);
  if (!document) {
    throw new Error('Document not found');
  }

  if (!document.templateUuid) {
    throw new Error('Document has no associated template');
  }

  // Get template
  const template = await storage.getTemplateByUuid(document.templateUuid);
  if (!template) {
    throw new Error('Template not found');
  }

  // Get document fields
  const fields = await storage.getDocumentFields(documentUuid);
  
  // Create field mapping
  const fieldMap: Record<string, string> = {};
  fields.forEach(field => {
    fieldMap[field.fieldName] = field.fieldValue || '';
  });

  // Process template with field data
  const templatePath = path.resolve(template.filePath);
  const result = await processTemplateWithData(templatePath, fieldMap);

  // Generate new file path if needed
  let filePath = document.filePath;
  if (!filePath || !fs.existsSync(filePath)) {
    const documentDir = path.resolve('storage/documents');
    if (!fs.existsSync(documentDir)) {
      fs.mkdirSync(documentDir, { recursive: true });
    }
    
    const shortId = document.uuid.split('-')[0];
    const fileName = `doc-${shortId}-${Date.now().toString(36)}.docx`;
    filePath = path.join(documentDir, fileName);
    
    // Update document record with new file path
    await storage.updateDocumentByUuid(document.uuid, { filePath: path.relative(process.cwd(), filePath) });
  }

  // Write document file
  fs.writeFileSync(filePath, result.buffer);

  return {
    buffer: result.buffer,
    filePath,
    htmlPreview: result.htmlContent
  };
}

/**
 * Get document preview by regenerating from template if needed
 */
export async function getDocumentPreview(documentUuid: string): Promise<string> {
  try {
    // Try to get existing document first
    const document = await storage.getDocumentByUuid(documentUuid);
    if (!document) {
      throw new Error('Document not found');
    }

    // Check if document file exists
    if (document.filePath && fs.existsSync(document.filePath)) {
      // Use existing file for preview
      const mammoth = await import('mammoth');
      const buffer = fs.readFileSync(document.filePath);
      const result = await mammoth.convertToHtml({ buffer });
      
      return `
        <div style="font-family: 'Times New Roman', serif; max-width: 800px; margin: 0 auto; padding: 40px; line-height: 1.6; background: white;">
          ${result.value}
        </div>
      `;
    }

    // Regenerate document and return preview
    const regenerationResult = await regenerateDocument(documentUuid);
    
    return `
      <div style="font-family: 'Times New Roman', serif; max-width: 800px; margin: 0 auto; padding: 40px; line-height: 1.6; background: white;">
        ${regenerationResult.htmlPreview}
      </div>
    `;

  } catch (error) {
    console.error('Document preview generation error:', error);
    return `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
        <h2>Preview Error</h2>
        <p>Unable to generate document preview: ${error instanceof Error ? error.message : 'Unknown error'}</p>
      </div>
    `;
  }
}

/**
 * Get document file buffer, regenerating if necessary
 */
export async function getDocumentFile(documentUuid: string): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
  const document = await storage.getDocumentByUuid(documentUuid);
  if (!document) {
    throw new Error('Document not found');
  }

  let buffer: Buffer;

  // Check if document file exists
  if (document.filePath && fs.existsSync(document.filePath)) {
    buffer = fs.readFileSync(document.filePath);
  } else {
    // Regenerate document
    const regenerationResult = await regenerateDocument(documentUuid);
    buffer = regenerationResult.buffer;
  }

  return {
    buffer,
    fileName: `${document.name}.docx`,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  };
}