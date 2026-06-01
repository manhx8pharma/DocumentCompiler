import { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { storage } from '../storage-uuid';
import { insertTemplateSchema } from '@shared/schema';
import { z } from 'zod';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import archiver from 'archiver';
import { FileManagerService } from '../services/file-manager.service';
import { ApiResponse } from '../utils/response-builders';
import { getEnhancedMammothOptions, getPreviewStyles } from '../services/template-processor.service';
import { fieldHighlightStyles } from '../utils/docx-parser';
import { templatePreviewCache } from '../services/template-preview-cache.service';
import { getContentDispositionHeader } from '../utils/filename-encoder';
import { parseTableMarkersFromXml } from '../utils/table-marker';
import PizZip from 'pizzip';

/**
 * Extract chorus block definitions from Word XML content.
 * Detects {%#BLOCKNAME%}...{%/BLOCKNAME%} patterns and variables inside.
 */
type BlockVariableDef = { name: string; options: string[] };

function parseChorusBlocksFromXml(xmlContent: string): Array<{ name: string; variables: BlockVariableDef[] }> {
  try {
    const paragraphTexts: string[] = [];
    const parPattern = /<w:p[ >][\s\S]*?<\/w:p>/g;
    let parMatch: RegExpExecArray | null;
    while ((parMatch = parPattern.exec(xmlContent)) !== null) {
      const parContent = parMatch[0];
      const textPattern = /<w:t[^>]*>([^<]*)<\/w:t>/g;
      const texts: string[] = [];
      let tm: RegExpExecArray | null;
      while ((tm = textPattern.exec(parContent)) !== null) {
        texts.push(tm[1]);
      }
      paragraphTexts.push(texts.join(''));
    }
    const fullText = paragraphTexts.join('\n');

    const blocks: Array<{ name: string; variables: BlockVariableDef[] }> = [];
    const openRe = /\{%#([^%\s]+)%\}/g;
    let openMatch: RegExpExecArray | null;

    while ((openMatch = openRe.exec(fullText)) !== null) {
      const name = openMatch[1].trim();
      if (!fullText.includes(`{%/${name}%}`)) continue;

      const betweenRe = new RegExp(`\\{%#${name}%\\}([\\s\\S]*?)\\{%\\/${name}%\\}`);
      const between = betweenRe.exec(fullText);
      const variables: BlockVariableDef[] = [];
      if (between) {
        const varRe = /\{%([^%]+)%\}/g;
        let vm: RegExpExecArray | null;
        while ((vm = varRe.exec(between[1])) !== null) {
          const raw = vm[1].trim();
          // Skip block open/close tags
          if (raw.startsWith('#') || raw.startsWith('/')) continue;
          // Split at first pipe: "varName|opt1|opt2" → name="varName", options=["opt1","opt2"]
          const pipeIdx = raw.indexOf('|');
          const varName = pipeIdx >= 0 ? raw.substring(0, pipeIdx).trim() : raw;
          const options = pipeIdx >= 0
            ? raw.substring(pipeIdx + 1).split('|').map(o => o.trim()).filter(Boolean)
            : [];
          if (varName && !variables.find(v => v.name === varName)) {
            variables.push({ name: varName, options });
          }
        }
      }
      if (!blocks.find(b => b.name === name)) {
        blocks.push({ name, variables });
      }
    }
    return blocks;
  } catch (err) {
    console.warn('[parseChorusBlocksFromXml] Error:', err);
    return [];
  }
}
import { db } from '@db';
import { templateTables, templateFields } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

// Configure multer for file uploads
const upload = multer({
  dest: 'storage/templates/',
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.docx', '.doc'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only Word documents (.docx, .doc) are allowed'));
    }
  },
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

const uploadExcel = multer({
  dest: 'storage/batch/',
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.xlsx', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only Excel files (.xlsx, .xls) are allowed'));
    }
  },
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
});

export const uploadTemplateMiddleware = upload.single('file');

export async function getTemplates(req: Request, res: Response) {
  try {
    const { search, category, archived, page = '1', limit = '10' } = req.query;
    
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const offset = (pageNum - 1) * limitNum;

    const isArchived = archived === 'true';
    
    const templates = await storage.getTemplates({
      searchQuery: search as string,
      category: category as string,
      archived: isArchived,
      limit: limitNum,
      offset: offset,
    });

    const filteredTotal = await storage.getTemplatesCount({
      searchQuery: search as string,
      category: category as string,
      archived: isArchived,
    });

    const stats = await storage.getTemplateStats();

    res.json({
      templates,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: filteredTotal,
      },
      stats,
    });
  } catch (error) {
    console.error('Error fetching templates:', error);
    res.status(500).json({ 
      message: 'Failed to fetch templates',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export async function getTemplateById(req: Request, res: Response) {
  try {
    const { uuid: templateUuid, id: templateId } = req.params;
    const templateUuid_ = templateUuid || templateId;
    

    const template = await storage.getTemplateByUuid(templateUuid_);
    
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    res.json(template);
  } catch (error) {
    console.error('Error fetching template:', error);
    res.status(500).json({ 
      message: 'Failed to fetch template',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export async function createTemplate(req: Request, res: Response) {
  let createdTemplateUuid: string | null = null;
  let permanentFilePath: string | null = null;
  const uploadId = Date.now().toString(36);

  console.log(`\n========== [TEMPLATE UPLOAD START] ID: ${uploadId} ==========`);
  console.log(`[UPLOAD ${uploadId}] Timestamp: ${new Date().toISOString()}`);

  try {
    if (!req.file) {
      console.log(`[UPLOAD ${uploadId}] ERROR: No file uploaded`);
      return res.status(400).json({ message: 'No file uploaded' });
    }

    console.log(`[UPLOAD ${uploadId}] File received:`, {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: req.file.path
    });
    console.log(`[UPLOAD ${uploadId}] Request body:`, {
      name: req.body.name,
      category: req.body.category,
      description: req.body.description
    });

    const validatedData = insertTemplateSchema.parse(req.body);
    console.log(`[UPLOAD ${uploadId}] Validation passed`);
    
    // Log existing templates BEFORE upload
    const existingTemplates = await storage.getTemplates({ limit: 100 });
    console.log(`[UPLOAD ${uploadId}] BEFORE UPLOAD - Existing templates count: ${existingTemplates.length}`);
    console.log(`[UPLOAD ${uploadId}] BEFORE UPLOAD - Template list:`, existingTemplates.map(t => ({ uuid: t.uuid, name: t.name })));
    
    // Create storage directory if it doesn't exist
    const storageDir = 'storage/templates';
    try {
      await fs.mkdir(storageDir, { recursive: true });
    } catch (mkdirError) {
      console.log(`[UPLOAD ${uploadId}] Storage directory already exists or created`);
    }

    // Handle file path - move from temp to permanent location
    const tempFilePath = req.file.path;
    console.log(`[UPLOAD ${uploadId}] Saving file from temp: ${tempFilePath}`);
    permanentFilePath = await FileManagerService.saveUploadedTemplate(tempFilePath, req.file.originalname);
    console.log(`[UPLOAD ${uploadId}] File saved to: ${permanentFilePath}`);
    
    const templateData = {
      name: validatedData.name,
      description: validatedData.description || undefined,
      category: validatedData.category,
      filePath: permanentFilePath,
    };

    console.log(`[UPLOAD ${uploadId}] Creating template in database...`);
    const template = await storage.createTemplate(templateData);
    createdTemplateUuid = template.uuid;
    console.log(`[UPLOAD ${uploadId}] Template created with UUID: ${createdTemplateUuid}`);
    
    // Log existing templates AFTER creation
    const templatesAfterCreate = await storage.getTemplates({ limit: 100 });
    console.log(`[UPLOAD ${uploadId}] AFTER CREATE - Templates count: ${templatesAfterCreate.length}`);
    console.log(`[UPLOAD ${uploadId}] AFTER CREATE - Template list:`, templatesAfterCreate.map(t => ({ uuid: t.uuid, name: t.name })));

    // Extract fields from the document
    try {
      const fileBuffer = await FileManagerService.readTemplateBuffer(permanentFilePath);
      console.log('File buffer size:', fileBuffer.length);
      
      const { value: extractedText } = await mammoth.extractRawText({ buffer: fileBuffer });
      console.log('Extracted text length:', extractedText.length);
      console.log('Extracted text preview:', extractedText.substring(0, 500));
      
      // Extract field placeholders like {{fieldName}} or {{fieldName=default|opt1|opt2}}
      const fieldMatches = extractedText.match(/\{\{([^}]+)\}\}/g) || [];
      console.log('Field matches found:', fieldMatches);
      
      const rawFieldContents = fieldMatches.map(match => match.replace(/[{}]/g, ''));
      console.log('Raw field contents:', rawFieldContents);
      
      // Remove duplicates manually (based on raw content to preserve syntax)
      const uniqueRawFields = rawFieldContents.filter((field, index) => rawFieldContents.indexOf(field) === index);
      console.log('Unique raw fields:', uniqueRawFields);

      // Also extract <<TABLE_NAME>> markers and {%#BLOCK%} chorus blocks from XML
      let tableMarkers: Array<{ name: string; columns: Array<{ name: string; label: string }> }> = [];
      let chorusBlocks: Array<{ name: string; variables: BlockVariableDef[] }> = [];
      try {
        const zip = new PizZip(fileBuffer);
        const xmlFile = zip.files['word/document.xml'];
        if (xmlFile) {
          const xmlContent = xmlFile.asText();
          tableMarkers = parseTableMarkersFromXml(xmlContent);
          chorusBlocks = parseChorusBlocksFromXml(xmlContent);
          console.log('Table markers found:', tableMarkers.map(m => m.name));
          console.log('Chorus blocks found:', chorusBlocks.map(b => `${b.name}(${b.variables.map(v => v.options.length > 0 ? `${v.name}[checklist:${v.options.length}]` : v.name).join(',')})`));
        }
      } catch (xmlErr) {
        console.warn('Could not extract table/block markers from XML:', xmlErr);
      }
      
      if (uniqueRawFields.length > 0 || tableMarkers.length > 0 || chorusBlocks.length > 0) {
        // Parse each {{}} field with new syntax: {{field=default|opt1|opt2}}
        const fieldsData = uniqueRawFields.map((rawField, idx) => {
          let fieldName = rawField;
          let defaultValue: string | undefined;
          let options: string | undefined;
          let fieldType = 'text';
          
          // Check for new bracket syntax: field['opt1']['opt2']
          if (rawField.includes("['")) {
            const bracketMatch = rawField.match(/^([^\[=]+)/);
            if (bracketMatch) {
              const beforeBrackets = bracketMatch[1];
              if (beforeBrackets.includes('=')) {
                const eqIdx = beforeBrackets.indexOf('=');
                fieldName = beforeBrackets.substring(0, eqIdx).trim();
                defaultValue = beforeBrackets.substring(eqIdx + 1).trim().replace(/^'|'$/g, '');
              } else {
                fieldName = beforeBrackets.trim();
              }
            }
            const optMatches = rawField.match(/\['((?:[^'\\]|\\')*)'\]/g) || [];
            const optionsArray = optMatches.map(m => m.slice(2, -2).replace(/\\'/g, "'"));
            if (optionsArray.length > 0) {
              options = JSON.stringify(optionsArray);
              fieldType = 'checklist';
            }
          }
          // Check for options (pipe-separated): field|opt1|opt2
          else if (rawField.includes('|')) {
            const parts = rawField.split('|');
            const firstPart = parts[0];
            const optionParts = parts.slice(1);
            
            if (firstPart.includes('=')) {
              const [name, defVal] = firstPart.split('=');
              fieldName = name.trim();
              defaultValue = defVal.trim();
            } else {
              fieldName = firstPart.trim();
            }
            
            const optionsArray = optionParts.map(opt => opt.trim()).filter(opt => opt.length > 0);
            if (optionsArray.length > 0) {
              options = JSON.stringify(optionsArray);
              fieldType = 'checklist';
            }
          } 
          // Check for default value only: field=default
          else if (rawField.includes('=')) {
            const [name, defVal] = rawField.split('=');
            fieldName = name.trim();
            defaultValue = defVal.trim().replace(/^'|'$/g, '');
          }
          
          return {
            templateUuid: template.uuid,
            name: fieldName,
            type: 'text',
            fieldType,
            required: false,
            options,
            defaultValue,
            position: idx,
          };
        });

        // Add row_group fields for each table marker
        const tableFieldsData = tableMarkers.map((marker, idx) => ({
          templateUuid: template.uuid,
          name: marker.name,
          type: 'text',
          fieldType: 'row_group',
          required: false,
          options: undefined,
          defaultValue: undefined,
          position: uniqueRawFields.length + idx,
        }));
        
        const allFieldsData = [...fieldsData, ...tableFieldsData];
        console.log('Creating fields with parsed data:', allFieldsData);
        await storage.updateTemplateFields(template.uuid, allFieldsData);
        
        // Create templateTables records for each marker
        if (tableMarkers.length > 0) {
          for (let i = 0; i < tableMarkers.length; i++) {
            const marker = tableMarkers[i];
            // Upsert: insert or ignore if already exists
            await db.insert(templateTables).values({
              templateUuid: template.uuid,
              name: marker.name,
              label: marker.name.replace(/_/g, ' '),
              columns: marker.columns.length > 0 ? marker.columns : [],
              position: i,
            }).onConflictDoNothing();
          }
          console.log(`Created ${tableMarkers.length} template table records`);
        }

        // Create templateTables records for each chorus block
        if (chorusBlocks.length > 0) {
          for (let i = 0; i < chorusBlocks.length; i++) {
            const block = chorusBlocks[i];
            const columns = block.variables.map((v: BlockVariableDef) => ({
              name: v.name,
              label: v.name,
              fieldType: v.options.length > 0 ? 'checklist' : 'text',
              ...(v.options.length > 0 ? { options: v.options } : {}),
            }));
            await db.insert(templateTables).values({
              templateUuid: template.uuid,
              name: block.name,
              label: block.name.replace(/_/g, ' '),
              columns,
              position: tableMarkers.length + i,
              blockType: 'block',
            }).onConflictDoNothing();
          }
          console.log(`Created ${chorusBlocks.length} chorus block records`);
        }

        // Update field count (only count regular fields, not row_group)
        await storage.updateTemplateByUuid(template.uuid, {
          fieldCount: (uniqueRawFields.length + tableMarkers.length).toString()
        });
        
        console.log('Fields successfully created for template:', template.uuid);
      } else {
        console.warn('No field placeholders found in template. Make sure your template uses {{fieldName}} format.');
      }
    } catch (extractError) {
      console.error('Could not extract fields from template:', extractError);
      throw new Error(`Field extraction failed: ${extractError instanceof Error ? extractError.message : 'Unknown error'}`);
    }

    // Fetch the updated template with fields
    const updatedTemplate = await storage.getTemplateByUuid(template.uuid);
    
    // Final verification - log templates after everything is done
    const finalTemplates = await storage.getTemplates({ limit: 100 });
    console.log(`[UPLOAD ${uploadId}] FINAL - Templates count: ${finalTemplates.length}`);
    console.log(`[UPLOAD ${uploadId}] FINAL - Template list:`, finalTemplates.map(t => ({ uuid: t.uuid, name: t.name })));
    console.log(`========== [TEMPLATE UPLOAD SUCCESS] ID: ${uploadId} ==========\n`);
    
    res.status(201).json(updatedTemplate);
  } catch (error) {
    console.error(`[UPLOAD ${uploadId}] ERROR:`, error);
    
    // ROLLBACK: Clean up database record if created
    if (createdTemplateUuid) {
      try {
        console.log(`[UPLOAD ${uploadId}] ROLLBACK - Deleting template: ${createdTemplateUuid}`);
        await storage.deleteTemplateByUuid(createdTemplateUuid, true);
        console.log(`[UPLOAD ${uploadId}] ROLLBACK - Template ${createdTemplateUuid} successfully rolled back from database`);
      } catch (rollbackError) {
        console.error(`[UPLOAD ${uploadId}] ROLLBACK FAILED:`, rollbackError);
      }
    } else if (permanentFilePath) {
      // File was uploaded but DB record wasn't created - clean up orphaned file
      try {
        console.log(`[UPLOAD ${uploadId}] Cleaning up orphaned file: ${permanentFilePath}`);
        await FileManagerService.deleteTemplateFile(permanentFilePath);
        console.log(`[UPLOAD ${uploadId}] Orphaned file ${permanentFilePath} successfully deleted`);
      } catch (cleanupError) {
        console.error(`[UPLOAD ${uploadId}] Failed to cleanup orphaned file:`, cleanupError);
      }
    }
    
    // Clean up uploaded file on error
    if (req.file) {
      try {
        // Try to clean up temp file
        await fs.unlink(req.file.path).catch(() => {});
      } catch (unlinkError) {
        console.error(`[UPLOAD ${uploadId}] Error cleaning up file:`, unlinkError);
      }
    }
    
    console.log(`========== [TEMPLATE UPLOAD FAILED] ID: ${uploadId} ==========\n`);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: 'Validation error',
        errors: error.errors 
      });
    }
    
    res.status(500).json({ 
      message: 'Failed to create template',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export async function updateTemplate(req: Request, res: Response) {
  try {
    const { uuid: templateUuid, id: templateId } = req.params;
    const templateUuid_ = templateUuid || templateId;
    
    const template = await storage.getTemplateByUuid(templateUuid_);
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    const validatedData = insertTemplateSchema.partial().parse(req.body);
    
    const updatedTemplate = await storage.updateTemplateByUuid(templateUuid_, validatedData);
    
    // Invalidate cache when template is updated
    templatePreviewCache.invalidate(templateUuid_);
    
    res.json(updatedTemplate);
  } catch (error) {
    console.error('Error updating template:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: 'Validation error',
        errors: error.errors 
      });
    }
    
    res.status(500).json({ 
      message: 'Failed to update template',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export const replaceTemplateFileMiddleware = upload.single('file');

export async function replaceTemplateFile(req: Request, res: Response) {
  const replaceId = Date.now().toString(36);
  console.log(`\n========== [TEMPLATE FILE REPLACE START] ID: ${replaceId} ==========`);
  
  try {
    const { uuid: templateUuid } = req.params;
    
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    
    const template = await storage.getTemplateByUuid(templateUuid);
    if (!template) {
      await fs.unlink(req.file.path).catch(() => {});
      return res.status(404).json({ message: 'Template not found' });
    }
    
    console.log(`[REPLACE ${replaceId}] Template: ${template.name} (${templateUuid})`);
    console.log(`[REPLACE ${replaceId}] New file: ${req.file.originalname}`);
    
    const existingFields = await storage.getTemplateFields(templateUuid);
    // Separate regular fields from row_group (table) fields
    const existingRegularFieldNames = existingFields
      .filter(f => f.fieldType !== 'row_group')
      .map(f => f.name.toLowerCase().trim()).sort();
    const existingTableNames = existingFields
      .filter(f => f.fieldType === 'row_group')
      .map(f => f.name.toLowerCase().trim()).sort();
    console.log(`[REPLACE ${replaceId}] Existing regular fields (${existingRegularFieldNames.length}):`, existingRegularFieldNames);
    console.log(`[REPLACE ${replaceId}] Existing table markers (${existingTableNames.length}):`, existingTableNames);

    // Load existing chorus block names from templateTables
    const existingBlockRows = await db
      .select({ name: templateTables.name })
      .from(templateTables)
      .where(and(eq(templateTables.templateUuid, templateUuid), eq(templateTables.blockType, 'block')));
    const existingBlockNames = existingBlockRows.map(r => r.name.toLowerCase()).sort();
    console.log(`[REPLACE ${replaceId}] Existing chorus blocks (${existingBlockNames.length}):`, existingBlockNames);

    const tempFilePath = req.file.path;
    const fileBuffer = await fs.readFile(tempFilePath);
    
    const { value: extractedText } = await mammoth.extractRawText({ buffer: fileBuffer });
    const fieldMatches = extractedText.match(/\{\{([^}]+)\}\}/g) || [];
    
    const rawFieldContents = fieldMatches.map(match => match.replace(/[{}]/g, ''));
    const uniqueRawFields = rawFieldContents.filter((field, index) => rawFieldContents.indexOf(field) === index);
    
    const newFieldNames = uniqueRawFields.map(rawField => {
      let fieldName = rawField;
      if (rawField.includes("['")) {
        const bracketMatch = rawField.match(/^([^\[=]+)/);
        if (bracketMatch) fieldName = bracketMatch[1].trim();
      } else if (rawField.includes('|')) {
        const firstPart = rawField.split('|')[0];
        fieldName = firstPart.includes('=') ? firstPart.split('=')[0].trim() : firstPart.trim();
      } else if (rawField.includes('=')) {
        fieldName = rawField.split('=')[0].trim();
      }
      return fieldName.toLowerCase().trim();
    }).sort();

    // Extract <<TABLE_NAME>> markers and chorus blocks from new file XML
    let newTableNames: string[] = [];
    let newChorusBlocks: Array<{ name: string; variables: BlockVariableDef[] }> = [];
    try {
      const zip = new PizZip(fileBuffer);
      const xmlFile = zip.files['word/document.xml'];
      if (xmlFile) {
        const xmlContent = xmlFile.asText();
        const markers = parseTableMarkersFromXml(xmlContent);
        newTableNames = markers.map(m => m.name.toLowerCase()).sort();
        newChorusBlocks = parseChorusBlocksFromXml(xmlContent);
      }
    } catch (xmlErr) {
      console.warn(`[REPLACE ${replaceId}] Could not extract table markers:`, xmlErr);
    }
    const newBlockNames = newChorusBlocks.map(b => b.name.toLowerCase()).sort();

    console.log(`[REPLACE ${replaceId}] New file fields (${newFieldNames.length}):`, newFieldNames);
    console.log(`[REPLACE ${replaceId}] New file table markers (${newTableNames.length}):`, newTableNames);
    console.log(`[REPLACE ${replaceId}] New file chorus blocks (${newBlockNames.length}):`, newBlockNames);

    const missingFields = existingRegularFieldNames.filter(f => !newFieldNames.includes(f));
    const extraFields = newFieldNames.filter(f => !existingRegularFieldNames.includes(f));
    const missingTables = existingTableNames.filter(t => !newTableNames.includes(t));
    const extraTables = newTableNames.filter(t => !existingTableNames.includes(t));
    const missingBlocks = existingBlockNames.filter(b => !newBlockNames.includes(b));
    const extraBlocks = newBlockNames.filter(b => !existingBlockNames.includes(b));

    if (missingFields.length > 0 || extraFields.length > 0 || missingTables.length > 0 || extraTables.length > 0 || missingBlocks.length > 0 || extraBlocks.length > 0) {
      await fs.unlink(tempFilePath).catch(() => {});
      console.log(`[REPLACE ${replaceId}] REJECTED - Field/table/block mismatch`);

      return res.status(400).json({
        message: 'Field mismatch - new template must have exactly the same fields, table markers, and chorus blocks',
        existingFieldCount: existingRegularFieldNames.length,
        newFieldCount: newFieldNames.length,
        missingFields: missingFields.length > 0 ? missingFields : undefined,
        extraFields: extraFields.length > 0 ? extraFields : undefined,
        missingTables: missingTables.length > 0 ? missingTables : undefined,
        extraTables: extraTables.length > 0 ? extraTables : undefined,
        missingBlocks: missingBlocks.length > 0 ? missingBlocks : undefined,
        extraBlocks: extraBlocks.length > 0 ? extraBlocks : undefined,
        hint: 'The new template file must contain exactly the same field placeholders, <<TABLE>> markers, and chorus blocks as the original'
      });
    }
    
    console.log(`[REPLACE ${replaceId}] Field validation PASSED`);
    
    const oldFilePath = template.filePath;
    
    const newFilePath = await FileManagerService.saveUploadedTemplate(tempFilePath, req.file.originalname);
    console.log(`[REPLACE ${replaceId}] New file saved: ${newFilePath}`);
    
    await storage.updateTemplateByUuid(templateUuid, {
      filePath: newFilePath,
      updatedAt: new Date(),
    });
    console.log(`[REPLACE ${replaceId}] Database updated with new file path`);
    
    templatePreviewCache.invalidate(templateUuid);
    console.log(`[REPLACE ${replaceId}] Preview cache invalidated`);

    // === Update field metadata (defaultValue, options, fieldType) from new file syntax ===
    // Build a map of field-name → parsed metadata from the new file's raw placeholders.
    // Only fields whose syntax explicitly carries new metadata (=default or ['opt1']['opt2'])
    // are updated — bare {{field}} placeholders leave existing DB metadata untouched.
    interface FieldMetaUpdate {
      defaultValue?: string;
      options?: string;
      fieldType?: string;
    }
    const fieldMetaMap = new Map<string, FieldMetaUpdate>();

    for (const rawField of uniqueRawFields) {
      let parsedName = rawField;
      let parsedDefaultValue: string | undefined;
      let parsedOptions: string | undefined;
      let parsedFieldType: string | undefined;

      // Normalize smart quotes that Word may insert
      const norm = rawField
        .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
        .replace(/[\u201C\u201D\u201E\u201F]/g, '"');

      if (norm.includes("['")) {
        // Bracket syntax: field['opt1']['opt2'] or field='default'['opt1']['opt2']
        const firstBracket = norm.indexOf("['");
        const beforeBrackets = norm.substring(0, firstBracket).trim();

        const optArr: string[] = [];
        const bracketRe = /\['((?:\\'|[^'])*)'\]/g;
        let bm: RegExpExecArray | null;
        while ((bm = bracketRe.exec(norm)) !== null) {
          optArr.push(bm[1].replace(/\\'/g, "'"));
        }
        if (optArr.length > 0) {
          parsedOptions = JSON.stringify(optArr);
          parsedFieldType = 'checklist';
        }

        const defaultWithQuotes = beforeBrackets.match(/^([^=]+)='((?:\\'|[^'])*)'$/);
        if (defaultWithQuotes) {
          parsedName = defaultWithQuotes[1].trim();
          parsedDefaultValue = defaultWithQuotes[2].replace(/\\'/g, "'");
        } else if (beforeBrackets.includes('=')) {
          const eqIdx = beforeBrackets.indexOf('=');
          parsedName = beforeBrackets.substring(0, eqIdx).trim();
          let dv = beforeBrackets.substring(eqIdx + 1).trim();
          if (dv.startsWith("'") && dv.endsWith("'")) dv = dv.slice(1, -1);
          if (dv) parsedDefaultValue = dv;
        } else {
          parsedName = beforeBrackets;
        }
      } else if (norm.includes('|')) {
        // Legacy pipe syntax: field|opt1|opt2 or field=default|opt1|opt2
        const parts = norm.split('|');
        const firstPart = parts[0];
        const optParts = parts.slice(1).map(o => o.trim()).filter(Boolean);

        if (firstPart.includes('=')) {
          const eqIdx = firstPart.indexOf('=');
          parsedName = firstPart.substring(0, eqIdx).trim();
          const dv = firstPart.substring(eqIdx + 1).trim();
          if (dv) parsedDefaultValue = dv;
        } else {
          parsedName = firstPart.trim();
        }

        if (optParts.length > 0) {
          parsedOptions = JSON.stringify(optParts);
          parsedFieldType = 'checklist';
        }
      } else if (norm.includes('=')) {
        // Default value only: {{gio_hop=8h00}}
        const eqIdx = norm.indexOf('=');
        parsedName = norm.substring(0, eqIdx).trim();
        let dv = norm.substring(eqIdx + 1).trim();
        if (dv.startsWith("'") && dv.endsWith("'")) dv = dv.slice(1, -1);
        if (dv) parsedDefaultValue = dv;
      }

      const meta: FieldMetaUpdate = {};
      if (parsedDefaultValue !== undefined) meta.defaultValue = parsedDefaultValue;
      if (parsedOptions !== undefined) meta.options = parsedOptions;
      if (parsedFieldType !== undefined) meta.fieldType = parsedFieldType;

      if (Object.keys(meta).length > 0) {
        fieldMetaMap.set(parsedName.toLowerCase().trim(), meta);
      }
    }

    // Apply updates to each regular (non-row_group) field that has new metadata
    const regularFields = existingFields.filter(f => f.fieldType !== 'row_group');
    let metaUpdatedCount = 0;
    for (const field of regularFields) {
      const meta = fieldMetaMap.get(field.name.toLowerCase().trim());
      if (!meta) continue;

      const updates: Record<string, any> = { updatedAt: new Date() };
      if (meta.defaultValue !== undefined) updates.defaultValue = meta.defaultValue;
      if (meta.options !== undefined) updates.options = meta.options;
      if (meta.fieldType !== undefined) updates.fieldType = meta.fieldType;

      if (Object.keys(updates).length > 1) { // more than just updatedAt
        await db
          .update(templateFields)
          .set(updates)
          .where(and(
            eq(templateFields.templateUuid, templateUuid),
            eq(templateFields.name, field.name),
          ));
        metaUpdatedCount++;
        console.log(`[REPLACE ${replaceId}] Updated field metadata for "${field.name}":`, meta);
      }
    }
    if (metaUpdatedCount > 0) {
      console.log(`[REPLACE ${replaceId}] Updated metadata for ${metaUpdatedCount} field(s)`);
    }
    // === End field metadata update ===

    // Update chorus block column definitions — merge by variable name to preserve
    // any fieldType / defaultValue / options metadata the user has already configured.
    for (const block of newChorusBlocks) {
      const [existingBlock] = await db
        .select({ columns: templateTables.columns })
        .from(templateTables)
        .where(and(eq(templateTables.templateUuid, templateUuid), eq(templateTables.name, block.name)));

      const existingColMap = new Map<string, any>(
        ((existingBlock?.columns as any[]) ?? []).map((c: any) => [c.name, c])
      );

      const columns = block.variables.map((v: BlockVariableDef) => {
        const existing = existingColMap.get(v.name);
        if (v.options.length > 0) {
          // Case 1: new file declares pipe-options → force checklist, override options, keep label/defaultValue
          const merged: Record<string, any> = {
            name: v.name,
            label: existing?.label ?? v.name,
            fieldType: 'checklist',
            options: v.options,
          };
          if (existing?.defaultValue !== undefined && existing.defaultValue !== '') {
            merged.defaultValue = existing.defaultValue;
          }
          return merged;
        } else if (existing) {
          // Case 2: new file bare syntax + variable already existed → preserve all metadata
          const merged: Record<string, any> = {
            name: v.name,
            label: existing.label ?? v.name,
          };
          if (existing.fieldType) merged.fieldType = existing.fieldType;
          if (existing.defaultValue !== undefined && existing.defaultValue !== '') {
            merged.defaultValue = existing.defaultValue;
          }
          if (existing.options && existing.options.length > 0) {
            merged.options = existing.options;
          }
          return merged;
        } else {
          // Case 3: new file bare syntax + brand new variable → default to text
          return { name: v.name, label: v.name, fieldType: 'text' };
        }
      });

      await db
        .update(templateTables)
        .set({ columns })
        .where(and(eq(templateTables.templateUuid, templateUuid), eq(templateTables.name, block.name)));
    }
    if (newChorusBlocks.length > 0) {
      console.log(`[REPLACE ${replaceId}] Updated ${newChorusBlocks.length} chorus block column definitions`);
    }

    if (oldFilePath && oldFilePath !== newFilePath) {
      await FileManagerService.deleteTemplateFile(oldFilePath);
      console.log(`[REPLACE ${replaceId}] Old file deleted: ${oldFilePath}`);
    }
    
    const updatedTemplate = await storage.getTemplateByUuid(templateUuid);
    
    console.log(`========== [TEMPLATE FILE REPLACE SUCCESS] ID: ${replaceId} ==========\n`);
    
    res.json({
      message: 'Template file replaced successfully',
      template: updatedTemplate
    });
    
  } catch (error) {
    console.error(`[REPLACE ${replaceId}] ERROR:`, error);
    
    if (req.file) {
      await fs.unlink(req.file.path).catch(() => {});
    }
    
    res.status(500).json({
      message: 'Failed to replace template file',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export async function deleteTemplate(req: Request, res: Response) {
  const deleteId = Date.now().toString(36);
  console.log(`\n========== [TEMPLATE DELETE START] ID: ${deleteId} ==========`);
  console.log(`[DELETE ${deleteId}] Timestamp: ${new Date().toISOString()}`);
  
  try {
    const { uuid: templateUuid, id: templateId } = req.params;
    const templateUuid_ = templateUuid || templateId;
    const { cascade = 'false', force = 'false' } = req.query;
    
    console.log(`[DELETE ${deleteId}] Request to delete template: ${templateUuid_}`);
    console.log(`[DELETE ${deleteId}] Options: cascade=${cascade}, force=${force}`);
    
    const template = await storage.getTemplateByUuid(templateUuid_);
    if (!template) {
      console.log(`[DELETE ${deleteId}] Template not found: ${templateUuid_}`);
      return res.status(404).json({ message: 'Template not found' });
    }
    
    console.log(`[DELETE ${deleteId}] Found template: ${template.name} (${template.uuid})`);

    const documentCount = await storage.getDocumentsCount({ templateUuid: templateUuid_ });
    console.log(`[DELETE ${deleteId}] Linked documents: ${documentCount}`);
    
    if (documentCount > 0 && force !== 'true') {
      console.log(`[DELETE ${deleteId}] BLOCKED - Template has ${documentCount} linked documents`);
      return res.status(409).json({ 
        message: 'Cannot delete template with linked documents',
        documentCount,
        hint: 'Delete all documents first, or use ?force=true to delete anyway (documents will become orphaned)'
      });
    }

    // Log templates BEFORE deletion
    const templatesBefore = await storage.getTemplates({ limit: 100 });
    console.log(`[DELETE ${deleteId}] BEFORE DELETE - Templates count: ${templatesBefore.length}`);
    console.log(`[DELETE ${deleteId}] BEFORE DELETE - Template list:`, templatesBefore.map(t => ({ uuid: t.uuid, name: t.name })));

    templatePreviewCache.invalidate(templateUuid_);

    console.log(`[DELETE ${deleteId}] Executing deletion...`);
    await storage.deleteTemplateByUuid(templateUuid_, cascade === 'true');
    
    // Log templates AFTER deletion
    const templatesAfter = await storage.getTemplates({ limit: 100 });
    console.log(`[DELETE ${deleteId}] AFTER DELETE - Templates count: ${templatesAfter.length}`);
    console.log(`[DELETE ${deleteId}] AFTER DELETE - Template list:`, templatesAfter.map(t => ({ uuid: t.uuid, name: t.name })));
    console.log(`========== [TEMPLATE DELETE SUCCESS] ID: ${deleteId} ==========\n`);
    
    res.json({ 
      message: 'Template deleted successfully',
      orphanedDocuments: documentCount > 0 ? documentCount : undefined
    });
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ 
      message: 'Failed to delete template',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export async function archiveTemplate(req: Request, res: Response) {
  try {
    const { uuid: templateUuid } = req.params;
    const template = await storage.getTemplateByUuid(templateUuid);
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }
    const updatedTemplate = await storage.archiveTemplateByUuid(templateUuid);
    res.json({ message: 'Template archived successfully', template: updatedTemplate });
  } catch (error) {
    console.error('Error archiving template:', error);
    res.status(500).json({ 
      message: 'Failed to archive template',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export async function unarchiveTemplate(req: Request, res: Response) {
  try {
    const { uuid: templateUuid } = req.params;
    const template = await storage.getTemplateByUuid(templateUuid);
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }
    const updatedTemplate = await storage.unarchiveTemplateByUuid(templateUuid);
    res.json({ message: 'Template unarchived successfully', template: updatedTemplate });
  } catch (error) {
    console.error('Error unarchiving template:', error);
    res.status(500).json({ 
      message: 'Failed to unarchive template',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export async function getTemplateFields(req: Request, res: Response) {
  try {
    const { uuid: templateUuid, id: templateId } = req.params;
    const templateUuid_ = templateUuid || templateId;
    
    const template = await storage.getTemplateByUuid(templateUuid_);
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    const fields = await storage.getTemplateFields(templateUuid_);
    
    res.json(fields);
  } catch (error) {
    console.error('Error fetching template fields:', error);
    res.status(500).json({ 
      message: 'Failed to fetch template fields',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export async function downloadTemplate(req: Request, res: Response) {
  try {
    const { uuid: templateUuid, id: templateId } = req.params;
    const templateUuid_ = templateUuid || templateId;
    
    const template = await storage.getTemplateByUuid(templateUuid_);
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    // Check if file exists (supports both Object Storage and local)
    const fileExists = await FileManagerService.fileExists(template.filePath);
    if (!fileExists) {
      return res.status(404).json({ message: 'Template file not found' });
    }

    // Read file buffer from Object Storage or local
    const fileBuffer = await FileManagerService.readTemplateBuffer(template.filePath);
    
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': getContentDispositionHeader(template.name, 'docx'),
      'Content-Length': fileBuffer.length.toString(),
    });
    
    res.send(fileBuffer);
  } catch (error) {
    console.error('Error downloading template:', error);
    res.status(500).json({ 
      message: 'Failed to download template',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export async function previewTemplate(req: Request, res: Response) {
  try {
    const { uuid: templateUuid, id: templateId } = req.params;
    const templateUuid_ = templateUuid || templateId;
    
    const template = await storage.getTemplateByUuid(templateUuid_);
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    // Use cache with promise coalescing for base HTML generation
    const baseHtml = await templatePreviewCache.getOrGenerate(
      templateUuid_,
      template.updatedAt,
      async () => {
        const fileBuffer = await FileManagerService.readTemplateBuffer(template.filePath);
        const { value: htmlContent } = await mammoth.convertToHtml({ buffer: fileBuffer }, getEnhancedMammothOptions());
        
        // Highlight placeholders (empty fields) with yellow background
        const highlightedHtml = htmlContent.replace(
          /\{\{([^{}]+)\}\}/g,
          '<span class="field-empty">{{$1}}</span>'
        );
        
        return getPreviewStyles() + fieldHighlightStyles + highlightedHtml;
      }
    );
    
    // Use response builder for type-safe, consistent response structure
    return ApiResponse.preview(res, {
      html: baseHtml,
      template: {
        uuid: template.uuid,
        name: template.name,
        description: template.description,
        category: template.category,
        fieldCount: parseInt(template.fieldCount) || 0,
        createdAt: template.createdAt,
      }
    });
  } catch (error) {
    console.error('Error generating template preview:', error);
    return ApiResponse.previewError(res, error, 'Failed to generate template preview');
  }
}

export async function getTemplateStats(req: Request, res: Response) {
  try {
    const stats = await storage.getTemplateStats();
    res.json(stats);
  } catch (error) {
    console.error('Error fetching template stats:', error);
    res.status(500).json({ 
      message: 'Failed to fetch template stats',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export const uploadExcelMiddleware = uploadExcel.single('file');

export async function exportTemplateToExcel(req: Request, res: Response) {
  try {
    const { uuid: templateUuid, id: templateId } = req.params;
    const templateUuid_ = templateUuid || templateId;
    
    const template = await storage.getTemplateByUuid(templateUuid_);
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    const fields = await storage.getTemplateFields(templateUuid_);

    // Create Excel workbook
    const workbook = XLSX.utils.book_new();
    
    // Create headers with exact field names from template (preserve camelCase)
    const headers = ['DOCUMENT_NAME', ...fields.map(field => field.name)];
    
    // Create sample data rows with examples
    const sampleRows = [
      headers,
      [`Văn bản số 1 - ${template.name}`, ...fields.map(field => `Mẫu ${field.name}`)],
      [`Văn bản số 2 - ${template.name}`, ...fields.map(field => `Mẫu ${field.name}`)],
      ['', ...fields.map(() => '')] // Empty row for user input
    ];
    
    // Create worksheet with proper formatting
    const worksheet = XLSX.utils.aoa_to_sheet(sampleRows);
    
    // Set column widths for better readability
    const colWidths = [{ width: 35 }, ...fields.map(() => ({ width: 25 }))];
    worksheet['!cols'] = colWidths;
    
    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template Data');
    
    // Generate Excel buffer
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    const safeFileName = template.name.replace(/[^a-zA-Z0-9]/g, '_');
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${safeFileName}_template.xlsx"`,
    });
    
    res.send(excelBuffer);
  } catch (error) {
    console.error('Error exporting template to Excel:', error);
    res.status(500).json({ 
      message: 'Failed to export template to Excel',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export async function createBatchDocuments(req: Request, res: Response) {
  try {
    const { uuid: templateUuid, id: templateId } = req.params;
    const templateUuid_ = templateUuid || templateId;
    
    if (!req.file) {
      return res.status(400).json({ message: 'No Excel file uploaded' });
    }

    const template = await storage.getTemplateByUuid(templateUuid_);
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    // Read Excel file
    const fileBuffer = await fs.readFile(req.file.path);
    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as string[][];

    if (jsonData.length < 2) {
      return res.status(400).json({ message: 'Excel file must contain at least a header row and one data row' });
    }

    const headers = jsonData[0].map((h: string) => h?.toString().toLowerCase().trim());
    const dataRows = jsonData.slice(1).filter(row => row.some(cell => cell && cell.toString().trim()));

    if (dataRows.length === 0) {
      return res.status(400).json({ message: 'No valid data rows found in Excel file' });
    }

    // Find document name column (first column or DOCUMENT_NAME)
    const docNameIndex = headers.findIndex(h => 
      h === 'document_name' || h === 'document name' || h === 'name'
    ) || 0;

    // Create batch session
    const batchSession = await storage.createBatchSession({
      templateUuid: templateUuid_,
      fileName: req.file.originalname || 'batch_upload.xlsx',
      filePath: req.file.path,
      totalRows: dataRows.length.toString(),
      status: 'processing',
    });

    // Get template fields for mapping
    const templateFields = await storage.getTemplateFields(templateUuid_);
    const fieldMap = new Map(templateFields.map(f => [f.name.toLowerCase(), f.name]));

    // Process each row
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const documentName = row[docNameIndex]?.toString().trim() || `Document ${i + 1}`;
      
      try {
        // Create batch document
        const batchDocument = await storage.createBatchDocument({
          sessionUuid: batchSession.uuid,
          rowIndex: (i + 1).toString(),
          name: documentName,
          status: 'pending',
        });

        // Create batch document fields with proper mapping
        for (let j = 0; j < headers.length; j++) {
          if (j === docNameIndex) continue; // Skip document name column
          
          const headerName = headers[j];
          const mappedFieldName = fieldMap.get(headerName) || headerName;
          const cellValue = row[j]?.toString().trim() || '';
          
          if (mappedFieldName && cellValue) {
            await storage.createBatchDocumentField({
              batchDocumentUuid: batchDocument.uuid,
              fieldName: mappedFieldName,
              fieldValue: cellValue,
            });
          }
        }
      } catch (error) {
        console.error(`Error processing row ${i + 1}:`, error);
      }
    }

    // Update batch session
    await storage.updateBatchSession(batchSession.uuid, {
      processedRows: dataRows.length.toString(),
      status: 'completed',
    });

    res.json({
      sessionUuid: batchSession.uuid,
      message: `Batch created successfully with ${dataRows.length} documents`,
      totalRows: dataRows.length,
    });
  } catch (error) {
    console.error('Error creating batch documents:', error);
    
    // Clean up uploaded file on error
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (unlinkError) {
        console.error('Error cleaning up file:', unlinkError);
      }
    }
    
    res.status(500).json({ 
      message: 'Failed to create batch documents',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export async function parseExcelForPreview(req: Request, res: Response) {
  try {
    const { uuid: templateUuid } = req.params;
    
    if (!req.file) {
      return res.status(400).json({ message: 'No Excel file uploaded' });
    }

    const template = await storage.getTemplateByUuid(templateUuid);
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    const fields = await storage.getTemplateFields(templateUuid);

    // Read Excel file from disk storage (multer saves to disk)
    let fileBuffer: Buffer;
    
    if (req.file.buffer) {
      // Memory storage
      fileBuffer = req.file.buffer;
    } else if (req.file.path) {
      // Disk storage
      const fs = await import('fs');
      fileBuffer = await fs.promises.readFile(req.file.path);
    } else {
      throw new Error('No file buffer or path available');
    }

    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as string[][];

    if (jsonData.length < 2) {
      return res.status(400).json({ message: 'Excel file must contain at least a header row and one data row' });
    }

    const headers = jsonData[0];
    const dataRows = jsonData.slice(1).slice(0, 10); // Preview first 10 rows

    res.json({
      template: {
        uuid: template.uuid,
        name: template.name,
        fields: fields.map(f => f.name),
      },
      preview: {
        headers,
        rows: dataRows,
        totalRows: jsonData.length - 1,
        previewRows: dataRows.length,
      },
    });

    // Clean up temporary file after processing
    if (req.file && req.file.path) {
      try {
        const fs = await import('fs');
        await fs.promises.unlink(req.file.path);
      } catch (unlinkError) {
        console.warn('Could not clean up temporary file:', unlinkError);
      }
    }
  } catch (error) {
    console.error('Error parsing Excel for preview:', error);
    
    // Clean up temporary file on error
    if (req.file && req.file.path) {
      try {
        const fs = await import('fs');
        await fs.promises.unlink(req.file.path);
      } catch (unlinkError) {
        console.warn('Could not clean up temporary file:', unlinkError);
      }
    }
    
    res.status(500).json({ 
      message: 'Failed to parse Excel file',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export async function createDocumentsFromParsedData(req: Request, res: Response) {
  try {
    const { uuid: templateUuid, id: templateId } = req.params;
    const templateUuid_ = templateUuid || templateId;
    const { data } = req.body;

    if (!data || !Array.isArray(data)) {
      return res.status(400).json({ message: 'Invalid data format' });
    }

    const template = await storage.getTemplateByUuid(templateUuid_);
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    const results = [];
    let successCount = 0;
    let errorCount = 0;

    for (const item of data) {
      try {
        // Create document using the document service
        const documentData = {
          templateUuid,
          name: item.name || 'Untitled Document',
          fields: item.fields || [],
        };

        // This would typically call a document creation service
        // For now, we'll create a placeholder response
        results.push({
          name: documentData.name,
          status: 'success',
          message: 'Document created successfully',
        });
        successCount++;
      } catch (error) {
        console.error('Error creating document:', error);
        results.push({
          name: item.name || 'Untitled Document',
          status: 'error',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
        errorCount++;
      }
    }

    res.json({
      summary: {
        total: data.length,
        success: successCount,
        errors: errorCount,
      },
      results,
    });
  } catch (error) {
    console.error('Error creating documents from parsed data:', error);
    res.status(500).json({ 
      message: 'Failed to create documents',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

export async function exportDocumentsByDateRange(req: Request, res: Response) {
  try {
    const { templateId } = req.params;
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'Start date and end date are required' });
    }

    const template = await storage.getTemplateByUuid(String(templateId));
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    // Get documents within date range
    const documents = await storage.getDocumentsByTemplateAndDateRange(String(templateId), new Date(startDate as string), new Date(endDate as string));

    console.log(`EXPORT_DOCUMENTS: Found ${documents.length} documents in date range`);
    console.log(`EXPORT_DOCUMENTS: First document sample:`, documents[0] || 'No documents found');

    if (documents.length === 0) {
      return res.status(404).json({ message: 'No documents found in the specified date range' });
    }

    // Create ZIP file
    const archive = archiver('zip', {
      zlib: { level: 9 }
    });

    res.attachment(`${template.name}_documents_${startDate}_to_${endDate}.zip`);
    archive.pipe(res);

    // Add each document to the ZIP
    for (const document of documents) {
      try {
        await fs.access(document.filePath);
        const fileName = `${document.name}.docx`;
        archive.file(document.filePath, { name: fileName });
      } catch (error) {
        console.error(`File not found for document: ${document.name}`, error);
      }
    }

    await archive.finalize();
  } catch (error) {
    console.error('Error exporting documents by date range:', error);
    res.status(500).json({ 
      message: 'Failed to export documents',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Clean up orphan files (files without database records)
 */
export async function cleanupOrphanFiles(req: Request, res: Response) {
  try {
    const { autoFix = 'false' } = req.query;
    const shouldAutoFix = autoFix === 'true';

    // Get all templates from database
    const allTemplates = await storage.getTemplates({});
    const dbFilePaths = new Set(allTemplates.map(t => t.filePath));
    console.log(`Found ${dbFilePaths.size} file paths in database`);

    // Get all files from filesystem
    const storageDir = 'storage/templates';
    const filesOnDisk = await fs.readdir(storageDir);
    console.log(`Found ${filesOnDisk.length} files on disk`);

    const orphanFiles: Array<{
      fileName: string;
      filePath: string;
      reason: string;
    }> = [];

    const validFiles: string[] = [];

    // Check each file on disk
    for (const fileName of filesOnDisk) {
      if (fileName === '.gitkeep') continue; // Skip .gitkeep

      const filePath = `${storageDir}/${fileName}`;
      
      // Check if this file path exists in database
      if (dbFilePaths.has(filePath)) {
        validFiles.push(fileName);
      } else {
        orphanFiles.push({
          fileName,
          filePath,
          reason: 'No database record found for this file',
        });
      }
    }

    console.log(`Orphan files check: ${validFiles.length} valid, ${orphanFiles.length} orphaned`);

    // Auto-fix if requested
    const deletedFiles: string[] = [];
    if (shouldAutoFix && orphanFiles.length > 0) {
      console.log(`Auto-deleting ${orphanFiles.length} orphan files...`);
      
      for (const orphan of orphanFiles) {
        try {
          await fs.unlink(orphan.filePath);
          deletedFiles.push(orphan.fileName);
          console.log(`Deleted orphan file: ${orphan.fileName}`);
        } catch (deleteError) {
          console.error(`Failed to delete orphan file ${orphan.fileName}:`, deleteError);
        }
      }
    }

    res.json({
      summary: {
        totalFiles: filesOnDisk.length - 1, // Exclude .gitkeep
        validFiles: validFiles.length,
        orphanedFiles: orphanFiles.length,
        deletedFiles: deletedFiles.length,
      },
      orphanFiles: orphanFiles.map(o => ({
        fileName: o.fileName,
        filePath: o.filePath,
        reason: o.reason,
        deleted: deletedFiles.includes(o.fileName),
      })),
      validFiles,
    });
  } catch (error) {
    console.error('Error cleaning up orphan files:', error);
    res.status(500).json({ 
      message: 'Failed to clean up orphan files',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Check database-filesystem integrity for templates
 * Finds orphan records (templates in DB without corresponding files)
 */
export async function checkTemplateIntegrity(req: Request, res: Response) {
  try {
    const { autoFix = 'false' } = req.query;
    const shouldAutoFix = autoFix === 'true';

    // Get all templates from database (no limit)
    const allTemplates = await storage.getTemplates({});
    console.log(`Integrity check: Found ${allTemplates.length} templates in database`);

    const orphanRecords: Array<{
      uuid: string;
      name: string;
      filePath: string;
      reason: string;
    }> = [];

    const validRecords: Array<{
      uuid: string;
      name: string;
      filePath: string;
    }> = [];

    // Check each template's file
    for (const template of allTemplates) {
      try {
        await fs.access(template.filePath);
        validRecords.push({
          uuid: template.uuid,
          name: template.name,
          filePath: template.filePath,
        });
      } catch (error) {
        orphanRecords.push({
          uuid: template.uuid,
          name: template.name,
          filePath: template.filePath,
          reason: 'File not found on filesystem',
        });
      }
    }

    console.log(`Integrity check: ${validRecords.length} valid, ${orphanRecords.length} orphaned`);

    // Auto-fix if requested
    const fixedRecords: string[] = [];
    if (shouldAutoFix && orphanRecords.length > 0) {
      console.log(`Auto-fixing ${orphanRecords.length} orphan records...`);
      
      for (const orphan of orphanRecords) {
        try {
          await storage.deleteTemplateByUuid(orphan.uuid, true);
          fixedRecords.push(orphan.uuid);
          console.log(`Deleted orphan template: ${orphan.name} (${orphan.uuid})`);
        } catch (deleteError) {
          console.error(`Failed to delete orphan template ${orphan.uuid}:`, deleteError);
        }
      }
    }

    res.json({
      summary: {
        total: allTemplates.length,
        valid: validRecords.length,
        orphaned: orphanRecords.length,
        fixed: fixedRecords.length,
      },
      orphanRecords: orphanRecords.map(o => ({
        uuid: o.uuid,
        name: o.name,
        filePath: o.filePath,
        reason: o.reason,
        fixed: fixedRecords.includes(o.uuid),
      })),
      validRecords: validRecords.map(v => ({
        uuid: v.uuid,
        name: v.name,
      })),
    });
  } catch (error) {
    console.error('Error checking template integrity:', error);
    res.status(500).json({ 
      message: 'Failed to check template integrity',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}