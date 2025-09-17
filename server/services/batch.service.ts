import { v4 as uuidv4 } from 'uuid';
import * as XLSX from 'xlsx';
import { db } from '@db';
import { 
  batchSessions, 
  batchDocuments, 
  batchDocumentFields,
  templates,
  insertBatchSessionSchema,
  insertBatchDocumentSchema,
  insertBatchDocumentFieldSchema,
  type BatchSession,
  type BatchDocument,
  type BatchDocumentField
} from '@shared/schema';
import { eq, and } from 'drizzle-orm';

export interface ParsedExcelData {
  sessionId: string;
  templateUuid: string;
  fileName: string;
  documents: {
    uuid: string;
    rowIndex: number;
    documentName: string;
    fields: { fieldName: string; fieldValue: string }[];
  }[];
}

/**
 * Tạo batch session và lưu dữ liệu từ Excel vào database
 */
export async function createBatchSession(
  templateUuid: string,
  fileName: string,
  excelBuffer: Buffer,
  templateFields: any[]
): Promise<ParsedExcelData> {
  console.log('Creating batch session for template:', templateUuid);
  
  // Parse Excel file
  const workbook = XLSX.read(excelBuffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Convert to JSON
  const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as string[][];
  
  if (rawData.length < 2) {
    throw new Error('Excel file must have at least header row and one data row');
  }
  
  const headers = rawData[0];
  const dataRows = rawData.slice(1).filter(row => row.some(cell => cell !== undefined && cell !== ''));
  
  console.log('Excel headers:', headers);
  console.log('Data rows count:', dataRows.length);
  
  // Map headers to template fields
  const fieldMapping = mapHeadersToTemplateFields(headers, templateFields);
  console.log('Field mapping:', fieldMapping);
  
  // Create batch session
  const sessionUuid = uuidv4();
  const sessionData = insertBatchSessionSchema.parse({
    templateUuid,
    fileName,
    filePath: `storage/temp/batch-${sessionUuid}.xlsx`,
    status: 'pending',
    totalRows: dataRows.length.toString(),
    processedRows: '0',
    approvedRows: '0'
  });
  
  const [session] = await db.insert(batchSessions).values({
    uuid: sessionUuid,
    ...sessionData
  }).returning();
  console.log('Created batch session:', session.uuid);
  
  // Process each data row
  const documents: ParsedExcelData['documents'] = [];
  
  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const docUuid = uuidv4();
    
    // Extract document name (first non-empty cell or generate name)
    const documentName = row[0] || `Document ${i + 1}`;
    
    // Create batch document record
    const batchDocData = insertBatchDocumentSchema.parse({
      sessionUuid: session.uuid,
      rowIndex: (i + 1).toString(),
      name: documentName,
      status: 'pending'
    });
    
    const [batchDoc] = await db.insert(batchDocuments).values({
      uuid: docUuid,
      ...batchDocData
    }).returning();
    
    // Process fields for this document
    const docFields: { fieldName: string; fieldValue: string }[] = [];
    
    for (let j = 0; j < headers.length; j++) {
      const header = headers[j];
      const cellValue = row[j];
      
      if (cellValue !== undefined && cellValue !== '') {
        const mappedField = fieldMapping.find(f => f.excelHeader === header);
        
        // Use mapped field name if available, otherwise use Excel header directly
        const fieldName = mappedField ? mappedField.templateField : header;
        
        const fieldData = insertBatchDocumentFieldSchema.parse({
          batchDocumentUuid: batchDoc.uuid,
          fieldName: fieldName,
          fieldValue: String(cellValue)
        });
        
        await db.insert(batchDocumentFields).values({
          uuid: uuidv4(),
          ...fieldData
        });
        
        docFields.push({
          fieldName: fieldName,
          fieldValue: String(cellValue)
        });
      }
    }
    
    documents.push({
      uuid: docUuid,
      rowIndex: i,
      documentName,
      fields: docFields
    });
  }
  
  // Update session as processed
  await db.update(batchSessions)
    .set({ status: 'processed', processedRows: dataRows.length })
    .where(eq(batchSessions.uuid, session.uuid));
  
  console.log('Batch session created successfully with', documents.length, 'documents');
  
  return {
    sessionId: sessionUuid,
    templateUuid,
    fileName,
    documents
  };
}

/**
 * Lấy thông tin batch session và documents
 */
export async function getBatchSession(sessionUuid: string) {
  const session = await db.query.batchSessions.findFirst({
    where: eq(batchSessions.uuid, sessionUuid)
  });
  
  if (!session) {
    return null;
  }
  
  // Get template separately
  const template = await db.query.templates.findFirst({
    where: eq(templates.uuid, session.templateUuid)
  });
  
  // Get batch documents separately
  const sessionDocuments = await db.query.batchDocuments.findMany({
    where: eq(batchDocuments.sessionUuid, sessionUuid),
    with: {
      fields: true
    }
  });
  
  return {
    ...session,
    template,
    batchDocuments: sessionDocuments
  };
}

/**
 * Cập nhật trạng thái của batch document
 */
export async function updateBatchDocumentStatus(
  documentUuid: string, 
  status: 'pending' | 'approved' | 'rejected' | 'created'
) {
  const [updated] = await db.update(batchDocuments)
    .set({ status, updatedAt: new Date() })
    .where(eq(batchDocuments.uuid, documentUuid))
    .returning();
  
  return updated;
}

/**
 * Lấy danh sách documents đã approved trong session
 */
export async function getApprovedDocuments(sessionUuid: string) {
  const session = await db.query.batchSessions.findFirst({
    where: eq(batchSessions.uuid, sessionUuid)
  });
  
  if (!session) {
    throw new Error('Batch session not found');
  }
  
  const approvedDocs = await db.query.batchDocuments.findMany({
    where: and(
      eq(batchDocuments.sessionUuid, session.uuid),
      eq(batchDocuments.status, 'pending') // Use 'pending' as the initial status for batch documents
    ),
    with: {
      fields: true
    },
    orderBy: (batchDocuments, { asc }) => [asc(batchDocuments.rowIndex)]
  });
  
  return approvedDocs;
}

/**
 * Map Excel headers với template fields
 */
function mapHeadersToTemplateFields(headers: string[], templateFields: any[]) {
  const mapping: { excelHeader: string; templateField: string }[] = [];
  
  for (const header of headers) {
    // Tìm template field tương ứng (exact match hoặc similar)
    const matchedField = templateFields.find(field => {
      const fieldName = field.fieldName || field.name;
      const displayName = field.displayName || fieldName;
      
      // Exact match
      if (fieldName === header || displayName === header) {
        return true;
      }
      
      // Case insensitive match
      if (fieldName.toLowerCase() === header.toLowerCase() || 
          displayName.toLowerCase() === header.toLowerCase()) {
        return true;
      }
      
      // Remove special chars and compare
      const cleanFieldName = fieldName.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      const cleanHeader = header.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      
      return cleanFieldName === cleanHeader;
    });
    
    if (matchedField) {
      mapping.push({
        excelHeader: header,
        templateField: matchedField.fieldName || matchedField.name
      });
    }
  }
  
  return mapping;
}

/**
 * Xóa batch session và tất cả dữ liệu liên quan
 */
export async function deleteBatchSession(sessionUuid: string) {
  const session = await db.query.batchSessions.findFirst({
    where: eq(batchSessions.uuid, sessionUuid)
  });
  
  if (!session) {
    throw new Error('Batch session not found');
  }
  
  // Drizzle sẽ tự động xóa cascade
  await db.delete(batchSessions).where(eq(batchSessions.uuid, session.uuid));
  
  return true;
}