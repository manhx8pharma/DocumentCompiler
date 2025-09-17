import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { readFileSync } from 'fs';
import { join } from 'path';

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
  data: Record<string, any>
): Buffer {
  try {
    console.log(`generateDocumentFromTemplate: Starting with templateBuffer size: ${templateBuffer.length}`);
    console.log(`generateDocumentFromTemplate: Sanitized field values: ${Object.keys(data).length} fields`);
    
    // Load the template into PizZip
    const zip = new PizZip(templateBuffer);
    
    // Initialize docxtemplater with modern API
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: '{{', end: '}}' },
      nullGetter: () => ""  // Return empty string for null/undefined values
    });
    
    // Process field values to handle newlines
    const processedData = processFieldValues(data);
    
    // Set the data to inject
    doc.setData(processedData);
    
    try {
      // Render the document (replace all template variables with their values)
      doc.render();
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
    
    // Create Docxtemplater instance with careful configuration using modern API
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      delimiters: { start: '{{', end: '}}' },
      nullGetter: () => ""  // Return empty string for null/undefined values
    });
    
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