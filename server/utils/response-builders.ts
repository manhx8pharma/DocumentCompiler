import { Response } from 'express';
import { 
  PreviewResponse, 
  PreviewResponseSchema,
  BuildPreviewParams,
  validatePreviewResponse 
} from '../../shared/api-types';

/**
 * API Response Builder Utilities
 * 
 * These utilities ensure consistent, type-safe API responses across all endpoints.
 * All responses are validated against Zod schemas before being sent to clients.
 * 
 * BENEFITS:
 * - Type safety: Compile-time checking of response structure
 * - Runtime validation: Catches mismatches before they reach clients
 * - Consistency: One pattern for all similar responses
 * - Self-documenting: Clear function signatures
 * 
 * USAGE:
 * ```typescript
 * import { ApiResponse } from '../utils/response-builders';
 * 
 * export async function previewDocument(req, res) {
 *   const htmlContent = await generatePreview();
 *   
 *   const response = ApiResponse.buildPreview({
 *     html: htmlContent,
 *     document: { name: 'My Doc', template: {...} }
 *   });
 *   
 *   return ApiResponse.sendPreview(res, response);
 * }
 * ```
 */
export class ApiResponse {
  /**
   * Build a preview response object with type safety
   * 
   * @param params - Preview parameters
   * @param params.html - HTML content for the preview
   * @param params.template - Optional template information
   * @param params.document - Optional document information
   * @param params.fields - Optional field information
   * @returns Type-safe PreviewResponse object
   * 
   * @example
   * // Template preview
   * const response = ApiResponse.buildPreview({
   *   html: '<div>Template content</div>',
   *   template: { uuid: '123', name: 'My Template' }
   * });
   * 
   * @example
   * // Document preview with fields
   * const response = ApiResponse.buildPreview({
   *   html: '<div>Document content</div>',
   *   document: { 
   *     name: 'My Document',
   *     template: { uuid: '123', name: 'My Template' }
   *   },
   *   fields: [
   *     { name: 'field1', value: 'value1', type: 'text', required: true }
   *   ]
   * });
   */
  static buildPreview(params: BuildPreviewParams): PreviewResponse {
    const response: PreviewResponse = {
      previewHtml: params.html,
    };

    if (params.template) {
      response.template = {
        uuid: params.template.uuid || '',
        name: params.template.name || '',
        description: params.template.description,
        category: params.template.category,
        fieldCount: params.template.fieldCount,
        createdAt: params.template.createdAt,
      };
    }

    if (params.document) {
      response.document = params.document;
    }

    if (params.fields) {
      response.fields = params.fields;
    }

    return response;
  }

  /**
   * Send a preview response with validation
   * 
   * This method validates the response object against the schema
   * before sending it to the client. If validation fails, it throws
   * an error with details about what's wrong.
   * 
   * @param res - Express Response object
   * @param data - PreviewResponse data to send
   * @returns Express Response
   * @throws {ZodError} If response doesn't match schema
   * 
   * @example
   * const response = ApiResponse.buildPreview({...});
   * return ApiResponse.sendPreview(res, response);
   */
  static sendPreview(res: Response, data: PreviewResponse): Response {
    try {
      // Validate response structure before sending
      validatePreviewResponse(data);
      return res.json(data);
    } catch (error) {
      console.error('Preview response validation failed:', error);
      throw error;
    }
  }

  /**
   * Shorthand method to build and send a preview response in one call
   * 
   * @param res - Express Response object
   * @param params - Preview parameters
   * @returns Express Response
   * 
   * @example
   * return ApiResponse.preview(res, {
   *   html: htmlContent,
   *   template: templateData
   * });
   */
  static preview(res: Response, params: BuildPreviewParams): Response {
    const response = this.buildPreview(params);
    return this.sendPreview(res, response);
  }

  /**
   * Helper method to handle preview errors consistently
   * 
   * @param res - Express Response object
   * @param error - Error object
   * @param message - Custom error message
   * @param statusCode - HTTP status code (default: 500)
   * @returns Express Response
   */
  static previewError(
    res: Response, 
    error: unknown, 
    message: string = 'Failed to generate preview',
    statusCode: number = 500
  ): Response {
    console.error(message, error);
    return res.status(statusCode).json({
      message,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Legacy support: Export individual functions for gradual migration
 * These can be used during transition period
 */

export function buildPreviewResponse(params: BuildPreviewParams): PreviewResponse {
  return ApiResponse.buildPreview(params);
}

export function sendPreviewResponse(res: Response, data: PreviewResponse): Response {
  return ApiResponse.sendPreview(res, data);
}

export function handlePreviewError(
  res: Response, 
  error: unknown, 
  message?: string,
  statusCode?: number
): Response {
  return ApiResponse.previewError(res, error, message, statusCode);
}
