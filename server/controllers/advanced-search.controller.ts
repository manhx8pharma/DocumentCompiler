import { Request, Response } from 'express';
import { pool } from '@db';

// In-memory cache for searchable fields + table names (60s TTL)
let fieldNamesCache: {
  fields: string[];
  tables: string[];
  expiresAt: number;
} | null = null;

export async function getSearchableFields(req: Request, res: Response) {
  try {
    const now = Date.now();
    if (fieldNamesCache && fieldNamesCache.expiresAt > now) {
      return res.json({ fields: fieldNamesCache.fields, tables: fieldNamesCache.tables });
    }

    const client = await pool.connect();
    try {
      const fieldsResult = await client.query(
        'SELECT DISTINCT field_name FROM document_fields ORDER BY field_name'
      );
      // UNION template_tables (defined tables) with document_table_data (tables that have data)
      // so table names appear in scope selector even if no documents exist yet, and vice-versa
      const tablesResult = await client.query(`
        SELECT name FROM (
          SELECT DISTINCT name FROM template_tables
          UNION
          SELECT DISTINCT table_name AS name FROM document_table_data
        ) AS t ORDER BY 1
      `);

      const fields = fieldsResult.rows.map((r: any) => r.field_name as string);
      const tables = tablesResult.rows.map((r: any) => r.name as string);
      fieldNamesCache = { fields, tables, expiresAt: now + 60_000 };
      return res.json({ fields, tables });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[AdvancedSearch] getSearchableFields error:', error);
    return res.status(500).json({ message: 'Failed to fetch searchable fields' });
  }
}

export function invalidateFieldNamesCache() {
  fieldNamesCache = null;
}

export async function advancedSearch(req: Request, res: Response) {
  try {
    const {
      query,
      fieldNames,
      tableNames,
      page = 1,
      limit = 10,
    } = req.body as {
      query: string;
      fieldNames?: string[];
      tableNames?: string[];
      page?: number;
      limit?: number;
    };

    if (!query?.trim()) {
      return res.status(400).json({ message: 'query là bắt buộc' });
    }

    const searchTerm = query.trim();
    const safeLimitNum = Math.min(Math.max(Number(limit) || 10, 1), 100);
    const safePageNum = Math.max(Number(page) || 1, 1);
    const offset = (safePageNum - 1) * safeLimitNum;

    const searchAllFields = !fieldNames || !Array.isArray(fieldNames) || fieldNames.length === 0;
    const searchAllTables = !tableNames || !Array.isArray(tableNames) || tableNames.length === 0;

    // Include table data when:
    //  - Nothing is selected at all (search-all mode) → search fields + all tables
    //  - Specific tables are selected (with or without specific fields)
    // Do NOT include tables when only specific fields are selected but no tables
    const effectiveIncludeTableData = searchAllFields || !searchAllTables;

    const fieldNamesParam = searchAllFields ? [] : (fieldNames as string[]);
    const tableNamesParam = searchAllTables ? [] : (tableNames as string[]);
    const likePattern = `%${searchTerm}%`;

    const client = await pool.connect();
    try {
      // ── Step 1: Find matching doc UUIDs + total count ──
      // Table match uses hybrid approach:
      //   rows::text ILIKE → prefilter using GIN trigram index (fast)
      //   EXISTS jsonb_each_text → confirm match is in a value, not a key (accurate)
      const step1Sql = effectiveIncludeTableData
        ? `
          WITH field_matches AS (
            SELECT DISTINCT document_uuid
            FROM document_fields
            WHERE lower(field_value) LIKE lower($1)
              AND ($2::boolean OR field_name = ANY($3::text[]))
          ),
          table_matches AS (
            SELECT DISTINCT td.document_uuid
            FROM document_table_data td,
                 jsonb_array_elements(td.rows) AS elem
            WHERE td.rows::text ILIKE $1
              AND EXISTS (
                SELECT 1 FROM jsonb_each_text(elem) kv WHERE kv.value ILIKE $1
              )
              AND ($4::boolean OR td.table_name = ANY($5::text[]))
          ),
          all_matches AS (
            SELECT document_uuid FROM field_matches
            UNION
            SELECT document_uuid FROM table_matches
          ),
          ranked AS (
            SELECT
              d.uuid,
              d.name,
              d.archived,
              d.created_at,
              t.uuid  AS template_uuid,
              t.name  AS template_name,
              COUNT(*) OVER () AS total_count
            FROM all_matches m
            JOIN documents  d ON d.uuid = m.document_uuid
            JOIN templates  t ON t.uuid = d.template_uuid
            ORDER BY d.created_at DESC
            LIMIT $6 OFFSET $7
          )
          SELECT * FROM ranked
        `
        : `
          WITH field_matches AS (
            SELECT DISTINCT document_uuid
            FROM document_fields
            WHERE lower(field_value) LIKE lower($1)
              AND ($2::boolean OR field_name = ANY($3::text[]))
          ),
          ranked AS (
            SELECT
              d.uuid,
              d.name,
              d.archived,
              d.created_at,
              t.uuid  AS template_uuid,
              t.name  AS template_name,
              COUNT(*) OVER () AS total_count
            FROM field_matches m
            JOIN documents  d ON d.uuid = m.document_uuid
            JOIN templates  t ON t.uuid = d.template_uuid
            ORDER BY d.created_at DESC
            LIMIT $4 OFFSET $5
          )
          SELECT * FROM ranked
        `;

      const step1Params = effectiveIncludeTableData
        ? [likePattern, searchAllFields, fieldNamesParam, searchAllTables, tableNamesParam, safeLimitNum, offset]
        : [likePattern, searchAllFields, fieldNamesParam, safeLimitNum, offset];

      const step1Result = await client.query(step1Sql, step1Params);
      const docRows = step1Result.rows;

      if (docRows.length === 0) {
        return res.json({ results: [], total: 0, page: safePageNum, totalPages: 0 });
      }

      const totalCount = parseInt(docRows[0].total_count, 10);
      const docUuids = docRows.map((r: any) => r.uuid as string);

      // ── Step 2: Field value snippets for this page's docs ──
      const step2Result = await client.query(
        `SELECT document_uuid, field_name, field_value
         FROM document_fields
         WHERE document_uuid = ANY($1::uuid[])
           AND lower(field_value) LIKE lower($2)
           AND ($3::boolean OR field_name = ANY($4::text[]))`,
        [docUuids, likePattern, searchAllFields, fieldNamesParam]
      );

      const snippetsByDoc: Record<string, Array<{ fieldName: string; fieldValue: string }>> = {};
      for (const row of step2Result.rows) {
        if (!snippetsByDoc[row.document_uuid]) snippetsByDoc[row.document_uuid] = [];
        snippetsByDoc[row.document_uuid].push({
          fieldName: row.field_name,
          fieldValue: row.field_value,
        });
      }

      // ── Step 3: Count actual matching JSONB rows for this page's docs ──
      // Unnests each table record's rows array and counts individual rows
      // whose values (not keys) contain the keyword. Bounded by page size → safe.
      let tableMatchesByDoc: Record<string, number> = {};
      if (effectiveIncludeTableData) {
        const tableResult = await client.query(
          `SELECT td.document_uuid, COUNT(*) AS match_count
           FROM document_table_data td,
                jsonb_array_elements(td.rows) AS elem
           WHERE td.document_uuid = ANY($1::uuid[])
             AND td.rows::text ILIKE $2
             AND EXISTS (
               SELECT 1 FROM jsonb_each_text(elem) kv WHERE kv.value ILIKE $2
             )
             AND ($3::boolean OR td.table_name = ANY($4::text[]))
           GROUP BY td.document_uuid`,
          [docUuids, likePattern, searchAllTables, tableNamesParam]
        );
        for (const row of tableResult.rows) {
          tableMatchesByDoc[row.document_uuid] = parseInt(row.match_count, 10);
        }
      }

      const results = docRows.map((doc: any) => ({
        uuid: doc.uuid as string,
        name: doc.name as string,
        archived: doc.archived as boolean,
        createdAt: doc.created_at as string,
        templateUuid: doc.template_uuid as string,
        templateName: doc.template_name as string,
        matchedFields: snippetsByDoc[doc.uuid] || [],
        tableMatchCount: tableMatchesByDoc[doc.uuid] || 0,
      }));

      return res.json({
        results,
        total: totalCount,
        page: safePageNum,
        totalPages: Math.ceil(totalCount / safeLimitNum),
      });
    } finally {
      client.release();
    }
  } catch (error) {
    console.error('[AdvancedSearch] advancedSearch error:', error);
    return res.status(500).json({ message: 'Tìm kiếm thất bại, vui lòng thử lại' });
  }
}
