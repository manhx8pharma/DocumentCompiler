import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';

/**
 * Marker constants for preview highlighting.
 * These markers are used to identify field positions in the rendered document
 * so we can wrap them with highlight spans after Mammoth conversion.
 */
export const FIELD_MARKER = {
  FILLED_START: '___FIELD_FILLED_START___',
  FILLED_END: '___FIELD_FILLED_END___',
  EMPTY_START: '___FIELD_EMPTY_START___',
  EMPTY_END: '___FIELD_EMPTY_END___',
  SEPARATOR: '::',
};

/**
 * Sanitize placeholder tag by removing default values and options syntax.
 * Converts: {{field='default'['opt1']['opt2']}} -> field
 * Converts: {{field=default|opt1|opt2}} -> field (legacy syntax)
 * Converts: {{field['opt1']['opt2']}} -> field
 * Converts: {{field=default}} -> field
 * 
 * Also handles:
 * - Smart quotes from Word (U+2018, U+2019, U+201C, U+201D)
 * - Extra whitespace
 */
export function sanitizePlaceholderTag(tag: string): string {
  if (!tag || typeof tag !== 'string') {
    return tag;
  }
  
  let sanitized = tag.trim();
  
  // Normalize smart quotes to straight quotes (Word uses typographic quotes)
  sanitized = sanitized
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")  // Smart single quotes → '
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"'); // Smart double quotes → "
  
  // Remove whitespace before brackets
  sanitized = sanitized.replace(/\s+\['/g, "['");
  
  // === New bracket syntax: ['option'] ===
  // Remove bracket options: field['opt1']['opt2'] -> field
  // Also handles: field='default'['opt1']['opt2'] -> field
  if (sanitized.includes("['")) {
    // Get everything before the first bracket
    const firstBracketIndex = sanitized.indexOf("['");
    sanitized = sanitized.substring(0, firstBracketIndex).trim();
  }
  
  // === Handle default value syntax ===
  // Remove default value: field='default' -> field or field=default -> field
  if (sanitized.includes('=')) {
    const eqIndex = sanitized.indexOf('=');
    sanitized = sanitized.substring(0, eqIndex).trim();
  }
  
  // === Legacy pipe syntax: |option ===
  // Remove pipe options: field|opt1|opt2 -> field
  if (sanitized.includes('|')) {
    const pipeIndex = sanitized.indexOf('|');
    sanitized = sanitized.substring(0, pipeIndex).trim();
  }
  
  return sanitized;
}

/**
 * Create a custom parser function for Docxtemplater that normalizes 
 * checklist/default value placeholders to their base field names.
 */
export function createCustomParser() {
  return function customParser(tag: string) {
    const sanitizedTag = sanitizePlaceholderTag(tag);
    
    return {
      get: function(scope: any) {
        // First try the sanitized (base) tag name
        if (scope && typeof scope === 'object' && sanitizedTag in scope) {
          return scope[sanitizedTag];
        }
        // Fallback to original tag (for non-checklist fields)
        if (scope && typeof scope === 'object' && tag in scope) {
          return scope[tag];
        }
        // Return empty string if not found
        return '';
      }
    };
  };
}

/**
 * Options for creating Docxtemplater instance
 */
export interface DocxTemplaterOptions {
  paragraphLoop?: boolean;
  linebreaks?: boolean;
  nullGetter?: () => string;
}

/**
 * Factory function to create Docxtemplater instance for Chorus Block pass-2 rendering.
 * Uses {% %} delimiters to process {%#BLOCKNAME%}...{%/BLOCKNAME%} loop sections.
 * 
 * IMPORTANT: Only use this for pass-2 rendering, after pass-1 has already
 * resolved all {{ }} field placeholders.
 */
export function createChorusDocxTemplater(zip: PizZip): Docxtemplater {
  return new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{%', end: '%}' },
    nullGetter: () => '',
    parser: (tag: string) => ({
      get: (scope: any) => {
        // Strip pipe-options from tag name: "{%varName|opt1|opt2%}" → look up "varName"
        const cleanName = tag.split('|')[0].trim();
        if (scope && typeof scope === 'object') {
          if (cleanName in scope) return scope[cleanName];
          if (tag in scope) return scope[tag];
        }
        return '';
      },
    }),
  });
}

/**
 * Factory function to create Docxtemplater instance with custom parser
 * that handles checklist/default value placeholder syntax.
 * 
 * This should be used instead of `new Docxtemplater()` throughout the codebase
 * to ensure consistent handling of advanced placeholder syntax.
 */
export function createDocxTemplater(
  zip: PizZip, 
  options: DocxTemplaterOptions = {}
): Docxtemplater {
  const defaultOptions: DocxTemplaterOptions = {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => '',
  };
  
  const mergedOptions = { ...defaultOptions, ...options };
  
  const doc = new Docxtemplater(zip, {
    paragraphLoop: mergedOptions.paragraphLoop,
    linebreaks: mergedOptions.linebreaks,
    delimiters: { start: '{{', end: '}}' },
    parser: createCustomParser(),
    nullGetter: mergedOptions.nullGetter,
  });
  
  return doc;
}

/**
 * Create Docxtemplater instance for field analysis (without custom parser).
 * Used when extracting placeholders from template - we want the raw tags.
 */
export function createDocxTemplaterForAnalysis(zip: PizZip): Docxtemplater {
  return new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: '{{', end: '}}' },
  });
}

/**
 * Create a custom parser for PREVIEW mode that emits markers around field values.
 * This allows us to identify exact field positions after Mammoth HTML conversion.
 * 
 * - Filled values are wrapped with: ___FIELD_FILLED_START___fieldName::value___FIELD_FILLED_END___
 * - Empty values are wrapped with: ___FIELD_EMPTY_START___fieldName___FIELD_EMPTY_END___
 */
export function createPreviewParser() {
  return function previewParser(tag: string) {
    const sanitizedTag = sanitizePlaceholderTag(tag);
    
    return {
      get: function(scope: any) {
        let value: string = '';
        
        // First try the sanitized (base) tag name
        if (scope && typeof scope === 'object' && sanitizedTag in scope) {
          value = scope[sanitizedTag];
        }
        // Fallback to original tag (for non-checklist fields)
        else if (scope && typeof scope === 'object' && tag in scope) {
          value = scope[tag];
        }
        
        // Handle array values (checklists) - join with semicolon
        if (Array.isArray(value)) {
          value = value.filter(v => v).join('; ');
        }
        
        // Convert to string
        const strValue = value != null ? String(value).trim() : '';
        
        // Emit marker based on whether field has value
        // Both markers now include fieldName for interactive mode support
        if (strValue === '') {
          // Empty field - emit empty marker with field name
          return `${FIELD_MARKER.EMPTY_START}${sanitizedTag}${FIELD_MARKER.EMPTY_END}`;
        } else {
          // Filled field - emit filled marker with fieldName::value format
          return `${FIELD_MARKER.FILLED_START}${sanitizedTag}${FIELD_MARKER.SEPARATOR}${strValue}${FIELD_MARKER.FILLED_END}`;
        }
      }
    };
  };
}

/**
 * Factory function to create Docxtemplater instance for PREVIEW mode.
 * This version emits markers around field values for highlighting purposes.
 * 
 * IMPORTANT: Only use this for preview HTML generation, NOT for Word document output!
 * The markers would appear in the Word document if used for document generation.
 */
export function createDocxTemplaterPreview(
  zip: PizZip, 
  options: DocxTemplaterOptions = {}
): Docxtemplater {
  const defaultOptions: DocxTemplaterOptions = {
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => `${FIELD_MARKER.EMPTY_START}unknown${FIELD_MARKER.EMPTY_END}`,
  };
  
  const mergedOptions = { ...defaultOptions, ...options };
  
  const doc = new Docxtemplater(zip, {
    paragraphLoop: mergedOptions.paragraphLoop,
    linebreaks: mergedOptions.linebreaks,
    delimiters: { start: '{{', end: '}}' },
    parser: createPreviewParser(),
    nullGetter: mergedOptions.nullGetter,
  });
  
  return doc;
}

/**
 * Escape HTML entities in a string
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * CSS styles for field highlighting in preview
 */
export const fieldHighlightStyles = `
  <style>
    .field-empty {
      background-color: #FEF3C7;
      padding: 1px 3px;
      border-radius: 2px;
    }
    .field-filled {
      background-color: #D1FAE5;
      padding: 1px 3px;
      border-radius: 2px;
    }
  </style>
`;

/**
 * Strip HTML tags from a string
 */
function stripHtmlTags(str: string): string {
  return str.replace(/<[^>]*>/g, '');
}

/**
 * Post-process HTML preview to convert field markers into highlight spans.
 * 
 * This function finds the markers emitted by createDocxTemplaterPreview() and
 * converts them to styled HTML spans:
 * - ___FIELD_EMPTY_START___fieldName___FIELD_EMPTY_END___ -> <span class="field-empty">{{fieldName}}</span>
 * - ___FIELD_FILLED_START___value___FIELD_FILLED_END___ -> <span class="field-filled">value</span>
 * 
 * Note: Mammoth may split markers across HTML tags, so we use [\s\S]*? to match
 * any content (including HTML tags) between START and END markers.
 * 
 * This approach ensures ONLY the actual field positions are highlighted,
 * not any other text that happens to match field values.
 * 
 * @param html - The rendered HTML content with markers
 * @returns HTML with highlighted field values (markers converted to spans)
 */
export function highlightPreviewHtml(
  html: string, 
  _fieldValues?: Record<string, string> // Keep parameter for backward compatibility but not used
): string {
  let result = html;
  
  // Convert empty field markers to yellow-highlighted placeholders
  // Pattern: ___FIELD_EMPTY_START___fieldName___FIELD_EMPTY_END___
  // Use [\s\S]*? to match any content including HTML tags that Mammoth may have inserted
  const emptyPattern = new RegExp(
    `${escapeMarker(FIELD_MARKER.EMPTY_START)}([\\s\\S]*?)${escapeMarker(FIELD_MARKER.EMPTY_END)}`,
    'g'
  );
  result = result.replace(emptyPattern, (match, rawFieldName) => {
    // Strip any HTML tags that Mammoth may have inserted between markers
    const fieldName = stripHtmlTags(rawFieldName).trim();
    return `<span class="field-empty">{{${fieldName}}}</span>`;
  });
  
  // Convert filled field markers to green-highlighted values
  // Pattern: ___FIELD_FILLED_START___fieldName::value___FIELD_FILLED_END___
  const filledPattern = new RegExp(
    `${escapeMarker(FIELD_MARKER.FILLED_START)}([\\s\\S]*?)${escapeMarker(FIELD_MARKER.FILLED_END)}`,
    'g'
  );
  result = result.replace(filledPattern, (match, rawContent) => {
    // Strip any HTML tags, then extract value (may include fieldName::value format)
    const cleanContent = stripHtmlTags(rawContent);
    // Check if content has fieldName::value format
    const separatorIndex = cleanContent.indexOf(FIELD_MARKER.SEPARATOR);
    const cleanValue = separatorIndex >= 0 
      ? cleanContent.substring(separatorIndex + FIELD_MARKER.SEPARATOR.length) 
      : cleanContent;
    // Handle line breaks - convert \n to <br> for display
    let displayValue = escapeHtml(cleanValue);
    displayValue = displayValue
      .replace(/\r\n/g, '<br>')
      .replace(/\n/g, '<br>')
      .replace(/\r/g, '<br>');
    return `<span class="field-filled">${displayValue}</span>`;
  });
  
  return result;
}

/**
 * Escape marker string for use in regex
 */
function escapeMarker(marker: string): string {
  return marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Token types for interactive preview
 */
export interface TextToken {
  type: 'text';
  content: string;
}

export interface FieldToken {
  type: 'field';
  fieldName: string;
  value: string;
  isEmpty: boolean;
  occurrenceIndex: number; // 0-based index for repeated fields
}

export interface TableToken {
  type: 'table';
  tableName: string; // matches <<TABLE_NAME>> in .docx
}

export type PreviewToken = TextToken | FieldToken | TableToken;

/**
 * Result of parsing interactive preview data
 */
export interface InteractivePreviewData {
  tokens: PreviewToken[];
  fieldOccurrences: Record<string, number>; // fieldName -> count of occurrences
}

/**
 * Generate structured token data for interactive preview.
 * Instead of converting markers to HTML spans, this returns an array of tokens
 * that can be rendered by React with input elements at field positions.
 * 
 * @param html - The rendered HTML content with markers from createDocxTemplaterPreview()
 * @returns InteractivePreviewData with tokens and field occurrence counts
 */
export function generateInteractivePreviewData(html: string): InteractivePreviewData {
  const tokens: PreviewToken[] = [];
  const fieldOccurrences: Record<string, number> = {};
  const fieldOccurrenceCounters: Record<string, number> = {};
  
  // In mammoth HTML, "<<NAME>>" appears as "&lt;&lt;NAME>>" or "&lt;&lt;NAME&gt;&gt;"
  // TABLE_MARKER_PATTERN detects these and emits TableToken.
  const TABLE_MARKER_RE = /&lt;&lt;([A-Z0-9_]+)(?:&gt;&gt;|>>)/g;

  // Pre-process: replace <<TABLE_NAME>> HTML patterns with a unique sentinel
  // so that the main field-marker pattern below doesn't need to know about them.
  const TABLE_SENTINEL_PREFIX = '___TABLE_TOKEN___';
  const tableNames: string[] = [];
  const htmlWithSentinels = html.replace(TABLE_MARKER_RE, (_match, name) => {
    const idx = tableNames.length;
    tableNames.push(name);
    return `${TABLE_SENTINEL_PREFIX}${idx}___`;
  });

  // Pattern to match both empty and filled markers
  const markerPattern = new RegExp(
    `(${escapeMarker(FIELD_MARKER.EMPTY_START)}[\\s\\S]*?${escapeMarker(FIELD_MARKER.EMPTY_END)}|` +
    `${escapeMarker(FIELD_MARKER.FILLED_START)}[\\s\\S]*?${escapeMarker(FIELD_MARKER.FILLED_END)}|` +
    `${TABLE_SENTINEL_PREFIX}\\d+___)`,
    'g'
  );
  
  let lastIndex = 0;
  let match;
  
  while ((match = markerPattern.exec(htmlWithSentinels)) !== null) {
    // Add text before this marker
    if (match.index > lastIndex) {
      const textContent = htmlWithSentinels.substring(lastIndex, match.index);
      if (textContent) {
        tokens.push({ type: 'text', content: textContent });
      }
    }
    
    const markerContent = match[0];

    // Check if this is a table sentinel
    if (markerContent.startsWith(TABLE_SENTINEL_PREFIX)) {
      const idxStr = markerContent.slice(TABLE_SENTINEL_PREFIX.length, -3);
      const tableIdx = parseInt(idxStr, 10);
      const tableName = tableNames[tableIdx];
      if (tableName) {
        tokens.push({ type: 'table', tableName });
      }
      lastIndex = match.index + markerContent.length;
      continue;
    }
    
    // Determine if this is empty or filled field
    const isEmptyField = markerContent.startsWith(FIELD_MARKER.EMPTY_START);
    
    let fieldName: string;
    let value: string;
    
    if (isEmptyField) {
      // Extract field name from empty marker
      const innerContent = markerContent
        .replace(FIELD_MARKER.EMPTY_START, '')
        .replace(FIELD_MARKER.EMPTY_END, '');
      fieldName = stripHtmlTags(innerContent).trim();
      value = '';
    } else {
      // Extract fieldName::value from filled marker
      const innerContent = markerContent
        .replace(FIELD_MARKER.FILLED_START, '')
        .replace(FIELD_MARKER.FILLED_END, '');
      const cleanContent = stripHtmlTags(innerContent).trim();
      
      // Parse fieldName::value format
      const separatorIndex = cleanContent.indexOf(FIELD_MARKER.SEPARATOR);
      if (separatorIndex >= 0) {
        fieldName = cleanContent.substring(0, separatorIndex);
        value = cleanContent.substring(separatorIndex + FIELD_MARKER.SEPARATOR.length);
      } else {
        // Fallback for old format without fieldName
        fieldName = '__unknown__';
        value = cleanContent;
      }
    }
    
    // Track occurrences per fieldName
    if (!(fieldName in fieldOccurrenceCounters)) {
      fieldOccurrenceCounters[fieldName] = 0;
    }
    const occurrenceIndex = fieldOccurrenceCounters[fieldName];
    fieldOccurrenceCounters[fieldName]++;
    
    tokens.push({
      type: 'field',
      fieldName,
      value,
      isEmpty: isEmptyField,
      occurrenceIndex,
    });
    
    lastIndex = match.index + match[0].length;
  }
  
  // Add remaining text after last marker
  if (lastIndex < htmlWithSentinels.length) {
    tokens.push({ type: 'text', content: htmlWithSentinels.substring(lastIndex) });
  }
  
  // Calculate total occurrences per field
  Object.keys(fieldOccurrenceCounters).forEach(name => {
    fieldOccurrences[name] = fieldOccurrenceCounters[name];
  });
  
  return { tokens, fieldOccurrences };
}
