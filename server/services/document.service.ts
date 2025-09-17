import { v4 as uuidv4 } from 'uuid';
import { storage } from '../storage-uuid';
import Docxtemplater from 'docxtemplater';
import * as fs from 'fs';
import * as path from 'path';
import PizZip from 'pizzip';

import { generateSimpleDocument } from '../utils/simple-document-generator';
import { generateTemplatePreview, processTemplateWithData } from './template-processor.service';
import { getDocumentPreview, getDocumentFile } from './document-regenerator.service';

export interface CreateDocumentRequest {
  templateId: string;
  name: string;
  fields: { fieldName: string; fieldValue: string }[];
}

export const documentService = {
  async getDocuments(options: {
    search?: string;
    templateUuid?: string;
    limit?: number;
    offset?: number;
  }) {
    return await storage.getDocuments(options);
  },

  async getDocumentByUuid(uuid: string) {
    return await storage.getDocumentByUuid(uuid);
  },

  async regenerateDocumentFile(documentUuid: string, saveToDatabase = false) {
    try {
      console.log(`Regenerating document file for UUID: ${documentUuid}`);
      
      // Get the document from database
      const document = await storage.getDocumentByUuid(documentUuid);
      if (!document) {
        throw new Error('Document not found');
      }

      // Get the template
      if (!document.templateUuid) {
        throw new Error('Document has no associated template');
      }
      
      const template = await storage.getTemplateByUuid(document.templateUuid);
      if (!template) {
        throw new Error('Template not found for document');
      }

      // Get document fields
      const fields = await storage.getDocumentFields(documentUuid);
      
      // Create field values map
      const fieldValues: Record<string, string> = {};
      fields.forEach(field => {
        fieldValues[field.fieldName] = field.fieldValue || '';
      });

      // Generate the document using template
      const result = await processTemplateWithData(template.filePath, fieldValues);
      
      // Create output file path
      const outputDir = path.join(process.cwd(), 'storage', 'documents');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      const outputPath = path.join(outputDir, `${document.name}.docx`);
      fs.writeFileSync(outputPath, result.buffer);
      
      if (saveToDatabase) {
        // Update document with new file path
        await storage.updateDocumentByUuid(documentUuid, { filePath: outputPath });
      }

      return {
        success: true,
        filePath: outputPath,
        buffer: result.buffer,
        document: { ...document, filePath: outputPath },
        message: 'Document regenerated successfully'
      };
    } catch (error) {
      console.error('Error regenerating document:', error);
      throw error;
    }
  },

  async getDocumentFields(documentUuid: string) {
    return await storage.getDocumentFields(documentUuid);
  },
  async getDocumentFileContent(documentId: string) {
    // Get document from storage
    const document = await storage.getDocumentByUuid(documentId);
    if (!document) {
      throw new Error('Document not found');
    }

    // Check if file exists
    if (!fs.existsSync(document.filePath)) {
      throw new Error('Document file not found on disk');
    }

    // Read and return file content
    const fileContent = fs.readFileSync(document.filePath);
    return {
      buffer: fileContent,
      fileName: document.name + '.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    };
  },

  async getDocumentPreviewHtml(documentId: string): Promise<string> {
    return await getDocumentPreview(documentId);
  },

  async regenerateDocumentFromId(documentUuid: string, saveToDatabase: boolean = true) {
    try {
      // Get document from storage
      const document = await storage.getDocumentByUuid(documentUuid);
      if (!document) {
        throw new Error('Document not found');
      }

      // Get template
      const template = await storage.getTemplateByUuid(document.templateUuid!);
      if (!template) {
        throw new Error('Template not found for document');
      }

      // Get document fields
      const fields = await storage.getDocumentFields(documentUuid);
      
      // Create field values map
      const fieldValues: Record<string, string> = {};
      fields.forEach(field => {
        fieldValues[field.fieldName] = field.fieldValue || '';
      });

      // Generate the document using template
      const result = await processTemplateWithData(template.filePath, fieldValues);
      
      // Create output file path
      const outputDir = path.join(process.cwd(), 'storage', 'documents');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      const outputPath = path.join(outputDir, `${document.name}.docx`);
      
      // Write the file
      fs.writeFileSync(outputPath, result.buffer);
      
      return {
        success: true,
        filePath: outputPath,
        buffer: result.buffer,
        document: { ...document, filePath: outputPath },
        message: 'Document regenerated successfully'
      };
    } catch (error) {
      console.error('Error regenerating document:', error);
      throw error;
    }
  },



  async createDocument(request: CreateDocumentRequest) {
    const { templateId, name, fields } = request;
    
    console.log('Creating document:', { templateId, name, fieldsCount: fields.length });
    
    // Get template
    const template = await storage.getTemplateByUuid(templateId);
    if (!template) {
      throw new Error('Template not found');
    }
    
    // Get template file path
    const templatePath = path.resolve(template.filePath);
    if (!fs.existsSync(templatePath)) {
      throw new Error('Template file not found');
    }
    
    // Generate unique document UUID and file path
    const documentUuid = uuidv4();
    const shortId = documentUuid.split('-')[0];
    const fileName = `doc-${shortId}-${Date.now().toString(36)}.docx`;
    const documentDir = path.resolve('storage/documents');
    const documentPath = path.join(documentDir, fileName);
    
    // Ensure directory exists
    if (!fs.existsSync(documentDir)) {
      fs.mkdirSync(documentDir, { recursive: true });
    }
    
    let documentBuffer: Buffer;
    let usedFallback = false;
    
    try {
      // Read template file
      const templateBuffer = fs.readFileSync(templatePath);
      
      const zip = new PizZip(templateBuffer);
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
      });
      
      // Prepare field data for template
      const fieldData: Record<string, string> = {};
      for (const field of fields) {
        fieldData[field.fieldName] = field.fieldValue || '';
      }
      
      console.log('Field data for document:', fieldData);
      
      // Render template with data
      doc.setData(fieldData);
      doc.render();
      
      // Generate document buffer from template
      documentBuffer = doc.getZip().generate({
        type: 'nodebuffer',
        compression: 'DEFLATE',
      });
      
      console.log('Document generated successfully using template');
      
    } catch (templateError) {
      console.warn('Template processing failed completely, using fallback generator:', templateError);
      
      // Use fallback simple document generator
      const { buffer } = await generateSimpleDocument(name, fields);
      documentBuffer = buffer;
      usedFallback = true;
      
      console.log('Document generated using fallback method');
    }
    
    // Write document file
    fs.writeFileSync(documentPath, documentBuffer);
    
    // Create document record in database
    const document = await storage.createDocument({
      name,
      templateUuid: templateId,
      filePath: path.relative(process.cwd(), documentPath),
    });
    
    // Create document fields separately
    for (const field of fields) {
      await storage.createDocumentField({
        documentUuid: document.uuid,
        fieldName: field.fieldName,
        fieldValue: field.fieldValue || '',
      });
    }
    
    console.log(`Created document with ${fields.length} fields`);
    
    console.log('Document created successfully:', document.uuid);
    
    return document;
  },

  async deleteDocument(documentUuid: string) {
    // Use storage function directly
    return await storage.deleteDocumentByUuid(documentUuid);
  }
};

// Export the regenerateDocumentFile function directly
export const regenerateDocumentFile = documentService.regenerateDocumentFromId.bind(documentService);