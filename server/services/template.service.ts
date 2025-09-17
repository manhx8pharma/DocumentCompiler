import fs from 'fs';
import { promisify } from 'util';
import { randomUUID } from 'crypto';
import { storage } from '../storage-uuid';
import {
  saveFile,
  readFileFromStorage,
  generateUniqueFilename,
  extractPlaceholders,
  fileExists,
  ensureDir
} from '../utils/file-helpers';
import { createSimpleDocx } from '../utils/docx-helpers';
import { 
  Template, 
  TemplateField, 
  insertTemplateSchema, 
  insertTemplateFieldSchema 
} from '@shared/schema';

// NPM packages for DOCX handling
import JSZip from 'jszip';
import mammoth from 'mammoth';

const readFile = promisify(fs.readFile);

export interface TemplateService {
  uploadTemplate(
    file: { originalname: string; buffer: Buffer },
    data: {
      name: string;
      category: string;
      description?: string;
    }
  ): Promise<Template>;
  getTemplates(options: {
    search?: string;
    category?: string;
    sort?: string;
    limit?: number;
    offset?: number;
  }): Promise<Template[]>;
  getTemplateByUuid(uuid: string): Promise<Template | null>;
  getTemplateFields(templateUuid: string): Promise<TemplateField[]>;
  updateTemplate(
    uuid: string,
    data: Partial<Template>
  ): Promise<Template>;
  deleteTemplate(uuid: string): Promise<Template>;
  getTemplateFileContent(templateUuid: string): Promise<Buffer>;
  getTemplatePreviewHtml(templateUuid: string): Promise<string>;
}

export const templateService: TemplateService = {
  async uploadTemplate(file, data) {
    try {
      console.log(`Starting template upload process for ${file.originalname}`);
      
      // Step 1: Generate UUID first - this is the most important step
      const templateUuid = randomUUID();
      console.log('Template service: Generated UUID as first step:', templateUuid);
      
      // Validate data with schema
      const templateData: any = {
        name: data.name,
        category: data.category,
      };
      
      // Only add description if it exists
      if (data.description) {
        templateData.description = data.description;
      }
      
      const validatedData = insertTemplateSchema.parse(templateData);
      
      // Generate a temporary file path first with UUID
      const tempFilePath = await saveFile(
        file.buffer, 
        file.originalname, 
        'templates',
        templateUuid // Use the pre-generated UUID for the file name
      );
      console.log(`File saved at path: ${tempFilePath} with UUID: ${templateUuid}`);
      
      // Extract fields from the document
      const extractedFields = await extractFieldsFromDocx(file.buffer);
      console.log(`Extracted ${extractedFields.length} fields from template`);
      
      // Create the template record with the file path and UUID
      const templateRecord = {
        name: validatedData.name,
        category: validatedData.category as "legal" | "financial" | "hr" | "marketing" | "other",
        description: typeof validatedData.description === 'string' ? validatedData.description : undefined,
        filePath: tempFilePath,
        fieldCount: extractedFields.length,
        uuid: templateUuid, // Use the pre-generated UUID
      };
      
      const template = await storage.createTemplate(templateRecord);
      console.log(`Created template record with UUID: ${template.uuid}`);
      
      // Create template field records if any fields were extracted
      if (extractedFields.length > 0) {
        const fieldRecords = extractedFields.map(field => ({
          name: field.name,
          displayName: field.displayName,
          fieldType: field.fieldType,
          required: field.required,
          options: field.options,
        }));
        
        await storage.updateTemplateFields(template.uuid, fieldRecords);
        console.log(`Added ${fieldRecords.length} fields to template`);
      }
      
      return template;
    } catch (error: unknown) {
      console.error('Error in uploadTemplate:', error);
      if (error instanceof Error) {
        throw new Error(`Failed to upload template: ${error.message}`);
      } else {
        throw new Error('Failed to upload template: Unknown error');
      }
    }
  },
  
  async getTemplates(options) {
    return storage.getTemplates(options);
  },
  
  async getTemplateByUuid(uuid) {
    return storage.getTemplateByUuid(uuid);
  },
  
  async getTemplateFields(templateUuid) {
    return storage.getTemplateFields(templateUuid);
  },
  
  async updateTemplate(uuid, data) {
    return storage.updateTemplateByUuid(uuid, data);
  },
  
  async deleteTemplate(uuid) {
    return storage.deleteTemplateByUuid(uuid);
  },
  
  async getTemplateFileContent(templateUuid) {
    try {
      console.log(`Getting template file content for templateUuid: ${templateUuid}`);
      const template = await storage.getTemplateByUuid(templateUuid);
      
      if (!template) {
        console.error(`Template with UUID ${templateUuid} not found in database`);
        throw new Error(`Template not found: ${templateUuid}`);
      }
      
      // Kiểm tra xem đường dẫn tệp có hợp lệ không
      if (!template.filePath || typeof template.filePath !== 'string' || template.filePath.trim() === '') {
        console.error(`Invalid file path for template ${templateUuid}: "${template.filePath}"`);
        throw new Error(`Invalid template file path for template: ${templateUuid}`);
      }
      
      // Kiểm tra xem tệp có tồn tại không trước khi đọc
      const exists = await fileExists(template.filePath);
      if (!exists) {
        console.error(`Template file not found at path: ${template.filePath} for templateUuid: ${templateUuid}`);
        throw new Error(`Template file not found: ${template.filePath}`);
      }
      
      // Đọc và trả về nội dung file
      const fileContent = await readFileFromStorage(template.filePath);
      if (!fileContent || fileContent.length === 0) {
        console.error(`Empty template file for templateUuid: ${templateUuid}`);
        throw new Error(`Template file is empty: ${template.filePath}`);
      }
      
      return fileContent;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error accessing template file: ${errorMessage}`);
      throw new Error(`Template file not found or inaccessible: ${errorMessage}`);
    }
  },
  
  async getTemplatePreviewHtml(templateUuid) {
    try {
      const template = await storage.getTemplateByUuid(templateUuid);
      
      if (!template) {
        throw new Error('Template not found');
      }
      
      let fileContent: Buffer;
      try {
        // Kiểm tra xem tệp có tồn tại không trước khi đọc
        const exists = await fileExists(template.filePath);
        if (!exists) {
          console.error(`Template file not found at path: ${template.filePath} for templateUuid: ${templateUuid}`);
          // For seeded templates with empty/missing files, create a simple preview with just placeholders
          return createPlaceholderPreviewForTemplate(String(template.uuid));
        }
        fileContent = await readFileFromStorage(template.filePath);
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error reading template file: ${errorMessage}`);
        // For seeded templates with empty/missing files, create a simple preview with just placeholders
        return createPlaceholderPreviewForTemplate(String(template.uuid));
      }
      
      // Convert to HTML with mammoth
      const result = await mammoth.convertToHtml({ buffer: fileContent });
      let html = result.value;
      
      // Highlight placeholders
      html = highlightPlaceholders(html);
      
      return html;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Error generating template preview: ${errorMessage}`);
      throw new Error(`Failed to generate template preview: ${errorMessage}`);
    }
  },
};

// Helper function to extract fields from DOCX
async function extractFieldsFromDocx(buffer: Buffer): Promise<any[]> {
  try {
    // Extract text content from the DOCX file
    const result = await mammoth.extractRawText({ buffer });
    const content = result.value;
    
    if (!content || content.trim() === '') {
      console.warn('Empty content detected in uploaded template file');
      // Return default fields if the file is empty
      return [
        { name: 'title', displayName: 'Title', fieldType: 'text', required: true, options: null },
        { name: 'content', displayName: 'Content', fieldType: 'textarea', required: true, options: null },
      ];
    }
    
    // Extract placeholders using regex
    const placeholders = extractPlaceholders(content);
    
    // If no placeholders found, create some generic ones based on the content
    if (placeholders.length === 0) {
      console.log('No placeholders found, creating generic placeholders');
      
      // Create at least one field for the template
      return [
        { name: 'documentTitle', displayName: 'Document Title', fieldType: 'text', required: true, options: null },
        { name: 'documentContent', displayName: 'Document Content', fieldType: 'textarea', required: false, options: null },
        { name: 'date', displayName: 'Date', fieldType: 'date', required: false, options: null },
      ];
    }
    
    // Convert placeholders to fields
    return placeholders.map(placeholder => {
      // Determine field type based on placeholder name
      let fieldType = 'text';
      let options = null;
      let required = false;
      
      // Simple heuristic for field types based on name
      const lowercaseName = placeholder.toLowerCase();
      if (lowercaseName.includes('email')) {
        fieldType = 'email';
      } else if (
        lowercaseName.includes('date') || 
        lowercaseName.includes('dob') || 
        lowercaseName.includes('start') || 
        lowercaseName.includes('end')
      ) {
        fieldType = 'date';
      } else if (
        lowercaseName.includes('price') || 
        lowercaseName.includes('amount') || 
        lowercaseName.includes('salary') ||
        lowercaseName.includes('budget') ||
        lowercaseName.includes('cost') ||
        lowercaseName.includes('number')
      ) {
        fieldType = 'number';
      } else if (lowercaseName.includes('type') || lowercaseName.includes('category') || lowercaseName.includes('status')) {
        fieldType = 'select';
        
        // Example options for certain field types
        if (lowercaseName.includes('employment')) {
          options = 'Full-time,Part-time,Contract,Temporary';
        } else if (lowercaseName.includes('pay')) {
          options = 'Hour,Week,Bi-week,Month,Year';
        } else if (lowercaseName.includes('priority')) {
          options = 'High,Medium,Low';
        } else if (lowercaseName.includes('status')) {
          options = 'Active,Pending,Completed,Cancelled';
        } else {
          // Default options
          options = 'Option 1,Option 2,Option 3';
        }
      } else if (
        lowercaseName.includes('description') || 
        lowercaseName.includes('duties') || 
        lowercaseName.includes('notes') || 
        lowercaseName.includes('details') ||
        lowercaseName.includes('content')
      ) {
        fieldType = 'textarea';
      }
      
      // Simple heuristics for required fields
      if (
        lowercaseName.includes('name') || 
        lowercaseName.includes('title') || 
        lowercaseName.includes('id')
      ) {
        required = true;
      }
      
      // Format the display name for better user experience
      const displayName = placeholder
        .split(/(?=[A-Z])/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      
      return {
        name: placeholder,
        displayName,
        fieldType,
        required,
        options,
      };
    });
  } catch (error) {
    console.error('Error extracting fields from DOCX:', error);
    // Provide fallback fields even if extraction fails
    return [
      { name: 'title', displayName: 'Title', fieldType: 'text', required: true, options: null },
      { name: 'content', displayName: 'Content', fieldType: 'textarea', required: true, options: null },
    ];
  }
}

// Helper function to highlight placeholders in HTML
function highlightPlaceholders(html: string): string {
  return html.replace(
    /{{([^{}]+)}}/g,
    '<span class="bg-yellow-200 px-1">{{$1}}</span>'
  );
}

// Create a comprehensive HTML preview with both placeholder fields and surrounding content
async function createPlaceholderPreviewForTemplate(templateUuid: string): Promise<string> {
  try {
    // Get template fields
    const fields = await storage.getTemplateFields(templateUuid);
    const template = await storage.getTemplateByUuid(templateUuid);
    
    if (!template || !fields) {
      return '<div class="p-4"><p>Preview not available for this template.</p></div>';
    }
    
    try {
      // Try to extract the original document content for a more complete preview
      const templateBuffer = await readFileFromStorage(template.filePath);
      
      // Use JSZip to extract content from DOCX
      const zip = new JSZip();
      const zipContents = await zip.loadAsync(templateBuffer);
      
      // Extract text content from main document and other XML files
      let documentContent = '';
      
      // XML files that might contain text content
      const xmlFiles = [
        'word/document.xml',  // Main document content
        'word/header1.xml', 'word/header2.xml', 'word/header3.xml', // Headers
        'word/footer1.xml', 'word/footer2.xml', 'word/footer3.xml'  // Footers
      ];
      
      // Process each XML file to extract text with placeholders intact
      for (const xmlPath of xmlFiles) {
        const fileObj = zipContents.files[xmlPath];
        if (fileObj) {
          try {
            // Get the XML content
            const xmlContent = await fileObj.async('string');
            
            // Extract readable text from the XML, preserving placeholders
            let extractedText = xmlContent
              .replace(/<\/w:t>.*?<w:t[^>]*>/g, ' ') // Replace tag breaks with spaces
              .replace(/<[^>]+>/g, '') // Remove remaining XML tags
              .replace(/\s+/g, ' ') // Normalize whitespace
              .trim();
            
            // Add the extracted text to our document content
            if (extractedText) {
              documentContent += (documentContent ? '\n\n' : '') + extractedText;
            }
          } catch (xmlError) {
            console.warn(`Error extracting text from ${xmlPath}:`, xmlError);
          }
        }
      }
      
      // If we successfully extracted content, create a more complete preview
      if (documentContent) {
        // Highlight all placeholders in the content
        const highlightedContent = documentContent.replace(
          /{{([^{}]+)}}/g,
          '<span class="bg-yellow-200 px-1 rounded">{{$1}}</span>'
        );
        
        // Create HTML preview with document content
        return `
          <div class="p-4">
            <h1 class="text-xl font-bold mb-4">${template.name} - Preview</h1>
            <p class="mb-4">Template preview with highlighted placeholders:</p>
            <div class="border p-4 rounded bg-white mb-6 whitespace-pre-wrap">
              ${highlightedContent}
            </div>
            <h2 class="text-lg font-semibold mb-3">Available Fields:</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              ${fields.map(field => `
                <div class="border rounded p-3 bg-gray-50">
                  <p class="font-medium text-gray-800">${field.displayName}</p>
                  <p class="text-sm text-gray-600">Field name: <code>{{${field.name}}}</code></p>
                  <p class="text-sm text-gray-600">Type: ${field.fieldType || 'text'}</p>
                  ${field.required ? '<p class="text-xs text-red-600">Required</p>' : ''}
                </div>
              `).join('')}
            </div>
          </div>
        `;
      }
    } catch (contentError) {
      console.warn('Error extracting template content:', contentError);
      // Fall back to simple field preview if extraction fails
    }
    
    // Fallback: Generate HTML with just placeholder fields
    let html = `
      <div class="p-4">
        <h1 class="text-xl font-bold mb-4">${template.name} - Preview</h1>
        <p class="mb-4">This is a generated preview showing the template fields:</p>
        <div class="space-y-4">
    `;
    
    fields.forEach(field => {
      html += `
        <div class="mb-2">
          <p class="font-medium">${field.displayName}:</p>
          <p class="bg-yellow-200 px-2 py-1 rounded inline-block">{{${field.name}}}</p>
        </div>
      `;
    });
    
    html += `
        </div>
        <p class="mt-4 text-sm text-gray-500">Note: This is a generated preview. The actual template may have different formatting.</p>
      </div>
    `;
    
    return html;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error creating placeholder preview: ${errorMessage}`);
    return '<div class="p-4"><p>Preview not available for this template.</p></div>';
  }
}
