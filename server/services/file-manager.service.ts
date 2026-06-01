import fs from 'fs/promises';
import path from 'path';
import { ObjectStorageService, ObjectNotFoundError } from '../objectStorage';

export class FileManagerService {
  
  private static getObjectStorage(): ObjectStorageService | null {
    try {
      const service = new ObjectStorageService();
      service.getPrivateObjectDir();
      return service;
    } catch {
      return null;
    }
  }
  
  static async saveUploadedTemplate(tempPath: string, originalName: string): Promise<string> {
    console.log(`[FileManager] saveUploadedTemplate called:`, { tempPath, originalName });
    
    const fileBuffer = await fs.readFile(tempPath);
    console.log(`[FileManager] Read temp file, size: ${fileBuffer.length} bytes`);
    
    const objectStorage = this.getObjectStorage();
    
    if (objectStorage) {
      try {
        const objectPath = objectStorage.generateTemplatePath(originalName);
        console.log(`[FileManager] Uploading to Object Storage: ${objectPath}`);
        await objectStorage.uploadBuffer(fileBuffer, objectPath);
        console.log(`[FileManager] Template uploaded to Object Storage: ${objectPath}`);
        
        await fs.unlink(tempPath).catch(() => {});
        console.log(`[FileManager] Cleaned up temp file: ${tempPath}`);
        
        return objectPath;
      } catch (error) {
        console.error('[FileManager] Failed to upload to Object Storage, falling back to local:', error);
      }
    }
    
    const timestamp = Date.now();
    const sanitizedName = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const permanentFileName = `${timestamp}_${sanitizedName}`;
    const permanentPath = path.join('storage/templates', permanentFileName);
    
    console.log(`[FileManager] Saving to local filesystem: ${permanentPath}`);
    await fs.mkdir('storage/templates', { recursive: true });
    
    await fs.rename(tempPath, permanentPath);
    
    const exists = await this.fileExists(permanentPath);
    if (!exists) {
      throw new Error(`Failed to move file to permanent location: ${permanentPath}`);
    }
    
    console.log(`[FileManager] Template saved to local: ${permanentPath}`);
    return permanentPath;
  }
  
  static async readTemplateBuffer(filePath: string): Promise<Buffer> {
    if (filePath.startsWith('/')) {
      const objectStorage = this.getObjectStorage();
      if (objectStorage) {
        try {
          const buffer = await objectStorage.downloadBuffer(filePath);
          console.log(`Template read from Object Storage: ${filePath}`);
          return buffer;
        } catch (error) {
          if (error instanceof ObjectNotFoundError) {
            throw new Error(`Template file not found in Object Storage: ${filePath}`);
          }
          throw error;
        }
      }
      throw new Error(`Object Storage not configured for path: ${filePath}`);
    }
    
    return fs.readFile(filePath);
  }
  
  static async deleteTemplateFile(filePath: string): Promise<void> {
    if (filePath.startsWith('/')) {
      const objectStorage = this.getObjectStorage();
      if (objectStorage) {
        try {
          await objectStorage.deleteObject(filePath);
          console.log(`Template deleted from Object Storage: ${filePath}`);
        } catch (error) {
          console.warn(`Could not delete template from Object Storage ${filePath}:`, error);
        }
      }
      return;
    }
    
    try {
      await fs.unlink(filePath);
      console.log(`Template deleted from local filesystem: ${filePath}`);
    } catch (error) {
      console.warn(`Could not delete local template file ${filePath}:`, error);
    }
  }
  
  static async fileExists(filePath: string): Promise<boolean> {
    if (filePath.startsWith('/')) {
      const objectStorage = this.getObjectStorage();
      if (objectStorage) {
        return objectStorage.objectExists(filePath);
      }
      return false;
    }
    
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
  
  static async validateFile(filePath: string): Promise<{ exists: boolean; size: number; isValid: boolean }> {
    if (filePath.startsWith('/')) {
      const objectStorage = this.getObjectStorage();
      if (!objectStorage) {
        return { exists: false, size: 0, isValid: false };
      }
      
      const exists = await objectStorage.objectExists(filePath);
      if (!exists) {
        return { exists: false, size: 0, isValid: false };
      }
      
      try {
        const buffer = await objectStorage.downloadBuffer(filePath);
        return {
          exists: true,
          size: buffer.length,
          isValid: buffer.length > 0
        };
      } catch {
        return { exists: false, size: 0, isValid: false };
      }
    }
    
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
  
  static async cleanupTempFile(tempPath: string): Promise<void> {
    try {
      await fs.unlink(tempPath);
    } catch (error) {
      console.warn(`Could not cleanup temp file ${tempPath}:`, error);
    }
  }
  
  static async cleanupFiles(filePaths: string[]): Promise<void> {
    await Promise.all(
      filePaths.map(filePath => this.cleanupTempFile(filePath))
    );
  }
  
  static getFileExtension(filePath: string): string {
    return path.extname(filePath).toLowerCase();
  }
  
  static generateUniqueFileName(originalName: string, prefix: string = ''): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const sanitizedName = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');
    
    return prefix 
      ? `${prefix}_${timestamp}_${random}_${sanitizedName}`
      : `${timestamp}_${random}_${sanitizedName}`;
  }
}
