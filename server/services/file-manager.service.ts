import fs from 'fs/promises';
import path from 'path';

/**
 * File Manager Service for handling template and document file operations
 */
export class FileManagerService {
  
  /**
   * Move uploaded file from temp location to permanent storage
   */
  static async saveUploadedTemplate(tempPath: string, originalName: string): Promise<string> {
    const timestamp = Date.now();
    const sanitizedName = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const permanentFileName = `${timestamp}_${sanitizedName}`;
    const permanentPath = path.join('storage/templates', permanentFileName);
    
    // Ensure storage directory exists
    await fs.mkdir('storage/templates', { recursive: true });
    
    // Move file from temp to permanent location
    await fs.rename(tempPath, permanentPath);
    
    // Verify file was moved successfully
    const exists = await this.fileExists(permanentPath);
    if (!exists) {
      throw new Error(`Failed to move file to permanent location: ${permanentPath}`);
    }
    
    return permanentPath;
  }
  
  /**
   * Check if file exists
   */
  static async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Validate file integrity
   */
  static async validateFile(filePath: string): Promise<{ exists: boolean; size: number; isValid: boolean }> {
    try {
      const stats = await fs.stat(filePath);
      return {
        exists: true,
        size: stats.size,
        isValid: stats.isFile() && stats.size > 0
      };
    } catch {
      return {
        exists: false,
        size: 0,
        isValid: false
      };
    }
  }
  
  /**
   * Clean up temporary files
   */
  static async cleanupTempFile(tempPath: string): Promise<void> {
    try {
      await fs.unlink(tempPath);
    } catch (error) {
      // Ignore errors if file doesn't exist
      console.warn(`Could not cleanup temp file ${tempPath}:`, error);
    }
  }
  
  /**
   * Clean up multiple files
   */
  static async cleanupFiles(filePaths: string[]): Promise<void> {
    await Promise.all(
      filePaths.map(filePath => this.cleanupTempFile(filePath))
    );
  }
  
  /**
   * Get file extension from file path
   */
  static getFileExtension(filePath: string): string {
    return path.extname(filePath).toLowerCase();
  }
  
  /**
   * Generate unique filename
   */
  static generateUniqueFileName(originalName: string, prefix: string = ''): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const sanitizedName = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');
    
    return prefix 
      ? `${prefix}_${timestamp}_${random}_${sanitizedName}`
      : `${timestamp}_${random}_${sanitizedName}`;
  }
}