import fs from 'fs';
import path from 'path';
import PizZip from 'pizzip';
import mammoth from 'mammoth';
import { createDocxTemplater } from '../utils/docx-parser';

export interface TemplateProcessingResult {
  htmlContent: string;
  buffer: Buffer;
  textContent: string;
  filePath?: string;
}

/**
 * Transform document elements to capture alignment information
 * Mammoth doesn't preserve alignment by default, so we need to detect it
 * and assign custom style names that can be mapped to CSS classes
 */
function transformElement(element: any): any {
  if (element.children) {
    const children = element.children.map(transformElement);
    element = { ...element, children };
  }
  
  if (element.type === "paragraph") {
    // Detect alignment and assign custom style names
    // Only assign if no existing styleId to avoid overwriting named styles
    if (element.alignment === "center" && !element.styleId) {
      return { ...element, styleName: "center-aligned" };
    } else if (element.alignment === "right" && !element.styleId) {
      return { ...element, styleName: "right-aligned" };
    } else if (element.alignment === "both" && !element.styleId) {
      // "both" means justify in Word
      return { ...element, styleName: "justify-aligned" };
    } else if (element.alignment === "justify" && !element.styleId) {
      return { ...element, styleName: "justify-aligned" };
    }
    
    // Handle empty paragraphs as spacers
    if (element.children && element.children.length === 0) {
      return { ...element, styleName: "empty-paragraph" };
    }
  }
  
  return element;
}

/**
 * Enhanced mammoth options with alignment support
 */
const enhancedMammothOptions = {
  transformDocument: transformElement,
  includeDefaultStyleMap: true,
  includeEmbeddedStyleMap: true,
  styleMap: [
    // Alignment classes (from transformer)
    "p[style-name='center-aligned'] => p.text-center:fresh",
    "p[style-name='right-aligned'] => p.text-right:fresh",
    "p[style-name='justify-aligned'] => p.text-justify:fresh",
    "p[style-name='empty-paragraph'] => p.spacer:fresh",
    
    // Standard Word styles
    "p[style-name='Normal'] => p.normal",
    "p[style-name='Heading 1'] => h1.heading",
    "p[style-name='Heading 2'] => h2.heading",
    "p[style-name='Heading 3'] => h3.heading",
    "p[style-name='Title'] => h1.title",
    "r[style-name='Strong'] => strong",
    "r[style-name='Emphasis'] => em",
    
    // Default paragraph
    "p => p.paragraph"
  ],
  ignoreEmptyParagraphs: false
};

/**
 * CSS styles for alignment and spacing
 */
const previewStyles = `
  <style>
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .text-justify { text-align: justify; }
    .spacer { height: 0.5em; }
    .paragraph { margin: 0.3em 0; }
    .normal { margin: 0.3em 0; }
    .heading { margin: 0.3em 0; }
    .title { text-align: center; margin: 0.3em 0; }
    h1.heading, h2.heading, h3.heading { font-size: inherit; font-weight: inherit; }
    h1.title { font-size: inherit; font-weight: inherit; }
    strong { font-weight: bold; }
    em { font-style: italic; }
  </style>
`;

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
    
    // Use factory with custom parser for checklist/default value placeholders
    const doc = createDocxTemplater(zip);
    
    // Render template with field data
    doc.render(fieldData);
    
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
    }, enhancedMammothOptions);
    
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
 * Convert a buffer directly to HTML with enhanced formatting
 */
export async function convertBufferToHtml(buffer: Buffer): Promise<string> {
  try {
    const htmlResult = await mammoth.convertToHtml({ buffer }, enhancedMammothOptions);
    return htmlResult.value;
  } catch (error) {
    console.error('Buffer to HTML conversion error:', error);
    throw new Error(`Failed to convert buffer to HTML: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    
    // Apply styling with alignment support - reduced padding for better display
    const styledHtml = `
      ${previewStyles}
      <div style="
        font-family: 'Times New Roman', serif; 
        max-width: 100%; 
        margin: 0; 
        padding: 5px; 
        line-height: 1.5; 
        background: white;
        color: black;
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

/**
 * Get the enhanced mammoth options for use in other modules
 */
export function getEnhancedMammothOptions() {
  return enhancedMammothOptions;
}

/**
 * Get the preview styles for use in other modules
 */
export function getPreviewStyles() {
  return previewStyles;
}
