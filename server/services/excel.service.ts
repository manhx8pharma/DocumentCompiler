import * as XLSX from 'xlsx';

export interface ExcelExportOptions {
  templateId: number | string;
  includeSampleData?: boolean;
  rowCount?: number;
}

export interface ExcelField {
  fieldName: string;
  displayName: string;
  fieldType: string;
  isRequired: boolean;
  sampleValue?: string;
}

/**
 * Tạo file Excel từ template fields để nhập liệu hàng loạt
 */
export async function generateExcelTemplate(options: ExcelExportOptions): Promise<Buffer> {
  console.log('EXCEL_TEMPLATE: Generating Excel template with options:', options);
  
  try {
    // Import storage functions
    const { getTemplateFields } = await import('../storage');
    
    // Lấy template fields
    const fields = await getTemplateFields(options.templateId);
    console.log('EXCEL_TEMPLATE: Retrieved fields:', fields.length);
    
    if (!fields || fields.length === 0) {
      throw new Error('No fields found for template');
    }

    const workbook = XLSX.utils.book_new();
    
    // Tạo worksheet chính để nhập dữ liệu
    const dataWs = createDataEntryWorksheet(fields, options.rowCount || 10, options.includeSampleData || false);
    XLSX.utils.book_append_sheet(workbook, dataWs, 'Nhập liệu');
    
    // Tạo worksheet hướng dẫn
    const guideWs = createGuideWorksheet(fields);
    XLSX.utils.book_append_sheet(workbook, guideWs, 'Hướng dẫn');
    
    // Tạo worksheet validation rules
    const validationWs = createValidationWorksheet(fields);
    XLSX.utils.book_append_sheet(workbook, validationWs, 'Quy tắc');
    
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    console.log('EXCEL_TEMPLATE: Generated template successfully, buffer size:', buffer.length);
    return buffer;
    
  } catch (error) {
    console.error('EXCEL_TEMPLATE: Error generating template:', error);
    throw new Error(`Failed to generate Excel template: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Tạo worksheet chính để nhập dữ liệu
 */
function createDataEntryWorksheet(fields: any[], rowCount: number, includeSampleData: boolean) {
  console.log('EXCEL_TEMPLATE: Creating data entry worksheet');
  
  // Header với Document Name làm cột đầu tiên, sử dụng field.name (template field name)
  const headers = ['Document Name', ...fields.map(field => field.name)];
  
  // Tạo dữ liệu
  const data = [headers];
  
  // Thêm rows để nhập liệu
  for (let i = 0; i < rowCount; i++) {
    const row = [''];
    
    if (includeSampleData && i === 0) {
      // Thêm dữ liệu mẫu cho row đầu tiên
      row[0] = 'Văn bản mẫu';
      fields.forEach(field => {
        row.push(generateSampleValue(field));
      });
    } else {
      // Thêm cells trống
      fields.forEach(() => {
        row.push('');
      });
    }
    
    data.push(row);
  }
  
  const ws = XLSX.utils.aoa_to_sheet(data);
  
  // Thiết lập độ rộng cột
  const colWidths = [
    { wch: 25 }, // Document Name
    ...fields.map(() => ({ wch: 20 }))
  ];
  ws['!cols'] = colWidths;
  
  return ws;
}

/**
 * Tạo worksheet hướng dẫn
 */
function createGuideWorksheet(fields: any[]) {
  const guideData = [
    ['HƯỚNG DẪN SỬ DỤNG FILE EXCEL NHẬP LIỆU HÀNG LOẠT'],
    [''],
    ['1. CÁC BƯỚC THỰC HIỆN:'],
    ['   - Mở sheet "Nhập liệu"'],
    ['   - Nhập tên văn bản vào cột "Document Name"'],
    ['   - Nhập dữ liệu cho các trường tương ứng'],
    ['   - Lưu file và upload lên hệ thống'],
    [''],
    ['2. QUY TẮC NHẬP LIỆU:'],
    ['   - Cột "Document Name" là bắt buộc'],
    ['   - Không được để trống các trường bắt buộc'],
    ['   - Tuân thủ định dạng dữ liệu của từng trường'],
    [''],
    ['3. MÔ TẢ CÁC TRƯỜNG DỮ LIỆU:'],
    ['']
  ];

  // Thêm thông tin từng field
  fields.forEach((field, index) => {
    guideData.push([`${index + 1}. ${field.displayName || field.name || field.fieldName}`]);
    guideData.push([`   - Loại: ${getFieldTypeDescription(field.fieldType)}`]);
    guideData.push([`   - Bắt buộc: ${field.isRequired ? 'Có' : 'Không'}`]);
    guideData.push([`   - Mô tả: ${getFieldDescription(field)}`]);
    guideData.push(['']);
  });
  
  const ws = XLSX.utils.aoa_to_sheet(guideData);
  ws['!cols'] = [{ wch: 80 }];
  
  return ws;
}

/**
 * Tạo worksheet validation rules
 */
function createValidationWorksheet(fields: any[]) {
  const validationData = [
    ['QUY TẮC VALIDATION CHO CÁC TRƯỜNG'],
    [''],
    ['Trường', 'Quy tắc', 'Ví dụ hợp lệ'],
    ['Document Name', 'Bắt buộc, không được trống', 'Văn bản số 001'],
    ...fields.map(field => [
      field.displayName || field.name || field.fieldName,
      getValidationRule(field),
      generateSampleValue(field)
    ])
  ];
  
  const ws = XLSX.utils.aoa_to_sheet(validationData);
  ws['!cols'] = [
    { wch: 25 }, // Trường
    { wch: 40 }, // Quy tắc
    { wch: 25 }  // Ví dụ
  ];
  
  return ws;
}

/**
 * Tạo giá trị mẫu cho field
 */
function generateSampleValue(field: any): string {
  if (field.sampleValue) {
    return field.sampleValue;
  }
  
  switch (field.fieldType) {
    case 'text':
      return 'Văn bản mẫu';
    case 'number':
      return '100';
    case 'date':
      return new Date().toLocaleDateString('vi-VN');
    case 'email':
      return 'example@email.com';
    case 'phone':
      return '0123456789';
    case 'url':
      return 'https://example.com';
    case 'textarea':
      return 'Nội dung văn bản dài...';
    default:
      return 'Giá trị mẫu';
  }
}

/**
 * Lấy mô tả loại field
 */
function getFieldTypeDescription(fieldType: string): string {
  switch (fieldType) {
    case 'text':
      return 'Văn bản ngắn';
    case 'textarea':
      return 'Văn bản dài';
    case 'number':
      return 'Số';
    case 'date':
      return 'Ngày tháng';
    case 'email':
      return 'Email';
    case 'phone':
      return 'Số điện thoại';
    case 'url':
      return 'Đường dẫn URL';
    default:
      return 'Văn bản';
  }
}

/**
 * Lấy mô tả field
 */
function getFieldDescription(field: any): string {
  return field.description || field.displayName || field.fieldName || 'Không có mô tả';
}

/**
 * Lấy quy tắc validation
 */
function getValidationRule(field: any): string {
  const rules = [];
  
  if (field.isRequired) {
    rules.push('Bắt buộc');
  }
  
  switch (field.fieldType) {
    case 'email':
      rules.push('Định dạng email hợp lệ');
      break;
    case 'phone':
      rules.push('Định dạng số điện thoại');
      break;
    case 'number':
      rules.push('Chỉ nhập số');
      break;
    case 'date':
      rules.push('Định dạng ngày tháng');
      break;
    case 'url':
      rules.push('Định dạng URL hợp lệ');
      break;
  }
  
  return rules.length > 0 ? rules.join(', ') : 'Không có quy tắc đặc biệt';
}

/**
 * Parse file Excel để lấy dữ liệu hàng loạt
 */
export function parseExcelForBatchCreation(buffer: Buffer, templateFields: any[]): any[] {
  console.log('EXCEL_PARSE: Starting parse with template fields count:', templateFields.length);
  
  try {
    const workbook = XLSX.read(buffer);
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    
    console.log('EXCEL_PARSE: Reading from sheet:', firstSheetName);
    
    // Chuyển worksheet thành array
    const rawData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    console.log('EXCEL_PARSE: Raw data rows:', rawData.length);
    
    if (rawData.length < 2) {
      throw new Error('File Excel phải có ít nhất 2 dòng (header và dữ liệu)');
    }
    
    // Lấy headers từ dòng đầu tiên
    const headers = rawData[0] as string[];
    console.log('EXCEL_PARSE: Headers:', headers);
    
    // Map headers với template fields
    const fieldMapping = mapHeadersToFields(headers, templateFields);
    console.log('EXCEL_PARSE: Field mapping:', fieldMapping);
    
    // Lấy dữ liệu từ dòng thứ 2 trở đi
    const rows = rawData.slice(1) as any[][];
    console.log('EXCEL_PARSE: Data rows to process:', rows.length);
    
    // Chuyển đổi rows thành documents data
    const documents = rows
      .filter(row => row.some(cell => cell && cell.toString().trim())) // Loại bỏ rows trống
      .map((row, index) => {
        console.log(`EXCEL_PARSE: Processing row ${index + 1}:`, row);
        
        // Lấy tên document từ cột đầu tiên (Document Name)
        const documentName = row[0] ? row[0].toString().trim() : `Văn bản hàng loạt ${index + 1}`;
        
        // Xử lý các field từ cột thứ 2 trở đi (bỏ qua cột Document Name)
        const fields = row.slice(1).map((value, colIndex) => {
          const actualColIndex = colIndex + 1; // +1 vì đã bỏ qua cột đầu
          const field = fieldMapping[actualColIndex];
          if (!field || !field.fieldName) {
            console.log(`EXCEL_PARSE: No field mapping for column ${actualColIndex}, value: ${value}`);
            return null;
          }

          const fieldData = {
            fieldName: field.fieldName,
            fieldValue: value ? value.toString().trim() : ''
          };
          console.log(`EXCEL_PARSE: Mapped field:`, fieldData);
          return fieldData;
        }).filter((field): field is { fieldName: string; fieldValue: string } => 
          field !== null && field.fieldName && field.fieldName.trim() !== ''
        );

        const document = {
          name: documentName,
          fields
        };
        console.log(`EXCEL_PARSE: Created document with ${fields.length} fields:`, document);
        return document;
      });

    console.log('EXCEL_PARSE: Final documents count:', documents.length);
    return documents;
    
  } catch (error) {
    console.error('EXCEL_PARSE: Error parsing Excel:', error);
    throw new Error(`Failed to parse Excel file: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Map headers với template fields
 */
function mapHeadersToFields(headers: string[], templateFields: any[]): any[] {
  return headers.map((header, index) => {
    // Cột đầu tiên là "Document Name", không cần map với template fields
    if (index === 0 && header === 'Document Name') {
      return { fieldName: 'Document Name', isDocumentName: true };
    }
    
    // Tìm field khớp với header, chỉ sử dụng field.name (template field name)
    return templateFields.find(field => field.name === header);
  });
}

/**
 * Xuất dữ liệu văn bản ra file Excel
 */
export async function generateDocumentsExport(documents: any[], template: any): Promise<Buffer> {
  console.log('EXCEL_EXPORT: Starting export with documents count:', documents.length);
  console.log('EXCEL_EXPORT: Template info:', template?.name);
  
  if (!documents || documents.length === 0) {
    throw new Error('No documents to export');
  }
  
  try {
    const workbook = XLSX.utils.book_new();
    
    // Debug: Log first document structure
    console.log('EXCEL_EXPORT: First document structure:', JSON.stringify(documents[0], null, 2));

    // Get unique field names from all documents
    const uniqueFieldNames = getUniqueFieldNames(documents);
    console.log('EXCEL_EXPORT: Unique field names:', uniqueFieldNames);

    // Tạo dữ liệu cho sheet chính
    const documentsData = [
      ['STT', 'Tên văn bản', 'UUID', 'Ngày tạo', 'Ngày cập nhật', 'Đường dẫn file', ...uniqueFieldNames]
    ];

    // Process each document
    for (let index = 0; index < documents.length; index++) {
      const doc = documents[index];
      console.log(`EXCEL_EXPORT: Processing document ${index + 1}:`, doc.name);
      
      // Get document fields from database or document object
      let documentFields = [];
      if (doc.fields && Array.isArray(doc.fields)) {
        documentFields = doc.fields;
      } else if (doc.id) {
        // Fetch fields from database if not included
        try {
          const { getDocumentFields } = await import('../storage');
          documentFields = await getDocumentFields(doc.id);
          console.log(`EXCEL_EXPORT: Fetched ${documentFields.length} fields from database for document ${doc.id}`);
        } catch (error) {
          console.warn(`EXCEL_EXPORT: Could not fetch fields for document ${doc.id}:`, error);
          documentFields = [];
        }
      }
      
      console.log(`EXCEL_EXPORT: Document ${index + 1} fields:`, documentFields);
      
      // Create field values map
      const fieldValues: { [key: string]: string } = {};
      documentFields.forEach((field: any) => {
        const fieldName = field.fieldName || field.field_name;
        const fieldValue = field.fieldValue || field.field_value || '';
        if (fieldName) {
          fieldValues[fieldName] = fieldValue;
        }
      });
      
      console.log(`EXCEL_EXPORT: Field values for document ${index + 1}:`, fieldValues);

      // Create row data
      const row = [
        index + 1, // STT
        doc.name || `Document ${index + 1}`, // Tên văn bản
        doc.uuid || '', // UUID
        doc.createdAt ? new Date(doc.createdAt).toLocaleString('vi-VN') : '', // Ngày tạo
        doc.updatedAt ? new Date(doc.updatedAt).toLocaleString('vi-VN') : '', // Ngày cập nhật
        doc.filePath || '', // Đường dẫn file
        ...uniqueFieldNames.map(fieldName => fieldValues[fieldName] || '') // Field values
      ];

      console.log(`EXCEL_EXPORT: Row data for document ${index + 1}:`, row);
      documentsData.push(row);
    }

    // Tạo worksheet
    const ws = XLSX.utils.aoa_to_sheet(documentsData);

    // Thiết lập độ rộng cột
    const colWidths = [
      { wch: 5 },   // STT
      { wch: 30 },  // Document Name
      { wch: 40 },  // UUID
      { wch: 20 },  // Ngày tạo
      { wch: 20 },  // Ngày cập nhật
      { wch: 50 },  // Đường dẫn file
      ...uniqueFieldNames.map(() => ({ wch: 20 }))
    ];
    ws['!cols'] = colWidths;

    // Thêm worksheet vào workbook
    XLSX.utils.book_append_sheet(workbook, ws, 'Dữ liệu văn bản');

    // Tạo sheet thống kê
    const statsData = [
      ['THỐNG KÊ XUẤT DỮ LIỆU'],
      [''],
      ['Template:', template.name],
      ['Loại:', template.category],
      ['Tổng số văn bản:', documents.length],
      ['Thời gian xuất:', new Date().toLocaleString('vi-VN')],
      [''],
      ['CÁC TRƯỜNG DỮ LIỆU:'],
      ...uniqueFieldNames.map((fieldName, index) => [`${index + 1}. ${fieldName}`])
    ];

    const statsWs = XLSX.utils.aoa_to_sheet(statsData);
    statsWs['!cols'] = [{ wch: 50 }];
    XLSX.utils.book_append_sheet(workbook, statsWs, 'Thống kê');

    // Chuyển workbook thành buffer
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    console.log('EXCEL_EXPORT: Export completed successfully, buffer size:', buffer.length);
    return buffer;
    
  } catch (error) {
    console.error('EXCEL_EXPORT: Error during export:', error);
    throw new Error(`Failed to generate Excel export: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Lấy tất cả tên field duy nhất từ documents
 */
function getUniqueFieldNames(documents: any[]): string[] {
  const fieldNames = new Set<string>();
  documents.forEach(doc => {
    if (doc.fields && Array.isArray(doc.fields)) {
      doc.fields.forEach((field: any) => {
        if (field && field.fieldName) {
          fieldNames.add(field.fieldName);
        }
      });
    }
  });
  return Array.from(fieldNames).sort();
}