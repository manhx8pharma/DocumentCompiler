# DocCompile - Setup Instructions

## Yêu cầu hệ thống
- Node.js 18+ 
- PostgreSQL
- Git

## Cài đặt và chạy dự án

### 1. Clone repository
```bash
git clone https://github.com/manhx8pharma/DocumentCompiler.git
cd DocumentCompiler
```

### 2. Cài đặt dependencies
```bash
npm install
```

### 3. Cấu hình database
```bash
# Tạo file .env từ .env.example (nếu có)
cp .env.example .env

# Cập nhật DATABASE_URL trong .env
DATABASE_URL="postgresql://username:password@localhost:5432/doccompile"
```

### 4. Chạy database migrations
```bash
npm run db:push
```

### 5. Seed database với dữ liệu mẫu
```bash
npm run db:seed
```

### 6. Chạy ứng dụng
```bash
npm run dev
```

Ứng dụng sẽ chạy tại: http://localhost:5000

## Cấu trúc dự án

```
DocumentCompiler/
├── client/                 # Frontend React + TypeScript
│   ├── src/
│   │   ├── components/    # UI Components
│   │   ├── pages/         # Application pages
│   │   ├── lib/           # Utilities và helpers
│   │   └── hooks/         # Custom React hooks
├── server/                # Backend Node.js + Express
│   ├── controllers/       # Route controllers
│   ├── services/          # Business logic
│   ├── routes.ts          # API routes
│   └── index.ts           # Server entry point
├── shared/                # Shared types và schemas
│   └── schema.ts          # Database schema (Drizzle)
├── db/                    # Database configuration
│   ├── index.ts           # Database connection
│   └── seed.ts            # Database seeding
└── storage/               # File storage
    ├── templates/         # Template files
    └── documents/         # Generated documents
```

## Tính năng chính

- ✅ Upload và quản lý template Word (.docx)
- ✅ Tạo document từ template với form dynamic
- ✅ Xử lý batch documents từ file Excel
- ✅ Hệ thống approval cho batch processing
- ✅ Preview document real-time
- ✅ Export và download documents
- ✅ Search và filter documents

## Công nghệ sử dụng

### Frontend
- React 18 + TypeScript
- Vite (build tool)
- Tailwind CSS + shadcn/ui
- TanStack Query (state management)
- Wouter (routing)
- React Hook Form + Zod (forms)

### Backend  
- Node.js + Express + TypeScript
- Drizzle ORM + PostgreSQL
- Multer (file upload)
- Docxtemplater (Word processing)
- Mammoth (document conversion)

### Database
- PostgreSQL với Drizzle ORM
- UUID primary keys
- Relations giữa tables
- Type-safe queries

## Scripts có sẵn

```bash
# Development
npm run dev          # Chạy both frontend & backend

# Database
npm run db:push      # Sync schema với database
npm run db:seed      # Seed database với dữ liệu mẫu

# Build
npm run build        # Build production

# Other
npm run lint         # Lint code
npm run typecheck    # Check TypeScript types
```

## Troubleshooting

### Database connection issues
1. Đảm bảo PostgreSQL đang chạy
2. Kiểm tra DATABASE_URL trong .env
3. Đảm bảo database user có quyền tạo database

### File upload issues
1. Kiểm tra thư mục storage/ có quyền write
2. Đảm bảo multer middleware được cấu hình đúng

### Build issues
1. Chạy `npm run typecheck` để kiểm tra TypeScript errors
2. Clear node_modules và reinstall: `rm -rf node_modules && npm install`

## Development Notes

- Dự án sử dụng Drizzle ORM cho type-safe database operations
- Frontend và backend share types thông qua `shared/schema.ts`
- File upload được xử lý với multer và lưu trong storage/
- Document processing sử dụng docxtemplater cho Word files
- Real-time preview được generate từ template HTML conversion