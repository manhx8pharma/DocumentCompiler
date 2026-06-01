import { db } from '@db';
import { 
  templates, 
  templateFields, 
  documents, 
  documentFields, 
  batchSessions, 
  batchDocuments, 
  batchDocumentFields,
  type Template,
  type TemplateField,
  type Document,
  type DocumentField,
  type BatchSession,
  type BatchDocument,
  type BatchDocumentField
} from '@shared/schema';
import { eq, desc, asc, and, or, gte, lte, ilike, inArray, sql } from 'drizzle-orm';

// Template operations
export const createTemplate = async (data: {
  name: string;
  description?: string;
  category: 'contract' | 'proposal' | 'report' | 'letter' | 'form' | 'general' | 'legal' | 'financial' | 'hr' | 'marketing' | 'other';
  filePath: string;
  fieldCount?: string;
}) => {
  console.log(`[Storage] createTemplate called:`, { name: data.name, category: data.category, filePath: data.filePath });
  
  const [template] = await db.insert(templates).values({
    name: data.name,
    description: data.description,
    category: data.category,
    filePath: data.filePath,
    fieldCount: data.fieldCount || "0",
  }).returning();
  
  console.log(`[Storage] Template created:`, { uuid: template.uuid, name: template.name });
  return template;
};

export const getTemplates = async (options: {
  searchQuery?: string;
  category?: string;
  archived?: boolean;
  limit?: number;
  offset?: number;
} = {}) => {
  let query = db.query.templates.findMany({
    orderBy: desc(templates.createdAt),
    with: {
      fields: true,
    },
  });

  // Apply filters
  const conditions = [];
  
  if (options.searchQuery) {
    conditions.push(ilike(templates.name, `%${options.searchQuery}%`));
  }
  
  if (options.category && options.category !== 'all') {
    conditions.push(eq(templates.category, options.category as any));
  }
  
  if (typeof options.archived === 'boolean') {
    conditions.push(eq(templates.archived, options.archived));
  }
  
  if (conditions.length > 0) {
    const whereCondition = conditions.length === 1 ? conditions[0] : and(...conditions);
    return await db.query.templates.findMany({
      where: whereCondition,
      orderBy: desc(templates.createdAt),
      limit: options.limit,
      offset: options.offset,
      with: {
        fields: true,
      },
    });
  }
  
  return await db.query.templates.findMany({
    orderBy: desc(templates.createdAt),
    limit: options.limit,
    offset: options.offset,
    with: {
      fields: true,
    },
  });
};

export const getTemplateByUuid = async (uuid: string) => {
  return await db.query.templates.findFirst({
    where: eq(templates.uuid, uuid),
    with: {
      fields: true,
    },
  });
};

export const updateTemplateByUuid = async (uuid: string, data: Partial<typeof templates.$inferInsert>) => {
  const [template] = await db.update(templates)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(templates.uuid, uuid))
    .returning();
  return template;
};

export const archiveTemplateByUuid = async (uuid: string) => {
  const [template] = await db.update(templates)
    .set({ archived: true, updatedAt: new Date() })
    .where(eq(templates.uuid, uuid))
    .returning();
  return template;
};

export const unarchiveTemplateByUuid = async (uuid: string) => {
  const [template] = await db.update(templates)
    .set({ archived: false, updatedAt: new Date() })
    .where(eq(templates.uuid, uuid))
    .returning();
  return template;
};

export const getTemplatesCount = async (options: {
  searchQuery?: string;
  category?: string;
  archived?: boolean;
} = {}) => {
  const conditions = [];
  if (options.searchQuery) {
    conditions.push(ilike(templates.name, `%${options.searchQuery}%`));
  }
  if (options.category && options.category !== 'all') {
    conditions.push(eq(templates.category, options.category as any));
  }
  if (typeof options.archived === 'boolean') {
    conditions.push(eq(templates.archived, options.archived));
  }
  const whereCondition = conditions.length > 0
    ? (conditions.length === 1 ? conditions[0] : and(...conditions))
    : undefined;
  const result = await db.select({ count: sql<number>`count(*)` }).from(templates).where(whereCondition);
  return Number(result[0].count);
};

export const deleteTemplateByUuid = async (uuid: string, cascade: boolean = false) => {
  console.log(`\n[Storage] !!!! deleteTemplateByUuid CALLED !!!!`);
  console.log(`[Storage] Deleting template: ${uuid}, cascade: ${cascade}`);
  console.log(`[Storage] Call stack:`, new Error().stack);
  
  const template = await getTemplateByUuid(uuid);
  console.log(`[Storage] Template to delete:`, template ? { uuid: template.uuid, name: template.name } : 'NOT FOUND');
  
  if (cascade) {
    console.log(`[Storage] CASCADE DELETE - Deleting related fields and documents`);
    await db.delete(templateFields).where(eq(templateFields.templateUuid, uuid));
    await db.delete(documentFields).where(
      inArray(documentFields.documentUuid, 
        db.select({ uuid: documents.uuid }).from(documents).where(eq(documents.templateUuid, uuid))
      )
    );
    await db.delete(documents).where(eq(documents.templateUuid, uuid));
  }
  
  if (template?.filePath) {
    console.log(`[Storage] Deleting template file: ${template.filePath}`);
    const { FileManagerService } = await import('./services/file-manager.service');
    await FileManagerService.deleteTemplateFile(template.filePath);
  }
  
  const [deletedTemplate] = await db.delete(templates)
    .where(eq(templates.uuid, uuid))
    .returning();
  
  console.log(`[Storage] Template deleted from DB:`, deletedTemplate ? { uuid: deletedTemplate.uuid, name: deletedTemplate.name } : 'NONE');
  return deletedTemplate;
};

export const getTemplateStats = async () => {
  const result = await db.select({
    total: sql<number>`count(*)`,
    archived: sql<number>`count(*) filter (where ${templates.archived} = true)`,
  }).from(templates);

  const total = Number(result[0].total);
  const archived = Number(result[0].archived);
  return { total, active: total - archived, archived };
};

// Template Fields operations
export const createTemplateField = async (data: typeof templateFields.$inferInsert) => {
  const [field] = await db.insert(templateFields).values(data).returning();
  return field;
};

export const getTemplateFields = async (templateUuid: string) => {
  return await db.query.templateFields.findMany({
    where: eq(templateFields.templateUuid, templateUuid),
    orderBy: asc(templateFields.position), // Order by position (first appearance in document)
  });
};

export const updateTemplateFields = async (
  templateUuid: string, 
  fieldsData: Array<{ 
    name: string; 
    type?: string; 
    fieldType?: string;
    placeholder?: string; 
    required?: boolean;
    options?: string;
    defaultValue?: string;
    position?: number;
  }>
) => {
  // Delete existing fields
  await db.delete(templateFields).where(eq(templateFields.templateUuid, templateUuid));
  
  // Insert new fields
  if (fieldsData.length > 0) {
    const newFields = fieldsData.map((field, index) => ({
      templateUuid,
      name: field.name,
      type: field.type || 'text',
      fieldType: field.fieldType || 'text',
      placeholder: field.placeholder,
      required: field.required || false,
      options: field.options,
      defaultValue: field.defaultValue,
      position: field.position ?? index, // Use provided position or fallback to index
    }));
    
    return await db.insert(templateFields).values(newFields).returning();
  }
  
  return [];
};

// Document operations
export const createDocument = async (data: {
  templateUuid: string;
  name: string;
  filePath: string;
}) => {
  const [document] = await db.insert(documents).values(data).returning();
  return document;
};

// Shared document filter options type
interface DocumentFilterOptions {
  searchQuery?: string;
  templateUuid?: string;
  archived?: boolean;
  status?: string;
  fromDate?: string;
  toDate?: string;
}

/**
 * Centralized WHERE condition builder for document queries.
 * Used by both getDocuments and getDocumentsCount so they always stay in sync.
 * NOTE: The search condition references templates.name via ILIKE, so callers
 * must LEFT JOIN templates (documents→templates is N:1, no DISTINCT needed).
 */
function buildDocumentWhereCondition(options: DocumentFilterOptions) {
  const conditions: any[] = [];

  if (options.status && options.status !== 'all') {
    if (options.status === 'active') conditions.push(eq(documents.archived, false));
    else if (options.status === 'archived') conditions.push(eq(documents.archived, true));
  }

  if (options.fromDate) {
    const d = new Date(options.fromDate);
    d.setHours(0, 0, 0, 0);
    conditions.push(gte(documents.createdAt, d));
  }
  if (options.toDate) {
    const d = new Date(options.toDate);
    d.setHours(23, 59, 59, 999);
    conditions.push(lte(documents.createdAt, d));
  }

  if (options.searchQuery?.trim()) {
    const searchTerm = options.searchQuery.trim();
    const lowerTerm = searchTerm.toLowerCase();
    const words = lowerTerm.split(/\s+/).filter(w => w.length > 0);

    // Use lower(col) LIKE lower($pattern) so the expression matches the GIN trigram
    // indexes idx_documents_name_trgm and idx_templates_name_trgm (both on lower(name)).
    const exactPhrase = or(
      sql`lower(${documents.name}) LIKE ${`%${lowerTerm}%`}`,
      sql`lower(${templates.name}) LIKE ${`%${lowerTerm}%`}`,
    );

    if (words.length <= 1) {
      conditions.push(exactPhrase);
    } else {
      const allWords = and(
        ...words.map(word => or(
          sql`lower(${documents.name}) LIKE ${`%${word}%`}`,
          sql`lower(${templates.name}) LIKE ${`%${word}%`}`,
        ))
      );
      conditions.push(or(exactPhrase, allWords));
    }
  }

  if (options.templateUuid) {
    conditions.push(eq(documents.templateUuid, options.templateUuid));
  }

  if (typeof options.archived === 'boolean') {
    conditions.push(eq(documents.archived, options.archived));
  }

  if (conditions.length === 0) return undefined;
  return conditions.length === 1 ? conditions[0] : and(...conditions);
}

export const getDocumentsCount = async (options: DocumentFilterOptions = {}) => {
  const whereCondition = buildDocumentWhereCondition(options);
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(documents)
    .leftJoin(templates, eq(documents.templateUuid, templates.uuid))
    .where(whereCondition);
  return Number(result[0].count);
};

export const getDocuments = async (options: DocumentFilterOptions & { limit?: number; offset?: number } = {}) => {
  const whereCondition = buildDocumentWhereCondition(options);
  const searchTerm = options.searchQuery?.trim() || '';

  // Sort: exact name-match rows first (CASE WHEN), then newest first.
  // uuid DESC as stable tie-breaker so page boundaries don't shift between requests.
  const orderBy = searchTerm
    ? [
        sql<number>`CASE WHEN LOWER(${documents.name}) LIKE LOWER(${'%' + searchTerm + '%'}) THEN 1 ELSE 2 END`,
        desc(documents.createdAt),
        desc(documents.uuid),
      ]
    : [desc(documents.createdAt), desc(documents.uuid)];

  const baseQuery = db
    .select({
      uuid: documents.uuid,
      templateUuid: documents.templateUuid,
      name: documents.name,
      filePath: documents.filePath,
      archived: documents.archived,
      createdAt: documents.createdAt,
      updatedAt: documents.updatedAt,
      template: {
        uuid: templates.uuid,
        name: templates.name,
        description: templates.description,
        category: templates.category,
        filePath: templates.filePath,
        fieldCount: templates.fieldCount,
        archived: templates.archived,
        createdAt: templates.createdAt,
        updatedAt: templates.updatedAt,
      },
    })
    .from(documents)
    .leftJoin(templates, eq(documents.templateUuid, templates.uuid))
    .where(whereCondition)
    .orderBy(...orderBy);

  // Only apply limit/offset when explicitly provided — callers such as
  // bulk-delete.controller.ts and health.ts intentionally pass limit: undefined
  // to get the full result set.
  return await (options.limit !== undefined
    ? baseQuery.limit(options.limit).offset(options.offset ?? 0)
    : baseQuery);
};

export const getDocumentByUuid = async (uuid: string) => {
  return await db.query.documents.findFirst({
    where: eq(documents.uuid, uuid),
    with: {
      template: true,
      fields: true,
    },
  });
};

export const getDocumentFields = async (documentUuid: string) => {
  return await db.query.documentFields.findMany({
    where: eq(documentFields.documentUuid, documentUuid),
    orderBy: asc(documentFields.createdAt),
  });
};

export const createDocumentField = async (data: typeof documentFields.$inferInsert) => {
  const [field] = await db.insert(documentFields).values(data).returning();
  return field;
};

export const deleteDocumentFieldsByDocumentUuid = async (documentUuid: string) => {
  const deleted = await db.delete(documentFields)
    .where(eq(documentFields.documentUuid, documentUuid))
    .returning();
  return deleted;
};

// Optimized: Replace all document fields in a single transaction with batch insert
export const replaceDocumentFields = async (
  documentUuid: string, 
  fields: { fieldName: string; fieldValue: string }[]
) => {
  // Delete existing fields
  await db.delete(documentFields)
    .where(eq(documentFields.documentUuid, documentUuid));
  
  // If no new fields, return empty array
  if (!fields || fields.length === 0) {
    return [];
  }
  
  // Batch insert all new fields in one query
  const fieldsToInsert = fields.map(field => ({
    documentUuid,
    fieldName: field.fieldName,
    fieldValue: field.fieldValue || '',
  }));
  
  const insertedFields = await db.insert(documentFields)
    .values(fieldsToInsert)
    .returning();
  
  return insertedFields;
};

export const deleteDocumentByUuid = async (uuid: string) => {
  // Delete related fields first
  await db.delete(documentFields).where(eq(documentFields.documentUuid, uuid));
  
  const [document] = await db.delete(documents)
    .where(eq(documents.uuid, uuid))
    .returning();
  return document;
};

export const getDocumentStats = async () => {
  const result = await db.select({
    total: sql<number>`count(*)`,
    archived: sql<number>`count(*) filter (where ${documents.archived} = true)`,
  }).from(documents);

  const total = Number(result[0].total);
  const archived = Number(result[0].archived);
  return {
    total,
    active: total - archived,
    archived,
  };
};

export const updateDocumentByUuid = async (uuid: string, data: Partial<typeof documents.$inferInsert>) => {
  const [document] = await db.update(documents)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(documents.uuid, uuid))
    .returning();
  return document;
};

export const getDocumentsByTemplateAndDateRange = async (
  templateUuid: string,
  startDate: Date,
  endDate: Date
) => {
  return await db.query.documents.findMany({
    where: and(
      eq(documents.templateUuid, templateUuid),
      gte(documents.createdAt, startDate),
      lte(documents.createdAt, endDate)
    ),
    orderBy: desc(documents.createdAt),
    with: {
      template: true,
      fields: true,
    },
  });
};

// Batch operations
export const createBatchSession = async (data: typeof batchSessions.$inferInsert) => {
  const [session] = await db.insert(batchSessions).values(data).returning();
  return session;
};

export const getBatchSessionByUuid = async (uuid: string) => {
  return await db.query.batchSessions.findFirst({
    where: eq(batchSessions.uuid, uuid),
    with: {
      template: true,
      documents: {
        with: {
          fields: true,
        },
      },
    },
  });
};

export const updateBatchSession = async (uuid: string, data: Partial<typeof batchSessions.$inferInsert>) => {
  const [session] = await db.update(batchSessions)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(batchSessions.uuid, uuid))
    .returning();
  return session;
};

export const deleteBatchSessionByUuid = async (uuid: string) => {
  // Delete related data first
  const batchDocumentUuids = await db.select({ uuid: batchDocuments.uuid })
    .from(batchDocuments)
    .where(eq(batchDocuments.sessionUuid, uuid));
  
  if (batchDocumentUuids.length > 0) {
    await db.delete(batchDocumentFields).where(
      inArray(batchDocumentFields.batchDocumentUuid, batchDocumentUuids.map(d => d.uuid))
    );
  }
  
  await db.delete(batchDocuments).where(eq(batchDocuments.sessionUuid, uuid));
  
  const [session] = await db.delete(batchSessions)
    .where(eq(batchSessions.uuid, uuid))
    .returning();
  return session;
};

export const createBatchDocument = async (data: typeof batchDocuments.$inferInsert) => {
  const [document] = await db.insert(batchDocuments).values(data).returning();
  return document;
};

export const updateBatchDocumentStatus = async (uuid: string, status: string, errorMessage?: string) => {
  const [document] = await db.update(batchDocuments)
    .set({ status, errorMessage, updatedAt: new Date() })
    .where(eq(batchDocuments.uuid, uuid))
    .returning();
  return document;
};

export const createBatchDocumentField = async (data: typeof batchDocumentFields.$inferInsert) => {
  const [field] = await db.insert(batchDocumentFields).values(data).returning();
  return field;
};

export const getBatchDocumentsBySessionUuid = async (sessionUuid: string, templateUuid?: string) => {
  const docs = await db.query.batchDocuments.findMany({
    where: eq(batchDocuments.sessionUuid, sessionUuid),
    orderBy: asc(batchDocuments.rowIndex),
    with: {
      fields: true,
    },
  });
  
  // If templateUuid is provided, sort each document's fields by template field position
  if (templateUuid) {
    const templateFieldsList = await getTemplateFields(templateUuid);
    const fieldPositionMap = new Map<string, number>();
    templateFieldsList.forEach((field, index) => {
      fieldPositionMap.set(field.name, field.position ?? index);
    });
    
    // Sort fields within each document by template position
    return docs.map(doc => ({
      ...doc,
      fields: [...doc.fields].sort((a, b) => {
        const posA = fieldPositionMap.get(a.fieldName) ?? 999;
        const posB = fieldPositionMap.get(b.fieldName) ?? 999;
        return posA - posB;
      })
    }));
  }
  
  return docs;
};

export const bulkUpdateBatchDocumentStatus = async (documentUuids: string[], status: string) => {
  return await db.update(batchDocuments)
    .set({ status, updatedAt: new Date() })
    .where(inArray(batchDocuments.uuid, documentUuids))
    .returning();
};

// Storage interface for backward compatibility
export const storage = {
  // Templates
  createTemplate,
  getTemplates,
  getTemplateByUuid,
  updateTemplateByUuid,
  archiveTemplateByUuid,
  unarchiveTemplateByUuid,
  getTemplatesCount,
  deleteTemplateByUuid,
  getTemplateStats,
  
  // Template Fields
  createTemplateField,
  getTemplateFields,
  updateTemplateFields,
  
  // Documents
  createDocument,
  getDocuments,
  getDocumentsCount,
  getDocumentByUuid,
  getDocumentFields,
  createDocumentField,
  deleteDocumentFieldsByDocumentUuid,
  replaceDocumentFields,
  deleteDocumentByUuid,
  getDocumentStats,
  updateDocumentByUuid,
  getDocumentsByTemplateAndDateRange,
  
  // Batch operations
  createBatchSession,
  getBatchSessionByUuid,
  updateBatchSession,
  deleteBatchSessionByUuid,
  createBatchDocument,
  updateBatchDocumentStatus,
  createBatchDocumentField,
  getBatchDocumentsBySessionUuid,
  bulkUpdateBatchDocumentStatus,
};