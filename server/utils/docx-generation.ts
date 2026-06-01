import PizZip from 'pizzip';
import { readFileSync } from 'fs';
import { join } from 'path';
import { createDocxTemplater, createChorusDocxTemplater } from './docx-parser';
import { injectTablesIntoZip, type TableData } from './table-injector';

/**
 * Directly processes a DOCX template and replaces placeholders with values
 * 
 * This function uses the updated API for docxtemplater (v3+) to ensure
 * it works correctly with all document types.
 */
/**
 * Process field values to handle newlines correctly
 */
function processFieldValues(data: Record<string, any>): Record<string, any> {
  const processed: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      // Convert newlines to proper format for docxtemplater
      processed[key] = value.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    } else {
      processed[key] = value;
    }
  }
  
  return processed;
}

export function generateDocumentFromTemplate(
  templateBuffer: Buffer,
  data: Record<string, any>,
  tableDataMap?: Record<string, TableData>
): Buffer {
  try {
    console.log(`generateDocumentFromTemplate: Starting with templateBuffer size: ${templateBuffer.length}`);
    console.log(`generateDocumentFromTemplate: Sanitized field values: ${Object.keys(data).length} fields`);
    
    // Load the template into PizZip
    let zip = new PizZip(templateBuffer);
    
    // Inject dynamic tables (<<TABLE_NAME>> markers) before docxtemplater runs
    if (tableDataMap && Object.keys(tableDataMap).length > 0) {
      zip = injectTablesIntoZip(zip, tableDataMap);
    }

    // Use factory with custom parser for checklist/default value placeholders
    const doc = createDocxTemplater(zip);
    
    // Process field values to handle newlines
    const processedData = processFieldValues(data);
    
    try {
      // Render the document (replace all template variables with their values)
      doc.render(processedData);
    } catch (error: any) {
      // Handle errors during rendering more gracefully
      console.error('Error rendering document:', error);
      
      if (error.properties && error.properties.errors) {
        console.log('Error details:', error.properties.errors);
      }
      
      // Attempt a more minimal rendering approach - create a simple document with field values
      const errorMessage = "Error rendering template. Please check the template format and field values.";
      throw new Error(`Document rendering failed: ${errorMessage}`);
    }
    
    // Get the zip document as a buffer
    const buffer = doc.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE'
    });
    
    console.log('Document generated successfully, size:', buffer.length);
    return buffer;
  } catch (error) {
    console.error('Error generating document from template:', error);
    throw error;
  }
}

/**
 * Two-pass document generation for templates containing both {{ }} field placeholders
 * and {%#BLOCK%}...{%/BLOCK%} chorus block sections.
 *
 * Pass 1: Inject dynamic tables + render {{ }} field placeholders (standard flow).
 * Pass 2: Render {%#BLOCKNAME%}...{%/BLOCKNAME%} loop sections using chorus block data.
 *         Skipped entirely when blockDataMap is empty → zero overhead for normal templates.
 */
export function generateDocumentTwoPasses(
  templateBuffer: Buffer,
  fieldData: Record<string, any>,
  tableDataMap?: Record<string, TableData>,
  blockDataMap?: Record<string, Array<Record<string, string>>>
): Buffer {
  // --- Pass 1: table injection + {{ }} field rendering ---
  let zip = new PizZip(templateBuffer);
  if (tableDataMap && Object.keys(tableDataMap).length > 0) {
    zip = injectTablesIntoZip(zip, tableDataMap);
  }
  const doc1 = createDocxTemplater(zip);
  const processedData = processFieldValues(fieldData);
  try {
    doc1.render(processedData);
  } catch (err: any) {
    console.error('[generateDocumentTwoPasses] Pass-1 render error:', err);
    throw new Error(`Document rendering failed (pass 1): ${err.message || 'Unknown error'}`);
  }

  // If no chorus blocks, return pass-1 result immediately
  if (!blockDataMap || Object.keys(blockDataMap).length === 0) {
    return doc1.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  }

  // --- Pass 2: {%#BLOCK%}...{%/BLOCK%} chorus block loop rendering ---
  const pass1Buffer = doc1.getZip().generate({ type: 'nodebuffer' });
  const zip2 = new PizZip(pass1Buffer);
  const doc2 = createChorusDocxTemplater(zip2);
  try {
    doc2.render(blockDataMap);
  } catch (err: any) {
    console.error('[generateDocumentTwoPasses] Pass-2 render error:', err);
    throw new Error(`Document rendering failed (pass 2 - chorus blocks): ${err.message || 'Unknown error'}`);
  }

  return doc2.getZip().generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/**
 * Fixed implementation that preserves all template text while replacing just the
 * placeholder fields with their values.
 * Uses modern docxtemplater API (v3+).
 */
export function processTemplate(
  templateBuffer: Buffer,
  data: Record<string, any>
): Buffer {
  try {
    // Create a new PizZip instance
    const zip = new PizZip(templateBuffer);
    
    // Use factory with custom parser for checklist/default value placeholders
    const doc = createDocxTemplater(zip);
    
    try {
      // Render the document (replace placeholders with values)
      doc.render(data);
    } catch (error: any) {
      console.error('Error rendering document in processTemplate:', error);
      
      if (error.properties && error.properties.errors) {
        console.log('Detailed error information:', error.properties.errors);
        
        // Check if the error is related to a specific template tag
        if (error.properties.explanation) {
          console.log('Explanation:', error.properties.explanation);
        }
      }
      
      throw error;
    }
    
    // Generate final document
    const buffer = doc.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE'
    });
    
    return buffer;
  } catch (error) {
    console.error('Error processing template:', error);
    throw error;
  }
}