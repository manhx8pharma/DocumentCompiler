import { pgTable, text, boolean, timestamp, pgEnum, uuid, integer, jsonb, unique, index } from "drizzle-orm/pg-core";
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
}, (table) => ({
  archivedIdx: index("templates_archived_idx").on(table.archived),
  createdAtIdx: index("templates_created_at_idx").on(table.createdAt),
}));

// Template fields table - UUID references
export const templateFields = pgTable("template_fields", {
  uuid: uuid("uuid").primaryKey().defaultRandom(),
  templateUuid: uuid("template_uuid").notNull().references(() => templates.uuid, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  type: text("type").default("text").notNull(),
  fieldType: text("field_type").default("text").notNull(), // 'text', 'textarea', 'number', 'email', 'checklist', 'row_group'
  placeholder: text("placeholder"),
  required: boolean("required").default(false).notNull(),
  options: text("options"), // JSON array for checklist options: ["opt1", "opt2", "opt3"]
  defaultValue: text("default_value"), // Default value for the field
  position: integer("position").default(0).notNull(), // Order of first appearance in template document
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  templateUuidIdx: index("template_fields_template_uuid_idx").on(table.templateUuid),
}));

// Column definition for template tables and chorus block variables.
// For chorus blocks (blockType='block'), fieldType/defaultValue/options are supported.
// For regular tables (blockType='table'), only name/label are used.
export interface BlockColumnDef {
  name: string;
  label: string;
  fieldType?: 'text' | 'checklist'; // block variables only
  defaultValue?: string;             // block variables only
  options?: string[];                // block variables, when fieldType='checklist'
}

// Template tables — defines table structure for <<TABLE_NAME:col1,col2,...>> markers
// and chorus blocks for {%#BLOCK_NAME%}...{%/BLOCK_NAME%} repeatable sections
export const templateTables = pgTable("template_tables", {
  id: uuid("id").primaryKey().defaultRandom(),
  templateUuid: uuid("template_uuid").notNull().references(() => templates.uuid, { onDelete: 'cascade' }),
  name: text("name").notNull(), // matches <<NAME>> in .docx, or BLOCK_NAME for chorus blocks
  label: text("label").notNull(), // display name shown in UI
  columns: jsonb("columns").notNull().$type<Array<BlockColumnDef>>(), // [{name, label, fieldType?, defaultValue?, options?}]
  position: integer("position").default(0).notNull(),
  blockType: text("block_type").default('table').notNull(), // 'table' | 'block'
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  templateNameUnique: unique().on(table.templateUuid, table.name),
  templateUuidIdx: index("template_tables_template_uuid_idx").on(table.templateUuid),
}));

// Document table data — stores row data for each table in a document
export const documentTableData = pgTable("document_table_data", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentUuid: uuid("document_uuid").notNull().references(() => documents.uuid, { onDelete: 'cascade' }),
  tableName: text("table_name").notNull(), // matches templateTables.name
  rows: jsonb("rows").notNull().$type<Array<Record<string, string>>>(), // [{col1: val1, col2: val2}, ...]
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  docTableUnique: unique().on(table.documentUuid, table.tableName),
  documentUuidIdx: index("document_table_data_document_uuid_idx").on(table.documentUuid),
}));

// Documents table - UUID primary key
export const documents = pgTable("documents", {
  uuid: uuid("uuid").primaryKey().defaultRandom(),
  templateUuid: uuid("template_uuid").notNull().references(() => templates.uuid, { onDelete: 'cascade' }),
  name: text("name").notNull(),
  filePath: text("file_path").notNull(),
  archived: boolean("archived").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  templateUuidIdx: index("documents_template_uuid_idx").on(table.templateUuid),
  archivedIdx: index("documents_archived_idx").on(table.archived),
  createdAtIdx: index("documents_created_at_idx").on(table.createdAt),
  archivedCreatedAtIdx: index("documents_archived_created_at_idx").on(table.archived, table.createdAt),
  templateArchivedCreatedAtIdx: index("documents_template_archived_created_at_idx").on(table.templateUuid, table.archived, table.createdAt),
}));

// Document fields table - UUID references
export const documentFields = pgTable("document_fields", {
  uuid: uuid("uuid").primaryKey().defaultRandom(),
  documentUuid: uuid("document_uuid").notNull().references(() => documents.uuid, { onDelete: 'cascade' }),
  fieldName: text("field_name").notNull(),
  fieldValue: text("field_value").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => ({
  documentUuidIdx: index("document_fields_document_uuid_idx").on(table.documentUuid),
  fieldNameIdx: index("document_fields_field_name_idx").on(table.fieldName),
}));

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
  tables: many(templateTables),
  documents: many(documents),
  batchSessions: many(batchSessions),
}));

export const templateFieldsRelations = relations(templateFields, ({ one }) => ({
  template: one(templates, { fields: [templateFields.templateUuid], references: [templates.uuid] }),
}));

export const templateTablesRelations = relations(templateTables, ({ one }) => ({
  template: one(templates, { fields: [templateTables.templateUuid], references: [templates.uuid] }),
}));

export const documentsRelations = relations(documents, ({ one, many }) => ({
  template: one(templates, { fields: [documents.templateUuid], references: [templates.uuid] }),
  fields: many(documentFields),
  tableData: many(documentTableData),
}));

export const documentFieldsRelations = relations(documentFields, ({ one }) => ({
  document: one(documents, { fields: [documentFields.documentUuid], references: [documents.uuid] }),
}));

export const documentTableDataRelations = relations(documentTableData, ({ one }) => ({
  document: one(documents, { fields: [documentTableData.documentUuid], references: [documents.uuid] }),
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

export const insertTemplateTableSchema = createInsertSchema(templateTables, {
  name: (schema) => schema.min(1, "Table name is required"),
  label: (schema) => schema.min(1, "Table label is required"),
}).omit({ id: true, createdAt: true, updatedAt: true });

export const insertDocumentTableDataSchema = createInsertSchema(documentTableData, {
  tableName: (schema) => schema.min(1, "Table name is required"),
}).omit({ id: true, createdAt: true, updatedAt: true });

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

export type TemplateTable = typeof templateTables.$inferSelect;
export type InsertTemplateTable = z.infer<typeof insertTemplateTableSchema>;

export type DocumentTableData = typeof documentTableData.$inferSelect;
export type InsertDocumentTableData = z.infer<typeof insertDocumentTableDataSchema>;

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

// Column type for template tables
export type TableColumn = { name: string; label: string };

