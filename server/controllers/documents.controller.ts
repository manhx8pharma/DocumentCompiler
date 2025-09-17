import { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { storage } from '../storage-uuid';
import { insertDocumentSchema } from '@shared/schema';
import { z } from 'zod';
import mammoth from 'mammoth';
import docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import { createCompleteDocument } from '../services/document-generator';
import { FileManagerService } from '../services/file-manager.service';

async function generateDocumentPreview(templateBuffer: Buffer, fieldValues: Record<string, string>): Promise<string> {
  try {
    const zip = new PizZip(templateBuffer);
    const doc = new docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    doc.setData(fieldValues);
    doc.render();

    const buffer = doc.getZip().generate({ type: 'nodebuffer' });
    const { value: htmlContent } = await mammoth.convertToHtml({ buffer });
    
    return htmlContent;
  } catch (error) {
    console.error('Error generating document preview:', error);
    throw error;
  }
}

export async function getDocuments(req: Request, res: Response) {
  try {
    const { searchQuery, templateUuid, archived, page = '1', limit = '10' } = req.query;
    
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;

    const documents = await storage.getDocuments({
      searchQuery: searchQuery as string,
      templateUuid: templateUuid as string,
      archived: archived === 'true',
      limit: limitNum,
      offset: offset,
    });

    // Get total count with same filters
    const totalCount = await storage.getDocumentsCount({
      searchQuery: searchQuery as string,
      templateUuid: templateUuid as string,
      archived: archived === 'true',
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
    const { templateUuid, name, fields, fieldValues } = req.body;

    // Validate required fields - accept either fields array or fieldValues object
    if (!templateUuid || !name || (!fields && !fieldValues)) {
      console.log('Validation failed:', { templateUuid, name, fields: !!fields, fieldValues: !!fieldValues });
      return res.status(400).json({ 
        message: 'templateUuid, name, and fields (or fieldValues) are required' 
      });
    }

    // Get template
    const template = await storage.getTemplateByUuid(templateUuid);
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    // Prepare field values for document generation - handle both formats
    let processedFieldValues: Record<string, string> = {};
    let processedFields: { fieldName: string; fieldValue: string }[] = [];
    
    if (fieldValues && typeof fieldValues === 'object') {
      // Frontend sends fieldValues object
      processedFieldValues = fieldValues;
      // Convert to fields array for document generation
      processedFields = Object.entries(fieldValues).map(([fieldName, fieldValue]) => ({
        fieldName,
        fieldValue: fieldValue || ''
      }));
    } else if (Array.isArray(fields)) {
      // API sends fields array
      processedFields = fields;
      fields.forEach((field: { fieldName: string; fieldValue: string }) => {
        processedFieldValues[field.fieldName] = field.fieldValue || '';
      });
    }

    // Use shared document generation service
    console.log('Creating document with processed data:', {
      templateUuid,
      documentName: name,
      fieldCount: processedFields.length
    });
    
    const document = await createCompleteDocument({
      templateUuid,
      templateFilePath: template.filePath,
      documentName: name,
      fieldValues: processedFieldValues,
      fields: processedFields,
      storage
    });
    
    console.log('Document created successfully:', document.uuid);

    // Get complete document with fields
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

    // Delete physical file
    try {
      await fs.unlink(document.filePath);
    } catch (fileError) {
      console.warn('Could not delete document file:', fileError);
    }

    // Delete document record
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

    // Get template for document generation
    const template = await storage.getTemplateByUuid(document.templateUuid);
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    // Get document fields to populate the template
    const documentFields = await storage.getDocumentFields(documentUuid_);
    
    // Convert document fields to the format expected by document generator
    const fieldMap: Record<string, string> = {};
    documentFields.forEach(field => {
      fieldMap[field.fieldName] = field.fieldValue;
    });

    // Generate fresh document with current field values
    const { generateDocument } = await import('../services/document-generator');
    const generatedDoc = await generateDocument({
      templateFilePath: template.filePath,
      documentName: document.name,
      fieldValues: fieldMap
    });

    // Send the generated file and clean up
    res.download(generatedDoc.filePath, `${document.name}.docx`, (err) => {
      if (err) {
        console.error('Download error:', err);
      }
      // Clean up temporary file
      fs.unlink(generatedDoc.filePath).catch(unlinkErr => {
        console.warn('Could not delete temp file:', unlinkErr);
      });
    });

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

    // Read template file
    const templateBuffer = await fs.readFile(template.filePath);
    
    // Prepare field values
    const fieldValues: Record<string, string> = {};
    fields.forEach((field: { fieldName: string; fieldValue: string }) => {
      fieldValues[field.fieldName] = field.fieldValue || '';
    });

    // Generate preview
    const htmlContent = await generateDocumentPreview(templateBuffer, fieldValues);
    
    res.json({ 
      preview: htmlContent,
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
    res.status(500).json({ 
      message: 'Failed to generate document preview',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
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
    const { name, templateUuid, fields } = req.body;

    const document = await storage.getDocumentByUuid(documentUuid_);
    if (!document) {
      return res.status(404).json({ message: 'Document not found' });
    }

    // Update basic document info if provided
    const updateData: any = {};
    if (name) updateData.name = name;
    if (templateUuid && templateUuid !== document.templateUuid) {
      // Validate new template exists
      const newTemplate = await storage.getTemplateByUuid(templateUuid);
      if (!newTemplate) {
        return res.status(404).json({ message: 'New template not found' });
      }
      updateData.templateUuid = templateUuid;
    }

    if (Object.keys(updateData).length > 0) {
      await storage.updateDocumentByUuid(documentUuid_, updateData);
    }

    // Update fields if provided
    if (fields && Array.isArray(fields)) {
      // Delete existing fields
      const existingFields = await storage.getDocumentFields(documentUuid_);
      for (const field of existingFields) {
        await storage.deleteDocumentByUuid(field.uuid);
      }

      // Create new fields
      for (const field of fields) {
        await storage.createDocumentField({
          documentUuid: documentUuid_,
          fieldName: field.fieldName,
          fieldValue: field.fieldValue || '',
        });
      }

      // If document content needs regeneration
      if (updateData.templateUuid || fields) {
        const template = await storage.getTemplateByUuid(updateData.templateUuid || document.templateUuid);
        if (template) {
          try {
            const templateBuffer = await fs.readFile(template.filePath);
            
            const fieldValues: Record<string, string> = {};
            fields.forEach((field: { fieldName: string; fieldValue: string }) => {
              const value = field.fieldValue || '';
              // Convert newlines to proper format for docxtemplater
              fieldValues[field.fieldName] = typeof value === 'string' 
                ? value.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
                : value;
            });

            // Regenerate document
            const zip = new PizZip(templateBuffer);
            const doc = new docxtemplater(zip, {
              paragraphLoop: true,
              linebreaks: true,
            });

            doc.setData(fieldValues);
            doc.render();

            const documentBuffer = doc.getZip().generate({ type: 'nodebuffer' });
            
            // Save updated document
            await fs.writeFile(document.filePath, documentBuffer);
          } catch (regenerateError) {
            console.error('Error regenerating document:', regenerateError);
          }
        }
      }
    }

    // Get updated document
    const updatedDocument = await storage.getDocumentByUuid(documentUuid_);
    
    res.json(updatedDocument);
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

    // Read template file
    const templateBuffer = await fs.readFile(template.filePath);
    
    // Prepare field values with newline processing
    const fieldValues: Record<string, string> = {};
    fields.forEach((field: { fieldName: string; fieldValue: string }) => {
      const value = field.fieldValue || '';
      // Convert newlines to proper format for docxtemplater
      fieldValues[field.fieldName] = typeof value === 'string' 
        ? value.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
        : value;
    });

    // Generate document
    const zip = new PizZip(templateBuffer);
    const doc = new docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });

    doc.setData(fieldValues);
    doc.render();

    const documentBuffer = doc.getZip().generate({ type: 'nodebuffer' });
    
    const filename = `${name || 'document'}.docx`;
    
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    
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
      const templateBuffer = await fs.readFile(template.filePath);
      previewHtml = await generateDocumentPreview(templateBuffer, processedFieldValues);
    } catch (docxError) {
      console.warn('Docxtemplater failed, falling back to mammoth:', docxError);
      
      // Fallback: Use mammoth to convert to HTML and manually replace placeholders
      try {
        const mammoth = await import('mammoth');
        const templateBuffer = await fs.readFile(template.filePath);
        const result = await mammoth.convertToHtml({ 
          buffer: templateBuffer,
          options: {
            includeDefaultStyleMap: false,
            includeEmbeddedStyleMap: false,
            styleMap: [
              "p[style-name='Normal'] => p.normal",
              "p[style-name='Heading 1'] => h1.heading",
              "p[style-name='Heading 2'] => h2.heading",
              "p[style-name='Title'] => h1.title",
              "r[style-name='Strong'] => strong",
              "p => p.paragraph"
            ],
            convertImage: () => ({ src: '', alt: '' }),
            ignoreEmptyParagraphs: false
          }
        });
        
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
              `<span class="preview-field filled" style="white-space: pre-wrap; display: inline;">${processedValue}</span>`
            );
          } else {
            htmlContent = htmlContent.replace(
              new RegExp(escapeRegExp(placeholder), 'g'),
              `<span class="preview-field empty">${placeholder}</span>`
            );
          }
        });
        
        previewHtml = `
          <div style="font-family: 'Times New Roman', serif; max-width: 800px; margin: 0 auto; padding: 40px; line-height: 1.6; background: white; white-space: pre-wrap;">
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

    res.json({
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
    res.status(500).json({ 
      message: 'Failed to generate template preview',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// Helper function to escape regex special characters
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}