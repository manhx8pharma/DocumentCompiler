import fs from 'fs';
import path from 'path';
import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';
import mammoth from 'mammoth';

export interface TemplateProcessingResult {
  htmlContent: string;
  buffer: Buffer;
  textContent: string;
  filePath?: string;
}

/**
 * Process a template with field data to generate both HTML preview and document buffer
 */
export async function processTemplateWithData(
  templatePath: string,
  fieldData: Record<string, string>
): Promise<TemplateProcessingResult> {
  
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Template file not found: ${templatePath}`);
  }
  
  try {
    // Read template file
    const templateBuffer = fs.readFileSync(templatePath);
    const zip = new PizZip(templateBuffer);
    
    // Create docx templater instance
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });
    
    // Set field data and render template
    doc.setData(fieldData);
    doc.render();
    
    // Generate processed document buffer
    const processedBuffer = doc.getZip().generate({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });
    
    // Get text content from processed template
    const textContent = doc.getFullText();
    
    // Convert processed document to HTML using mammoth with enhanced options
    const htmlResult = await mammoth.convertToHtml({ 
      buffer: processedBuffer
    }, {
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
    });
    const htmlContent = htmlResult.value;
    
    return {
      htmlContent,
      buffer: processedBuffer,
      textContent
    };
    
  } catch (error) {
    console.error('Template processing error:', error);
    throw new Error(`Failed to process template: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate HTML preview from template and field data with proper formatting
 */
export async function generateTemplatePreview(
  templatePath: string,
  fieldData: Record<string, string>
): Promise<string> {
  
  try {
    const result = await processTemplateWithData(templatePath, fieldData);
    
    // Apply minimal styling to preserve original document formatting
    const styledHtml = `
      <div style="
        font-family: 'Times New Roman', serif; 
        max-width: 800px; 
        margin: 0 auto; 
        padding: 40px; 
        line-height: 1.6; 
        background: white;
        color: black;
        white-space: pre-wrap;
      ">
        ${result.htmlContent}
      </div>
    `;
    
    return styledHtml;
    
  } catch (error) {
    console.error('Template preview generation error:', error);
    return `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
        <h2>Preview Error</h2>
        <p>Unable to generate template preview: ${error instanceof Error ? error.message : 'Unknown error'}</p>
      </div>
    `;
  }
}