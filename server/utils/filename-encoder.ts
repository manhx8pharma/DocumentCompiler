/**
 * Utility functions for encoding filenames in HTTP headers
 * Supports UTF-8 characters (Vietnamese, etc.) according to RFC 5987
 */

/**
 * Sanitize filename by removing/replacing invalid characters
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/\.+$/g, '')
    .trim() || 'document';
}

/**
 * Create ASCII-safe fallback filename
 */
export function createAsciiFallback(filename: string): string {
  return filename
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/_+/g, '_')
    .trim() || 'document';
}

/**
 * Encode filename for Content-Disposition header according to RFC 5987
 * Returns both ASCII fallback and UTF-8 encoded version
 * 
 * @example
 * encodeFilenameForDownload("251113-0031_TBTC_Nguyễn Văn Tình.docx")
 * // Returns: 'attachment; filename="251113-0031_TBTC_Nguyen_Van_Tinh.docx"; filename*=UTF-8\'\'251113-0031_TBTC_Nguy%E1%BB%85n%20V%C4%83n%20T%C3%ACnh.docx'
 */
export function encodeFilenameForDownload(filename: string): string {
  const sanitized = sanitizeFilename(filename);
  const asciiFallback = createAsciiFallback(sanitized);
  const utf8Encoded = encodeURIComponent(sanitized).replace(/'/g, '%27');
  
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${utf8Encoded}`;
}

/**
 * Get Content-Disposition header value for document download
 */
export function getContentDispositionHeader(documentName: string, extension: string = 'docx'): string {
  const fullFilename = `${documentName}.${extension}`;
  return encodeFilenameForDownload(fullFilename);
}

/**
 * Encode filename for use inside ZIP archives
 * Uses UTF-8 encoding for proper display on Windows/Mac
 */
export function encodeFilenameForZip(filename: string): string {
  return sanitizeFilename(filename);
}
