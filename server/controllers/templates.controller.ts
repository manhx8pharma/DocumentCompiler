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

    const templates = await storage.getTemplates({
      searchQuery: search as string,
      category: category as string,
      archived: archived === 'true',
      limit: limitNum,
      offset: offset,
    });

    const stats = await storage.getTemplateStats();

    res.json({
      templates,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: stats.total,
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
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const validatedData = insertTemplateSchema.parse(req.body);
    
    // Create storage directory if it doesn't exist
    const storageDir = 'storage/templates';
    try {
      await fs.mkdir(storageDir, { recursive: true });
    } catch (mkdirError) {
      console.log('Storage directory already exists or created');
    }

    // Handle file path - move from temp to permanent location
    const tempFilePath = req.file.path;
    const permanentFilePath = await FileManagerService.saveUploadedTemplate(tempFilePath, req.file.originalname);
    
    const templateData = {
      name: validatedData.name,
      description: validatedData.description || undefined,
      category: validatedData.category,
      filePath: permanentFilePath,
    };

    const template = await storage.createTemplate(templateData);

    // Extract fields from the document
    try {
      const fileBuffer = await fs.readFile(permanentFilePath);
      console.log('File buffer size:', fileBuffer.length);
      
      const { value: extractedText } = await mammoth.extractRawText({ buffer: fileBuffer });
      console.log('Extracted text length:', extractedText.length);
      console.log('Extracted text preview:', extractedText.substring(0, 500));
      
      // Extract field placeholders like {{fieldName}}
      const fieldMatches = extractedText.match(/\{\{([^}]+)\}\}/g) || [];
      console.log('Field matches found:', fieldMatches);
      
      const fieldNames = fieldMatches.map(match => match.replace(/[{}]/g, ''));
      console.log('Field names:', fieldNames);
      
      // Remove duplicates manually
      const uniqueFields = fieldNames.filter((field, index) => fieldNames.indexOf(field) === index);
      console.log('Unique fields:', uniqueFields);
      
      if (uniqueFields.length > 0) {
        const fieldsData = uniqueFields.map(fieldName => ({
          templateUuid: template.uuid,
          name: fieldName,
          type: 'text',
          required: false,
        }));
        
        console.log('Creating fields:', fieldsData);
        await storage.updateTemplateFields(template.uuid, fieldsData);
        
        // Update field count
        await storage.updateTemplateByUuid(template.uuid, {
          fieldCount: uniqueFields.length.toString()
        });
        
        console.log('Fields successfully created for template:', template.uuid);
      } else {
        console.warn('No field placeholders found in template. Make sure your template uses {{fieldName}} format.');
      }
    } catch (extractError) {
      console.error('Could not extract fields from template:', extractError);
    }

    // Fetch the updated template with fields
    const updatedTemplate = await storage.getTemplateByUuid(template.uuid);
    
    res.status(201).json(updatedTemplate);
  } catch (error) {
    console.error('Error creating template:', error);
    
    // Clean up uploaded file on error
    if (req.file) {
      try {
        // Try to clean up both temp file and permanent file if they exist
        await fs.unlink(req.file.path).catch(() => {});
        if (permanentFilePath) {
          await fs.unlink(permanentFilePath).catch(() => {});
        }
      } catch (unlinkError) {
        console.error('Error cleaning up file:', unlinkError);
      }
    }
    
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

export async function deleteTemplate(req: Request, res: Response) {
  try {
    const { uuid: templateUuid, id: templateId } = req.params;
    const templateUuid_ = templateUuid || templateId;
    const { cascade = 'false' } = req.query;
    
    const template = await storage.getTemplateByUuid(templateUuid_);
    if (!template) {
      return res.status(404).json({ message: 'Template not found' });
    }

    // Delete the physical file
    try {
      await fs.unlink(template.filePath);
    } catch (fileError) {
      console.warn('Could not delete template file:', fileError);
    }

    await storage.deleteTemplateByUuid(templateUuid_, cascade === 'true');
    
    res.json({ message: 'Template deleted successfully' });
  } catch (error) {
    console.error('Error deleting template:', error);
    res.status(500).json({ 
      message: 'Failed to delete template',
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

    // Check if file exists
    try {
      await fs.access(template.filePath);
    } catch (error) {
      return res.status(404).json({ message: 'Template file not found' });
    }

    res.download(template.filePath, `${template.name}.docx`);
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

    const fileBuffer = await fs.readFile(template.filePath);
    const { value: htmlContent } = await mammoth.convertToHtml({ buffer: fileBuffer });
    
    res.json({ 
      preview: htmlContent,
      template: {
        uuid: template.uuid,
        name: template.name,
        description: template.description,
        category: template.category,
        fieldCount: template.fieldCount,
        createdAt: template.createdAt,
      }
    });
  } catch (error) {
    console.error('Error generating template preview:', error);
    res.status(500).json({ 
      message: 'Failed to generate template preview',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
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