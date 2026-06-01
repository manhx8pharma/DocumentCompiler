# DocCompile - Document Generation System

## Overview

DocCompile is a comprehensive document management and generation system built with React and Node.js. It allows users to create and manage document templates, extract and define template fields (including advanced types like checklists, default values, and repeatable chorus blocks), and generate documents individually or in bulk. The system supports Microsoft Word documents and Excel-based batch processing, streamlining the document creation workflow from template upload to final document generation. Its business vision is to provide an efficient, robust solution for automated document creation, catering to various industries requiring repetitive document generation.

## User Preferences

Preferred communication style: Simple, everyday language.

---

## Hướng dẫn soạn Template

Phần này mô tả cách đặt placeholder trong file `.docx` để DocCompile nhận diện và xử lý tự động khi upload.

---

### 1. Field thông thường (Regular Fields)

Đặt tên field trong dấu ngoặc kép đôi `{{ }}`. Khi tạo văn bản, người dùng sẽ nhập giá trị cho từng field này.

#### Cú pháp

| Loại | Cú pháp trong docx | Ví dụ |
|---|---|---|
| Field thường | `{{tenField}}` | `{{ho_ten}}` |
| Field có giá trị mặc định | `{{tenField='giá trị mặc định'}}` hoặc `{{tenField=giaTri}}` | `{{so_luong='10'}}` |
| Field checklist (chọn nhiều) | `{{tenField['Lựa chọn 1']['Lựa chọn 2']['Lựa chọn 3']}}` | `{{ket_qua['Đạt']['Không đạt']['Cần xem xét']}}` |
| Field checklist + mặc định (legacy) | `{{tenField\|Opt1\|Opt2}}` hoặc `{{tenField=Mac dinh\|Opt1\|Opt2}}` | `{{loai_hs\|A\|B\|C}}` |

#### Quy tắc đặt tên field
- Tên field chỉ dùng chữ cái, số, dấu gạch dưới (`_`). **Không dùng dấu cách hay ký tự đặc biệt.**
- Cùng một tên field có thể xuất hiện nhiều lần trong docx → tất cả sẽ được thay thế bằng cùng một giá trị.
- Hệ thống tự nhận diện field khi upload template — không cần khai báo thủ công.

#### Ví dụ đoạn docx
```
Họ và tên: {{ho_ten}}
Ngày sinh: {{ngay_sinh}}
Kết quả: {{ket_qua['Đạt']['Không đạt']}}
Số lượng mặc định: {{so_luong='10'}}
```

---

### 2. Chorus Block — Đoạn nội dung lặp lại

Chorus Block là các đoạn nội dung **có thể thêm nhiều lần** trong một văn bản (ví dụ: danh sách ý kiến, nhiều kết quả kiểm tra, từng mục trong biên bản...). Người dùng có thể thêm/xóa/sửa từng "mục" (instance) trực tiếp trên giao diện khi tạo văn bản.

#### Cú pháp khai báo trong docx

```
{%#TEN_BLOCK%}
Nội dung lặp lại, có thể dùng biến: {%tenBien%}
{%/TEN_BLOCK%}
```

- `{%#TEN_BLOCK%}` — mở block (phải đứng đầu một đoạn văn riêng)
- `{%/TEN_BLOCK%}` — đóng block (phải đứng đầu một đoạn văn riêng)
- `{%tenBien%}` — biến bên trong block (thay bằng giá trị của từng mục)

#### Quy tắc đặt tên
- Tên block: chữ in hoa, số, dấu gạch dưới — ví dụ `NOI_DUNG_TD`, `KET_QUA_KIEM_TRA`
- Tên biến bên trong: chữ thường, số, dấu gạch dưới — ví dụ `{%noi_dung%}`, `{%ten_nguoi%}`

#### Ví dụ đoạn docx hoàn chỉnh

```
BIÊN BẢN HỌP

Thành phần tham dự:
{{thanh_phan}}

Nội dung thảo luận:
{%#NOI_DUNG_TD%}
- Vấn đề: {%van_de%}
  Ý kiến: {%y_kien%}
{%/NOI_DUNG_TD%}

Kết quả biểu quyết:
{%#KET_QUA%}
  Nội dung biểu quyết: {%noi_dung%}
  Số phiếu thuận: {%phieu_thuan%} / {%tong_so%}
{%/KET_QUA%}
```

#### Cách dùng trên giao diện
1. Upload template có Chorus Block → hệ thống tự phát hiện và lưu vào DB.
2. Khi tạo/chỉnh sửa văn bản, mỗi block hiện thị một panel màu tím với nút **"Thêm mục"**.
3. Bấm **"Thêm mục"** để thêm một instance mới, điền dữ liệu cho các biến bên trong.
4. Có thể thêm không giới hạn số mục, kéo để xóa từng mục.
5. Khi tải văn bản về, mỗi mục sẽ được render thành một đoạn lặp lại trong file Word.

#### Giới hạn quan trọng
- **Template có Chorus Block không thể dùng tính năng Batch Excel** (tạo hàng loạt). Phải điền từng văn bản riêng lẻ.
- Biến bên trong block (`{%varName%}`) chỉ có tác dụng bên trong block đó, không dùng được ngoài block.
- Block phải có thẻ mở và thẻ đóng đúng cặp trong docx.

#### Lưu ý khi Replace File
- Khi thay file docx mới (tính năng Replace File), **tên các block phải giống hệt** template cũ.
- Thêm/xóa block hoặc đổi tên block sẽ báo lỗi validation.

---

### 3. Table động — Bảng dữ liệu inject vào docx

Table động cho phép nhúng một bảng với **nhiều dòng dữ liệu** vào file Word khi xuất. Dữ liệu được nhập qua giao diện bảng tính hoặc import từ Excel.

#### Cú pháp khai báo marker trong docx

```
<<TEN_BANG:cot1,cot2,cot3>>
```

- `TEN_BANG`: tên bảng, chữ in hoa, dấu gạch dưới
- `cot1,cot2,...`: danh sách code name các cột (tùy chọn — có thể bỏ qua nếu định nghĩa cột qua UI)

Marker phải **đứng trên một dòng riêng** trong docx (một đoạn văn riêng).

#### Ví dụ

```
Danh sách người tham dự:
<<DANH_SACH_HOP:TT,ho_ten,don_vi,ky_ten>>
```

#### Hai chiến lược render (tự động)

**Chiến lược A — Pre-formatted Table (khuyến nghị):**
- Trong file docx, **đặt một bảng Word ngay sau marker**. Bảng này có thể được định dạng sẵn (màu sắc, font, độ rộng cột, border...).
- App giữ nguyên toàn bộ định dạng dòng header (dòng 1), clone dòng mẫu (dòng 2) cho mỗi dòng dữ liệu.
- **Yêu cầu**: bảng sau marker phải có ít nhất 2 dòng (1 header + 1 dòng mẫu).

**Chiến lược B — Generated Table (fallback):**
- Nếu không có bảng ngay sau marker (hoặc bảng < 2 dòng), app tự tạo bảng mới với định dạng đơn giản (border đen, header nền xanh nhạt).
- Dùng khi muốn bảng được tạo hoàn toàn tự động không cần template bảng trong docx.

#### Định nghĩa cột qua UI

Ngoài việc liệt kê cột trong marker, bạn có thể **thêm/sửa/xóa cột trong trang quản lý template** (tab "Định nghĩa cột bảng"). Khi đã có định nghĩa cột trong DB, **cột từ DB được ưu tiên hơn** danh sách cột trong marker docx.

Mỗi cột có:
- **Code name**: tên nội bộ dùng trong marker và khi lưu dữ liệu
- **Nhãn hiển thị**: tên hiện ra trên giao diện và header bảng Excel

#### Nhập dữ liệu bảng khi tạo văn bản

1. Trên trang tạo/chỉnh sửa văn bản, nhấn **"Nhập bảng [TÊN BẢNG]"** để mở dialog nhập liệu.
2. Giao diện dạng bảng tính: thêm dòng, chỉnh sửa từng ô, kéo resize cột.
3. **Tải Excel mẫu**: tải file Excel với các cột đúng định nghĩa để điền offline.
4. **Import Excel**: upload file Excel đã điền để nhập hàng loạt dữ liệu vào bảng.
5. Lưu → dữ liệu được lưu vào DB, inject vào file Word khi tải xuống.

#### Lưu ý khi thêm cột mới

Khi thêm cột mới (ví dụ `ma_hs`) qua UI nhưng **file docx chưa có cột đó trong bảng định dạng sẵn**:

- Dữ liệu cột mới **được lưu vào DB và điền vào văn bản**.
- Tuy nhiên, **dòng header** của bảng trong docx **giữ nguyên** (không tự thêm tên cột mới vào header).
- Các dòng dữ liệu sẽ có ô thừa ở cuối (ô plain, không định dạng) cho cột mới.
- Kết quả: bảng bị lệch header so với dữ liệu.

**→ Giải pháp**: Cập nhật file docx (thêm cột vào bảng định dạng và vào marker), rồi dùng **Replace File** để thay file mới lên. Replace File chỉ kiểm tra tên field `{{...}}` và tên marker `<<...>>`, không kiểm tra danh sách cột bên trong marker → cho phép cập nhật cột.

#### Giới hạn
- Batch Excel (tạo hàng loạt) **không hỗ trợ** template có table field (row_group). Phải tạo từng văn bản.
- Một template có thể có nhiều bảng (nhiều marker khác nhau).

---

## System Architecture

### Frontend
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite
- **Styling**: Tailwind CSS with shadcn/ui
- **State Management**: TanStack Query
- **Routing**: Wouter
- **Form Handling**: React Hook Form with Zod validation

### Backend
- **Framework**: Node.js with Express.js
- **Language**: TypeScript
- **ORM**: Drizzle ORM for PostgreSQL
- **File Uploads**: Multer
- **Document Processing**: Docxtemplater, JSZip, Mammoth

### Database
- **Type**: PostgreSQL
- **ORM**: Drizzle ORM
- **Schema**: Tables for templates, fields, documents, batch sessions, batch documents, and template tables/blocks, utilizing UUIDs for primary keys and enums for categorization and status tracking.

### Core Features
- **Template Management**: Uploads (.docx, .doc), automatic field extraction (e.g., `{{fieldName}}`, `{{field='default'}}`, `{{field['opt1']['opt2']}}`), categorization, HTML preview generation, and Excel template export for batch data entry.
- **Template Visibility Management**: Hide/show templates using archive/unarchive functionality. Hidden templates are excluded from main list but accessible via dedicated dialog. API: `PUT /api/templates/:uuid/archive`, `PUT /api/templates/:uuid/unarchive`. Frontend: EyeOff button on cards, "Hiện template ẩn" dialog with unhide buttons.
- **Configurable Pagination**: Server-side pagination with configurable page sizes (12/24/48/96 items per page). Stats include total/active/archived counts. Filtered total count for accurate page calculations.
- **Advanced Field Types**: Supports checklist fields (multi-select) and default values with both new bracket-quote syntax and legacy pipe/equals syntax.
- **Chorus Block Sections**: Repeatable free-text sections within .docx templates using `{%#BLOCK_NAME%}…{%/BLOCK_NAME%}` delimiter syntax.
  - Templates are auto-scanned for chorus block patterns on upload; block variable names extracted from `{%varName%}` placeholders inside each block
  - Stored in `template_tables` with `block_type = 'block'`; block instances stored in `document_table_data`
  - **Two-pass rendering**: Pass 1 uses standard `{{ }}` delimiters (field values + table injection); Pass 2 uses `{% %}` delimiters (chorus block loop expansion). Pass 2 is skipped when no blocks are present for zero overhead on existing templates
  - Frontend: `ChorusBlockSection` component (`client/src/components/chorus-block-section.tsx`) — inline add/remove/edit instances per block in document-create and document-update pages
  - Batch Excel upload is blocked for templates containing chorus blocks (must be filled individually)
  - Document Generator Cache cache key includes block data hash
- **Dynamic Table Injection**: Injects multi-row data tables into .docx files at `<<TABLE_NAME:col1,col2,...>>` markers.
  - **Strategy A (Pre-formatted)**: If a Word table exists immediately after the marker (≥ 2 rows), app keeps header row as-is, clones template row (row[1]) for each data row — all cell formatting preserved.
  - **Strategy B (Generated fallback)**: If no pre-formatted table found, generates a plain auto-styled table with bold header and grid borders.
  - Column source priority: DB `templateTables.columns` > marker column list in docx (marker list used only as fallback when no DB columns defined).
  - Table data entry via grid UI; supports Excel download (template) and Excel import (bulk row data).
  - API: `GET /api/templates/:uuid/tables/:name/excel` (download), `POST /api/documents/:uuid/tables/:name/excel` (import).
- **Document Generation (Generate-on-Demand)**: Documents are generated dynamically on download from template + field data. Only metadata and field values are stored in DB; no document files are persisted. This architecture eliminates storage costs and prevents orphaned files after restarts.
- **Interactive Preview Mode**: Visual data entry interface that renders document preview with inline editable input fields. Features include:
  - Mode toggle (Preview ↔ Interactive) in document-create and document-update pages
  - Linked fields: Repeated placeholders (same fieldName) update synchronously across all occurrences
  - Responsive input widths based on content length
  - Debounced autosave (1.5s delay) in document-update page with status indicator
  - API endpoint: `POST /api/documents/interactive-preview` returns token-based rendering data
- **Batch Processing**: Handles Excel imports, manages batch sessions with approval states, allows individual document approval/rejection within batches, and supports bulk operations. Blocked for templates with chorus blocks or row_group (table) fields.
- **Bulk Excel Export**: Export document data to Excel files from the Bulk Download page (`/bulk-download`). Features:
  - One Excel file per template (filename = template name)
  - Columns: Document Name + all template fields with their values
  - Single template: Direct `.xlsx` download; Multiple templates: ZIP containing multiple `.xlsx` files
  - **Data Validation for Checklist Fields**: Columns with `fieldType = 'checklist'` automatically have Excel dropdown validation. Options sourced from database field definitions. Uses hidden `_ValidationLists` sheet for safe handling of special characters.
  - API endpoint: `POST /api/documents/bulk-download/excel`
- **UI/UX Decisions**: Consistent styling with Tailwind CSS and shadcn/ui, responsive layouts using resizable panels for desktop, and stacked layouts for mobile. Document previews feature A4 responsive layout and visual field highlighting (yellow for empty, light green for filled). Interactive preview inputs use 0.5px borders matching document info styling.

### Performance Optimizations
- **Template Preview Cache**: In-memory LRU cache for template HTML previews (`server/services/template-preview-cache.service.ts`)
  - Caches mammoth-generated HTML to avoid repeated DOCX→HTML conversion
  - LRU eviction with max 100 entries, 60-minute TTL
  - Promise coalescing prevents duplicate renders on concurrent requests
  - Auto-invalidation on template update/delete
  - Feature flag toggle via API
  - Performance gain: ~5x faster on cache hits
  - Admin endpoints: `GET /api/admin/cache/stats`, `POST /api/admin/cache/clear`, `POST /api/admin/cache/toggle`
  - Unit tests: 31 tests covering all edge cases (`server/services/__tests__/template-preview-cache.test.ts`)

- **Document Generator Cache**: Short-term buffer cache for generated documents (`server/services/document-generator-cache.service.ts`)
  - Caches generated document buffers in memory (no file storage)
  - LRU eviction with max 50 entries, 10-minute TTL
  - Promise coalescing for concurrent download requests
  - Auto-invalidation on document update/delete
  - Cache key includes hashes of field values, table data, and chorus block data
  - Internally calls `generateDocumentTwoPasses()` for two-pass rendering support
  - Key benefits: Eliminates storage costs, prevents file orphaning, enables fast repeated downloads

- **Template Deletion Protection**: Templates with linked documents cannot be deleted
  - Returns 409 Conflict with document count and resolution hints
  - Force delete option (`?force=true`) for intentional orphaning

- **Template File Replacement**: Replace template files while preserving UUID and existing documents
  - API endpoint: `PUT /api/templates/:uuid/file`
  - Strict field validation: New file must have exactly the same field placeholders (`{{...}}`), table marker names (`<<TABLE_NAME>>`), and chorus block names as the original. Column lists inside markers and field `defaultValue`/`options` may freely change.
  - Auto-updates `defaultValue`, `options`, and `fieldType` in DB when new file placeholders carry new metadata
  - Auto-invalidates template preview cache on replacement
  - Frontend: "Replace File" button on template preview page (`/template-preview/:uuid`)
  - Error handling: Returns detailed field mismatch info (missing/extra fields) on validation failure

### Reliability
- **Neon DB Connection Resilience**: The app handles Neon serverless PostgreSQL's periodic idle connection termination gracefully.
  - `pool.on('error', ...)` in `db/index.ts` catches connection drops silently; pool reconnects automatically on the next query
  - `process.on('uncaughtException')` and `process.on('unhandledRejection')` in `server/index.ts` swallow recoverable DB disconnect errors without calling `process.exit()`
  - Result: app stays up during Neon idle timeouts instead of crashing for ~2 minutes

### Testing
- **Framework**: Vitest (`vitest.config.ts` for server-side tests)
- **Test Location**: `server/services/__tests__/`
- **Run Tests**: `npx vitest run --config vitest.config.ts`
- **Coverage**: Cache hit/miss, TTL expiration, template invalidation, LRU eviction, promise coalescing, error recovery

### External API (FlowForge Integration)
- **Purpose**: Provides read-only endpoints for FlowForge (Workflow Field Mapping app) to sync templates
- **Authentication**: None (development phase) — add auth before production
- **Endpoints**:
  - `GET /api/external/templates` — Returns all templates with their fields. Response: `{ success: true, count: number, templates: [...] }`
  - `GET /api/external/templates/:uuid` — Returns single template with fields. Response: `{ success: true, template: {...} }`
- **Template Response Fields**: uuid, name, description, category, fieldCount, archived, createdAt, updatedAt, fields[]
- **Field Response Fields**: uuid, name, type, fieldType, placeholder, required, options, defaultValue, position

### Data Flow
- **Template Upload**: Frontend upload → Backend validation → Field extraction (including chorus block scanning + table marker parsing) → DB storage → File storage.
- **Document Creation**: User selects template & fills form (+ chorus block instances + table row data) → Two-pass placeholder replacement → Document generated on download (no file persisted).
  - Pass 1: standard `{{ }}` delimiters — field values replaced + table markers injected (Strategy A or B)
  - Pass 2: `{% %}` delimiters — chorus block loop expansion (skipped if no blocks)
- **Batch Processing**: User uploads Excel → System parses data & creates batch session → User reviews/approves → Approved documents generated & packaged. Blocked for templates with chorus blocks or table (row_group) fields.

## External Dependencies

- **@tanstack/react-query**: Server state management
- **drizzle-orm**: Database ORM
- **docxtemplater**: Word document template processing
- **multer**: File upload handling
- **mammoth**: Document to HTML conversion
- **xlsx**: Excel file processing
- **archiver**: ZIP file creation
- **@radix-ui**: Accessible UI primitives
- **tailwindcss**: CSS framework
- **lucide-react**: Icon library
- **react-hook-form**: Form management
- **wouter**: Client-side routing
- **PostgreSQL**: Primary database (Neon serverless)
- **Replit App Storage**: Persistent file storage (Google Cloud Storage backed)
