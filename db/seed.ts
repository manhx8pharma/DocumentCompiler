import { db } from "./index";
import * as schema from "@shared/schema";
import { randomBytes } from "crypto";
import { ensureDir, generateUniqueFilename } from "../server/utils/file-helpers";
import fs from "fs";
import path from "path";
import { eq, sql } from "drizzle-orm";

async function seed() {
  try {
    console.log("🌱 Starting database seeding...");

    // Check if templates already exist
    const existingTemplates = await db.query.templates.findMany();
    
    // Only update template files if they exist but don't recreate all data
    if (existingTemplates.length > 0) {
      console.log(`Found ${existingTemplates.length} existing templates. Updating template files...`);
      
      // Create the storage directories
      const templatesDir = await ensureDir("templates");
      
      // Update template files for each existing template
      for (const template of existingTemplates) {
        // Get the sample fields for this template
        const templateFields = await db.select().from(schema.templateFields)
          .where(({ templateId }) => sql`${templateId} = ${template.id}`);
        
        // Create a basic docx-like XML 
        const docContent = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>${template.name}</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:t>${template.description}</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:t>This is a sample template for ${template.category} documents.</w:t>
      </w:r>
    </w:p>
    ${templateFields.map(field => `
    <w:p>
      <w:r>
        <w:t>${field.displayName}: {{${field.name}}}</w:t>
      </w:r>
    </w:p>`).join('')}
  </w:body>
</w:document>`;
        
        // Write the file to the template's path
        try {
          fs.writeFileSync(template.filePath, Buffer.from(docContent));
          console.log(`Updated template file for: ${template.name}`);
        } catch (error) {
          console.error(`Error updating template file for ${template.name}:`, error);
          
          // If the directory doesn't exist, create a new file
          const newFilePath = path.join(templatesDir, generateUniqueFilename(`${template.name}.docx`));
          fs.writeFileSync(newFilePath, Buffer.from(docContent));
          console.log(`Created new template file for: ${template.name} at ${newFilePath}`);
          
          // Update the database with the new file path
          await db.update(schema.templates)
            .set({ filePath: newFilePath })
            .where(({ id }) => sql`${id} = ${template.id}`);
          console.log(`Updated database record for: ${template.name} with new file path`);
        }
      }
      
      console.log("✅ Template files updated successfully!");
      return;
    }

    // Create sample template categories
    const categories = ["legal", "financial", "hr", "marketing"];

    // Template data
    const templateData = [
      {
        name: "Employment Contract",
        description: "Standard employment agreement with customizable terms, conditions, and compensation details.",
        category: "legal" as const,
        fieldCount: 14,
      },
      {
        name: "Invoice Template",
        description: "Professional invoice with company details, itemized billing, and payment instructions.",
        category: "financial" as const,
        fieldCount: 9,
      },
      {
        name: "Offer Letter",
        description: "Job offer letter with position details, compensation information, and start date.",
        category: "hr" as const,
        fieldCount: 11,
      },
      {
        name: "Project Proposal",
        description: "Comprehensive project proposal with scope, timeline, deliverables, and budget details.",
        category: "marketing" as const,
        fieldCount: 18,
      },
    ];

    // Create the storage directories
    const templatesDir = await ensureDir("templates");
    const documentsDir = await ensureDir("documents");

    // Create sample templates
    for (const template of templateData) {
      // Generate a file path and create a simple DOCX-like content
      const filePath = path.join(templatesDir, generateUniqueFilename(`${template.name}.docx`));
      
      // Get sample fields to include them in the template
      const templateFields = getSampleFieldsForTemplate(template.name, 0);
      
      // Create sample document content with placeholders
      let contentWithPlaceholders = `
# ${template.name}

${template.description}

This is a sample template for ${template.category} documents.

`;

      // Add sample placeholders based on the fields
      templateFields.forEach(field => {
        contentWithPlaceholders += `\n${field.displayName}: {{${field.name}}}\n`;
      });
      
      // Create a basic docx-like XML 
      const docContent = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>${template.name}</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:t>${template.description}</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:t>This is a sample template for ${template.category} documents.</w:t>
      </w:r>
    </w:p>
    ${templateFields.map(field => `
    <w:p>
      <w:r>
        <w:t>${field.displayName}: {{${field.name}}}</w:t>
      </w:r>
    </w:p>`).join('')}
  </w:body>
</w:document>`;
      
      fs.writeFileSync(filePath, Buffer.from(docContent));

      // Insert the template record
      const [newTemplate] = await db.insert(schema.templates).values({
        name: template.name,
        description: template.description,
        category: template.category,
        filePath: filePath,
        fieldCount: template.fieldCount,
      }).returning();

      console.log(`Created template: ${template.name}`);

      // Create sample template fields based on the template type
      const fields = getSampleFieldsForTemplate(template.name, newTemplate.id);
      
      if (fields.length > 0) {
        await db.insert(schema.templateFields).values(fields);
        console.log(`Added ${fields.length} fields to template: ${template.name}`);
      }
    }

    console.log("✅ Seeding completed successfully!");
  } catch (error) {
    console.error("❌ Seeding failed:", error);
  }
}

// Helper function to generate sample fields for different template types
function getSampleFieldsForTemplate(templateName: string, templateId: number) {
  switch (templateName) {
    case "Employment Contract":
      return [
        {
          templateId,
          name: "employeeName",
          displayName: "Employee Name",
          fieldType: "text",
          required: true,
        },
        {
          templateId,
          name: "employeeAddress",
          displayName: "Employee Address",
          fieldType: "text",
          required: true,
        },
        {
          templateId,
          name: "companyName",
          displayName: "Company Name",
          fieldType: "text",
          required: true,
        },
        {
          templateId,
          name: "companyAddress",
          displayName: "Company Address",
          fieldType: "text",
          required: true,
        },
        {
          templateId,
          name: "position",
          displayName: "Position",
          fieldType: "text",
          required: true,
        },
        {
          templateId,
          name: "startDate",
          displayName: "Start Date",
          fieldType: "date",
          required: true,
        },
        {
          templateId,
          name: "salary",
          displayName: "Salary",
          fieldType: "number",
          required: true,
        },
        {
          templateId,
          name: "payPeriod",
          displayName: "Pay Period",
          fieldType: "select",
          options: "Hour,Week,Bi-week,Month,Year",
          required: true,
        },
        {
          templateId,
          name: "employmentType",
          displayName: "Employment Type",
          fieldType: "select",
          options: "Full-time,Part-time,Contract,Temporary",
          required: true,
        },
        {
          templateId,
          name: "duties",
          displayName: "Duties",
          fieldType: "textarea",
          required: true,
        },
        {
          templateId,
          name: "currentDate",
          displayName: "Current Date",
          fieldType: "date",
          required: true,
        },
      ];
    
    case "Invoice Template":
      return [
        {
          templateId,
          name: "invoiceNumber",
          displayName: "Invoice Number",
          fieldType: "text",
          required: true,
        },
        {
          templateId,
          name: "issueDate",
          displayName: "Issue Date",
          fieldType: "date",
          required: true,
        },
        {
          templateId,
          name: "dueDate",
          displayName: "Due Date",
          fieldType: "date",
          required: true,
        },
        {
          templateId,
          name: "companyName",
          displayName: "Company Name",
          fieldType: "text",
          required: true,
        },
        {
          templateId,
          name: "clientName",
          displayName: "Client Name",
          fieldType: "text",
          required: true,
        },
        {
          templateId,
          name: "items",
          displayName: "Items",
          fieldType: "textarea",
          required: true,
        },
        {
          templateId,
          name: "totalAmount",
          displayName: "Total Amount",
          fieldType: "number",
          required: true,
        },
      ];
    
    case "Offer Letter":
      return [
        {
          templateId,
          name: "candidateName",
          displayName: "Candidate Name",
          fieldType: "text",
          required: true,
        },
        {
          templateId,
          name: "position",
          displayName: "Position",
          fieldType: "text",
          required: true,
        },
        {
          templateId,
          name: "companyName",
          displayName: "Company Name",
          fieldType: "text",
          required: true,
        },
        {
          templateId,
          name: "startDate",
          displayName: "Start Date",
          fieldType: "date",
          required: true,
        },
        {
          templateId,
          name: "salary",
          displayName: "Salary",
          fieldType: "number",
          required: true,
        },
        {
          templateId,
          name: "benefits",
          displayName: "Benefits",
          fieldType: "textarea",
          required: false,
        },
        {
          templateId,
          name: "offerExpiration",
          displayName: "Offer Expiration",
          fieldType: "date",
          required: true,
        },
      ];
    
    case "Project Proposal":
      return [
        {
          templateId,
          name: "clientName",
          displayName: "Client Name",
          fieldType: "text",
          required: true,
        },
        {
          templateId,
          name: "projectTitle",
          displayName: "Project Title",
          fieldType: "text",
          required: true,
        },
        {
          templateId,
          name: "projectDescription",
          displayName: "Project Description",
          fieldType: "textarea",
          required: true,
        },
        {
          templateId,
          name: "startDate",
          displayName: "Start Date",
          fieldType: "date",
          required: true,
        },
        {
          templateId,
          name: "endDate",
          displayName: "End Date",
          fieldType: "date",
          required: true,
        },
        {
          templateId,
          name: "budget",
          displayName: "Budget",
          fieldType: "number",
          required: true,
        },
        {
          templateId,
          name: "deliverables",
          displayName: "Deliverables",
          fieldType: "textarea",
          required: true,
        },
        {
          templateId,
          name: "timeline",
          displayName: "Timeline",
          fieldType: "textarea",
          required: true,
        },
      ];
    
    default:
      return [];
  }
}

seed();
