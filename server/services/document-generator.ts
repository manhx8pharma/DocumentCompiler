import fs from 'fs/promises';
import path from 'path';
import PizZip from 'pizzip';
import { FileManagerService } from './file-manager.service';
import { createDocxTemplater } from '../utils/docx-parser';
import { injectTablesIntoZip, type TableData } from '../utils/table-injector';

export interface DocumentGenerationData {
  templateFilePath: string;
  documentName: string;
  fieldValues: Record<string, string>;
  /** Optional table data map for templates containing <<TABLE_NAME>> markers. */
  tableDataMap?: Record<string, TableData>;
}

export interface GeneratedDocument {
  filePath: string;
  buffer: Buffer;
}

/**
 * Generate a physical Word document from template with field values
 */
export async function generateDocument(data: DocumentGenerationData): Promise<GeneratedDocument> {
  const { templateFilePath, documentName, fieldValues } = data;

  // Read template file using FileManagerService (supports Object Storage)
  const templateBuffer = await FileManagerService.readTemplateBuffer(templateFilePath);
  
  // Process field values to handle newlines and special characters
  const processedFieldValues: Record<string, string> = {};
  for (const [key, value] of Object.entries(fieldValues)) {
    if (typeof value === 'string') {
      // Handle newlines and preserve formatting for docxtemplater
      let processedValue = value
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');
      
      // Ensure value is not too long (prevent potential memory issues)
      if (processedValue.length > 10000) {
        console.warn(`Field ${key} has very long content (${processedValue.length} chars), truncating...`);
        processedValue = processedValue.substring(0, 10000) + '...';
      }
      
      processedFieldValues[key] = processedValue;
    } else {
      processedFieldValues[key] = String(value || '');
    }
  }

  // Generate document with error handling
  let documentBuffer: Buffer;
  try {
    let zip = new PizZip(templateBuffer);
    // Inject dynamic tables (<<TABLE_NAME>> markers) before docxtemplater runs
    if (data.tableDataMap && Object.keys(data.tableDataMap).length > 0) {
      zip = injectTablesIntoZip(zip, data.tableDataMap);
    }
    // Use factory with custom parser for checklist/default value placeholders
    const doc = createDocxTemplater(zip);

    doc.render(processedFieldValues);
    documentBuffer = doc.getZip().generate({ type: 'nodebuffer' });
  } catch (docxError) {
    console.error('Docxtemplater failed:', docxError);
    console.error('Field values causing error:', JSON.stringify(processedFieldValues, null, 2));
    
    // Re-throw error to handle it properly upstream
    throw new Error(`Document generation failed: ${docxError instanceof Error ? docxError.message : 'Unknown docx error'}`);
  }
  
  // Create unique filename with proper sanitization
  const timestamp = Date.now();
  const sanitizedName = documentName.replace(/[^a-zA-Z0-9\s]/g, '_').trim().replace(/\s+/g, '_');
  const filename = `${sanitizedName}_${timestamp}.docx`;
  const filePath = path.join('storage/documents', filename);
  
  // Ensure directory exists
  await fs.mkdir('storage/documents', { recursive: true });
  
  // Save document to file
  await fs.writeFile(filePath, documentBuffer);
  
  // Verify file was written successfully
  try {
    const stats = await fs.stat(filePath);
    if (!stats.isFile() || stats.size === 0) {
      throw new Error(`Document file verification failed: ${filePath}`);
    }
  } catch (verifyError) {
    throw new Error(`Failed to verify saved document: ${verifyError instanceof Error ? verifyError.message : 'Unknown error'}`);
  }

  return {
    filePath,
    buffer: documentBuffer
  };
}

/**
 * Create complete document record with physical file and database entry
 */
export async function createCompleteDocument(params: {
  templateUuid: string;
  templateFilePath: string;
  documentName: string;
  fieldValues: Record<string, string>;
  fields: Array<{ fieldName: string; fieldValue: string }>;
  storage: any;
}): Promise<any> {
  const { templateUuid, templateFilePath, documentName, fieldValues, fields, storage } = params;

  // Generate physical document
  const generatedDoc = await generateDocument({
    templateFilePath,
    documentName,
    fieldValues
  });

  // Create document record
  const document = await storage.createDocument({
    templateUuid,
    name: documentName,
    filePath: generatedDoc.filePath,
  });

  // Create document fields
  for (const field of fields) {
    await storage.createDocumentField({
      documentUuid: document.uuid,
      fieldName: field.fieldName,
      fieldValue: field.fieldValue || '',
    });
  }

  return document;
}