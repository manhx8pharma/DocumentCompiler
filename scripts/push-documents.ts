/**
 * push-documents.ts
 *
 * Tự động tạo tài liệu hàng loạt từ file Excel.
 *
 * Cách dùng:
 *   npx tsx scripts/push-documents.ts --template <UUID> --file <đường_dẫn.xlsx> [--api <URL>]
 *
 * Cấu trúc Excel:
 *   - Cột "Chon"      : gõ x vào dòng muốn xử lý
 *   - Cột "TenTaiLieu": tên của tài liệu sẽ được tạo (nếu không có, script tự đặt tên)
 *   - Cột "TrangThai" : script tự ghi kết quả (done / lỗi: ...)
 *   - Các cột còn lại : tên trường khớp với placeholder {{...}} trong template
 *
 * Ví dụ:
 *   npx tsx scripts/push-documents.ts --template abc-123 --file ./data.xlsx
 *   npx tsx scripts/push-documents.ts --template abc-123 --file ./data.xlsx --api https://my-app.replit.app
 */

import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

const CHON_COL = 'Chon';
const TRANG_THAI_COL = 'TrangThai';
const TEN_TAI_LIEU_COL = 'TenTaiLieu';

function parseArgs() {
  const args = process.argv.slice(2);
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') && args[i + 1] && !args[i + 1].startsWith('--')) {
      result[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }
  return result;
}

function printHelp() {
  console.log(`
Cách dùng:
  npx tsx scripts/push-documents.ts --template <UUID> --file <file.xlsx> [--api <URL>]

Tham số:
  --template  UUID của template (bắt buộc)
  --file      Đường dẫn file Excel (bắt buộc)
  --api       URL gốc của API (mặc định: http://localhost:5000)

Cấu trúc file Excel:
  Cột "Chon"       : gõ x vào dòng muốn xử lý
  Cột "TenTaiLieu" : tên tài liệu (tùy chọn, tự đặt nếu không có)
  Cột "TrangThai"  : script tự ghi kết quả
  Các cột còn lại  : tên trường khớp placeholder {{...}} trong template

Ví dụ:
  npx tsx scripts/push-documents.ts --template 32889967-c384-4df2-bc91 --file ./data.xlsx
  `);
}

async function fetchTemplateFields(apiUrl: string, templateUuid: string): Promise<string[]> {
  const res = await fetch(`${apiUrl}/api/templates/${templateUuid}`);
  if (!res.ok) {
    throw new Error(`Không tìm thấy template với UUID: ${templateUuid} (HTTP ${res.status})`);
  }
  const data = await res.json() as { fields?: Array<{ name: string }> };
  return (data.fields || []).map((f) => f.name);
}

async function createDocument(
  apiUrl: string,
  templateUuid: string,
  docName: string,
  fieldValues: Record<string, string>
): Promise<{ uuid: string }> {
  const res = await fetch(`${apiUrl}/api/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ templateUuid, name: docName, fieldValues }),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({})) as { message?: string };
    throw new Error(errBody.message || `HTTP ${res.status}`);
  }
  return res.json() as Promise<{ uuid: string }>;
}

function saveWorkbook(wb: XLSX.WorkBook, filePath: string) {
  const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  fs.writeFileSync(filePath, out);
}

async function main() {
  const args = parseArgs();

  if (!args.template || !args.file) {
    printHelp();
    process.exit(1);
  }

  const templateUuid = args.template;
  const filePath = path.resolve(args.file);
  const apiUrl = (args.api || 'http://localhost:5000').replace(/\/$/, '');

  if (!fs.existsSync(filePath)) {
    console.error(`❌ Không tìm thấy file: ${filePath}`);
    process.exit(1);
  }

  console.log(`\n📋 Template UUID : ${templateUuid}`);
  console.log(`📁 File Excel    : ${filePath}`);
  console.log(`🌐 API URL       : ${apiUrl}\n`);

  console.log('🔍 Đang lấy danh sách trường của template...');
  let templateFields: string[];
  try {
    templateFields = await fetchTemplateFields(apiUrl, templateUuid);
    console.log(`✅ Template có ${templateFields.length} trường: ${templateFields.join(', ')}\n`);
  } catch (err) {
    console.error(`❌ ${(err as Error).message}`);
    process.exit(1);
  }

  const fileBuffer = fs.readFileSync(filePath);
  const wb = XLSX.read(fileBuffer, { type: 'buffer' });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' });

  if (rows.length === 0) {
    console.log('⚠️  File Excel không có dữ liệu.');
    process.exit(0);
  }

  const columns = Object.keys(rows[0]);
  const hasChon = columns.includes(CHON_COL);
  const hasTrangThai = columns.includes(TRANG_THAI_COL);

  if (!hasChon) {
    console.error(`❌ File Excel thiếu cột "${CHON_COL}". Hãy thêm cột này và gõ x vào các dòng muốn xử lý.`);
    process.exit(1);
  }

  const fieldColumns = columns.filter(
    (c) => c !== CHON_COL && c !== TRANG_THAI_COL && c !== TEN_TAI_LIEU_COL
  );

  console.log(`📊 File Excel có ${rows.length} dòng dữ liệu`);

  let countSelected = 0;
  let countDone = 0;
  let countSkipped = 0;
  let countError = 0;
  let countAlreadyDone = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2;
    const chonVal = String(row[CHON_COL] || '').trim().toLowerCase();
    const trangThai = String(row[TRANG_THAI_COL] || '').trim().toLowerCase();

    if (chonVal !== 'x') {
      countSkipped++;
      continue;
    }

    if (trangThai === 'done') {
      console.log(`  Dòng ${rowNum}: ⏭️  Bỏ qua (đã done)`);
      countAlreadyDone++;
      continue;
    }

    countSelected++;

    const docName =
      String(row[TEN_TAI_LIEU_COL] || '').trim() ||
      `Tài liệu ${rowNum}`;

    const fieldValues: Record<string, string> = {};
    for (const col of fieldColumns) {
      fieldValues[col] = String(row[col] || '');
    }

    console.log(`  Dòng ${rowNum}: ⏳ Đang tạo "${docName}"...`);

    const cellRef = updateTrangThaiInSheet(ws, rows, i, 'dang_xu_ly');
    saveWorkbook(wb, filePath);

    try {
      const doc = await createDocument(apiUrl, templateUuid, docName, fieldValues);
      updateTrangThaiInSheet(ws, rows, i, 'done');
      saveWorkbook(wb, filePath);
      console.log(`  Dòng ${rowNum}: ✅ Tạo thành công (UUID: ${doc.uuid})`);
      countDone++;
    } catch (err) {
      const errMsg = `lỗi: ${(err as Error).message}`.slice(0, 100);
      updateTrangThaiInSheet(ws, rows, i, errMsg);
      saveWorkbook(wb, filePath);
      console.log(`  Dòng ${rowNum}: ❌ Thất bại — ${errMsg}`);
      countError++;
    }
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Kết quả:
   ✅ Tạo thành công : ${countDone}
   ❌ Thất bại       : ${countError}
   ⏭️  Đã done trước  : ${countAlreadyDone}
   ⏩ Không có dấu x : ${countSkipped}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💾 File Excel đã được cập nhật cột TrangThai.
`);
}

function updateTrangThaiInSheet(
  ws: XLSX.WorkSheet,
  rows: Record<string, string>[],
  rowIndex: number,
  value: string
): void {
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  const headerRow = 0;
  const dataRow = rowIndex + 1;

  const firstRow = rows[0];
  const colNames = Object.keys(firstRow);
  const trangThaiColIndex = colNames.indexOf(TRANG_THAI_COL);

  if (trangThaiColIndex === -1) {
    const newColIndex = range.e.c + 1;
    const headerCell = XLSX.utils.encode_cell({ r: headerRow, c: newColIndex });
    ws[headerCell] = { t: 's', v: TRANG_THAI_COL };

    const dataCell = XLSX.utils.encode_cell({ r: dataRow, c: newColIndex });
    ws[dataCell] = { t: 's', v: value };

    if (range.e.c < newColIndex) range.e.c = newColIndex;
    ws['!ref'] = XLSX.utils.encode_range(range);
  } else {
    const dataCell = XLSX.utils.encode_cell({ r: dataRow, c: trangThaiColIndex });
    ws[dataCell] = { t: 's', v: value };
  }

  rows[rowIndex][TRANG_THAI_COL] = value;
}

main().catch((err) => {
  console.error('❌ Lỗi không mong đợi:', err);
  process.exit(1);
});
