# Architecture Documentation

## 1. Overview

This repository contains a Document Management System application built with a modern web stack. The system allows users to manage, create, and modify document templates and generate documents based on those templates.

The application follows a client-server architecture with a clear separation between frontend and backend components. It uses React for the frontend UI and Node.js/Express for the backend API, with PostgreSQL as the database managed through Drizzle ORM.

Key features include:
- Template management (upload, preview, download)
- Document generation from templates
- Category-based organization
- Field-based document customization

## 2. System Architecture

The application follows a 3-tier architecture:

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Document Management System                       │
├────────────────┬──────────────────────────┬────────────────────────┤
│   Frontend     │         Database          │        Backend         │
│   (React.js)   │       (PostgreSQL)        │      (Node.js/Express) │
└────────────────┴──────────────────────────┴────────────────────────┘
```

### 2.1 Directory Structure

```
├── client/                   # Frontend React application
│   ├── src/                  # Source code
│   │   ├── components/       # UI components
│   │   ├── hooks/            # Custom React hooks
│   │   ├── lib/              # Utility functions
│   │   ├── pages/            # Page components
│   │   └── main.tsx          # Application entry point
│
├── server/                   # Backend Express application
│   ├── controllers/          # Route handlers
│   ├── services/             # Business logic
│   ├── utils/                # Helper functions
│   ├── routes.ts             # API route definitions
│   ├── index.ts              # Server entry point
│   └── vite.ts               # Vite integration
│
├── db/                       # Database configuration
│   ├── index.ts              # DB connection setup
│   └── seed.ts               # Database seeding
│
├── shared/                   # Shared code between frontend and backend
│   └── schema.ts             # Drizzle ORM schema definitions
│
└── storage/                  # Storage for templates and documents
```

## 3. Key Components

### 3.1 Frontend Architecture

The frontend is built with React and uses a component-based architecture. Key frontend technologies include:

- **React**: Core UI library
- **React Query**: For data fetching and state management
- **Shadcn UI**: Component library based on Radix UI primitives
- **Tailwind CSS**: For styling
- **Wouter**: For client-side routing

The frontend is organized into:

- **Pages**: Main view components representing full pages
- **Components**: Reusable UI components
- **Hooks**: Custom React hooks for shared logic
- **Lib**: Utility functions and service integrations

### 3.2 Backend Architecture

The backend is built with Node.js and Express, organized in a modular structure:

- **Controllers**: Handle HTTP requests and responses
- **Services**: Implement business logic
- **Utils**: Provide helper functions for document processing and file management
- **Routes**: Define API endpoints

Key backend functionality includes:
- Template management
- Document generation from templates
- File storage and retrieval
- DOCX processing and manipulation

### 3.3 Database Architecture

The application uses PostgreSQL for data storage, with Drizzle ORM for database interaction. The schema is defined in `shared/schema.ts` and includes:

- **Users**: Basic user management
- **Templates**: Document templates with metadata
- **TemplateFields**: Fields associated with templates
- **Documents**: Generated documents
- **DocumentFields**: Field values for generated documents

The database connection is established in `db/index.ts` using Neon serverless Postgres.

### 3.4 Storage System

File storage is managed through a custom storage system implemented in `server/storage.ts` and `server/utils/file-helpers.ts`. Key features include:

- Centralized storage of templates and documents
- File organization in separate directories
- Secure file naming using UUID
- Support for DOCX file operations

## 4. Data Flow

### 4.1 Template Management Flow

1. User uploads a template file through the frontend
2. File is processed on the backend to extract fields/placeholders
3. Template metadata and file path are stored in the database
4. Template is available for preview and document generation

### 4.2 Document Generation Flow

1. User selects a template and provides field values
2. Backend processes the template with provided values
3. A new document is generated using document generation utilities
4. Document metadata and file path are stored in the database
5. Document is available for preview and download

### 4.3 API Structure

The API follows a RESTful design pattern with the following main endpoints:

**Template APIs:**
- `GET /api/templates`: List all templates
- `GET /api/templates/:id`: Get template details
- `GET /api/templates/:id/fields`: Get template fields
- `GET /api/templates/:id/download`: Download template file
- `GET /api/templates/:id/preview`: Preview template
- `POST /api/templates`: Create a new template
- `PUT /api/templates/:id`: Update a template
- `DELETE /api/templates/:id`: Delete a template

**Document APIs:**
- `GET /api/documents`: List all documents
- `GET /api/documents/:id`: Get document details
- `GET /api/documents/:id/fields`: Get document fields
- `GET /api/documents/:id/download`: Download document file
- `GET /api/documents/:id/preview`: Preview document
- `POST /api/documents`: Create a new document
- `DELETE /api/documents/:id`: Delete a document

## 5. External Dependencies

### 5.1 Frontend Dependencies

- **@radix-ui**: UI component primitives
- **@tanstack/react-query**: Data fetching and state management
- **clsx/tailwind-merge**: Utility-first CSS
- **cmdk**: Command menu interface
- **date-fns**: Date formatting
- **lucide-react**: Icon library
- **react-hook-form**: Form handling
- **wouter**: Client-side routing
- **zod**: Schema validation

### 5.2 Backend Dependencies

- **express**: Web framework
- **docxtemplater/pizzip**: DOCX file manipulation
- **mammoth**: DOCX to HTML conversion
- **multer**: File upload handling
- **uuid**: Unique ID generation
- **@neondatabase/serverless**: Serverless Postgres client

### 5.3 Shared Dependencies

- **drizzle-orm**: ORM for database interactions
- **drizzle-zod**: Schema validation for database
- **zod**: Schema validation

## 6. Deployment Strategy

The application is configured for deployment on Replit with the following strategy:

### 6.1 Build Process

The build process is defined in package.json:
- Development: `npm run dev` (uses tsx for TypeScript execution)
- Production Build: `npm run build` (uses Vite for frontend and esbuild for backend)
- Production Start: `npm run start` (runs the built application)

### 6.2 Environment Configuration

- Environment variables defined include: 
  - `DATABASE_URL`: For database connection
  - `NODE_ENV`: For environment detection

### 6.3 Infrastructure

- The application leverages Replit's infrastructure
- PostgreSQL is used as the database, specifically Neon serverless PostgreSQL
- Static assets are served through the Express server
- File storage is handled via the local filesystem

### 6.4 Scalability Considerations

- The deployment target is set to "autoscale" in the Replit configuration
- The application is designed to separate concerns between frontend, backend, and database services

## 7. Authentication and Authorization

The application includes a basic user authentication system with:
- User registration and login functionality
- Password hashing for security
- Session management

This system is minimal in the current implementation but structured to allow expansion.

## 8. Development Workflow

The development workflow is facilitated by:
- TypeScript for type safety across the codebase
- ESBuild and Vite for fast development and build times
- Shared schemas between frontend and backend
- Database migration and seeding utilities

---

This architecture is designed to provide a clean separation of concerns while maintaining a cohesive application structure. The system prioritizes modularity, reusability, and maintainability through its component-based design and clear API boundaries.