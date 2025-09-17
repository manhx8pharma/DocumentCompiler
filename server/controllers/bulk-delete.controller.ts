import { Request, Response } from 'express';
import { storage } from '../storage-uuid';

interface BulkDeleteFilters {
  searchQuery?: string;
  templateUuids?: string[];
  dateFrom?: string;
  dateTo?: string;
  dateType?: 'created' | 'updated'; // Filter by creation or update date
  archived?: boolean;
}

interface BulkDeleteRequest {
  filters: BulkDeleteFilters;
  confirm?: boolean;
}

export async function previewBulkDelete(req: Request, res: Response) {
  try {
    const filters: BulkDeleteFilters = req.body.filters || {};

    // Get all documents matching the search query first
    const allDocs = await storage.getDocuments({
      searchQuery: filters.searchQuery,
      templateUuid: undefined,
      limit: undefined,
      offset: undefined
    });

    // Apply additional filters
    let filteredDocs = allDocs;

    // Date range filter - support both created and updated dates
    if (filters.dateFrom || filters.dateTo) {
      filteredDocs = filteredDocs.filter(doc => {
        // Choose date field based on dateType filter
        const docDate = new Date(filters.dateType === 'updated' ? doc.updatedAt : doc.createdAt);
        if (filters.dateFrom && docDate < new Date(filters.dateFrom)) {
          return false;
        }
        if (filters.dateTo && docDate > new Date(filters.dateTo)) {
          return false;
        }
        return true;
      });
    }

    // Template filter - use UUID-based filtering
    if (filters.templateUuids && filters.templateUuids.length > 0) {
      filteredDocs = filteredDocs.filter(doc => {
        return doc.templateUuid !== null && filters.templateUuids!.includes(doc.templateUuid);
      });
    }

    // Return preview data with template names
    const preview = {
      totalMatching: filteredDocs.length,
      documents: await Promise.all(filteredDocs.slice(0, 10).map(async doc => {
        let templateName = 'Unknown Template';
        if (doc.templateUuid) {
          try {
            const template = await storage.getTemplateByUuid(doc.templateUuid);
            templateName = template?.name || 'Unknown Template';
          } catch (e) {
            // Template not found, keep default name
          }
        }
        return {
          uuid: doc.uuid,
          name: doc.name,
          templateUuid: doc.templateUuid,
          templateName,
          createdAt: doc.createdAt,
          updatedAt: doc.updatedAt
        };
      }))
    };

    res.json(preview);
  } catch (error) {
    console.error('Error in previewBulkDelete:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

export async function executeBulkDelete(req: Request, res: Response) {
  try {
    const { filters, confirm }: BulkDeleteRequest = req.body;

    if (!confirm) {
      return res.status(400).json({ message: 'Confirmation required for bulk delete' });
    }

    // Get all documents matching the search query first
    const allDocs = await storage.getDocuments({
      searchQuery: filters.searchQuery,
      templateUuid: undefined,
      limit: undefined,
      offset: undefined
    });

    // Apply additional filters (same logic as preview)
    let filteredDocs = allDocs;

    // Date range filter - support both created and updated dates
    if (filters.dateFrom || filters.dateTo) {
      filteredDocs = filteredDocs.filter(doc => {
        // Choose date field based on dateType filter
        const docDate = new Date(filters.dateType === 'updated' ? doc.updatedAt : doc.createdAt);
        if (filters.dateFrom && docDate < new Date(filters.dateFrom)) {
          return false;
        }
        if (filters.dateTo && docDate > new Date(filters.dateTo)) {
          return false;
        }
        return true;
      });
    }

    // Template filter - use UUID-based filtering
    if (filters.templateUuids && filters.templateUuids.length > 0) {
      filteredDocs = filteredDocs.filter(doc => {
        return doc.templateUuid !== null && filters.templateUuids!.includes(doc.templateUuid);
      });
    }

    // Check if we have any documents to delete
    if (filteredDocs.length === 0) {
      return res.json({ 
        message: 'No documents found matching the specified criteria',
        deletedCount: 0
      });
    }

    // Execute bulk delete
    let deletedCount = 0;
    const errors: string[] = [];

    for (const doc of filteredDocs) {
      try {
        await storage.deleteDocumentByUuid(doc.uuid);
        deletedCount++;
      } catch (error) {
        console.error(`Failed to delete document ${doc.uuid}:`, error);
        errors.push(`Failed to delete document "${doc.name}"`);
      }
    }

    res.json({
      message: `Successfully deleted ${deletedCount} out of ${filteredDocs.length} documents`,
      deletedCount,
      totalAttempted: filteredDocs.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error in executeBulkDelete:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}