/**
 * Service để phân tích và đồng bộ fields từ template DOCX
 * Đảm bảo quy trình: Phân tích => Lưu trữ => Truy xuất chính xác
 * 
 * Cú pháp placeholder hỗ trợ:
 * - Basic: {{fieldName}}
 * - Default value: {{fieldName='default value'}}
 * - Checklist: {{fieldName['opt1']['opt2']['opt3']}}
 * - Checklist with default: {{fieldName='default'['opt1']['opt2']['opt3']}}
 * - Legacy pipe syntax: {{fieldName|opt1|opt2}} (backward compatible)
 */

import mammoth from 'mammoth';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { storage } from '../storage-uuid';

export interface TemplateField {
  name: string;
  displayName: string;
  fieldType: 'text' | 'textarea' | 'number' | 'date' | 'select' | 'checklist';
  required: boolean;
  options?: string; // JSON array for checklist: ["opt1", "opt2"]
  defaultValue?: string; // Default value for the field
}

interface ParsedFieldSyntax {
  name: string;
  defaultValue?: string;
  options?: string[];
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
   * Bước 1: Nối tất cả <w:t> nodes thành chuỗi text liên tục
   * Giải quyết vấn đề Word chia nhỏ placeholder thành nhiều XML runs
   */
  private static collectRunsFromXml(xmlContent: string): string {
    // Extract tất cả nội dung từ <w:t> tags và nối lại
    const textParts: string[] = [];
    const wtRegex = /<w:t[^>]*>([^<]*)<\/w:t>/g;
    let match;
    
    while ((match = wtRegex.exec(xmlContent)) !== null) {
      textParts.push(match[1]);
    }
    
    const collectedText = textParts.join('');
    console.log('[Parser] Collected text from XML runs:', collectedText.substring(0, 500) + '...');
    return collectedText;
  }

  /**
   * Extract placeholders từ XML content
   * Sử dụng collectRuns để nối text trước khi tìm placeholder
   */
  private static extractFromXml(xmlContent: string): string[] {
    const placeholders: string[] = [];
    
    // Bước 1: Nối tất cả text từ XML runs
    const collectedText = this.collectRunsFromXml(xmlContent);
    
    // Bước 2: Tìm placeholders với double braces {{...}}
    const doubleBraceRegex = /\{\{([^{}]+)\}\}/g;
    let match;
    
    while ((match = doubleBraceRegex.exec(collectedText)) !== null) {
      const placeholder = match[1].trim();
      if (placeholder && !placeholders.includes(placeholder)) {
        placeholders.push(placeholder);
      }
    }
    
    // Bước 3: Fallback - tìm single braces {..} nếu không tìm thấy double braces
    if (placeholders.length === 0) {
      const singleBraceRegex = /\{([^{}]+)\}/g;
      while ((match = singleBraceRegex.exec(collectedText)) !== null) {
        const placeholder = match[1].trim();
        if (placeholder && !placeholders.includes(placeholder)) {
          placeholders.push(placeholder);
        }
      }
    }
    
    console.log('[Parser] Extracted placeholders:', placeholders);
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
   * Parse field syntax - hỗ trợ cả cú pháp mới và cũ:
   * 
   * Cú pháp mới (khuyến nghị):
   * - {{field['opt1']['opt2']}}
   * - {{field='default'['opt1']['opt2']}}
   * 
   * Cú pháp cũ (tương thích ngược):
   * - {{field|opt1|opt2}}
   * - {{field=default|opt1|opt2}}
   * 
   * Returns: { name, defaultValue, options }
   */
  private static parseFieldSyntax(placeholder: string): ParsedFieldSyntax {
    let name = placeholder;
    let defaultValue: string | undefined;
    let options: string[] | undefined;
    
    console.log('[Parser] Parsing placeholder:', placeholder);
    
    // Normalize smart quotes to straight quotes (Word uses typographic quotes)
    // U+2018 (') U+2019 (') U+201C (") U+201D (") → straight quotes
    let normalizedPlaceholder = placeholder
      .replace(/[\u2018\u2019\u201A\u201B]/g, "'")  // Smart single quotes → '
      .replace(/[\u201C\u201D\u201E\u201F]/g, '"'); // Smart double quotes → "
    
    // Normalize: remove extra whitespace before brackets
    normalizedPlaceholder = normalizedPlaceholder.replace(/\s+\['/g, "['");
    
    console.log('[Parser] Normalized placeholder:', normalizedPlaceholder);
    
    // === Cú pháp mới: ['option'] ===
    // Pattern: fieldName='default'['opt1']['opt2'] hoặc fieldName['opt1']['opt2']
    const bracketOptionsRegex = /\['((?:\\'|[^'])*)'\]/g;
    // Detect bracket syntax - tolerate whitespace before ['
    const hasBracketOptions = /\['/.test(normalizedPlaceholder);
    
    if (hasBracketOptions) {
      // Extract options từ ['...'] - sử dụng normalizedPlaceholder
      options = [];
      let bracketMatch;
      while ((bracketMatch = bracketOptionsRegex.exec(normalizedPlaceholder)) !== null) {
        // Unescape \' thành '
        const optionValue = bracketMatch[1].replace(/\\'/g, "'");
        options.push(optionValue);
      }
      
      // Extract phần trước các brackets (fieldName hoặc fieldName='default')
      const firstBracketIndex = normalizedPlaceholder.indexOf("['");
      const beforeBrackets = normalizedPlaceholder.substring(0, firstBracketIndex).trim();
      
      // Check for default value với quotes: field='default'
      const defaultWithQuotesMatch = beforeBrackets.match(/^([^=]+)='((?:\\'|[^'])*)'$/);
      if (defaultWithQuotesMatch) {
        name = defaultWithQuotesMatch[1].trim();
        defaultValue = defaultWithQuotesMatch[2].replace(/\\'/g, "'");
      } 
      // Check for default value không có quotes: field=default
      else if (beforeBrackets.includes('=')) {
        const eqIndex = beforeBrackets.indexOf('=');
        name = beforeBrackets.substring(0, eqIndex).trim();
        let defVal = beforeBrackets.substring(eqIndex + 1).trim();
        // Remove quotes nếu có
        if (defVal.startsWith("'") && defVal.endsWith("'")) {
          defVal = defVal.slice(1, -1).replace(/\\'/g, "'");
        }
        defaultValue = defVal;
      } else {
        name = beforeBrackets;
      }
      
      console.log('[Parser] New syntax detected:', { name, defaultValue, options });
    }
    // === Cú pháp cũ: pipe-separated ===
    else if (placeholder.includes('|')) {
      const parts = placeholder.split('|');
      const firstPart = parts[0];
      const optionParts = parts.slice(1);
      
      // Check if first part has default value: field=default
      if (firstPart.includes('=')) {
        const eqIndex = firstPart.indexOf('=');
        name = firstPart.substring(0, eqIndex).trim();
        defaultValue = firstPart.substring(eqIndex + 1).trim();
      } else {
        name = firstPart.trim();
      }
      
      // Store options as array
      options = optionParts.map(opt => opt.trim()).filter(opt => opt.length > 0);
      
      console.log('[Parser] Legacy pipe syntax detected:', { name, defaultValue, options });
    } 
    // === Chỉ có default value ===
    else if (placeholder.includes('=')) {
      const eqIndex = placeholder.indexOf('=');
      name = placeholder.substring(0, eqIndex).trim();
      let defVal = placeholder.substring(eqIndex + 1).trim();
      
      // Remove quotes nếu có
      if (defVal.startsWith("'") && defVal.endsWith("'")) {
        defVal = defVal.slice(1, -1).replace(/\\'/g, "'");
      }
      defaultValue = defVal;
      
      console.log('[Parser] Default value only:', { name, defaultValue });
    } else {
      console.log('[Parser] Simple field:', { name });
    }
    
    // Validate: nếu có options, đảm bảo không rỗng
    if (options && options.length === 0) {
      options = undefined;
    }
    
    // Validate: kiểm tra unmatched brackets/quotes
    const openBrackets = (normalizedPlaceholder.match(/\['/g) || []).length;
    const closeBrackets = (normalizedPlaceholder.match(/'\]/g) || []).length;
    if (openBrackets !== closeBrackets) {
      console.warn(`[Parser] Warning: Unmatched brackets in placeholder "${placeholder}" (open: ${openBrackets}, close: ${closeBrackets})`);
    }
    
    // Validate: kiểm tra unmatched quotes trong default value
    const beforeBracket = normalizedPlaceholder.split("['")[0];
    if (beforeBracket.includes("='")) {
      const afterEquals = beforeBracket.split("='")[1] || '';
      const quoteCount = (afterEquals.match(/(?<!\\)'/g) || []).length;
      if (quoteCount % 2 !== 0 && !afterEquals.endsWith("'")) {
        console.warn(`[Parser] Warning: Unmatched quotes in default value of "${placeholder}"`);
      }
    }
    
    return { name, defaultValue, options };
  }
  
  /**
   * Convert placeholders thành field objects với smart typing
   */
  private static convertPlaceholdersToFields(placeholders: string[]): TemplateField[] {
    return placeholders.map(placeholder => {
      // Parse new syntax: {{field=default|opt1|opt2}}
      const parsed = this.parseFieldSyntax(placeholder);
      
      // Determine field type based on parsed data
      let fieldType: TemplateField['fieldType'];
      let options: string | undefined;
      
      if (parsed.options && parsed.options.length > 0) {
        // Has options => checklist type
        fieldType = 'checklist';
        options = JSON.stringify(parsed.options);
      } else {
        // Infer type from name
        fieldType = this.inferFieldType(parsed.name);
        if (fieldType === 'select') {
          options = this.generateSelectOptions(parsed.name);
        }
      }
      
      const field: TemplateField = {
        name: parsed.name,
        displayName: this.generateDisplayName(parsed.name),
        fieldType,
        required: this.inferRequired(parsed.name),
        options,
        defaultValue: parsed.defaultValue,
      };
      
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
        defaultValue: field.defaultValue || undefined,
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