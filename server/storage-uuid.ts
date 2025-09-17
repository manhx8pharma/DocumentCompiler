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
  const [template] = await db.insert(templates).values({
    name: data.name,
    description: data.description,
    category: data.category,
    filePath: data.filePath,
    fieldCount: data.fieldCount || "0",
  }).returning();
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

export const deleteTemplateByUuid = async (uuid: string, cascade: boolean = false) => {
  if (cascade) {
    // Delete related data first
    await db.delete(templateFields).where(eq(templateFields.templateUuid, uuid));
    await db.delete(documentFields).where(
      inArray(documentFields.documentUuid, 
        db.select({ uuid: documents.uuid }).from(documents).where(eq(documents.templateUuid, uuid))
      )
    );
    await db.delete(documents).where(eq(documents.templateUuid, uuid));
  }
  
  const [template] = await db.delete(templates)
    .where(eq(templates.uuid, uuid))
    .returning();
  return template;
};

export const getTemplateStats = async () => {
  const totalTemplates = await db.select().from(templates);
  const archivedTemplates = await db.select().from(templates).where(eq(templates.archived, true));
  
  return {
    total: totalTemplates.length,
    active: totalTemplates.length - archivedTemplates.length,
    archived: archivedTemplates.length,
  };
};

// Template Fields operations
export const createTemplateField = async (data: typeof templateFields.$inferInsert) => {
  const [field] = await db.insert(templateFields).values(data).returning();
  return field;
};

export const getTemplateFields = async (templateUuid: string) => {
  return await db.query.templateFields.findMany({
    where: eq(templateFields.templateUuid, templateUuid),
    orderBy: asc(templateFields.createdAt),
  });
};

export const updateTemplateFields = async (
  templateUuid: string, 
  fieldsData: Array<{ name: string; type?: string; placeholder?: string; required?: boolean }>
) => {
  // Delete existing fields
  await db.delete(templateFields).where(eq(templateFields.templateUuid, templateUuid));
  
  // Insert new fields
  if (fieldsData.length > 0) {
    const newFields = fieldsData.map(field => ({
      templateUuid,
      name: field.name,
      type: field.type || 'text',
      placeholder: field.placeholder,
      required: field.required || false,
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

export const getDocumentsCount = async (options: {
  searchQuery?: string;
  templateUuid?: string;
  archived?: boolean;
} = {}) => {
  // Use a simple query approach for counting
  const allDocs = await getDocuments(options);
  return allDocs.length;
};

export const getDocuments = async (options: {
  searchQuery?: string;
  templateUuid?: string;
  archived?: boolean;
  limit?: number;
  offset?: number;
} = {}) => {
  const conditions = [];
  
  // Enhanced search algorithm
  if (options.searchQuery && options.searchQuery.trim()) {
    const searchTerm = options.searchQuery.trim();
    
    // First try exact phrase match
    const exactPhraseMatch = or(
      ilike(documents.name, `%${searchTerm}%`),
      sql`EXISTS (
        SELECT 1 FROM ${templates} t 
        WHERE t.uuid = ${documents.templateUuid} 
        AND LOWER(t.name) LIKE ${'%' + searchTerm.toLowerCase() + '%'}
      )`
    );
    
    // Then try word-based search as fallback
    const words = searchTerm.toLowerCase().split(/\s+/).filter(word => word.length > 0);
    
      if (words.length === 1) {
        // Single word search
        conditions.push(exactPhraseMatch);
      } else {
        // Multi-word: allow exact phrase OR all words present
        const allWordsConditions = words.map(word => 
          or(
            ilike(documents.name, `%${word}%`),
            sql`EXISTS (
              SELECT 1 FROM ${templates} t 
              WHERE t.uuid = ${documents.templateUuid} 
              AND LOWER(t.name) LIKE ${'%' + word + '%'}
            )`
          )
        );
        
        conditions.push(
          or(
            exactPhraseMatch,
            and(...allWordsConditions)
          )
        );
      }
  }
  
  if (options.templateUuid) {
    conditions.push(eq(documents.templateUuid, options.templateUuid));
  }
  
  if (typeof options.archived === 'boolean') {
    conditions.push(eq(documents.archived, options.archived));
  }

  let query;
  if (conditions.length > 0) {
    const whereCondition = conditions.length === 1 ? conditions[0] : and(...conditions);
    query = db.query.documents.findMany({
      where: whereCondition,
      limit: options.limit,
      offset: options.offset,
      with: {
        template: true,
        fields: true,
      },
    });
  } else {
    query = db.query.documents.findMany({
      limit: options.limit,
      offset: options.offset,
      with: {
        template: true,
        fields: true,
      },
    });
  }

  const results = await query;
  
  // Fixed search with exact phrase priority
  if (options.searchQuery && options.searchQuery.trim()) {
    const searchTerm = options.searchQuery.toLowerCase().trim();
    
    // Split into exact phrase matches and partial matches
    const exactPhraseMatches = results.filter(doc => 
      doc.name.toLowerCase().includes(searchTerm)
    );
    
    const partialMatches = results.filter(doc => 
      !doc.name.toLowerCase().includes(searchTerm)
    );
    
    // Sort exact phrase matches by position of the phrase, then by creation date
    exactPhraseMatches.sort((a, b) => {
      const posA = a.name.toLowerCase().indexOf(searchTerm);
      const posB = b.name.toLowerCase().indexOf(searchTerm);
      
      // Earlier position in name comes first
      if (posA !== posB) {
        return posA - posB;
      }
      
      // Same position - sort by creation date (newer first)
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    
    // Sort partial matches by creation date (newer first)
    partialMatches.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    
    // Return exact phrase matches first, then partial matches
    return [...exactPhraseMatches, ...partialMatches];
  }
  
  // Default sort by creation date when not searching
  return results.sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
};

// Corrected relevance scoring - exact phrase match must win
function calculateRelevanceScore(document: any, searchTerm: string, words: string[]): number {
  const docName = document.name.toLowerCase();
  const templateName = document.template?.name?.toLowerCase() || '';
  const searchLower = searchTerm.toLowerCase();
  
  // EXACT PHRASE MATCH gets massive priority over everything else
  if (docName.includes(searchLower)) {
    const position = docName.indexOf(searchLower);
    const score = 10000000 + (position === 0 ? 1000000 : 500000 - position);
    
    if (searchTerm === "số 4") {
      console.log(`[EXACT] "${document.name}" contains "${searchLower}" at position ${position}, score: ${score}`);
    }
    
    return score;
  }
  
  if (templateName.includes(searchLower)) {
    const position = templateName.indexOf(searchLower);
    return 8000000 + (position === 0 ? 1000000 : 500000 - position);
  }
  
  // Word-based matching gets much lower scores (under 100,000)
  let wordScore = 0;
  const matchingWords = words.filter(word => 
    docName.includes(word) || templateName.includes(word)
  );
  
  if (matchingWords.length === 0) {
    return 0;
  }
  
  // Calculate word score
  matchingWords.forEach(word => {
    if (docName.includes(word)) wordScore += 100;
    if (templateName.includes(word)) wordScore += 50;
  });
  
  // Bonus for matching all words
  if (matchingWords.length === words.length) {
    wordScore += 1000;
  }
  
  if (searchTerm === "số 4" && matchingWords.length > 0) {
    console.log(`[WORD] "${document.name}" word-based score: ${wordScore}, matching: ${matchingWords.join(', ')}`);
  }
  
  return wordScore;
}

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

export const deleteDocumentByUuid = async (uuid: string) => {
  // Delete related fields first
  await db.delete(documentFields).where(eq(documentFields.documentUuid, uuid));
  
  const [document] = await db.delete(documents)
    .where(eq(documents.uuid, uuid))
    .returning();
  return document;
};

export const getDocumentStats = async () => {
  const totalDocuments = await db.select().from(documents);
  const archivedDocuments = await db.select().from(documents).where(eq(documents.archived, true));
  
  return {
    total: totalDocuments.length,
    active: totalDocuments.length - archivedDocuments.length,
    archived: archivedDocuments.length,
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

export const getBatchDocumentsBySessionUuid = async (sessionUuid: string) => {
  return await db.query.batchDocuments.findMany({
    where: eq(batchDocuments.sessionUuid, sessionUuid),
    orderBy: asc(batchDocuments.rowIndex),
    with: {
      fields: true,
    },
  });
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