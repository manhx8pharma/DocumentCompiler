import { z } from 'zod';

/**
 * Shared API Response Types
 * 
 * This file defines TypeScript types and Zod schemas for API responses
 * to ensure consistency between frontend and backend.
 * 
 * NAMING CONVENTION:
 * - HTML preview content: Always use `previewHtml` key
 * - Boolean flags: Use `isXxx` or `hasXxx` pattern
 * - Data objects: Use descriptive names with context
 */

// ============================================================================
// PREVIEW RESPONSE TYPES
// ============================================================================

/**
 * Base template information included in preview responses
 */
export const TemplateInfoSchema = z.object({
  uuid: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  category: z.string().optional(),
  fieldCount: z.coerce.number().optional(),
  createdAt: z.date().optional(),
});

export type TemplateInfo = z.infer<typeof TemplateInfoSchema>;

/**
 * Document information included in preview responses
 */
export const DocumentInfoSchema = z.object({
  name: z.string(),
  template: z.object({
    uuid: z.string(),
    name: z.string(),
  })
});

export type DocumentInfo = z.infer<typeof DocumentInfoSchema>;

/**
 * Field information for template fields preview
 */
export const FieldInfoSchema = z.object({
  name: z.string(),
  value: z.string(),
  type: z.string(),
  required: z.boolean(),
});

export type FieldInfo = z.infer<typeof FieldInfoSchema>;

/**
 * Standard Preview Response
 * 
 * All preview endpoints should return this structure with `previewHtml`
 * containing the HTML content to be displayed.
 * 
 * @example
 * // Template preview
 * { previewHtml: "<html>...", template: {...} }
 * 
 * // Document preview
 * { previewHtml: "<html>...", document: {...} }
 * 
 * // Template with fields preview
 * { previewHtml: "<html>...", fields: [...], template: {...} }
 */
export const PreviewResponseSchema = z.object({
  previewHtml: z.string(),
  template: TemplateInfoSchema.optional(),
  document: DocumentInfoSchema.optional(),
  fields: z.array(FieldInfoSchema).optional(),
});

export type PreviewResponse = z.infer<typeof PreviewResponseSchema>;

// ============================================================================
// RESPONSE BUILDER PARAMETER TYPES
// ============================================================================

/**
 * Parameters for building a preview response
 * These are used by the response builder utility functions
 */
export interface BuildPreviewParams {
  html: string;
  template?: Partial<TemplateInfo>;
  document?: DocumentInfo;
  fields?: FieldInfo[];
}

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validates if a response object conforms to PreviewResponse schema
 * @param data - The response data to validate
 * @returns true if valid, throws ZodError if invalid
 */
export function validatePreviewResponse(data: unknown): data is PreviewResponse {
  PreviewResponseSchema.parse(data);
  return true;
}

/**
 * Safely parses a preview response with error handling
 * @param data - The response data to parse
 * @returns Parsed preview response or null if invalid
 */
export function safeParsePreviewResponse(data: unknown): PreviewResponse | null {
  const result = PreviewResponseSchema.safeParse(data);
  return result.success ? result.data : null;
}
