import { db } from '@db';
import { eq } from 'drizzle-orm';
import { batchSessions, batchDocuments, batchDocumentFields } from '@shared/schema';

/**
 * Comprehensive batch data cleanup service
 * Handles deletion of batch data in correct order to avoid foreign key violations
 */
export class BatchCleanupService {
  
  /**
   * Delete all batch data associated with a template
   * Handles the complete chain: template -> sessions -> documents -> fields
   */
  static async deleteAllBatchDataForTemplate(templateId: number): Promise<void> {
    console.log(`Starting batch cleanup for template ID: ${templateId}`);
    
    // Get all batch sessions for this template
    const sessions = await db.select({ id: batchSessions.id, uuid: batchSessions.uuid })
      .from(batchSessions)
      .where(eq(batchSessions.templateId, templateId));
    
    console.log(`Found ${sessions.length} batch sessions to clean up`);
    
    for (const session of sessions) {
      await this.deleteCompleteSession(session.id);
    }
    
    console.log(`Completed batch cleanup for template ID: ${templateId}`);
  }
  
  /**
   * Delete a complete batch session and all its related data
   */
  static async deleteCompleteSession(sessionId: number): Promise<void> {
    console.log(`Deleting complete session: ${sessionId}`);
    
    // Step 1: Get all batch documents for this session
    const batchDocs = await db.select({ id: batchDocuments.id })
      .from(batchDocuments)
      .where(eq(batchDocuments.sessionId, sessionId));
    
    console.log(`Found ${batchDocs.length} batch documents for session ${sessionId}`);
    
    // Step 2: Delete all batch document fields first
    for (const batchDoc of batchDocs) {
      const deletedFields = await db.delete(batchDocumentFields)
        .where(eq(batchDocumentFields.batchDocumentId, batchDoc.id));
      console.log(`Deleted fields for batch document ${batchDoc.id}`);
    }
    
    // Step 3: Delete all batch documents
    const deletedDocs = await db.delete(batchDocuments)
      .where(eq(batchDocuments.sessionId, sessionId));
    console.log(`Deleted ${batchDocs.length} batch documents for session ${sessionId}`);
    
    // Step 4: Finally delete the batch session
    const deletedSession = await db.delete(batchSessions)
      .where(eq(batchSessions.id, sessionId));
    console.log(`Deleted batch session ${sessionId}`);
  }
  
  /**
   * Check if a template has any batch data
   */
  static async hasAnyBatchData(templateId: number): Promise<boolean> {
    const sessions = await db.select({ id: batchSessions.id })
      .from(batchSessions)
      .where(eq(batchSessions.templateId, templateId))
      .limit(1);
    
    return sessions.length > 0;
  }
  
  /**
   * Get summary of batch data for a template
   */
  static async getBatchDataSummary(templateId: number): Promise<{
    sessionCount: number;
    documentCount: number;
    fieldCount: number;
  }> {
    // Count sessions
    const sessions = await db.select({ id: batchSessions.id })
      .from(batchSessions)
      .where(eq(batchSessions.templateId, templateId));
    
    let totalDocuments = 0;
    let totalFields = 0;
    
    for (const session of sessions) {
      // Count documents for this session
      const docs = await db.select({ id: batchDocuments.id })
        .from(batchDocuments)
        .where(eq(batchDocuments.sessionId, session.id));
      
      totalDocuments += docs.length;
      
      // Count fields for each document
      for (const doc of docs) {
        const fields = await db.select({ id: batchDocumentFields.id })
          .from(batchDocumentFields)
          .where(eq(batchDocumentFields.batchDocumentId, doc.id));
        
        totalFields += fields.length;
      }
    }
    
    return {
      sessionCount: sessions.length,
      documentCount: totalDocuments,
      fieldCount: totalFields
    };
  }
}