/**
 * Client-side Excel export utility.
 * Lazy-loads the `xlsx` package to avoid bloating the initial bundle.
 *
 * Exports a workbook that mirrors the server-side format
 * (header row + data rows + hidden _ColMap sheet) so re-importing the
 * exported file back works without manual column remapping.
 */

export interface ExcelColumn {
  name: string;
  label: string;
}

/**
 * Generates and triggers download of an .xlsx file from in-memory rows.
 *
 * @param columns - Column definitions (same shape as templateTables.columns)
 * @param rows    - Array of row objects keyed by column.name
 * @param label   - Human-readable label used as sheet name and filename prefix
 */
export async function exportRowsToExcel(
  columns: ExcelColumn[],
  rows: Array<Record<string, string>>,
  label: string,
): Promise<void> {
  const XLSX = await import('xlsx');

  const wb = XLSX.utils.book_new();

  // Header row uses column labels (same as server buildExcelWorkbook)
  const headerRow = columns.map((c) => c.label || c.name);

  // Data rows — one array per row, aligned to column order
  const dataRows =
    rows.length > 0
      ? rows.map((row) => columns.map((c) => row[c.name] ?? ''))
      : [columns.map(() => '')]; // blank row when no data

  const ws = XLSX.utils.aoa_to_sheet([headerRow, ...dataRows]);
  ws['!cols'] = columns.map(() => ({ wch: 22 }));

  // Hidden _ColMap sheet for accurate label→name resolution on re-import
  const mapSheet = XLSX.utils.aoa_to_sheet([
    ['label', 'name'],
    ...columns.map((c) => [c.label || c.name, c.name]),
  ]);

  const safeSheetName = label.slice(0, 31);
  XLSX.utils.book_append_sheet(wb, ws, safeSheetName);
  XLSX.utils.book_append_sheet(wb, mapSheet, '_ColMap');

  // Filename: label_YYYY-MM-DD_HHmm.xlsx
  const now = new Date();
  const datePart = now
    .toISOString()
    .slice(0, 16)
    .replace('T', '_')
    .replace(':', '');
  const filename = `${label}_${datePart}.xlsx`;

  const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
