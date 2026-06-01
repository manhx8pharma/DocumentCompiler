import { db } from '../db';
import { templateFields } from '../shared/schema';
import { eq } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';

// Known fields from the Dispatch template based on logs
const dispatchFields = [
  'clientName',
  'projectTitle', 
  'projectDescription',
  'startDate',
  'endDate',
  'budget',
  'deliverables',
  'timeline',
  'firstName',
  'lastName',
  'email',
  'address',
  'company',
  'position',
  'phone',
  'description',
  'amount',
  'date',
  'notes'
];

async function fixTemplateFields() {
  try {
    console.log('Adding fields for template ID 31...');
    
    // Delete existing fields for template 31
    await db.delete(templateFields).where(eq(templateFields.templateId, 31));
    console.log('Deleted existing fields');
    
    // Add new fields with proper schema
    const fieldRecords = dispatchFields.map(fieldName => ({
      templateId: 31,
      name: fieldName,
      displayName: fieldName.charAt(0).toUpperCase() + fieldName.slice(1),
      fieldType: 'text',
      required: false,
    }));
    
    await db.insert(templateFields).values(fieldRecords);
    console.log(`Added ${fieldRecords.length} fields for template 31`);
    
    // Verify fields were added
    const addedFields = await db.query.templateFields.findMany({
      where: eq(templateFields.templateId, 31)
    });
    
    console.log(`Verification: Found ${addedFields.length} fields in database`);
    addedFields.forEach(field => {
      console.log(`- ${field.fieldName} (${field.fieldType})`);
    });
    
  } catch (error) {
    console.error('Error fixing template fields:', error);
  } finally {
    process.exit(0);
  }
}

fixTemplateFields();