/**
 * Backfill script to set correct position values for existing template fields
 * This script re-parses each template's DOCX file and updates field positions
 * based on order of first appearance in the document
 */

import { db } from '@db';
import { templates, templateFields } from '@shared/schema';
import { eq, asc } from 'drizzle-orm';
import { extractPlaceholders, readFileFromStorage } from '../utils/file-helpers';

interface BackfillResult {
  templateUuid: string;
  templateName: string;
  status: 'success' | 'error' | 'skipped';
  fieldsUpdated: number;
  message?: string;
}

async function extractPlaceholdersFromTemplate(filePath: string): Promise<string[]> {
  try {
    // Try to get file from storage
    const fileBuffer = await readFileFromStorage(filePath);
    
    if (!fileBuffer) {
      throw new Error('Could not read template file');
    }

    // Use docxtemplater to extract placeholders in order
    const Docxtemplater = await import('docxtemplater');
    const PizZip = await import('pizzip');
    
    try {
      const zip = new PizZip.default(fileBuffer);
      const doc = new Docxtemplater.default(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: {
          start: '{',
          end: '}'
        }
      });
      
      const fullText = doc.getFullText();
      const placeholderMatches = fullText.match(/\{([^{}]+)\}/g);
      
      if (placeholderMatches) {
        const mappedPlaceholders = placeholderMatches.map(p => p.replace(/[{}]/g, '').trim());
        // Filter unique while preserving order of first appearance
        return mappedPlaceholders.filter((value, index, self) => self.indexOf(value) === index);
      }
      
      return [];
    } catch (docxError) {
      // Fallback to mammoth text extraction
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer: fileBuffer });
      return extractPlaceholders(result.value);
    }
  } catch (error) {
    console.error(`Error extracting placeholders from ${filePath}:`, error);
    return [];
  }
}

async function backfillTemplateFieldPositions(): Promise<BackfillResult[]> {
  console.log('Starting backfill of template field positions...');
  
  const results: BackfillResult[] = [];
  
  // Get all templates
  const allTemplates = await db.query.templates.findMany({
    orderBy: asc(templates.createdAt),
  });
  
  console.log(`Found ${allTemplates.length} templates to process`);
  
  for (const template of allTemplates) {
    console.log(`\nProcessing template: ${template.name} (${template.uuid})`);
    
    try {
      // Get existing fields for this template
      const existingFields = await db.query.templateFields.findMany({
        where: eq(templateFields.templateUuid, template.uuid),
      });
      
      if (existingFields.length === 0) {
        results.push({
          templateUuid: template.uuid,
          templateName: template.name,
          status: 'skipped',
          fieldsUpdated: 0,
          message: 'No fields found for template',
        });
        continue;
      }
      
      // Extract placeholders from template file to get correct order
      const orderedPlaceholders = await extractPlaceholdersFromTemplate(template.filePath);
      
      if (orderedPlaceholders.length === 0) {
        // Fallback: assign positions based on current field order (by name alphabetically)
        console.log(`Could not extract placeholders from file, using fallback ordering`);
        
        let updateCount = 0;
        for (let i = 0; i < existingFields.length; i++) {
          const field = existingFields[i];
          await db.update(templateFields)
            .set({ position: i })
            .where(eq(templateFields.uuid, field.uuid));
          updateCount++;
        }
        
        results.push({
          templateUuid: template.uuid,
          templateName: template.name,
          status: 'success',
          fieldsUpdated: updateCount,
          message: 'Used fallback ordering (could not read DOCX)',
        });
        continue;
      }
      
      // Create a map of placeholder name -> position
      const positionMap = new Map<string, number>();
      orderedPlaceholders.forEach((placeholder, index) => {
        positionMap.set(placeholder, index);
      });
      
      // Update each field with its correct position
      let updateCount = 0;
      for (const field of existingFields) {
        const position = positionMap.get(field.name);
        
        if (position !== undefined) {
          await db.update(templateFields)
            .set({ position })
            .where(eq(templateFields.uuid, field.uuid));
          updateCount++;
        } else {
          // Field not found in document, assign a high position
          const fallbackPosition = orderedPlaceholders.length + updateCount;
          await db.update(templateFields)
            .set({ position: fallbackPosition })
            .where(eq(templateFields.uuid, field.uuid));
          updateCount++;
          console.log(`  Warning: Field "${field.name}" not found in document, assigned position ${fallbackPosition}`);
        }
      }
      
      results.push({
        templateUuid: template.uuid,
        templateName: template.name,
        status: 'success',
        fieldsUpdated: updateCount,
      });
      
      console.log(`  Updated ${updateCount} field positions`);
      
    } catch (error: any) {
      console.error(`  Error processing template: ${error.message}`);
      results.push({
        templateUuid: template.uuid,
        templateName: template.name,
        status: 'error',
        fieldsUpdated: 0,
        message: error.message,
      });
    }
  }
  
  return results;
}

// Main execution
async function main() {
  console.log('=== Template Field Position Backfill ===\n');
  
  try {
    const results = await backfillTemplateFieldPositions();
    
    console.log('\n=== Backfill Summary ===');
    console.log(`Total templates processed: ${results.length}`);
    console.log(`Successful: ${results.filter(r => r.status === 'success').length}`);
    console.log(`Skipped: ${results.filter(r => r.status === 'skipped').length}`);
    console.log(`Errors: ${results.filter(r => r.status === 'error').length}`);
    
    // Print errors if any
    const errors = results.filter(r => r.status === 'error');
    if (errors.length > 0) {
      console.log('\nErrors:');
      errors.forEach(e => {
        console.log(`  - ${e.templateName}: ${e.message}`);
      });
    }
    
    console.log('\nBackfill complete!');
    process.exit(0);
  } catch (error) {
    console.error('Backfill failed:', error);
    process.exit(1);
  }
}

main();
