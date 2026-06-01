# DocCompile - Hệ thống tạo tài liệu thông minh

Hệ thống quản lý và tạo tài liệu tự động với template Word, hỗ trợ xử lý hàng loạt, bảng dữ liệu động và preview tương tác.

---

## 🚀 Tính năng chính

### 📝 Quản lý Template

| Tính năng | Mô tả |
|-----------|-------|
| Upload template | Hỗ trợ file `.docx` với placeholder `{{fieldName}}` |
| Phân tích tự động | Tự động phát hiện tất cả các trường dữ liệu |
| Phân loại | Chia theo category: legal, financial, hr, marketing, communication |
| Preview | Xem trước template với HTML rendering |
| Thay thế file | Thay file `.docx` mới mà vẫn giữ nguyên UUID và tài liệu cũ |
| Ẩn/Hiện template | Lưu trữ template không dùng, khôi phục khi cần |
| Export Excel | Tạo file Excel mẫu để nhập liệu hàng loạt |
| Bảo vệ xóa | Không thể xóa template có tài liệu liên kết (trả về cảnh báo) |

### 📄 Tạo tài liệu đơn lẻ

- **Form điền dữ liệu**: Tự động sinh form theo các trường của template
- **Preview tức thì**: Xem trước layout tài liệu trong khi nhập
- **Interactive Preview**: Nhập liệu trực tiếp trên giao diện giống văn bản thật
- **Autosave**: Tự động lưu sau 1.5 giây khi chỉnh sửa (trang Edit)
- **Download on-demand**: Tạo file Word ngay khi tải, không lưu file trên server

### 📊 Xử lý hàng loạt (Batch)

- **Import Excel**: Upload file Excel nhiều dòng → nhiều tài liệu
- **Phê duyệt từng dòng**: Duyệt / từ chối từng tài liệu trước khi xuất
- **Bulk download**: Tải toàn bộ tài liệu đã duyệt dưới dạng ZIP
- **Báo cáo lỗi**: Hiển thị chi tiết lỗi từng dòng không hợp lệ

### 📋 Bảng dữ liệu động (Dynamic Tables)

- **Cú pháp placeholder**: `<<TEN_BANG>>` trong file Word
- **Định nghĩa cột**: Thiết lập cột bảng trong trang Column Editor
- **Nhập dữ liệu bảng**: Giao diện dạng lưới (Google Sheets-style) per tài liệu
- **Tự động chèn bảng**: Khi tạo/tải file Word, bảng được chèn đúng vị trí placeholder

### 🔁 Chorus Block (Đoạn lặp)

- **Cú pháp**: `{%#TEN_BLOCK%}…{%/TEN_BLOCK%}` bao quanh nội dung lặp trong file Word
- **Biến trong block**: `{%tenBien%}` — mỗi lần lặp có thể điền giá trị khác nhau
- **Phát hiện tự động**: Khi upload template, hệ thống tự quét và nhận diện tất cả chorus block
- **Kiểu biến**: Mỗi biến trong block có thể được cấu hình riêng — **văn bản (text)** hoặc **checklist (đa lựa chọn)**
- **Giá trị mặc định**: Đặt giá trị mặc định cho từng biến, tự động điền khi thêm mục mới
- **Import/Export Excel**: Tải file Excel mẫu của block và nhập dữ liệu hàng loạt (checklist có dropdown validation)
- **Giao diện inline**: Thêm / xóa / chỉnh sửa từng "mục" ngay trong form tạo/sửa tài liệu
- **Không giới hạn mục**: Mỗi block có thể thêm bao nhiêu mục tùy ý
- **Lưu ý**: Template có chorus block không hỗ trợ Batch Upload (phải tạo tài liệu đơn lẻ)

### 🔍 Quản lý tài liệu

- **Phân trang**: Tùy chọn 12/24/48/96 items/trang
- **Tìm kiếm & Filter**: Tìm theo tên, lọc theo template, ngày tạo/cập nhật
- **Bulk delete**: Xóa hàng loạt với preview và xác nhận
- **Bulk Excel export**: Xuất dữ liệu nhiều tài liệu ra file Excel (từ trang /bulk-download)

---

## 📖 Hướng dẫn sử dụng

### 1️⃣ Tạo và quản lý Template

#### Cách thiết kế file Word
Trước khi upload, chuẩn bị file `.docx` với các placeholder theo cú pháp sau:

**Trường thông thường:**
```
{{hoTen}}          → Trường text thông thường
{{ngaySinh}}       → Trường ngày tháng
{{soTien}}         → Trường số tiền
```

**Trường có giá trị mặc định:**
```
{{tinhThanh='Hà Nội'}}      → Hiển thị "Hà Nội" nếu không điền
{{loaiHD='Hợp đồng A'}}
```

**Trường checklist (chọn nhiều):**
```
{{dichVu['Tư vấn']['Thiết kế']['Thi công']}}
```

**Bảng dữ liệu động:**
```
<<DANH_SACH_SAN_PHAM:STT,TenSanPham,SoLuong,DonGia>>
↑ tên bảng  ↑ tên các cột (phân cách bằng dấu phẩy)
```
> Hệ thống tự động tạo các cột khi phân tích template.
> Nếu không khai báo cột trong placeholder, bạn cần thiết lập cột thủ công trong **Column Editor**.

**Chorus Block (Đoạn lặp):**
```
{%#DANH_SACH_NGUOI%}
Họ tên: {%hoTen%}
Chức vụ: {%chucVu%}
{%/DANH_SACH_NGUOI%}
```
> Phần nội dung giữa `{%#TEN_BLOCK%}` và `{%/TEN_BLOCK%}` sẽ được lặp lại cho mỗi "mục" người dùng thêm vào.
> Các biến bên trong (`{%hoTen%}`, `{%chucVu%}`) được điền riêng cho từng mục.
> Hệ thống tự nhận diện block khi upload — không cần cấu hình thêm.

#### Upload Template
1. Vào menu **Templates** → click **"Upload Template"**
2. Chọn file `.docx` đã chuẩn bị
3. Điền tên, mô tả, category
4. Hệ thống tự động phát hiện tất cả trường dữ liệu
5. Click **"Save"** để hoàn tất

#### Thay thế file template
- Vào trang Preview của template → click **"Replace File"**
- Chọn file `.docx` mới — file mới phải có **đúng cùng các placeholder, bảng và chorus block** với file gốc
- Tài liệu cũ không bị ảnh hưởng; cấu hình biến block (kiểu, giá trị mặc định, lựa chọn) được giữ nguyên

#### Ẩn / Hiện template
- Click icon **👁 (ẩn)** trên card template để ẩn template không còn dùng
- Template ẩn không hiện trong danh sách chính
- Click **"Hiện template ẩn"** để xem và khôi phục template đã ẩn

#### Thiết lập cột cho Bảng động
1. Vào trang Preview của template
2. Với trường kiểu **row_group** (bảng), click **"Cài đặt cột"**
3. Thêm các cột cho bảng (tên cột, nhãn hiển thị)
4. Lưu cấu hình cột

---

### 2️⃣ Tạo tài liệu đơn lẻ

#### Từ trang Documents
1. Click **"Tạo tài liệu mới"**
2. Chọn template muốn sử dụng
3. Điền tên tài liệu
4. Điền giá trị cho từng trường:
   - **Text/Number**: Nhập trực tiếp
   - **Checklist**: Tích chọn các mục
   - **Trường có default**: Hiển thị sẵn giá trị, có thể sửa
5. Với **bảng động**: Click **"Nhập bảng"** → điền dữ liệu từng dòng
6. Preview tài liệu → **Download** file Word

#### Chế độ Interactive Preview
- Toggle sang **"Interactive"** để nhập liệu trực tiếp trên giao diện văn bản
- Các ô input xuất hiện đúng vị trí placeholder trong tài liệu
- **Linked fields**: Cùng một trường xuất hiện nhiều lần → tự cập nhật đồng bộ
- Click **"Nhập bảng"** trong Interactive Preview → chuyển sang trang nhập bảng

#### Chỉnh sửa tài liệu đã tạo
1. Vào **Documents** → click **Edit** trên tài liệu
2. Chỉnh sửa các trường → **Autosave** sau 1.5 giây
3. Nhập dữ liệu bảng riêng qua trang `/document/:id/table/:tenBang`
4. Chỉnh sửa Chorus Block trực tiếp trong form (thêm/xóa/sửa mục)
5. Download lại file Word với dữ liệu mới

---

### 3️⃣ Sử dụng Chorus Block (Đoạn lặp)

Chorus Block dùng để tạo các đoạn nội dung lặp lại với số lượng mục linh hoạt — ví dụ: danh sách người tham dự, danh mục sản phẩm, các điều khoản hợp đồng, v.v.

#### Cách thiết kế file Word
Đặt nội dung muốn lặp giữa thẻ mở và thẻ đóng:
```
{%#DANH_SACH_NGUOI%}
{%stt%}. {%hoTen%} — {%chucVu%} — {%donVi%}
{%/DANH_SACH_NGUOI%}
```
- Tên block viết HOA hoặc camelCase, không dấu cách
- Mỗi biến bên trong dùng cú pháp `{%tenBien%}`
- Một template có thể có nhiều chorus block khác nhau

#### Cấu hình biến trong Block (Block Variable Editor)

Sau khi upload template, hệ thống tự nhận diện tất cả biến bên trong từng chorus block. Bạn có thể cấu hình thêm cho mỗi biến để cải thiện trải nghiệm nhập liệu:

1. Vào trang **Preview** của template
2. Trong phần **Chorus Blocks**, click **"Cài đặt biến"** của block cần chỉnh
3. Màn hình **Block Variable Editor** hiện ra, liệt kê tất cả biến đã phát hiện
4. Với mỗi biến, click biểu tượng **▼** để mở phần cài đặt nâng cao:

| Cài đặt | Mô tả |
|---------|-------|
| **Kiểu dữ liệu** | `Văn bản (text)` — nhập tự do; hoặc `Checklist` — chọn từ danh sách |
| **Giá trị mặc định** | Giá trị tự động điền khi thêm mục mới (chỉ áp dụng cho kiểu `text`) |
| **Danh sách lựa chọn** | Các lựa chọn hiển thị dưới dạng checkbox (chỉ áp dụng khi kiểu là `Checklist`) |

5. Click **"Lưu định nghĩa biến"** để áp dụng

> **Ví dụ thực tế**: Block `DANH_SACH_THANH_VIEN` có biến `vaiTro`:
> - Kiểu: `Checklist`
> - Lựa chọn: `Chủ trì`, `Thư ký`, `Thành viên`, `Quan sát viên`
> - Khi nhập liệu, người dùng tích chọn một hoặc nhiều vai trò cho mỗi thành viên

#### Nhập liệu biến Checklist
Khi biến block có kiểu **Checklist**, giao diện nhập liệu hiển thị các ô checkbox:
- Tích chọn một hoặc nhiều lựa chọn
- Các lựa chọn được lưu và điền vào file Word dưới dạng danh sách phân cách bằng dấu chấm phẩy

#### Điền dữ liệu khi tạo tài liệu
1. Tạo tài liệu từ template có chorus block
2. Trong form, mỗi chorus block hiển thị một **panel màu tím** với tiêu đề block
3. Click **"Thêm mục"** để thêm một lần lặp mới (các biến có giá trị mặc định sẽ tự điền)
4. Điền giá trị vào các ô trong mục vừa thêm (text: nhập tự do; checklist: tích chọn)
5. Click icon **thùng rác** để xóa một mục không cần
6. Lặp lại để thêm bao nhiêu mục tùy ý
7. Download → file Word sẽ lặp đoạn nội dung theo đúng số mục đã nhập

#### Import / Export Excel cho Block
Ngoài giao diện inline, bạn có thể dùng Excel để nhập nhiều mục cùng lúc:
1. Trong form tạo/sửa tài liệu, click **"Tải mẫu"** ở đầu mỗi block → tải file Excel mẫu
2. Điền dữ liệu vào Excel (mỗi dòng = 1 mục):
   - Cột kiểu `text`: nhập trực tiếp
   - Cột kiểu `checklist`: có dropdown validation, chọn từ danh sách
3. Click **"Import"** và chọn file Excel vừa điền → các mục được tạo tự động

Hoặc từ trang **Block Data Page** (`/document/:id/block/:blockName`):
- **Tải Excel mẫu** → file Excel có dropdown cho cột checklist
- **Xuất dữ liệu** → xuất dữ liệu hiện tại ra Excel để kiểm tra hoặc chỉnh sửa ngoài
- **Import Excel** → nhập file Excel và thay thế toàn bộ dữ liệu block

#### Ví dụ thực tế
Template hợp đồng có block danh sách người ký:
```
{%#NGUOI_KY%}
Đại diện: {%hoTen%}, chức vụ {%chucVu%}, CMND số {%cmnd%}
{%/NGUOI_KY%}
```
→ Nếu thêm 3 mục, file Word sẽ có 3 đoạn "Đại diện: …" tương ứng.

Cấu hình biến `chucVu` là `Checklist` với các lựa chọn: `Giám đốc`, `Phó Giám đốc`, `Kế toán trưởng`
→ Khi thêm mục, người dùng tích chọn chức vụ thay vì nhập tay, tránh sai chính tả.

> ⚠️ **Lưu ý**: Template có chorus block không hỗ trợ Batch Upload Excel.

---

### 4️⃣ Nhập dữ liệu Bảng động

Khi template có `<<TEN_BANG>>`, quy trình nhập bảng như sau:

1. **Tạo/sửa tài liệu** → click **"Nhập bảng: TEN_BANG"**
2. Trang nhập bảng mở ra với lưới hàng-cột
3. **Thêm dòng**: Click **"+ Thêm dòng"**
4. **Điền dữ liệu**: Click vào ô để chỉnh sửa
5. **Xóa dòng**: Click icon thùng rác ở đầu dòng
6. Click **"Lưu"** → dữ liệu được gắn vào tài liệu
7. Khi **Download** tài liệu, bảng tự động được chèn vào đúng vị trí

---

### 5️⃣ Xử lý hàng loạt (Batch Processing)

#### Bước 1 — Chuẩn bị file Excel
1. Vào trang Preview của template → click **"Export Excel"**
2. File Excel tải về với:
   - Cột đầu tiên: **Tên tài liệu**
   - Các cột tiếp theo: mỗi cột = một trường dữ liệu
   - Trường checklist: có dropdown validation
3. Điền dữ liệu vào Excel (mỗi dòng = 1 tài liệu)

#### Bước 2 — Upload và xử lý
1. Vào **Batch Sessions** hoặc trang template → click **"Batch Upload"**
2. Chọn file Excel đã điền
3. Hệ thống tự động phân tích và tạo batch session
4. Xem preview danh sách tài liệu sẽ được tạo

#### Bước 3 — Phê duyệt và tải về
1. Duyệt từng tài liệu: **Approve** hoặc **Reject**
2. Click **"Bulk Download"** để tải ZIP toàn bộ tài liệu đã duyệt
3. Xem báo cáo lỗi cho những dòng thất bại

> ⚠️ **Lưu ý**: Template có bảng động (`<<...>>`) hoặc chorus block chưa hỗ trợ batch upload.

---

### 6️⃣ Xuất dữ liệu Excel hàng loạt (Bulk Excel Export)

1. Vào menu **Bulk Download** (`/bulk-download`)
2. Lọc tài liệu theo template, tên, ngày tạo
3. Click **"Export Excel"**:
   - **1 template**: Tải thẳng file `.xlsx`
   - **Nhiều template**: Tải file `.zip` chứa nhiều `.xlsx`
4. File Excel gồm: Tên tài liệu + tất cả trường dữ liệu theo cột

---

### 7️⃣ Tips sử dụng hiệu quả

#### Thiết kế Template
```
✅ {{hoTen}}               → Tên trường rõ ràng, camelCase
✅ {{soTien='0'}}          → Có giá trị mặc định
✅ {{loai['A']['B']['C']}} → Checklist với các lựa chọn
✅ <<BANG_CHI_TIET:STT,Ten,SoLuong,GiaTri>>  → Bảng có khai báo cột ngay trong placeholder
✅ <<BANG_CHI_TIET>>                         → Bảng không khai báo cột (cài đặt sau trong Column Editor)
✅ {%#DANH_SACH%}{%tenBien%}{%/DANH_SACH%}  → Chorus Block — đoạn nội dung lặp linh hoạt
❌ {{c}}, {{field1}}       → Tên không rõ nghĩa
❌ {{client.name}}         → Nested không được hỗ trợ
❌ {%#BLOCK%} thiếu {%/BLOCK%} → Block không đóng sẽ bị bỏ qua
```

#### Cấu hình Block Variable tốt
```
✅ Đặt kiểu Checklist cho các biến có tập giá trị cố định (chức vụ, loại hình, trạng thái)
✅ Đặt giá trị mặc định cho biến hay lặp lại (VD: tên cơ quan, địa chỉ mặc định)
✅ Dùng mô tả rõ nghĩa cho nhãn biến thay vì tên kỹ thuật
❌ Để biến checklist không có lựa chọn nào → sẽ bị chặn khi lưu
```

#### Batch Processing
- Luôn dùng file Excel **export từ hệ thống** (đã có đúng cột và validation)
- Kiểm tra kỹ dữ liệu trước khi upload
- Xem report lỗi để biết dòng nào cần sửa

#### Quản lý Template
- Ẩn template cũ thay vì xóa → tránh mất tài liệu liên kết
- Dùng **"Replace File"** khi cần cập nhật nội dung template — cấu hình biến block được giữ nguyên

---

## 🔧 Troubleshooting

### Template upload thất bại
| Nguyên nhân | Giải pháp |
|-------------|-----------|
| File không phải `.docx` | Lưu lại dưới dạng `.docx` từ MS Word |
| Placeholder sai format | Dùng đúng cú pháp `{{fieldName}}` |
| File bị hỏng | Mở lại bằng MS Word và lưu lại |

### Không thể xóa template
- Template có tài liệu liên kết → xóa tài liệu trước, hoặc dùng **ẩn template** thay vì xóa

### Thay thế file template báo lỗi "field mismatch"
- File mới có placeholder khác với file gốc
- Thêm/bớt placeholder cần thực hiện qua trang **Fields** của template, không thể thay thế file nếu placeholder không khớp

### Chorus Block không xuất hiện trong file Word
- Kiểm tra cú pháp: thẻ mở `{%#TEN_BLOCK%}` và thẻ đóng `{%/TEN_BLOCK%}` phải khớp tên chính xác
- Kiểm tra đã thêm ít nhất 1 mục trong panel chorus block chưa (nếu 0 mục → đoạn lặp bị bỏ qua)
- Re-upload template nếu block chưa được nhận diện (xảy ra khi template upload trước khi tính năng được triển khai)

### Không lưu được cấu hình biến block (Block Variable Editor)
| Thông báo | Giải pháp |
|-----------|-----------|
| "Tên biến không được để trống" | Đặt tên cho tất cả các biến hoặc xóa biến trống |
| "Tên biến bị trùng" | Mỗi biến phải có tên duy nhất trong block |
| "Checklist thiếu lựa chọn" | Biến kiểu Checklist phải có ít nhất 1 lựa chọn |

### Batch upload báo lỗi
| Thông báo | Giải pháp |
|-----------|-----------|
| "Template has no fields" | Re-upload template với placeholder |
| "Template has row_group fields" | Batch chưa hỗ trợ template có bảng |
| "Template has chorus block sections" | Batch chưa hỗ trợ template có chorus block — tạo tài liệu đơn lẻ |
| "Missing required columns" | Dùng đúng file Excel export từ hệ thống |
| "Invalid data format" | Kiểm tra format ngày tháng, số |

### Bảng không xuất hiện trong file Word tải về
- Kiểm tra đã lưu dữ liệu bảng chưa (trang nhập bảng)
- Kiểm tra placeholder trong Word là `<<TEN_BANG>>` (dấu `<<` và `>>` đúng)
- Kiểm tra cột bảng đã được thiết lập trong Column Editor

### Preview không hiển thị
- Template chưa có fields → re-upload template
- Refresh trang và thử lại
- Nếu lỗi liên tục → kiểm tra console trình duyệt

---

## 💡 FAQ

**Q: Placeholder hỗ trợ những kiểu gì?**

| Cú pháp | Kiểu | Ví dụ |
|---------|------|-------|
| `{{name}}` | Text thông thường | `{{hoTen}}` |
| `{{field='value'}}` | Có giá trị mặc định | `{{tinhThanh='Hà Nội'}}` |
| `{{field['a']['b']}}` | Checklist | `{{loai['A']['B']['C']}}` |
| `<<TABLE:col1,col2>>` | Bảng động (có khai báo cột) | `<<HANG_HOA:STT,Ten,SoLuong,DonGia>>` |
| `<<TABLE>>` | Bảng động (cột thiết lập riêng trong UI) | `<<DANH_MUC>>` |
| `{%#BLOCK%}…{%/BLOCK%}` | Chorus Block — đoạn lặp | `{%#NGUOI_KY%}{%hoTen%}{%/NGUOI_KY%}` |

**Q: Cùng một placeholder xuất hiện nhiều lần trong template?**
Hệ thống nhận ra và điền đồng bộ — chỉ cần nhập 1 lần.

**Q: Tại sao không thể xóa template?**
Template đang có tài liệu liên kết. Hãy xóa hết tài liệu trước, hoặc dùng tính năng **Ẩn template**.

**Q: File Word tải về có giữ nguyên font, màu sắc không?**
Có. Hệ thống chỉ thay thế placeholder, toàn bộ định dạng gốc được giữ nguyên.

**Q: Limit file size?**
- Template Word: tối đa 10MB
- Excel batch: tối đa 10MB

**Q: Dữ liệu bảng và chorus block có lưu lại khi sửa tài liệu không?**
Có. Dữ liệu bảng và dữ liệu từng mục chorus block lưu riêng và được tự động chèn vào file Word khi download.

**Q: Biến trong Block có thể là Checklist không?**
Có. Sau khi upload template, vào **Block Variable Editor** (click "Cài đặt biến" trên trang Preview template), đổi kiểu biến thành `Checklist` và điền danh sách lựa chọn. Khi nhập liệu, biến đó sẽ hiển thị dưới dạng checkbox thay vì ô text.

**Q: Replace File có giữ lại cấu hình biến block không?**
Có. Khi thay thế file `.docx`, hệ thống giữ nguyên kiểu dữ liệu, giá trị mặc định và danh sách lựa chọn của tất cả biến block có tên trùng với file mới. Biến mới (chưa có cấu hình) được thêm với kiểu mặc định là `text`.

**Q: Chorus Block và Bảng động khác nhau thế nào?**

| | Bảng động `<<TABLE>>` | Chorus Block `{%#BLOCK%}` |
|---|---|---|
| Output | Bảng Word (rows & columns) | Đoạn văn bản lặp tự do |
| Nhập liệu | Trang riêng `/table/:name` | Inline trong form tạo tài liệu |
| Kiểu biến | Chỉ text | Text hoặc Checklist (đa lựa chọn) |
| Giá trị mặc định | Không | Có (per biến) |
| Linh hoạt layout | Cố định theo cột | Tự do — theo thiết kế trong Word |
| Phù hợp | Danh sách dạng bảng | Danh sách dạng đoạn, điều khoản |

**Q: Có thể dùng cả bảng động và chorus block trong cùng 1 template không?**
Có. Hai tính năng hoàn toàn độc lập và có thể kết hợp trong cùng một file Word.

---

## 🔌 API Endpoints chính

### Templates
```
GET    /api/templates                           → Danh sách (có pagination, filter)
POST   /api/templates                           → Upload template mới
GET    /api/templates/:uuid                     → Chi tiết template
PUT    /api/templates/:uuid                     → Cập nhật thông tin
DELETE /api/templates/:uuid                     → Xóa (chặn nếu có documents)
PUT    /api/templates/:uuid/file                → Thay thế file .docx
PUT    /api/templates/:uuid/archive             → Ẩn template
PUT    /api/templates/:uuid/unarchive           → Hiện template
GET    /api/templates/:uuid/preview             → HTML preview
GET    /api/templates/:uuid/export-excel        → Tải Excel template
GET    /api/templates/:uuid/tables              → Danh sách bảng/block của template
GET    /api/templates/:uuid/tables/:name        → Chi tiết bảng/block (bao gồm blockType, columns với fieldType/defaultValue/options)
PUT    /api/templates/:uuid/tables/:name/columns → Cập nhật định nghĩa cột/biến (bao gồm fieldType, defaultValue, options)
GET    /api/templates/:uuid/tables/:name/excel  → Tải Excel mẫu (có dropdown validation cho cột checklist)
POST   /api/templates/:uuid/tables/:name/excel/parse → Parse Excel (trả về rows, không lưu)
GET    /api/templates/stats                     → Thống kê
```

### Documents
```
GET    /api/documents                           → Danh sách (pagination, filter)
POST   /api/documents                           → Tạo document mới
GET    /api/documents/:uuid                     → Chi tiết document
PUT    /api/documents/:uuid                     → Cập nhật document
DELETE /api/documents/:uuid                     → Xóa document
GET    /api/documents/:uuid/download            → Tải file Word
GET    /api/documents/:uuid/tables/:name        → Dữ liệu bảng/block của document
PUT    /api/documents/:uuid/tables/:name        → Lưu dữ liệu bảng/block
GET    /api/documents/:uuid/tables/:name/excel  → Tải Excel dữ liệu hiện tại (có dropdown validation)
POST   /api/documents/:uuid/tables/:name/excel  → Import Excel và lưu
POST   /api/documents/interactive-preview       → Dữ liệu cho Interactive Preview
POST   /api/documents/bulk-delete/preview       → Preview bulk delete
DELETE /api/documents/bulk-delete               → Thực hiện bulk delete
POST   /api/documents/bulk-download/excel       → Export Excel hàng loạt
GET    /api/documents/stats                     → Thống kê
```

### External API (FlowForge Integration)
```
GET    /api/external/templates            → Tất cả templates + fields
GET    /api/external/templates/:uuid      → Một template + fields
```

---

## 🗄️ Database Schema

| Bảng | Mô tả |
|------|-------|
| `templates` | Thông tin template (tên, category, trạng thái) |
| `template_fields` | Các trường dữ liệu của template |
| `template_tables` | Định nghĩa cột bảng và biến chorus block. Cột `block_type`: `table` / `block`. Cột `columns` (JSONB): `[{name, label, fieldType?, defaultValue?, options?}]` |
| `documents` | Tài liệu đã tạo (metadata + field values) |
| `document_fields` | Giá trị từng trường của document |
| `document_table_data` | Dữ liệu dòng trong bảng động và mục trong chorus block |
| `batch_sessions` | Phiên upload hàng loạt |
| `batch_documents` | Tài liệu trong batch session |
| `batch_document_fields` | Field values trong batch |

---

**Version**: 4.2.0
**Cập nhật lần cuối**: Tháng 5, 2026
