# DocCompile - Document Generation System

Hệ thống quản lý và tạo tài liệu thông minh với khả năng xử lý hàng loạt, hỗ trợ template Word và Excel.

## 🚀 Tính năng chính

### 📝 Quản lý Template
- **Upload template Word**: Hỗ trợ file .docx với placeholder động `{{fieldName}}`
- **Phân tích tự động**: Tự động phát hiện các trường dữ liệu từ template
- **Quản lý danh mục**: Phân loại template theo category (legal, financial, hr, marketing, communication)
- **Preview template**: Xem trước template với dữ liệu mẫu
- **Export Excel template**: Tạo file Excel template để nhập liệu hàng loạt

### 📄 Tạo tài liệu
- **Tạo đơn lẻ**: Điền form và tạo tài liệu ngay lập tức
- **Preview real-time**: Xem trước tài liệu trong quá trình nhập liệu
- **Form validation**: Kiểm tra dữ liệu đầu vào tự động
- **Download**: Tải về file Word hoàn chỉnh với encoding UTF-8

### 📊 Xử lý hàng loạt (Batch Processing)
- **Import Excel**: Upload file Excel với nhiều dòng dữ liệu
- **Tạo tự động**: Hệ thống tự động tạo documents từ dữ liệu Excel
- **Bulk download**: Download multiple documents as ZIP file
- **Error handling**: Hiển thị lỗi chi tiết cho từng row không hợp lệ

### 🔍 Quản lý tài liệu
- **Pagination**: Phân trang với tùy chỉnh số items per page (5, 10, 25, 50)
- **Search & Filter**: Tìm kiếm theo tên, filter theo template, ngày tạo/cập nhật
- **Bulk operations**: 
  - Bulk delete với preview và confirmation
  - Filter by templates và date ranges
- **Document management**: Edit, download, delete từng document
- **Statistics**: Thống kê số lượng templates và documents

## Technology Stack

### Frontend
- **React 18** with TypeScript
- **Vite** for fast development and building
- **Tailwind CSS** with shadcn/ui components
- **TanStack Query** for data fetching and caching
- **Wouter** for client-side routing
- **React Hook Form** with Zod validation

### Backend
- **Node.js** with Express.js
- **TypeScript** for type safety
- **Drizzle ORM** for database operations
- **PostgreSQL** database
- **Multer** for file uploads
- **Docxtemplater** for Word document processing
- **Mammoth** for document to HTML conversion

### Development Tools
- **ESBuild** for fast compilation
- **Drizzle Kit** for database migrations
- **tsx** for TypeScript execution

## Installation

1. Clone the repository:
```bash
git clone https://github.com/manhx8pharma/DocumentCompiler.git
cd DocumentCompiler
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Configure your DATABASE_URL and other environment variables
```

4. Set up the database:
```bash
npm run db:push
npm run db:seed
```

5. Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5000`

## 📖 Hướng dẫn sử dụng

### 1️⃣ Quản lý Template

#### Tạo Template mới
1. **Truy cập trang Templates** từ navigation menu
2. **Click "Upload Template"** để tạo template mới
3. **Upload file Word (.docx)** chứa placeholder:
   ```
   Ví dụ: Kính gửi {{clientName}}, 
   Ngày: {{date}}
   Số tiền: {{amount}}
   ```
4. **Điền thông tin template**:
   - Tên template
   - Mô tả (optional)
   - Chọn category
5. **Hệ thống tự động phân tích** và phát hiện các trường dữ liệu
6. **Save template** để hoàn tất

#### Preview Template
- Click **"Preview"** để xem template với dữ liệu mẫu
- Kiểm tra định dạng và layout
- Đảm bảo các placeholder hoạt động đúng

#### Export Excel Template
- Click **"Export Excel"** để tạo file Excel cho batch processing
- File Excel sẽ chứa các cột tương ứng với template fields
- Sử dụng file này để nhập liệu hàng loạt

### 2️⃣ Tạo tài liệu đơn lẻ

#### Từ trang Templates
1. **Chọn template** muốn sử dụng
2. **Click "Create Document"**
3. **Điền form** với các thông tin cần thiết:
   - Tên tài liệu
   - Giá trị cho từng trường dữ liệu
4. **Preview real-time**: Xem trước tài liệu trong quá trình nhập
5. **Submit** để tạo tài liệu
6. **Download** file Word hoàn chỉnh

### 3️⃣ Xử lý hàng loạt (Batch Processing)

#### Chuẩn bị dữ liệu
1. **Export Excel template** từ template đã chọn
2. **Mở file Excel** và điền dữ liệu:
   - Mỗi dòng = 1 tài liệu
   - Điền đầy đủ các cột bắt buộc
   - Đảm bảo format dữ liệu đúng

#### Upload và xử lý
1. **Truy cập template** muốn batch process
2. **Click "Batch Upload"**
3. **Chọn file Excel** đã chuẩn bị
4. **Upload** và hệ thống sẽ:
   - Tự động parse Excel data
   - Tạo documents ngay lập tức
   - Hiển thị kết quả (created/failed)
5. **Download** các tài liệu đã tạo
6. **Xem chi tiết** errors nếu có

### 4️⃣ Quản lý tài liệu

#### Xem danh sách Documents với Pagination
1. **Truy cập trang Documents**
2. **Tùy chỉnh hiển thị**:
   - Chọn số documents per page (5, 10, 25, 50)
   - Sử dụng pagination controls: « First ‹ Prev 1 2 3 4 5 ... Next › Last »
3. **Xem thông tin**:
   - "Showing X to Y of Z documents"
   - Thông tin documents trong trang hiện tại

#### Thao tác với Documents
- **Edit**: Chỉnh sửa thông tin và field values
- **Download**: Tải file Word gốc
- **Delete**: Xóa tài liệu (có xác nhận)

#### Bulk Delete
1. **Truy cập "Bulk Delete"** từ navigation menu
2. **Set up filters**:
   - Search query (tên document)
   - Select templates (multiple selection)
   - Date range (created or updated)
3. **Preview** documents sẽ bị xóa
4. **Confirm deletion** sau khi review
5. **Bulk delete** với confirmation dialog

### 5️⃣ Tips sử dụng hiệu quả

#### Template Design
- **Sử dụng placeholder rõ ràng**: `{{clientName}}` thay vì `{{c}}`
- **Consistent naming**: Đặt tên trường nhất quán
- **Test template**: Luôn test với dữ liệu thật trước khi deploy

#### Batch Processing
- **Chuẩn bị data chất lượng**: Kiểm tra spelling, format
- **Use Excel template**: Luôn dùng file Excel đã export từ hệ thống
- **Check results**: Review created/failed count sau khi upload

#### Performance
- **Use pagination**: Tùy chỉnh items per page phù hợp
- **Regular cleanup**: Sử dụng bulk delete để dọn dẹp documents cũ
- **Monitor storage**: Kiểm tra dung lượng file storage

## Database Schema

The application uses PostgreSQL with UUID-based primary keys:
- `templates`: Document templates with metadata
- `template_fields`: Field definitions for templates  
- `documents`: Generated documents
- `document_fields`: Field values for documents
- `batch_sessions`: Batch upload sessions
- `batch_documents`: Individual documents in batch sessions
- `batch_document_fields`: Field data for batch documents

## 🔧 Troubleshooting

### Các lỗi thường gặp

#### 1. Template upload thất bại
**Nguyên nhân:**
- File không phải định dạng .docx
- Placeholder không đúng format
- File bị corrupt

**Giải pháp:**
- Đảm bảo file là .docx (không phải .doc)
- Sử dụng placeholder format: `{{fieldName}}`
- Kiểm tra file mở được trong MS Word

#### 2. Document preview không hiển thị
**Nguyên nhân:**
- Template chưa có fields
- Dữ liệu field không hợp lệ

**Giải pháp:**
- Kiểm tra template có fields chưa
- Validate dữ liệu input
- Re-upload template nếu cần

#### 3. Batch upload Excel lỗi
**Nguyên nhân:**
- Template chưa có fields configured
- Format Excel không đúng
- Missing required columns

**Giải pháp:**
- Đảm bảo template đã có fields (re-upload template nếu cần)
- Sử dụng Excel template đã export từ hệ thống
- Kiểm tra tất cả cột bắt buộc có dữ liệu

#### 4. Pagination không hoạt động
**Nguyên nhân:**
- Server error khi query database
- Network connectivity issues

**Giải pháp:**
- Refresh trang
- Kiểm tra network connection
- Contact administrator nếu vấn đề persists

## 💡 FAQ

### Q: Template hỗ trợ những placeholder nào?
**A:** Hỗ trợ format `{{fieldName}}` với:
- Text fields: `{{name}}`, `{{address}}`
- Date fields: `{{date}}`, `{{createdDate}}`
- Number fields: `{{amount}}`, `{{quantity}}`
- Rich text: Hỗ trợ formatting trong Word

### Q: Tại sao batch upload báo "Template has no fields configured"?
**A:** Template chưa được phân tích fields. Giải pháp:
- Re-upload template với placeholders `{{fieldName}}`
- Đảm bảo template chứa ít nhất 1 placeholder
- Check template preview để confirm fields đã được detected

### Q: Có thể nested placeholder không?
**A:** Hiện tại chưa hỗ trợ nested. Sử dụng flat structure:
```
❌ {{client.name}} → Không support
✅ {{clientName}} → Support
```

### Q: Limit file size là bao nhiêu?
**A:** 
- Template Word: Max 10MB
- Excel batch: Max 10MB
- Generated documents: No limit

### Q: Pagination có ảnh hưởng performance không?
**A:** Không, pagination giúp cải thiện performance:
- Load ít documents hơn mỗi lần
- Faster page load times
- Better UX với large datasets

## 🔌 API Endpoints

### Templates
- `GET /api/templates` - Danh sách templates với pagination
- `POST /api/templates` - Tạo template mới (with file upload)
- `GET /api/templates/:uuid` - Chi tiết template
- `PUT /api/templates/:uuid` - Cập nhật template
- `DELETE /api/templates/:uuid` - Xóa template
- `GET /api/templates/:uuid/download` - Download template file
- `GET /api/templates/:uuid/export-excel` - Export Excel template
- `GET /api/templates/:uuid/preview` - Preview template
- `GET /api/templates/:uuid/fields` - Get template fields
- `GET /api/templates/stats` - Template statistics

### Documents
- `GET /api/documents` - Danh sách documents với pagination (`?page=1&limit=10`)
- `POST /api/documents` - Tạo document mới
- `GET /api/documents/:uuid` - Chi tiết document
- `PUT /api/documents/:uuid` - Cập nhật document
- `DELETE /api/documents/:uuid` - Xóa document
- `GET /api/documents/:uuid/download` - Download document file
- `GET /api/documents/:uuid/preview` - Preview document HTML
- `GET /api/documents/stats` - Document statistics

### Batch Processing
- `POST /api/templates/:uuid/upload-batch` - Upload Excel và tạo documents
- `POST /api/templates/:uuid/parse-excel` - Parse Excel và preview data

### Bulk Operations
- `POST /api/documents/bulk-delete/preview` - Preview bulk delete
- `DELETE /api/documents/bulk-delete` - Execute bulk delete

## 🚀 Deployment

### Production Environment
```bash
NODE_ENV=production
DATABASE_URL=postgresql://user:password@localhost:5432/doccompile_prod
PORT=5000
SESSION_SECRET=your-secret-key-here
```

### Build và Deploy
```bash
# Build application
npm run build

# Start production server
npm start

# Using PM2
npm install -g pm2
pm2 start npm --name "doccompile" -- start
pm2 startup
pm2 save
```

### Database Setup
```bash
# Create production database
createdb doccompile_prod

# Run migrations
npm run db:push

# Seed initial data (optional)
npm run db:seed
```

## 🔧 Maintenance

### Regular Tasks
```bash
# Database backup
pg_dump doccompile_prod > backup_$(date +%Y%m%d).sql

# Clean old temporary files
find storage/temp -name "*" -mtime +1 -delete

# Check storage space
df -h storage/
```

### Performance Monitoring
- **Database performance**: Monitor query times và connection count
- **File storage**: Track storage usage growth
- **Memory usage**: Check for memory leaks
- **API response times**: Monitor endpoint performance

## 📞 Support

### Community
- **Issues**: Report bugs qua GitHub Issues
- **Documentation**: Xem README và code comments
- **Debug**: Check browser console và server logs

---

**Version**: 3.0.0  
**Last Updated**: June 2025  
**Maintainer**: DocCompile Team