/**
 * Service để phân tích và đồng bộ fields từ template DOCX
 * Đảm bảo quy trình: Phân tích => Lưu trữ => Truy xuất chính xác
 */

import mammoth from 'mammoth';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { storage } from '../storage-uuid';

export interface TemplateField {
  name: string;
  displayName: string;
  fieldType: 'text' | 'textarea' | 'number' | 'date' | 'select';
  required: boolean;
  options?: string;
}

export class TemplateFieldAnalyzer {
  
  /**
   * Phân tích fields từ template DOCX buffer
   */
  static async analyzeFields(templateBuffer: Buffer): Promise<TemplateField[]> {
    try {
      // Bước 1: Extract placeholders từ DOCX XML structure
      const placeholders = await this.extractPlaceholdersFromDocx(templateBuffer);
      
      // Bước 2: Convert placeholders thành field objects với metadata
      const fields = this.convertPlaceholdersToFields(placeholders);
      
      console.log(`Analyzed ${fields.length} fields from template:`, fields.map(f => f.name));
      return fields;
      
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error analyzing template fields:', errorMessage);
      throw new Error(`Failed to analyze template fields: ${errorMessage}`);
    }
  }
  
  /**
   * Extract placeholders trực tiếp từ DOCX XML structure
   */
  private static async extractPlaceholdersFromDocx(buffer: Buffer): Promise<string[]> {
    try {
      // Method 1: Sử dụng docxtemplater để kiểm tra placeholders
      const zip = new PizZip(buffer);
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        errorLogging: false,
        delimiters: { start: '{', end: '}' }
      });
      
      // Method 2: Extract từ XML content trực tiếp
      const documentXml = zip.files['word/document.xml'];
      if (documentXml) {
        const xmlContent = documentXml.asText();
        const placeholders = this.extractFromXml(xmlContent);
        
        if (placeholders.length > 0) {
          console.log('Extracted placeholders from XML:', placeholders);
          return placeholders;
        }
      }
      
      // Method 3: Fallback - extract từ text content
      const result = await mammoth.extractRawText({ buffer });
      const textPlaceholders = this.extractFromText(result.value);
      
      console.log('Extracted placeholders from text:', textPlaceholders);
      return textPlaceholders;
      
    } catch (error) {
      console.error('Error extracting placeholders:', error);
      return [];
    }
  }
  
  /**
   * Extract placeholders từ XML content
   */
  private static extractFromXml(xmlContent: string): string[] {
    const placeholders: string[] = [];
    
    // Pattern 1: Standard {{fieldName}} trong XML
    const regex1 = /{([^{}]+)}/g;
    let match1;
    while ((match1 = regex1.exec(xmlContent)) !== null) {
      const placeholder = match1[1].trim();
      if (placeholder && !placeholders.includes(placeholder)) {
        placeholders.push(placeholder);
      }
    }
    
    // Pattern 2: Split across XML tags <w:t>{field</w:t><w:t>Name}</w:t>
    const splitPattern = /<w:t[^>]*>([^<]*{[^}]*)<\/w:t>\s*<w:t[^>]*>([^}]*}[^<]*)<\/w:t>/g;
    let match2;
    while ((match2 = splitPattern.exec(xmlContent)) !== null) {
      const combined = match2[1] + match2[2];
      const innerMatch = combined.match(/{([^{}]+)}/);
      if (innerMatch) {
        const placeholder = innerMatch[1].trim();
        if (placeholder && !placeholders.includes(placeholder)) {
          placeholders.push(placeholder);
        }
      }
    }
    
    return placeholders;
  }
  
  /**
   * Extract placeholders từ text content
   */
  private static extractFromText(content: string): string[] {
    const placeholders: string[] = [];
    const regex = /{([^{}]+)}/g;
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      const placeholder = match[1].trim();
      if (placeholder && !placeholders.includes(placeholder)) {
        placeholders.push(placeholder);
      }
    }
    
    return placeholders;
  }
  
  /**
   * Convert placeholders thành field objects với smart typing
   */
  private static convertPlaceholdersToFields(placeholders: string[]): TemplateField[] {
    return placeholders.map(placeholder => {
      const field: TemplateField = {
        name: placeholder,
        displayName: this.generateDisplayName(placeholder),
        fieldType: this.inferFieldType(placeholder),
        required: this.inferRequired(placeholder),
      };
      
      // Add options for select fields
      if (field.fieldType === 'select') {
        field.options = this.generateSelectOptions(placeholder);
      }
      
      return field;
    });
  }
  
  /**
   * Generate display name từ field name
   */
  private static generateDisplayName(fieldName: string): string {
    return fieldName
      .replace(/([A-Z])/g, ' $1') // Add space before capitals
      .replace(/^./, str => str.toUpperCase()) // Capitalize first letter
      .trim();
  }
  
  /**
   * Infer field type từ field name
   */
  private static inferFieldType(fieldName: string): TemplateField['fieldType'] {
    const name = fieldName.toLowerCase();
    
    if (name.includes('date') || name.includes('time')) {
      return 'date';
    }
    
    if (name.includes('amount') || name.includes('price') || name.includes('number') || name.includes('num')) {
      return 'number';
    }
    
    if (name.includes('description') || name.includes('content') || name.includes('paragraph') || name.includes('notes')) {
      return 'textarea';
    }
    
    if (name.includes('status') || name.includes('type') || name.includes('category')) {
      return 'select';
    }
    
    return 'text';
  }
  
  /**
   * Infer nếu field required
   */
  private static inferRequired(fieldName: string): boolean {
    const name = fieldName.toLowerCase();
    return name.includes('name') || name.includes('title') || name.includes('id') || name.includes('number');
  }
  
  /**
   * Generate select options cho select fields
   */
  private static generateSelectOptions(fieldName: string): string {
    const name = fieldName.toLowerCase();
    
    if (name.includes('status')) {
      return 'Active,Inactive,Pending';
    }
    
    if (name.includes('type')) {
      return 'Type A,Type B,Type C';
    }
    
    if (name.includes('category')) {
      return 'Category 1,Category 2,Category 3';
    }
    
    return 'Option 1,Option 2,Option 3';
  }
  
  /**
   * Validate field mapping với template
   */
  static async validateFieldMapping(templateUuid: string, fieldData: Record<string, string>): Promise<boolean> {
    try {
      const templateFields = await storage.getTemplateFields(templateUuid);
      const requiredFields = templateFields.filter(f => f.required).map(f => f.name);
      
      // Check nếu tất cả required fields có giá trị
      for (const requiredField of requiredFields) {
        if (!fieldData[requiredField] || fieldData[requiredField].trim() === '') {
          console.log(`Missing required field: ${requiredField}`);
          return false;
        }
      }
      
      return true;
    } catch (error) {
      console.error('Error validating field mapping:', error);
      return false;
    }
  }
  
  /**
   * Sync fields từ template file với database
   */
  static async syncTemplateFields(templateUuid: string, templateBuffer: Buffer): Promise<void> {
    try {
      // Analyze fields từ template
      const analyzedFields = await this.analyzeFields(templateBuffer);
      
      // Get existing fields từ database
      const existingFields = await storage.getTemplateFields(templateUuid);
      
      // Convert analyzed fields thành database format
      const fieldRecords = analyzedFields.map(field => ({
        name: field.name,
        displayName: field.displayName,
        fieldType: field.fieldType,
        required: field.required,
        options: field.options || undefined,
      }));
      
      // Update fields trong database
      await storage.updateTemplateFields(templateUuid, fieldRecords);
      
      console.log(`Synced ${fieldRecords.length} fields for template ${templateUuid}`);
    } catch (error) {
      console.error('Error syncing template fields:', error);
      throw error;
    }
  }
}

export const templateFieldAnalyzer = TemplateFieldAnalyzer;