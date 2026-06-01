/**
 * API controllers for template table definitions and document table data.
 *
 * Endpoints:
 *   GET    /api/templates/:uuid/tables                        — list all table defs for template
 *   GET    /api/templates/:uuid/tables/:name                  — get single table def
 *   PUT    /api/templates/:uuid/tables/:name/columns          — update column definitions
 *   GET    /api/templates/:uuid/tables/:name/excel            — download blank Excel template
 *   POST   /api/templates/:uuid/tables/:name/excel/parse      — parse Excel (local mode, no save)
 *   GET    /api/documents/:uuid/tables/:name                  — get row data for a document table
 *   PUT    /api/documents/:uuid/tables/:name                  — save row data (full replace)
 *   GET    /api/documents/:uuid/tables/:name/excel            — download Excel with current rows
 *   POST   /api/documents/:uuid/tables/:name/excel            — upload Excel and save rows
 */

import { Request, Response } from 'express';
import { db } from '@db';
import { templateTables, documentTableData, documents, templates } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { documentGeneratorCache } from '../services/document-generator-cache.service';

// ─── Template table routes ────────────────────────────────────────────────────

/**
 * GET /api/templates/:uuid/tables
 * Returns all table definitions for the given template.
 */
export async function getTemplateTables(req: Request, res: Response) {
  try {
    const { uuid: templateUuid } = req.params;
    const rows = await db
      .select()
      .from(templateTables)
      .where(eq(templateTables.templateUuid, templateUuid))
      .orderBy(templateTables.position);

    res.json(rows);
  } catch (err) {
    console.error('[getTemplateTables]', err);
    res.status(500).json({ message: 'Failed to fetch template tables', error: String(err) });
  }
}

/**
 * GET /api/templates/:uuid/tables/:name
 * Returns a single table definition.
 */
export async function getTemplateTable(req: Request, res: Response) {
  try {
    const { uuid: templateUuid, name: tableName } = req.params;
    const [row] = await db
      .select()
      .from(templateTables)
      .where(and(
        eq(templateTables.templateUuid, templateUuid),
        eq(templateTables.name, tableName),
      ));

    if (!row) {
      return res.status(404).json({ message: 'Table definition not found' });
    }
    res.json(row);
  } catch (err) {
    console.error('[getTemplateTable]', err);
    res.status(500).json({ message: 'Failed to fetch table definition', error: String(err) });
  }
}

/**
 * PUT /api/templates/:uuid/tables/:name/columns
 * Update column definitions for a template table.
 * Body: { label?: string; columns: Array<{ name: string; label: string }> }
 */
export async function updateTemplateTableColumns(req: Request, res: Response) {
  try {
    const { uuid: templateUuid, name: tableName } = req.params;
    const { columns, label } = req.body;

    if (!Array.isArray(columns)) {
      return res.status(400).json({ message: 'columns must be an array' });
    }

    // Validate each column has a name and optional block fields are valid
    for (const col of columns) {
      if (!col.name || typeof col.name !== 'string') {
        return res.status(400).json({ message: 'Each column must have a name' });
      }
      if (col.fieldType !== undefined && !['text', 'checklist'].includes(col.fieldType)) {
        return res.status(400).json({ message: `Invalid fieldType '${col.fieldType}'. Must be 'text' or 'checklist'` });
      }
      if (col.fieldType === 'checklist' && col.options !== undefined) {
        if (!Array.isArray(col.options) || col.options.some((o: any) => typeof o !== 'string')) {
          return res.status(400).json({ message: 'Column options must be an array of strings' });
        }
      }
    }

    const [existing] = await db
      .select()
      .from(templateTables)
      .where(and(
        eq(templateTables.templateUuid, templateUuid),
        eq(templateTables.name, tableName),
      ));

    if (!existing) {
      // Auto-create if missing (e.g. legacy templates that predated the feature)
      const [created] = await db.insert(templateTables).values({
        templateUuid,
        name: tableName,
        label: label || tableName.replace(/_/g, ' '),
        columns,
        position: 0,
      }).returning();
      return res.json(created);
    }

    const updatePayload: Record<string, any> = {
      columns,
      updatedAt: new Date(),
    };
    if (label !== undefined) updatePayload.label = label;

    const [updated] = await db
      .update(templateTables)
      .set(updatePayload)
      .where(and(
        eq(templateTables.templateUuid, templateUuid),
        eq(templateTables.name, tableName),
      ))
      .returning();

    res.json(updated);
  } catch (err) {
    console.error('[updateTemplateTableColumns]', err);
    res.status(500).json({ message: 'Failed to update column definitions', error: String(err) });
  }
}

// ─── Excel import / export for template tables (blank template) ───────────────

type TableColumn = {
  name: string;
  label: string;
  fieldType?: 'text' | 'checklist';
  defaultValue?: string;
  options?: string[];
};

/**
 * Build an XLSX workbook for a table or chorus block.
 * If checklistOptions is provided, adds dropdown validation for those columns
 * using a hidden _ValidationLists sheet.
 */
async function buildExcelWorkbook(
  columns: TableColumn[],
  rows: Array<Record<string, string>>,
  sheetLabel: string,
  checklistOptions?: Map<string, string[]>,
) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  const headerRow = columns.map((c) => c.label || c.name);
  const dataRows =
    rows.length > 0
      ? rows.map((row) => columns.map((c) => row[c.name] ?? ''))
      : [columns.map(() => '')];

  const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
  ws['!cols'] = columns.map(() => ({ wch: 22 }));

  // Hidden mapping sheet so upload can resolve label → internal name
  const mapSheet = XLSX.utils.aoa_to_sheet([
    ['label', 'name'],
    ...columns.map((c) => [c.label || c.name, c.name]),
  ]);

  XLSX.utils.book_append_sheet(wb, ws, sheetLabel.slice(0, 31));
  XLSX.utils.book_append_sheet(wb, mapSheet, '_ColMap');

  // Add dropdown validation for checklist columns (block type only)
  if (checklistOptions && checklistOptions.size > 0) {
    const validationListData: string[][] = [];
    const validationRanges: { colIdx: number; listColIdx: number; listLength: number }[] = [];
    let listColIndex = 0;

    for (let colIdx = 0; colIdx < columns.length; colIdx++) {
      const col = columns[colIdx];
      const opts = checklistOptions.get(col.name);
      if (!opts || opts.length === 0) continue;
      for (let i = 0; i < opts.length; i++) {
        if (!validationListData[i]) validationListData[i] = [];
        validationListData[i][listColIndex] = opts[i];
      }
      validationRanges.push({ colIdx, listColIdx: listColIndex, listLength: opts.length });
      listColIndex++;
    }

    if (validationRanges.length > 0) {
      const validationSheet = XLSX.utils.aoa_to_sheet(validationListData);
      XLSX.utils.book_append_sheet(wb, validationSheet, '_ValidationLists');

      const totalDataRows = Math.max(rows.length, 5);
      const dataValidations: any[] = [];
      for (const range of validationRanges) {
        const dataColLetter = XLSX.utils.encode_col(range.colIdx);
        const listColLetter = XLSX.utils.encode_col(range.listColIdx);
        dataValidations.push({
          sqref: `${dataColLetter}2:${dataColLetter}${totalDataRows + 1}`,
          type: 'list',
          formula1: `'_ValidationLists'!$${listColLetter}$1:$${listColLetter}$${range.listLength}`,
          showDropDown: false,
          allowBlank: true,
        });
      }
      ws['!dataValidation'] = dataValidations;

      // Hide _ValidationLists sheet
      const sheetIdx = wb.SheetNames.indexOf('_ValidationLists');
      if (sheetIdx !== -1) {
        if (!wb.Workbook) wb.Workbook = { Sheets: [] };
        const wbSheets = wb.Workbook.Sheets!;
        while (wbSheets.length < wb.SheetNames.length) wbSheets.push({});
        (wbSheets[sheetIdx] as any) = { Hidden: 2 };
      }
    }
  }

  return { wb, XLSX };
}

async function parseExcelRows(
  buffer: Buffer,
  columns: TableColumn[],
): Promise<Array<Record<string, string>>> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buffer, { type: 'buffer' });

  const sheetName =
    wb.SheetNames.find((n) => !n.startsWith('_')) ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rawRows: string[][] = XLSX.utils.sheet_to_json(ws, {
    header: 1,
    defval: '',
  }) as string[][];

  if (rawRows.length < 2) {
    throw new Error(
      'File không có dữ liệu (cần ít nhất 1 dòng sau header)',
    );
  }

  const headerRow = rawRows[0].map((h) => String(h).trim());
  const labelToName: Record<string, string> = {};

  // Prefer the hidden _ColMap sheet for accurate label→name mapping
  if (wb.Sheets['_ColMap']) {
    const mapRows: string[][] = XLSX.utils.sheet_to_json(
      wb.Sheets['_ColMap'],
      { header: 1, defval: '' },
    ) as string[][];
    for (let i = 1; i < mapRows.length; i++) {
      const [lbl, nm] = mapRows[i];
      if (lbl && nm) labelToName[String(lbl).trim()] = String(nm).trim();
    }
  }
  // Fallback: match by label or name directly
  for (const col of columns) {
    const key = col.label || col.name;
    if (!labelToName[key]) labelToName[key] = col.name;
    if (!labelToName[col.name]) labelToName[col.name] = col.name;
  }

  const colMap: Array<string | null> = headerRow.map(
    (h) => labelToName[h] ?? null,
  );

  // Validate that every expected column is present in the header
  const mappedColumnNames = new Set(colMap.filter(Boolean) as string[]);
  const missingColumns = columns.filter((c) => !mappedColumnNames.has(c.name));
  if (missingColumns.length > 0) {
    const missingLabels = missingColumns.map((c) => c.label || c.name);
    const expectedLabels = columns.map((c) => c.label || c.name);
    throw Object.assign(
      new Error(
        `File Excel thiếu cột: ${missingLabels.join(', ')}. ` +
        `Cột bắt buộc: ${expectedLabels.join(', ')}. ` +
        `Vui lòng tải file mẫu từ hệ thống và điền vào đó.`
      ),
      { statusCode: 400, missingColumns: missingLabels, expectedColumns: expectedLabels },
    );
  }

  const parsedRows: Array<Record<string, string>> = [];
  for (let i = 1; i < rawRows.length; i++) {
    const raw = rawRows[i];
    if (raw.every((v) => v === '' || v === null || v === undefined)) continue; // skip blank rows
    const row: Record<string, string> = {};
    for (const col of columns) row[col.name] = '';
    for (let c = 0; c < colMap.length; c++) {
      const colName = colMap[c];
      if (colName) row[colName] = String(raw[c] ?? '');
    }
    parsedRows.push(row);
  }

  if (parsedRows.length === 0) {
    throw new Error('Không tìm thấy dữ liệu hợp lệ trong file');
  }

  // Normalize checklist column values: comma-separated → semicolon-delimited
  const checklistColNames = new Set(
    columns.filter(c => c.fieldType === 'checklist').map(c => c.name)
  );
  if (checklistColNames.size > 0) {
    for (const row of parsedRows) {
      for (const colName of checklistColNames) {
        if (row[colName]) {
          row[colName] = row[colName]
            .split(/[,;]/)
            .map(v => v.trim())
            .filter(Boolean)
            .join(';');
        }
      }
    }
  }

  return parsedRows;
}

/**
 * GET /api/templates/:uuid/tables/:name/excel
 * Downloads a blank Excel template (column headers + 5 empty rows).
 * Used for local/new-doc mode where no documentUuid exists yet.
 */
export async function downloadTemplateTableExcel(req: Request, res: Response) {
  try {
    const { uuid: templateUuid, name: tableName } = req.params;
    const [tableDef] = await db
      .select()
      .from(templateTables)
      .where(
        and(
          eq(templateTables.templateUuid, templateUuid),
          eq(templateTables.name, tableName),
        ),
      );

    if (!tableDef || !(tableDef.columns as TableColumn[])?.length) {
      return res
        .status(404)
        .json({ message: 'Table definition not found or has no columns' });
    }

    // Optional ?type validation (e.g. ?type=block or ?type=table)
    const requestedType = req.query.type as string | undefined;
    if (requestedType && tableDef.blockType !== requestedType) {
      return res.status(400).json({
        message: `This entry is of type '${tableDef.blockType}', not '${requestedType}'`,
      });
    }

    const columns = tableDef.columns as TableColumn[];
    const emptyRows = Array.from({ length: 5 }, () =>
      Object.fromEntries(columns.map((c) => [c.name, ''])),
    );
    const label = tableDef.label || tableName;
    // For chorus blocks: include checklist dropdown validation
    let checklistOptions: Map<string, string[]> | undefined;
    if (tableDef.blockType === 'block') {
      checklistOptions = new Map();
      for (const col of columns) {
        if (col.fieldType === 'checklist' && col.options && col.options.length > 0) {
          checklistOptions.set(col.name, col.options);
        }
      }
      if (checklistOptions.size === 0) checklistOptions = undefined;
    }
    const { wb, XLSX } = await buildExcelWorkbook(columns, emptyRows, label, checklistOptions);

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(label + '_mau')}.xlsx"`,
    );
    res.send(buffer);
  } catch (err) {
    console.error('[downloadTemplateTableExcel]', err);
    res
      .status(500)
      .json({ message: 'Failed to generate Excel template', error: String(err) });
  }
}

/**
 * POST /api/templates/:uuid/tables/:name/excel/parse
 * Parses an uploaded Excel and returns rows WITHOUT saving.
 * Used for local/new-doc mode (onSaveLocal callback).
 * Expects multipart/form-data with field 'file'.
 */
export async function parseTemplateTableExcel(req: Request, res: Response) {
  try {
    const { uuid: templateUuid, name: tableName } = req.params;
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const [tableDef] = await db
      .select()
      .from(templateTables)
      .where(
        and(
          eq(templateTables.templateUuid, templateUuid),
          eq(templateTables.name, tableName),
        ),
      );

    if (!tableDef || !(tableDef.columns as TableColumn[])?.length) {
      return res.status(404).json({ message: 'Table definition not found' });
    }

    // Optional ?type validation (e.g. ?type=block or ?type=table)
    const requestedType = req.query.type as string | undefined;
    if (requestedType && tableDef.blockType !== requestedType) {
      return res.status(400).json({
        message: `This entry is of type '${tableDef.blockType}', not '${requestedType}'`,
      });
    }

    const columns = tableDef.columns as TableColumn[];
    const parsedRows = await parseExcelRows(req.file.buffer, columns);
    res.json({ rows: parsedRows, count: parsedRows.length });
  } catch (err: any) {
    console.error('[parseTemplateTableExcel]', err);
    const status = err.statusCode === 400 || err.message?.includes('dữ liệu') || err.message?.includes('thiếu cột') ? 400 : 500;
    res
      .status(status)
      .json({
        message: err.message || 'Failed to parse Excel',
        ...(err.missingColumns ? { missingColumns: err.missingColumns, expectedColumns: err.expectedColumns } : {}),
      });
  }
}

// ─── Excel import / export for document table data ────────────────────────────

/**
 * GET /api/documents/:uuid/tables/:name/excel
 * Downloads Excel with current saved rows (or one blank row if no data yet).
 */
export async function downloadDocumentTableExcel(req: Request, res: Response) {
  try {
    const { uuid: documentUuid, name: tableName } = req.params;

    const [doc] = await db
      .select({ uuid: documents.uuid, templateUuid: documents.templateUuid })
      .from(documents)
      .where(eq(documents.uuid, documentUuid));
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    const [tableDef] = await db
      .select()
      .from(templateTables)
      .where(
        and(
          eq(templateTables.templateUuid, doc.templateUuid),
          eq(templateTables.name, tableName),
        ),
      );
    if (!tableDef || !(tableDef.columns as TableColumn[])?.length) {
      return res
        .status(404)
        .json({ message: 'Table definition not found or has no columns' });
    }

    const columns = tableDef.columns as TableColumn[];

    const [dataRow] = await db
      .select()
      .from(documentTableData)
      .where(
        and(
          eq(documentTableData.documentUuid, documentUuid),
          eq(documentTableData.tableName, tableName),
        ),
      );

    const savedRows: Array<Record<string, string>> =
      (dataRow?.rows as Array<Record<string, string>>) ?? [];
    const label = tableDef.label || tableName;
    // For chorus blocks: include checklist dropdown validation
    let checklistOptions: Map<string, string[]> | undefined;
    if (tableDef.blockType === 'block') {
      checklistOptions = new Map();
      for (const col of columns) {
        if (col.fieldType === 'checklist' && col.options && col.options.length > 0) {
          checklistOptions.set(col.name, col.options);
        }
      }
      if (checklistOptions.size === 0) checklistOptions = undefined;
    }
    const { wb, XLSX } = await buildExcelWorkbook(columns, savedRows, label, checklistOptions);

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(label)}.xlsx"`,
    );
    res.send(buffer);
  } catch (err) {
    console.error('[downloadDocumentTableExcel]', err);
    res
      .status(500)
      .json({ message: 'Failed to generate Excel', error: String(err) });
  }
}

/**
 * POST /api/documents/:uuid/tables/:name/excel
 * Parses uploaded Excel and saves rows (full replace).
 * Expects multipart/form-data with field 'file'.
 */
export async function uploadDocumentTableExcel(req: Request, res: Response) {
  try {
    const { uuid: documentUuid, name: tableName } = req.params;
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    const [doc] = await db
      .select({ uuid: documents.uuid, templateUuid: documents.templateUuid })
      .from(documents)
      .where(eq(documents.uuid, documentUuid));
    if (!doc) return res.status(404).json({ message: 'Document not found' });

    const [tableDef] = await db
      .select()
      .from(templateTables)
      .where(
        and(
          eq(templateTables.templateUuid, doc.templateUuid),
          eq(templateTables.name, tableName),
        ),
      );
    if (!tableDef || !(tableDef.columns as TableColumn[])?.length) {
      return res.status(404).json({ message: 'Table definition not found' });
    }

    const columns = tableDef.columns as TableColumn[];
    const parsedRows = await parseExcelRows(req.file.buffer, columns);

    // Upsert rows
    const existing = await db
      .select({ id: documentTableData.id })
      .from(documentTableData)
      .where(
        and(
          eq(documentTableData.documentUuid, documentUuid),
          eq(documentTableData.tableName, tableName),
        ),
      );

    if (existing.length > 0) {
      await db
        .update(documentTableData)
        .set({ rows: parsedRows, updatedAt: new Date() })
        .where(
          and(
            eq(documentTableData.documentUuid, documentUuid),
            eq(documentTableData.tableName, tableName),
          ),
        );
    } else {
      await db
        .insert(documentTableData)
        .values({ documentUuid, tableName, rows: parsedRows });
    }

    documentGeneratorCache.invalidate(documentUuid);
    res.json({ rows: parsedRows, count: parsedRows.length });
  } catch (err: any) {
    console.error('[uploadDocumentTableExcel]', err);
    const status = err.statusCode === 400 || err.message?.includes('dữ liệu') || err.message?.includes('thiếu cột') ? 400 : 500;
    res
      .status(status)
      .json({
        message: err.message || 'Failed to parse Excel',
        ...(err.missingColumns ? { missingColumns: err.missingColumns, expectedColumns: err.expectedColumns } : {}),
      });
  }
}

// ─── Document table data routes ───────────────────────────────────────────────

/**
 * GET /api/documents/:uuid/tables/:name
 * Returns row data for a specific table in a document.
 * If no data saved yet, returns empty rows array.
 */
export async function getDocumentTableData(req: Request, res: Response) {
  try {
    const { uuid: documentUuid, name: tableName } = req.params;

    // Verify document exists
    const [doc] = await db
      .select({ uuid: documents.uuid, templateUuid: documents.templateUuid })
      .from(documents)
      .where(eq(documents.uuid, documentUuid));

    if (!doc) {
      return res.status(404).json({ message: 'Document not found' });
    }

    // Get table definition for column info
    const [tableDef] = await db
      .select()
      .from(templateTables)
      .where(and(
        eq(templateTables.templateUuid, doc.templateUuid),
        eq(templateTables.name, tableName),
      ));

    // Get saved rows (if any)
    const [dataRow] = await db
      .select()
      .from(documentTableData)
      .where(and(
        eq(documentTableData.documentUuid, documentUuid),
        eq(documentTableData.tableName, tableName),
      ));

    res.json({
      tableName,
      label: tableDef?.label ?? tableName,
      columns: tableDef?.columns ?? [],
      rows: dataRow?.rows ?? [],
    });
  } catch (err) {
    console.error('[getDocumentTableData]', err);
    res.status(500).json({ message: 'Failed to fetch table data', error: String(err) });
  }
}

/**
 * PUT /api/documents/:uuid/tables/:name
 * Save (full replace) row data for a specific table in a document.
 * Body: { rows: Array<Record<string, string>> }
 */
export async function saveDocumentTableData(req: Request, res: Response) {
  try {
    const { uuid: documentUuid, name: tableName } = req.params;
    const { rows } = req.body;

    if (!Array.isArray(rows)) {
      return res.status(400).json({ message: 'rows must be an array' });
    }

    // Verify document exists
    const [doc] = await db
      .select({ uuid: documents.uuid })
      .from(documents)
      .where(eq(documents.uuid, documentUuid));

    if (!doc) {
      return res.status(404).json({ message: 'Document not found' });
    }

    // Upsert: insert or update existing row
    const existing = await db
      .select({ id: documentTableData.id })
      .from(documentTableData)
      .where(and(
        eq(documentTableData.documentUuid, documentUuid),
        eq(documentTableData.tableName, tableName),
      ));

    let result;
    if (existing.length > 0) {
      [result] = await db
        .update(documentTableData)
        .set({ rows, updatedAt: new Date() })
        .where(and(
          eq(documentTableData.documentUuid, documentUuid),
          eq(documentTableData.tableName, tableName),
        ))
        .returning();
    } else {
      [result] = await db
        .insert(documentTableData)
        .values({ documentUuid, tableName, rows })
        .returning();
    }

    // Invalidate document generator cache so next download picks up new rows
    documentGeneratorCache.invalidate(documentUuid);

    res.json(result);
  } catch (err) {
    console.error('[saveDocumentTableData]', err);
    res.status(500).json({ message: 'Failed to save table data', error: String(err) });
  }
}
