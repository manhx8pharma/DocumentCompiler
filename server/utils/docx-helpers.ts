import JSZip from 'jszip';
import fs from 'fs';
import { promisify } from 'util';
import path from 'path';

const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);

/**
 * Creates a simple DOCX file with text content
 * 
 * @param content The text content to include in the document
 * @param placeholders Optional array of placeholder names to add as {{placeholderName}}
 * @returns Buffer containing the DOCX file
 */
export async function createSimpleDocx(
  content: string, 
  placeholders: { name: string; displayName: string }[] = []
): Promise<Buffer> {
  // Create a new JSZip instance
  const zip = new JSZip();
  
  // Add required files for a minimal valid DOCX
  
  // [Content_Types].xml
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`);

  // _rels/.rels
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`);

  // word/_rels/document.xml.rels
  zip.file('word/_rels/document.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`);

  // docProps/app.xml
  zip.file('docProps/app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Application>DocCompile</Application>
  <Template>Normal.dotm</Template>
  <TotalTime>0</TotalTime>
  <Pages>1</Pages>
  <Words>0</Words>
  <Characters>0</Characters>
  <Application>DocCompile</Application>
  <DocSecurity>0</DocSecurity>
  <Lines>0</Lines>
  <Paragraphs>0</Paragraphs>
  <ScaleCrop>false</ScaleCrop>
  <Company></Company>
  <LinksUpToDate>false</LinksUpToDate>
  <CharactersWithSpaces>0</CharactersWithSpaces>
  <SharedDoc>false</SharedDoc>
  <HyperlinksChanged>false</HyperlinksChanged>
  <AppVersion>1.0</AppVersion>
</Properties>`);

  // docProps/core.xml
  zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" 
                  xmlns:dc="http://purl.org/dc/elements/1.1/" 
                  xmlns:dcterms="http://purl.org/dc/terms/" 
                  xmlns:dcmitype="http://purl.org/dc/dcmitype/" 
                  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title></dc:title>
  <dc:subject></dc:subject>
  <dc:creator>DocCompile</dc:creator>
  <cp:keywords></cp:keywords>
  <dc:description></dc:description>
  <cp:lastModifiedBy>DocCompile</cp:lastModifiedBy>
  <cp:revision>1</cp:revision>
  <dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:modified>
</cp:coreProperties>`);

  // word/styles.xml with more styles for better formatting
  zip.file('word/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:default="1" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:pPr/>
    <w:rPr>
      <w:sz w:val="24"/>
      <w:szCs w:val="24"/>
      <w:lang w:val="en-US" w:eastAsia="en-US" w:bidi="ar-SA"/>
    </w:rPr>
  </w:style>
  
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:pPr>
      <w:keepNext/>
      <w:spacing w:before="240" w:after="120"/>
      <w:outlineLvl w:val="0"/>
    </w:pPr>
    <w:rPr>
      <w:b/>
      <w:bCs/>
      <w:sz w:val="36"/>
      <w:szCs w:val="36"/>
    </w:rPr>
  </w:style>
  
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:pPr>
      <w:keepNext/>
      <w:spacing w:before="160" w:after="80"/>
      <w:outlineLvl w:val="1"/>
    </w:pPr>
    <w:rPr>
      <w:b/>
      <w:bCs/>
      <w:sz w:val="30"/>
      <w:szCs w:val="30"/>
    </w:rPr>
  </w:style>
  
  <w:style w:type="paragraph" w:styleId="Section">
    <w:name w:val="Section"/>
    <w:pPr>
      <w:keepNext/>
      <w:spacing w:before="240" w:after="120"/>
      <w:outlineLvl w:val="2"/>
    </w:pPr>
    <w:rPr>
      <w:b/>
      <w:bCs/>
      <w:color w:val="404040"/>
      <w:sz w:val="28"/>
      <w:szCs w:val="28"/>
    </w:rPr>
  </w:style>
  
  <w:style w:type="paragraph" w:styleId="TableHeader">
    <w:name w:val="Table Header"/>
    <w:pPr>
      <w:spacing w:before="40" w:after="40"/>
      <w:jc w:val="center"/>
    </w:pPr>
    <w:rPr>
      <w:b/>
      <w:bCs/>
      <w:sz w:val="24"/>
      <w:szCs w:val="24"/>
    </w:rPr>
  </w:style>
</w:styles>`);

  // Build document.xml with content and placeholders
  let documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>`;

  // Add main content as paragraphs with proper formatting
  const paragraphs = content.split(/\n+/);
  
  for (const paragraph of paragraphs) {
    if (!paragraph.trim()) continue;
    
    // Check if it's a header (starts with # or ##)
    if (paragraph.startsWith('# ')) {
      // Level 1 heading (Title)
      documentXml += `
    <w:p>
      <w:pPr>
        <w:pStyle w:val="Heading1"/>
        <w:spacing w:before="360" w:after="240"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:b/>
          <w:sz w:val="36"/>
          <w:szCs w:val="36"/>
          <w:color w:val="000000"/>
        </w:rPr>
        <w:t>${paragraph.substring(2)}</w:t>
      </w:r>
    </w:p>`;
    } else if (paragraph.startsWith('## ')) {
      // Level 2 heading (Section)
      documentXml += `
    <w:p>
      <w:pPr>
        <w:pStyle w:val="Heading2"/>
        <w:spacing w:before="240" w:after="120"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:b/>
          <w:sz w:val="28"/>
          <w:szCs w:val="28"/>
          <w:color w:val="000000"/>
        </w:rPr>
        <w:t>${paragraph.substring(3)}</w:t>
      </w:r>
    </w:p>`;
    } else if (paragraph === '---') {
      // Horizontal line
      documentXml += `
    <w:p>
      <w:pPr>
        <w:pBdr>
          <w:top w:val="single" w:sz="6" w:space="1" w:color="999999"/>
        </w:pBdr>
      </w:pPr>
      <w:r>
        <w:t></w:t>
      </w:r>
    </w:p>`;
    } else if (paragraph.includes(': ')) {
      // Key-value pair (like "Name: John Doe")
      const [key, ...valueParts] = paragraph.split(': ');
      const value = valueParts.join(': '); // In case value itself contains ": "
      
      documentXml += `
    <w:p>
      <w:pPr>
        <w:spacing w:line="276" w:lineRule="auto"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:b/>
        </w:rPr>
        <w:t>${key}: </w:t>
      </w:r>
      <w:r>
        <w:t>${value}</w:t>
      </w:r>
    </w:p>`;
    } else {
      // Regular paragraph
      documentXml += `
    <w:p>
      <w:pPr>
        <w:spacing w:line="276" w:lineRule="auto"/>
      </w:pPr>
      <w:r>
        <w:t>${paragraph}</w:t>
      </w:r>
    </w:p>`;
    }
  }

  // Add placeholders if provided
  if (placeholders.length > 0) {
    documentXml += `
    <w:p>
      <w:pPr>
        <w:pStyle w:val="Heading2"/>
        <w:spacing w:before="240" w:after="120"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:b/>
          <w:sz w:val="28"/>
          <w:szCs w:val="28"/>
        </w:rPr>
        <w:t>Template Fields</w:t>
      </w:r>
    </w:p>`;

    for (const placeholder of placeholders) {
      documentXml += `
    <w:p>
      <w:pPr>
        <w:spacing w:line="276" w:lineRule="auto"/>
      </w:pPr>
      <w:r>
        <w:rPr>
          <w:b/>
        </w:rPr>
        <w:t>${placeholder.displayName}: </w:t>
      </w:r>
      <w:r>
        <w:rPr>
          <w:highlight w:val="yellow"/>
        </w:rPr>
        <w:t>{{${placeholder.name}}}</w:t>
      </w:r>
    </w:p>`;
    }
  }

  // Close the document
  documentXml += `
  </w:body>
</w:document>`;

  // Add the document.xml file to the zip
  zip.file('word/document.xml', documentXml);

  // Generate the DOCX file as a buffer
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });
  return buffer;
}

/**
 * Updates existing template files to ensure they have proper DOCX structure
 * 
 * @param filePaths Array of file paths to template files
 */
export async function updateTemplateFiles(filePaths: string[]): Promise<void> {
  for (const filePath of filePaths) {
    try {
      const fileContent = await readFile(filePath, 'utf-8');
      
      // Extract the document content and placeholder information
      const content = extractContent(fileContent);
      const placeholders = extractPlaceholders(fileContent);
      
      // Create a proper DOCX file
      const docxBuffer = await createSimpleDocx(content, placeholders);
      
      // Save the updated file
      await writeFile(filePath, docxBuffer);
      console.log(`Updated template file: ${filePath}`);
    } catch (error) {
      console.error(`Error updating template file ${filePath}:`, error);
    }
  }
}

/**
 * Extracts text content from XML-like content
 */
function extractContent(xmlContent: string): string {
  // Simple regex to extract text between <w:t> tags
  const textMatches = xmlContent.match(/<w:t>(.*?)<\/w:t>/g) || [];
  return textMatches
    .map(match => match.replace(/<w:t>|<\/w:t>/g, ''))
    .join('\n');
}

/**
 * Extracts placeholder information from XML-like content
 */
function extractPlaceholders(xmlContent: string): { name: string; displayName: string }[] {
  const placeholders: { name: string; displayName: string }[] = [];
  
  // Match patterns like "Field Name: {{fieldName}}"
  const regex = /([^:]+):\s*{{([^}]+)}}/g;
  let match;
  
  while ((match = regex.exec(xmlContent)) !== null) {
    if (match.length >= 3) {
      placeholders.push({
        displayName: match[1].trim(),
        name: match[2].trim()
      });
    }
  }
  
  // If we didn't find any placeholders through regex, try a more direct approach
  if (placeholders.length === 0) {
    // Look for {{...}} patterns directly
    const directRegex = /{{([^{}]+)}}/g;
    let directMatch;
    
    while ((directMatch = directRegex.exec(xmlContent)) !== null) {
      if (directMatch.length >= 2) {
        const name = directMatch[1].trim();
        // Generate a displayName from the placeholder name
        const displayName = name
          .replace(/([A-Z])/g, ' $1') // Add space before capital letters
          .replace(/^./, str => str.toUpperCase()) // Capitalize first letter
          .trim();
          
        // Check if this placeholder is already in our list
        if (!placeholders.some(p => p.name === name)) {
          placeholders.push({ name, displayName });
        }
      }
    }
  }
  
  return placeholders;
}

/**
 * Fixes common issues in docx template content
 * 
 * @param content The template content to fix
 * @returns Fixed template content
 */
export function fixTemplateContent(content: string): string {
  console.log('Fixing template content...');
  
  // Create a copy of the original content for debugging
  const originalContent = content;
  
  // Stage 1: Fix XML-related issues in placeholders
  // Fix placeholders with extra XML in the middle
  let fixed = content.replace(/{{([^{}]*<[^>]*>[^{}]*)}}/g, (match, p1) => {
    // Extract just the placeholder name without XML
    const cleanName = p1.replace(/<[^>]*>/g, '').trim();
    return `{{${cleanName}}}`;
  });
  
  // Stage 2: Fix malformed placeholders
  
  // Fix duplicate closing tags issue "tion}}" (specifically mentioned in the error)
  fixed = fixed.replace(/([a-z]+)}}}/gi, '$1}}');
  
  // Fix unmatched closing braces - too many closing braces
  fixed = fixed.replace(/{{([^{}]+?)}}+}/g, '{{$1}}');
  
  // Fix tags with unmatched braces - missing closing brace
  fixed = fixed.replace(/{{([^{}]+)(?:}|$)/g, '{{$1}}');
  
  // Fix placeholders split across XML tags (common in Word docs)
  fixed = fixed.replace(/{(<[^>]*>)+{([^{}]+)}(<[^>]*>)+}/g, '{{$2}}');
  
  // Fix placeholders with extra spaces
  fixed = fixed.replace(/{{\s+([^{}]+)\s+}}/g, '{{$1}}');
  
  // Fix problematic double quotes in placeholders (specifically causing issues)
  fixed = fixed.replace(/{{([^{}]*?)"}}/g, (match, p1) => {
    // Replace quotes in placeholder with empty string
    const cleanName = p1.replace(/"/g, '');
    console.log(`Fixed placeholder with quotes: ${match} -> {{${cleanName}}}`);
    return `{{${cleanName}}}`;
  });
  
  // Stage 3: Deal with problematic character sequences
  
  // Replace problematic sequences that appeared in the error logs
  // The specific issue with "tion}}" mentioned in the errors
  fixed = fixed.replace(/{{([^{}]*?)tion}}/g, '{{$1}}');
  fixed = fixed.replace(/([a-zA-Z]+)tion}}/g, '$1}}');
  
  // Handle spaces in placeholders
  // Find all placeholders with spaces and standardize them
  const spacePlaceholderRegex = /{{([^{}]*\s+[^{}]*)}}/g;
  let match;
  while ((match = spacePlaceholderRegex.exec(fixed)) !== null) {
    const originalPlaceholder = match[0];
    const placeholderContent = match[1];
    
    // Replace spaces with underscores for better compatibility
    const noSpacesContent = placeholderContent
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_]/g, ''); // Also remove special characters
    
    if (noSpacesContent) {
      console.log(`Fixing placeholder with spaces: ${originalPlaceholder} -> {{${noSpacesContent}}}`);
      // Replace just this occurrence
      fixed = fixed.replace(originalPlaceholder, `{{${noSpacesContent}}}`);
    }
  }
  
  // Handle more robust replacements for common template issues
  const knownProblemPatterns = [
    { pattern: /invitation}}/g, replacement: 'invitation}}' },
    { pattern: /description}}/g, replacement: 'description}}' },
    { pattern: /information}}/g, replacement: 'information}}' },
    { pattern: /([a-z]+)tion}}/g, replacement: '$1}}' },
    // Specific fix for the detailedDescriptionTask" field that's causing issues
    { pattern: /{{detailedDescriptionTask"}}/g, replacement: '{{detailedDescriptionTask}}' },
    // Add more patterns as they are discovered
  ];
  
  // Apply each pattern
  for (const { pattern, replacement } of knownProblemPatterns) {
    const before = fixed;
    fixed = fixed.replace(pattern, replacement);
    if (before !== fixed) {
      console.log(`Fixed pattern: ${pattern}`);
    }
  }
  
  // Replace any remaining XML tags inside placeholders
  fixed = fixed.replace(/{{([^{}]*?)(<[^>]*>)([^{}]*?)}}/g, '{{$1 $3}}');
  
  // Stage 4: Final cleanup
  
  // Remove any empty or nearly empty placeholders
  fixed = fixed.replace(/{{\s*}}/g, '');
  fixed = fixed.replace(/{{\s*\W+\s*}}/g, '');
  
  // Check if we actually made any changes
  if (fixed !== originalContent) {
    console.log('Template content fixed successfully');
  } else {
    console.log('No template issues found or fixed');
  }
  
  return fixed;
}