import fs from 'fs';
import { randomUUID } from 'crypto';
import { storage } from '../storage-uuid';
import {
  saveFile,
  extractPlaceholders,
} from '../utils/file-helpers';
import { 
  insertTemplateSchema
} from '@shared/schema';

export const simpleTemplateService = {
  async uploadTemplate(file: { originalname: string; buffer: Buffer }, data: { name: string; category: string; description?: string }) {
    try {
      console.log(`Starting template upload: ${file.originalname}`);
      
      // Generate UUID
      const templateUuid = randomUUID();
      
      // Validate input
      const templateInput = {
        name: data.name,
        category: data.category,
        ...(data.description && { description: data.description })
      };
      
      const validated = insertTemplateSchema.parse(templateInput);
      
      // Save file
      const filePath = await saveFile(
        file.buffer, 
        file.originalname, 
        'templates',
        templateUuid
      );
      
      // Extract fields from document using docxtemplater để chính xác phân tích placeholders
      let cleanPlaceholders: string[] = [];
      
      const Docxtemplater = await import('docxtemplater');
      const PizZip = await import('pizzip');
      
      try {
        const zip = new PizZip.default(file.buffer);
        const doc = new Docxtemplater.default(zip, {
          paragraphLoop: true,
          linebreaks: true,
          delimiters: {
            start: '{',
            end: '}'
          }
        });
        
        // Lấy tất cả placeholders từ template
        const fullText = doc.getFullText();
        const placeholderMatches = fullText.match(/\{([^{}]+)\}/g);
        if (placeholderMatches) {
          const mappedPlaceholders = placeholderMatches.map(p => p.replace(/[{}]/g, '').trim());
          cleanPlaceholders = mappedPlaceholders.filter((value, index, self) => self.indexOf(value) === index);
        }
        
        console.log(`Found ${cleanPlaceholders.length} placeholders using docxtemplater:`, cleanPlaceholders);
      } catch (docxError: any) {
        console.warn('Docxtemplater failed, falling back to text extraction:', docxError?.message || docxError);
        
        // Fallback: Extract fields using mammoth as before
        const mammoth = await import('mammoth');
        const result = await mammoth.extractRawText({ buffer: file.buffer });
        const content = result.value;
        
        cleanPlaceholders = extractPlaceholders(content);
        console.log(`Found ${cleanPlaceholders.length} placeholders using text extraction:`, cleanPlaceholders);
      }
      
      // Convert placeholders to field objects
      const extractedFields = cleanPlaceholders.map((placeholder: string) => ({
        name: placeholder,
        displayName: placeholder.charAt(0).toUpperCase() + placeholder.slice(1),
        fieldType: 'text',
        required: false,
      }));
      console.log(`Extracted ${extractedFields.length} fields from template`);
      
      // Create template record
      const template = await storage.createTemplate({
        name: validated.name,
        category: validated.category as "legal" | "financial" | "hr" | "marketing" | "other",
        description: validated.description || undefined,
        filePath: filePath,
        fieldCount: extractedFields.length,
        uuid: templateUuid,
      });
      
      console.log(`Template created with ID: ${template.id}`);
      
      // Create template field records if any fields were extracted
      if (extractedFields.length > 0) {
        const fieldRecords = extractedFields.map((field: any) => ({
          templateId: template.id,
          name: field.name,
          displayName: field.displayName,
          fieldType: field.fieldType || 'text',
          required: field.required || false,
        }));
        
        await storage.updateTemplateFields(template.uuid, fieldRecords);
        console.log(`Created ${fieldRecords.length} field records for template`);
      }
      
      return template;
      
    } catch (error: any) {
      console.error('Upload error:', error);
      throw new Error(`Upload failed: ${error?.message || error}`);
    }
  }
};