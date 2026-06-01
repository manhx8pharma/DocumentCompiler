/**
 * OOXML table builder and document.xml injector.
 *
 * Two injection strategies (per marker):
 *
 * 1. PRE-FORMATTED TABLE (preferred):
 *    If the template has a Word table immediately after the <<TABLE_NAME>> marker paragraph,
 *    that table's design (column widths, fonts, borders, shading...) is preserved.
 *    The app only fills data into it: keeps row[0] (header) as-is, clones row[1] (template row)
 *    for each data row, then removes the marker paragraph.
 *
 * 2. GENERATED TABLE (fallback):
 *    If no pre-formatted table is found after the marker, or the table has < 2 rows,
 *    the original buildTableXml() behaviour is used — generates a plain styled table.
 *
 * All existing callers are unaffected: same function signature, same fallback output.
 */

import PizZip from 'pizzip';
import { hasTableMarkers, findMarkerParagraphXml, parseTableMarkersFromXml } from './table-marker';

export interface TableColumn {
  name: string;
  label: string;
}

export type TableRow = Record<string, string>;

export interface TableData {
  columns: TableColumn[];
  rows: TableRow[];
}

// ─── XML utilities ────────────────────────────────────────────────────────────

/**
 * Escape special XML characters in a cell value.
 */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Find the position immediately after the closing tag of an element,
 * starting from startPos (where the opening tag begins).
 * Handles nesting (e.g. <w:tbl> inside <w:tc> inside <w:tbl>).
 * Returns -1 if the closing tag is not found.
 */
function findTagEnd(xml: string, startPos: number, tagName: string): number {
  const openTag = `<${tagName}`;
  const closeTag = `</${tagName}>`;
  let depth = 0;
  let pos = startPos;

  while (pos < xml.length) {
    const nextOpen = xml.indexOf(openTag, pos);
    const nextClose = xml.indexOf(closeTag, pos);

    if (nextClose === -1) return -1;

    if (nextOpen !== -1 && nextOpen < nextClose) {
      // Confirm it's actually this tag (not e.g. <w:tblPr> when searching for <w:tbl>)
      const charAfter = xml[nextOpen + openTag.length];
      if (charAfter === '>' || charAfter === ' ' || charAfter === '\n' || charAfter === '\r') {
        depth++;
      }
      pos = nextOpen + openTag.length;
    } else {
      depth--;
      pos = nextClose + closeTag.length;
      if (depth === 0) return pos;
    }
  }
  return -1;
}

// ─── Pre-formatted table detection ───────────────────────────────────────────

/**
 * Find the <w:tbl> that sits immediately after the marker paragraph in document XML.
 *
 * "Immediately after" means: no content-bearing <w:p> (paragraph with text) appears
 * between the paragraph's </w:p> and the table's <w:tbl>.
 * Empty/whitespace paragraphs (Word often inserts them) are allowed.
 *
 * Returns the full <w:tbl>…</w:tbl> string, or null if not found.
 */
function findNextTableAfterMarker(xml: string, paragraphXml: string): string | null {
  const pIdx = xml.indexOf(paragraphXml);
  if (pIdx === -1) return null;

  const afterParagraph = xml.substring(pIdx + paragraphXml.length);

  const tblStart = afterParagraph.indexOf('<w:tbl');
  if (tblStart === -1) return null;

  // Verify the char after <w:tbl is a valid tag boundary
  const charAfterTag = afterParagraph[tblStart + 6];
  if (charAfterTag !== '>' && charAfterTag !== ' ' && charAfterTag !== '\n' && charAfterTag !== '\r') {
    return null;
  }

  // Check nothing with actual text content sits between the paragraph and the table
  const between = afterParagraph.substring(0, tblStart);
  // If there's a text-bearing <w:t> tag between them → not immediately after
  if (/<w:t[^/][^>]*>[^<]+<\/w:t>/.test(between)) return null;
  // If another table comes before this one → not our table
  if (between.includes('<w:tbl')) return null;

  const tblEnd = findTagEnd(afterParagraph, tblStart, 'w:tbl');
  if (tblEnd === -1) return null;

  return afterParagraph.substring(tblStart, tblEnd);
}

// ─── Row / cell extraction ────────────────────────────────────────────────────

/**
 * Extract all <w:tr>…</w:tr> elements from a table XML string.
 * Uses depth tracking to handle nested tables correctly.
 */
function extractRows(tableXml: string): string[] {
  const rows: string[] = [];
  let pos = 0;

  while (pos < tableXml.length) {
    const trStart = tableXml.indexOf('<w:tr', pos);
    if (trStart === -1) break;

    // Confirm <w:tr> not <w:trPr> or similar
    const c = tableXml[trStart + 5];
    if (c !== '>' && c !== ' ' && c !== '\n' && c !== '\r') {
      pos = trStart + 1;
      continue;
    }

    const trEnd = findTagEnd(tableXml, trStart, 'w:tr');
    if (trEnd === -1) break;

    rows.push(tableXml.substring(trStart, trEnd));
    pos = trEnd;
  }

  return rows;
}

/**
 * Extract all <w:tc>…</w:tc> cells from a row XML string.
 * Uses depth tracking to handle nested tables correctly.
 */
function extractCells(rowXml: string): string[] {
  const cells: string[] = [];
  let pos = 0;

  while (pos < rowXml.length) {
    const tcStart = rowXml.indexOf('<w:tc>', pos);
    if (tcStart === -1) break;

    const tcEnd = findTagEnd(rowXml, tcStart, 'w:tc');
    if (tcEnd === -1) break;

    cells.push(rowXml.substring(tcStart, tcEnd));
    pos = tcEnd;
  }

  return cells;
}

/**
 * Extract everything between the opening <w:tbl> tag and the first <w:tr>.
 * This captures <w:tblPr> and <w:tblGrid> — the table's formatting definition.
 */
function extractTablePreamble(tableXml: string): string {
  const openTagEnd = tableXml.indexOf('>') + 1;
  const firstTr = tableXml.search(/<w:tr[\s>]/);
  if (firstTr === -1) return tableXml.substring(openTagEnd);
  return tableXml.substring(openTagEnd, firstTr);
}

// ─── Cell / row filling ───────────────────────────────────────────────────────

/**
 * Replace the text content of a <w:tc> cell while preserving all formatting:
 * - <w:tcPr> (cell properties: width, borders, shading, merge…)
 * - <w:pPr>  (paragraph properties: alignment, spacing…)
 * - <w:rPr>  (run properties from first run: font, size, bold, color…)
 *
 * Multiple runs are collapsed into a single run so Word doesn't fragment the text.
 */
function replaceCellContent(cellXml: string, value: string): string {
  const tcPr = (cellXml.match(/<w:tcPr>[\s\S]*?<\/w:tcPr>/) ?? [])[0] ?? '';
  const pPr  = (cellXml.match(/<w:pPr>[\s\S]*?<\/w:pPr>/)  ?? [])[0] ?? '';
  const rPr  = (cellXml.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)  ?? [])[0] ?? '';

  const escaped = escapeXml(value);
  const runXml = value
    ? `<w:r>${rPr}<w:t xml:space="preserve">${escaped}</w:t></w:r>`
    : `<w:r>${rPr}<w:t/></w:r>`;

  return `<w:tc>${tcPr}<w:p>${pPr}${runXml}</w:p></w:tc>`;
}

/**
 * Clone the template row and fill each cell with the corresponding column value.
 * Preserves <w:trPr> (row height, header-repeat flag, etc.).
 * Falls back to a plain generated cell for any column that has no corresponding template cell.
 */
function fillTemplateRow(templateRowXml: string, columns: TableColumn[], rowData: TableRow): string {
  const trPr = (templateRowXml.match(/<w:trPr>[\s\S]*?<\/w:trPr>/) ?? [])[0] ?? '';
  const cells = extractCells(templateRowXml);

  const filledCells = columns.map((col, i) => {
    const value = rowData[col.name] ?? '';
    if (i < cells.length) {
      return replaceCellContent(cells[i], value);
    }
    // Template has fewer cells than columns — generate a plain fallback cell
    return buildCell(value);
  });

  return `<w:tr>${trPr}${filledCells.join('')}</w:tr>`;
}

// ─── Generated-table fallback (original logic, unchanged) ────────────────────

/**
 * Build OOXML for a single table cell <w:tc>.
 */
function buildCell(text: string, bold = false, shading?: string): string {
  const shadingXml = shading
    ? `<w:shd w:val="clear" w:color="auto" w:fill="${shading}"/>`
    : '';
  const boldXml = bold ? '<w:b/>' : '';
  return `<w:tc>
      <w:tcPr>${shadingXml}</w:tcPr>
      <w:p>
        <w:pPr><w:jc w:val="left"/></w:pPr>
        <w:r>
          <w:rPr>${boldXml}</w:rPr>
          <w:t xml:space="preserve">${escapeXml(text)}</w:t>
        </w:r>
      </w:p>
    </w:tc>`;
}

/**
 * Build a complete OOXML <w:tbl> string for the given columns and rows.
 * Used as fallback when no pre-formatted table is found in the template.
 * - Header row: bold, light blue-grey shading (#D9E1F2)
 * - Border: single black lines, 4pt
 * - If rows is empty: generates one empty data row to keep the table visible
 */
export function buildTableXml(columns: TableColumn[], rows: TableRow[]): string {
  if (columns.length === 0) return '';

  const borderDef = `
    <w:top w:val="single" w:sz="4" w:space="0" w:color="000000"/>
    <w:left w:val="single" w:sz="4" w:space="0" w:color="000000"/>
    <w:bottom w:val="single" w:sz="4" w:space="0" w:color="000000"/>
    <w:right w:val="single" w:sz="4" w:space="0" w:color="000000"/>
    <w:insideH w:val="single" w:sz="4" w:space="0" w:color="000000"/>
    <w:insideV w:val="single" w:sz="4" w:space="0" w:color="000000"/>
  `;

  const tblPr = `<w:tblPr>
    <w:tblStyle w:val="TableGrid"/>
    <w:tblW w:w="0" w:type="auto"/>
    <w:tblBorders>${borderDef}</w:tblBorders>
  </w:tblPr>`;

  const headerCells = columns.map(col => buildCell(col.label || col.name, true, 'D9E1F2')).join('');
  const headerRow = `<w:tr>${headerCells}</w:tr>`;

  const dataRowsXml = (rows.length > 0 ? rows : [{}]).map(row => {
    const cells = columns.map(col => buildCell(row[col.name] ?? '')).join('');
    return `<w:tr>${cells}</w:tr>`;
  }).join('');

  return `<w:tbl>${tblPr}${headerRow}${dataRowsXml}</w:tbl>`;
}

// ─── Main injection entry point ───────────────────────────────────────────────

/**
 * Main injection function.
 *
 * For each <<TABLE_NAME>> marker found in word/document.xml:
 *
 *   Strategy A — Pre-formatted table (preferred):
 *     Requires: a <w:tbl> immediately after the marker paragraph with ≥ 2 rows.
 *     Effect:   marker paragraph removed; header row (row[0]) kept as-is;
 *               template row (row[1]) cloned for each data row (preserving all formatting).
 *               If no data rows: template row kept empty.
 *
 *   Strategy B — Generated table (fallback):
 *     Used when strategy A conditions are not met or an error occurs.
 *     Effect:   marker paragraph replaced with a plain auto-styled table (original behaviour).
 *
 * @param zip          PizZip instance (not yet rendered by docxtemplater)
 * @param tableDataMap Record keyed by TABLE_NAME → { columns, rows }
 */
export function injectTablesIntoZip(
  zip: PizZip,
  tableDataMap: Record<string, TableData>
): PizZip {
  const docFile = zip.files['word/document.xml'];
  if (!docFile) return zip;

  let xml = docFile.asText();

  if (!hasTableMarkers(xml)) return zip;

  const markers = parseTableMarkersFromXml(xml);
  if (markers.length === 0) return zip;

  let modified = false;

  for (const marker of markers) {
    const data = tableDataMap[marker.name];
    const columns = (data?.columns && data.columns.length > 0) ? data.columns : marker.columns;
    const rows = data?.rows ?? [];

    if (columns.length === 0) continue;

    const paragraphXml = findMarkerParagraphXml(xml, marker.name);
    if (!paragraphXml) continue;

    let injected = false;

    // ── Strategy A: fill data into the pre-formatted table ──────────────────
    try {
      const preformattedTable = findNextTableAfterMarker(xml, paragraphXml);

      if (preformattedTable) {
        const tableRows = extractRows(preformattedTable);

        if (tableRows.length >= 2) {
          const headerRow   = tableRows[0];
          const templateRow = tableRows[1];
          const preamble    = extractTablePreamble(preformattedTable);

          const dataRowsXml = rows.length > 0
            ? rows.map(row => fillTemplateRow(templateRow, columns, row)).join('')
            : templateRow; // no data → keep the empty template row as-is

          const newTable = `<w:tbl>${preamble}${headerRow}${dataRowsXml}</w:tbl>`;

          // Remove marker paragraph; replace the pre-formatted table with filled version
          xml = xml.replace(paragraphXml, '');
          xml = xml.replace(preformattedTable, () => newTable);
          modified = true;
          injected = true;
          console.log(`[TableInjector] ${marker.name}: pre-formatted table (${rows.length} data rows)`);
        } else {
          console.log(`[TableInjector] ${marker.name}: pre-formatted table found but has < 2 rows — falling back`);
        }
      }
    } catch (err: any) {
      console.warn(`[TableInjector] ${marker.name}: pre-formatted injection error (${err?.message}) — falling back`);
    }

    // ── Strategy B: generate table from scratch (original behaviour) ─────────
    if (!injected) {
      const tableXml = buildTableXml(columns, rows);
      xml = xml.replace(paragraphXml, tableXml);
      modified = true;
      console.log(`[TableInjector] ${marker.name}: generated table fallback (${rows.length} data rows)`);
    }
  }

  if (modified) {
    zip.file('word/document.xml', xml);
  }

  return zip;
}
