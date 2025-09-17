import { pgTable, text, boolean, timestamp, pgEnum, uuid } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";
import { relations } from "drizzle-orm";

// Category enum for document templates
export const categoryEnum = pgEnum('category', [
  'contract',
  'proposal', 
  'report',
  'letter',
  'form',
  'general',
  'legal',
  'financial',
  'hr',
  'marketing',
  'other'
]);

// Templates table - UUID primary key
export const templates = pgTable("templates", {
  uuid: uuid("uuid").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  category: categoryEnum("category").notNull(),
  filePath: text("file_path").notNull(),
  fieldCount: text("field_count").default("0").notNull(),
  archived: boolean("archived").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Template fields table - UUID references
export const templateFields = pgTable("template_fields", {
  uuid: uuid("uuid").primaryKey().defaultRandom(),
  templateUuid: uuid("template_uuid").notNull().references(() => templates.uuid, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  type: text("type").default("text").notNull(),
  fieldType: text("field_type").default("text").notNull(), // 'text', 'textarea', 'number', 'email'
  placeholder: text("placeholder"),
  required: boolean("required").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Documents table - UUID primary key
export const documents = pgTable("documents", {
  uuid: uuid("uuid").primaryKey().defaultRandom(),
  templateUuid: uuid("template_uuid").notNull().references(() => templates.uuid, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  filePath: text("file_path").notNull(),
  archived: boolean("archived").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Document fields table - UUID references
export const documentFields = pgTable("document_fields", {
  uuid: uuid("uuid").primaryKey().defaultRandom(),
  documentUuid: uuid("document_uuid").notNull().references(() => documents.uuid, { onDelete: 'cascade' }),
  fieldName: text("field_name").notNull(),
  fieldValue: text("field_value").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Batch sessions table - UUID primary key
export const batchSessions = pgTable("batch_sessions", {
  uuid: uuid("uuid").primaryKey().defaultRandom(),
  templateUuid: uuid("template_uuid").notNull().references(() => templates.uuid, { onDelete: 'cascade' }),
  fileName: text("file_name").notNull(),
  filePath: text("file_path").notNull(),
  totalRows: text("total_rows").default("0").notNull(),
  processedRows: text("processed_rows").default("0").notNull(),
  approvedRows: text("approved_rows").default("0").notNull(),
  status: text("status").default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Batch documents table - UUID references
export const batchDocuments = pgTable("batch_documents", {
  uuid: uuid("uuid").primaryKey().defaultRandom(),
  sessionUuid: uuid("session_uuid").notNull().references(() => batchSessions.uuid, { onDelete: 'cascade' }),
  rowIndex: text("row_index").notNull(),
  name: text("name").notNull(),
  status: text("status").default("pending").notNull(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Batch document fields table - UUID references
export const batchDocumentFields = pgTable("batch_document_fields", {
  uuid: uuid("uuid").primaryKey().defaultRandom(),
  batchDocumentUuid: uuid("batch_document_uuid").notNull().references(() => batchDocuments.uuid, { onDelete: 'cascade' }),
  fieldName: text("field_name").notNull(),
  fieldValue: text("field_value").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Relations
export const templatesRelations = relations(templates, ({ many }) => ({
  fields: many(templateFields),
  documents: many(documents),
  batchSessions: many(batchSessions),
}));

export const templateFieldsRelations = relations(templateFields, ({ one }) => ({
  template: one(templates, { fields: [templateFields.templateUuid], references: [templates.uuid] }),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  template: one(templates, { fields: [documents.templateUuid], references: [templates.uuid] }),
  fields: many(documentFields),
}));

export const documentFieldsRelations = relations(documentFields, ({ one }) => ({
  document: one(documents, { fields: [documentFields.documentUuid], references: [documents.uuid] }),
}));

export const batchSessionsRelations = relations(batchSessions, ({ one, many }) => ({
  template: one(templates, { fields: [batchSessions.templateUuid], references: [templates.uuid] }),
  documents: many(batchDocuments),
}));

export const batchDocumentsRelations = relations(batchDocuments, ({ one, many }) => ({
  session: one(batchSessions, { fields: [batchDocuments.sessionUuid], references: [batchSessions.uuid] }),
  fields: many(batchDocumentFields),
}));

export const batchDocumentFieldsRelations = relations(batchDocumentFields, ({ one }) => ({
  batchDocument: one(batchDocuments, { fields: [batchDocumentFields.batchDocumentUuid], references: [batchDocuments.uuid] }),
}));

// Validation schemas
export const insertTemplateSchema = createInsertSchema(templates, {
  name: (schema) => schema.min(1, "Template name is required"),
  description: (schema) => schema.optional(),
  category: (schema) => schema,
}).omit({ uuid: true, filePath: true, fieldCount: true, createdAt: true, updatedAt: true });

export const insertTemplateFieldSchema = createInsertSchema(templateFields, {
  name: (schema) => schema.min(1, "Field name is required"),
  type: (schema) => schema.default("text"),
  fieldType: (schema) => schema.default("text"),
  required: (schema) => schema.default(false),
}).omit({ uuid: true, createdAt: true, updatedAt: true });

export const insertDocumentSchema = createInsertSchema(documents, {
  name: (schema) => schema.min(1, "Document name is required"),
}).omit({ uuid: true, filePath: true, createdAt: true, updatedAt: true });

export const insertDocumentFieldSchema = createInsertSchema(documentFields, {
  fieldName: (schema) => schema.min(1, "Field name is required"),
  fieldValue: (schema) => schema.optional(),
}).omit({ uuid: true, createdAt: true, updatedAt: true });

export const insertBatchSessionSchema = createInsertSchema(batchSessions, {
  fileName: (schema) => schema.min(1, "File name is required"),
  filePath: (schema) => schema.min(1, "File path is required"),
}).omit({ uuid: true, createdAt: true, updatedAt: true });

export const insertBatchDocumentSchema = createInsertSchema(batchDocuments, {
  name: (schema) => schema.min(1, "Document name is required"),
  rowIndex: (schema) => schema.min(1, "Row index is required"),
}).omit({ uuid: true, createdAt: true, updatedAt: true });

export const insertBatchDocumentFieldSchema = createInsertSchema(batchDocumentFields, {
  fieldName: (schema) => schema.min(1, "Field name is required"),
  fieldValue: (schema) => schema.min(0, "Field value is required"),
}).omit({ uuid: true, createdAt: true, updatedAt: true });

// Type exports
export type Template = typeof templates.$inferSelect;
export type InsertTemplate = z.infer<typeof insertTemplateSchema>;

export type TemplateField = typeof templateFields.$inferSelect;
export type InsertTemplateField = z.infer<typeof insertTemplateFieldSchema>;

export type Document = typeof documents.$inferSelect;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;

export type DocumentField = typeof documentFields.$inferSelect;
export type InsertDocumentField = z.infer<typeof insertDocumentFieldSchema>;

export type BatchSession = typeof batchSessions.$inferSelect;
export type InsertBatchSession = z.infer<typeof insertBatchSessionSchema>;

export type BatchDocument = typeof batchDocuments.$inferSelect;
export type InsertBatchDocument = z.infer<typeof insertBatchDocumentSchema>;

export type BatchDocumentField = typeof batchDocumentFields.$inferSelect;
export type InsertBatchDocumentField = z.infer<typeof insertBatchDocumentFieldSchema>;