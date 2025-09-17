import fs from 'fs';
import path from 'path';
import os from 'os';
import { promisify } from 'util';
import { randomBytes, createHash } from 'crypto';

// Promisify fs functions
const mkdir = promisify(fs.mkdir);
const writeFile = promisify(fs.writeFile);
const readFile = promisify(fs.readFile);
const unlink = promisify(fs.unlink);
const access = promisify(fs.access);
const stat = promisify(fs.stat);

// Base storage directory
const getStorageDir = () => {
  // Store files in a more persistent location
  const baseDir = path.join(process.cwd(), 'storage');
  
  // Make sure the base directory exists synchronously on startup
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }
  
  return baseDir;
};

// Subdirectories
const TEMPLATES_DIR = 'templates';
const DOCUMENTS_DIR = 'documents';

// Ensure the directory exists
export const ensureDir = async (type: 'templates' | 'documents'): Promise<string> => {
  const baseDir = getStorageDir();
  const dirPath = path.join(baseDir, type === 'templates' ? TEMPLATES_DIR : DOCUMENTS_DIR);
  
  try {
    await access(dirPath);
  } catch (error) {
    // Directory doesn't exist, create it
    await mkdir(dirPath, { recursive: true });
  }
  
  return dirPath;
};

// Generate unique filename with UUID to ensure no ID collisions
export const generateUniqueFilename = (originalName: string): string => {
  const timestamp = Date.now();
  const random = randomBytes(8).toString('hex');
  const extension = path.extname(originalName);
  // Combine timestamp and random bytes for a virtually collision-proof filename
  const filename = `${timestamp}-${random}${extension}`;
  return filename;
};

// Generate stable filename based on ID to prevent collisions
export const generateStableFilename = (id: number | string, originalName: string): string => {
  // Create deterministic hash based on ID and type
  const typePrefix = originalName.toLowerCase().includes('template') ? 'tpl' : 'doc';
  const idString = String(id); // Ensure the ID is a string for consistent hashing
  const idHash = createHash('md5').update(`${typePrefix}-${idString}`).digest('hex').slice(0, 8);
  const extension = path.extname(originalName);
  
  // Use ID and deterministic hash for consistent filename
  // For UUIDs, use just the first 8 characters to keep filename manageable
  const idForFilename = typeof id === 'string' && id.includes('-') 
    ? id.split('-')[0] // Just take the first segment of the UUID
    : id;
  
  const filename = `${typePrefix}-${idForFilename}-${idHash}${extension}`;
  return filename;
};

// Save file to storage with optional ID for stable naming
export const saveFile = async (
  buffer: Buffer, 
  originalname: string,
  type: 'templates' | 'documents',
  id?: number | string
): Promise<string> => {
  const dirPath = await ensureDir(type);
  // Use stable filename when ID is provided
  const uniqueFilename = id !== undefined
    ? generateStableFilename(id, originalname)
    : generateUniqueFilename(originalname);
  const filePath = path.join(dirPath, uniqueFilename);
  
  // Create storage directories if they don't exist
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  
  try {
    // Write file with fs.writeFileSync for more reliability
    fs.writeFileSync(filePath, buffer);
    
    // Verify the file was written
    if (!fs.existsSync(filePath)) {
      throw new Error(`File write verification failed: File not found after write operation`);
    }
    
    // Log detailed information about the saved file
    const stats = fs.statSync(filePath);
    console.log(`File saved successfully at: ${filePath}`);
    console.log(`File details: Size=${stats.size} bytes, Created=${stats.birthtime}`);
    
    return filePath;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Failed to save file: ${errorMessage}`);
    throw new Error(`Failed to save file: ${errorMessage}`);
  }
};

// Read file from storage
export const readFileFromStorage = async (filePath: string): Promise<Buffer> => {
  try {
    // Try synchronous read first for more reliable file access
    if (fs.existsSync(filePath)) {
      try {
        const data = fs.readFileSync(filePath);
        // Verify the data is valid
        if (!data || data.length === 0) {
          throw new Error('File exists but contains no data');
        }
        console.log(`Read file successfully: ${filePath}, size: ${data.length} bytes`);
        return data;
      } catch (syncError: unknown) {
        const errorMessage = syncError instanceof Error ? syncError.message : 'Unknown error';
        console.error(`Failed to read file synchronously: ${errorMessage}`);
        throw new Error(`Failed to read file synchronously: ${errorMessage}`);
      }
    }
    
    // Fall back to async read if sync read fails
    const data = await readFile(filePath);
    return data;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Failed to read file: ${errorMessage}`);
  }
};

// Delete file from storage
export const deleteFile = async (filePath: string): Promise<void> => {
  try {
    await access(filePath);
    await unlink(filePath);
    
    // Verify file was deleted
    if (fs.existsSync(filePath)) {
      console.warn(`File deletion verification failed: ${filePath} still exists`);
    } else {
      console.log(`File deleted successfully: ${filePath}`);
    }
  } catch (error: unknown) {
    // File doesn't exist or can't be accessed, that's okay
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.warn(`Could not delete file ${filePath}: ${errorMessage}`);
  }
};

// Check if file exists
export const fileExists = async (filePath: string): Promise<boolean> => {
  // First try synchronous check for immediate result
  if (fs.existsSync(filePath)) {
    // Verify the file is accessible and not a directory
    try {
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        console.warn(`File path exists but is a directory: ${filePath}`);
        return false;
      }
      return true;
    } catch (statError: unknown) {
      const errorMessage = statError instanceof Error ? statError.message : 'Unknown error';
      console.warn(`File exists but can't be stat'd: ${filePath}, error: ${errorMessage}`);
      return false;
    }
  }
  
  // Fall back to async check if sync check fails
  try {
    await access(filePath);
    return true;
  } catch (error: unknown) {
    return false;
  }
};

// Get file size
export const getFileSize = async (filePath: string): Promise<number> => {
  try {
    const stats = await stat(filePath);
    return stats.size;
  } catch (error) {
    return 0;
  }
};

// Extract placeholders from text content (e.g., {{name}})
export const extractPlaceholders = (content: string): string[] => {
  // Enhanced regex to handle more complex placeholder patterns and avoid invalid matches
  // This will match standard {{fieldName}} patterns as well as some variations
  const regex = /{{([^{}]+?)(?:}}|(?=\s|$))/g;
  const placeholders: string[] = [];
  let match;
  
  // First pass with standard regex
  while ((match = regex.exec(content)) !== null) {
    const placeholder = match[1].trim();
    if (placeholder && !placeholders.includes(placeholder)) {
      placeholders.push(placeholder);
    }
  }
  
  // Secondary pass for potential XML-formatted placeholders and content
  // This helps with Word documents that might have XML formatting within placeholders
  const xmlRegex = /<w:t[^>]*>.*?{{([^{}]+?)}}.*?<\/w:t>/g;
  while ((match = xmlRegex.exec(content)) !== null) {
    const placeholder = match[1].trim();
    if (placeholder && !placeholders.includes(placeholder)) {
      placeholders.push(placeholder);
    }
  }
  
  // Clean up placeholders to remove any invalid characters or trailing spaces
  return placeholders.map(p => p.trim().replace(/\s+/g, ' '));
};
