# Hướng dẫn Upload Project lên GitHub

## Chuẩn bị Repository

1. **Tạo Repository mới trên GitHub**:
   - Đi tới: https://github.com/manhx8pharma/DocumentCompiler
   - Nếu chưa có, tạo repository mới với tên `DocumentCompiler`
   - Chọn Public repository
   - Không init với README (vì đã có sẵn)

## Các bước Upload

### 1. Khởi tạo Git (nếu chưa có)
```bash
git init
git add .
git commit -m "Initial commit: Document Compiler System"
```

### 2. Kết nối với GitHub Repository
```bash
git remote add origin https://github.com/manhx8pharma/DocumentCompiler.git
git branch -M main
```

### 3. Push code lên GitHub
```bash
git push -u origin main
```

### 4. Nếu gặp lỗi authentication
Sử dụng Personal Access Token:
```bash
git remote set-url origin https://[YOUR_TOKEN]@github.com/manhx8pharma/DocumentCompiler.git
git push -u origin main
```

## Files cần loại trừ (.gitignore)

Đảm bảo .gitignore đã bao gồm:
```
# Dependencies
node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Build outputs
dist/
build/

# Storage files
storage/templates/*
storage/documents/*
!storage/templates/.gitkeep
!storage/documents/.gitkeep

# Database
*.db
*.sqlite

# IDE
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Logs
logs/
*.log
```

## Cấu trúc files cần upload

✅ **CÓ upload**:
- `client/` - Frontend React code
- `server/` - Backend Express code  
- `shared/` - Shared types/schemas
- `db/` - Database utilities
- `scripts/` - Database scripts
- `package.json` - Dependencies
- `package-lock.json` - Lock file
- `tsconfig.json` - TypeScript config
- `tailwind.config.ts` - Tailwind config
- `vite.config.ts` - Vite config
- `drizzle.config.ts` - Drizzle config
- `README.md` - Documentation
- `.env.example` - Environment template
- `.gitignore` - Git ignore rules

❌ **KHÔNG upload**:
- `node_modules/` - Dependencies (sẽ install lại)
- `.env` - Environment variables (chứa secrets)
- `storage/templates/*` - User uploaded files
- `storage/documents/*` - Generated documents
- Build outputs

## Sau khi upload thành công

1. **Kiểm tra Repository**:
   - Vào https://github.com/manhx8pharma/DocumentCompiler
   - Đảm bảo tất cả files đã được upload
   - README.md hiển thị đúng

2. **Cập nhật README nếu cần**:
   - Clone URL: `https://github.com/manhx8pharma/DocumentCompiler.git`
   - Installation instructions
   - Demo link (nếu có deploy)

3. **Tạo Release (tùy chọn)**:
   - Vào tab "Releases"
   - Click "Create a new release"
   - Tag: v1.0.0
   - Title: "Document Compiler v1.0.0"
   - Mô tả các tính năng chính

## Troubleshooting

### Lỗi thường gặp:

1. **Authentication failed**:
   ```bash
   # Sử dụng Personal Access Token thay vì password
   git remote set-url origin https://[TOKEN]@github.com/manhx8pharma/DocumentCompiler.git
   ```

2. **Large files warning**:
   ```bash
   # Nếu có file quá lớn, loại bỏ khỏi git
   git rm --cached [large-file]
   git commit -m "Remove large file"
   ```

3. **Repository already exists**:
   ```bash
   # Force push (cẩn thận!)
   git push -f origin main
   ```

## Verification Checklist

- [ ] Repository đã được tạo: https://github.com/manhx8pharma/DocumentCompiler
- [ ] Tất cả source code đã được upload
- [ ] README.md hiển thị đầy đủ thông tin
- [ ] .gitignore hoạt động đúng (không có node_modules, .env)
- [ ] Package.json có đầy đủ dependencies
- [ ] Project có thể clone và chạy được

## Next Steps

Sau khi upload thành công:
1. Chia sẻ repository link
2. Setup CI/CD nếu cần
3. Deploy to production (Vercel, Netlify, Railway, etc.)
4. Invite collaborators nếu có