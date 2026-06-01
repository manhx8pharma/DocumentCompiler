import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

// This is the correct way neon config - DO NOT change this
neonConfig.webSocketConstructor = ws;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.on('error', (err) => {
  console.error('[DB Pool] Connection error (will reconnect):', err.message);
  // Do NOT call process.exit() - pool handles reconnection automatically
});

export const db = drizzle({ client: pool, schema });

// Enable pg_trgm extension and GIN trigram indexes for fast ILIKE search on name columns.
// These are created here (not in shared/schema.ts) because Drizzle ORM's schema DSL
// does not support GIN indexes with custom operator classes (e.g. gin_trgm_ops).
// Using IF NOT EXISTS makes startup idempotent; db:push will drop them only if they
// conflict with schema-managed indexes (they don't — different index names).
// Runs once at startup; IF NOT EXISTS makes it idempotent and safe to re-run.
(async () => {
  const client = await pool.connect();
  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');
    await client.query(`CREATE INDEX IF NOT EXISTS idx_templates_name_trgm ON templates USING gin(lower(name) gin_trgm_ops)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_documents_name_trgm ON documents USING gin(lower(name) gin_trgm_ops)`);
    // Advanced search: GIN trigram on document field values and table JSONB rows
    await client.query(`CREATE INDEX IF NOT EXISTS idx_document_fields_value_trgm ON document_fields USING gin(lower(field_value) gin_trgm_ops)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_document_table_data_rows_trgm ON document_table_data USING gin((rows::text) gin_trgm_ops)`);
    console.log('[DB] pg_trgm extension and trigram indexes ready');
  } catch (err: any) {
    console.warn('[DB] pg_trgm setup failed (non-fatal):', err?.message);
  } finally {
    client.release();
  }
})().catch((err: any) => {
  console.warn('[DB] Could not connect for pg_trgm setup:', err?.message);
});