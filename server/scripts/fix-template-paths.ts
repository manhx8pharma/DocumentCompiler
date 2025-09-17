import fs from 'fs/promises';
import path from 'path';
import { storage } from '../storage-uuid';

/**
 * Script to fix template file path mismatches between database and file system
 */
async function fixTemplatePaths() {
  try {
    console.log('Starting template path fix...');
    
    // Get all templates from database
    const templates = await storage.getTemplates({ archived: false });
    console.log(`Found ${templates.length} templates in database`);
    
    // Get all files in storage/templates directory
    const storageDir = 'storage/templates';
    const filesOnDisk = await fs.readdir(storageDir);
    console.log(`Found ${filesOnDisk.length} files on disk:`, filesOnDisk);
    
    const fixes = [];
    
    for (const template of templates) {
      console.log(`\nChecking template: ${template.name} (${template.uuid})`);
      console.log(`Database filePath: ${template.filePath}`);
      
      // Check if database path exists
      try {
        await fs.access(template.filePath);
        console.log('✓ File exists at database path');
        continue;
      } catch {
        console.log('✗ File NOT found at database path');
      }
      
      // Try to find matching file by checking file signatures
      let foundMatch = false;
      for (const diskFile of filesOnDisk) {
        if (diskFile.endsWith('.docx')) continue; // Skip already processed files
        
        const diskFilePath = path.join(storageDir, diskFile);
        
        try {
          // Check if it's a Word document by reading file header
          const buffer = await fs.readFile(diskFilePath);
          const header = buffer.subarray(0, 4).toString('hex');
          
          // Word documents start with PK signature (ZIP format)
          if (header === '504b0304' || buffer.includes(Buffer.from('[Content_Types].xml'))) {
            console.log(`Found potential Word document: ${diskFile}`);
            
            // Create new permanent filename
            const timestamp = Date.now();
            const sanitizedName = template.name.replace(/[^a-zA-Z0-9\s]/g, '_').trim().replace(/\s+/g, '_');
            const newFileName = `${timestamp}_${sanitizedName}.docx`;
            const newFilePath = path.join(storageDir, newFileName);
            
            // Copy temp file to permanent location
            await fs.copyFile(diskFilePath, newFilePath);
            
            // Verify copy was successful
            const stats = await fs.stat(newFilePath);
            if (stats.size > 0) {
              fixes.push({
                templateUuid: template.uuid,
                templateName: template.name,
                oldPath: template.filePath,
                tempFile: diskFilePath,
                newPath: newFilePath
              });
              
              console.log(`✓ Copied ${diskFile} to ${newFileName}`);
              foundMatch = true;
              break;
            }
          }
        } catch (error) {
          // Skip files that can't be read
          continue;
        }
      }
      
      if (!foundMatch) {
        console.log(`✗ No matching Word document found for template: ${template.name}`);
      }
    }
    
    console.log(`\n=== SUMMARY ===`);
    console.log(`Templates to fix: ${fixes.length}`);
    
    if (fixes.length > 0) {
      console.log('\nProposed fixes:');
      fixes.forEach((fix, index) => {
        console.log(`${index + 1}. ${fix.templateName}`);
        console.log(`   Old: ${fix.oldPath}`);
        console.log(`   New: ${fix.newPath}`);
      });
      
      // Apply fixes to database
      for (const fix of fixes) {
        try {
          await storage.updateTemplateByUuid(fix.templateUuid, {
            filePath: fix.newPath
          });
          console.log(`✓ Updated database for: ${fix.templateName}`);
        } catch (error) {
          console.error(`✗ Failed to update database for ${fix.templateName}:`, error);
        }
      }
      
      console.log(`\n✓ Fixed ${fixes.length} template path(s)`);
    } else {
      console.log('\nNo fixes needed or no matching files found');
    }
    
  } catch (error) {
    console.error('Error fixing template paths:', error);
    throw error;
  }
}

// Run the fix
fixTemplatePaths()
  .then(() => {
    console.log('Template path fix completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Template path fix failed:', error);
    process.exit(1);
  });