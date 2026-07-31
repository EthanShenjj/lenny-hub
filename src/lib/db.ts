import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { paths } from "@/lib/paths";

declare global {
  var __lennyHubDb: Database.Database | undefined;
}

function migrate(db: Database.Database) {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("synchronous = NORMAL");
  db.pragma("busy_timeout = 5000");

  db.exec(`
    CREATE TABLE IF NOT EXISTS content_items (
      id TEXT PRIMARY KEY,
      dedupe_key TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL CHECK(type IN ('podcast', 'newsletter')),
      title TEXT NOT NULL,
      normalized_title TEXT NOT NULL,
      guest TEXT,
      published_at TEXT,
      source_url TEXT,
      video_id TEXT,
      description TEXT,
      tags_json TEXT NOT NULL DEFAULT '[]',
      body TEXT NOT NULL DEFAULT '',
      word_count INTEGER NOT NULL DEFAULT 0,
      body_status TEXT NOT NULL DEFAULT 'missing'
        CHECK(body_status IN ('available', 'preview', 'missing')),
      content_hash TEXT NOT NULL,
      imported_source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_content_type ON content_items(type);
    CREATE INDEX IF NOT EXISTS idx_content_date ON content_items(published_at DESC);
    CREATE INDEX IF NOT EXISTS idx_content_guest ON content_items(guest);
    CREATE INDEX IF NOT EXISTS idx_content_video ON content_items(video_id);
    CREATE INDEX IF NOT EXISTS idx_content_source_url ON content_items(source_url);
    CREATE INDEX IF NOT EXISTS idx_content_title_date
      ON content_items(type, normalized_title, published_at);

    CREATE TABLE IF NOT EXISTS content_chunks (
      id TEXT PRIMARY KEY,
      content_item_id TEXT NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
      ordinal INTEGER NOT NULL,
      heading TEXT,
      speaker TEXT,
      timestamp_seconds INTEGER,
      quote_text TEXT NOT NULL,
      anchor TEXT NOT NULL,
      UNIQUE(content_item_id, ordinal)
    );

    CREATE INDEX IF NOT EXISTS idx_chunks_content
      ON content_chunks(content_item_id, ordinal);

    CREATE TABLE IF NOT EXISTS insights (
      id TEXT PRIMARY KEY,
      content_item_id TEXT NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
      payload_json TEXT NOT NULL,
      citations_json TEXT NOT NULL,
      source_hash TEXT NOT NULL,
      model TEXT NOT NULL,
      provider TEXT NOT NULL,
      stale INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_insights_content
      ON insights(content_item_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS weekly_digests (
      id TEXT PRIMARY KEY,
      week_start TEXT NOT NULL UNIQUE,
      week_end TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      model TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_runs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      trigger_type TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      added_count INTEGER NOT NULL DEFAULT 0,
      updated_count INTEGER NOT NULL DEFAULT 0,
      skipped_count INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      details_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS analysis_jobs (
      id TEXT PRIMARY KEY,
      content_item_id TEXT REFERENCES content_items(id) ON DELETE CASCADE,
      job_type TEXT NOT NULL,
      status TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS content_embeddings (
      content_item_id TEXT PRIMARY KEY REFERENCES content_items(id) ON DELETE CASCADE,
      source_hash TEXT NOT NULL,
      model TEXT NOT NULL,
      vector_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS content_fts USING fts5(
      content_item_id UNINDEXED,
      title,
      guest,
      tags,
      body,
      tokenize = 'unicode61 remove_diacritics 2'
    );
  `);

  const insightColumns = db.pragma("table_info(insights)") as Array<{ name: string }>;
  const hasInsightColumn = (name: string) =>
    insightColumns.some((column) => column.name === name);
  if (!hasInsightColumn("raw_markdown")) {
    db.exec("ALTER TABLE insights ADD COLUMN raw_markdown TEXT");
  }
  if (!hasInsightColumn("source_path")) {
    db.exec("ALTER TABLE insights ADD COLUMN source_path TEXT");
  }
  if (!hasInsightColumn("import_hash")) {
    db.exec("ALTER TABLE insights ADD COLUMN import_hash TEXT");
  }
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_insights_source_path
      ON insights(source_path) WHERE source_path IS NOT NULL;
  `);
}

export function getDb() {
  if (globalThis.__lennyHubDb) return globalThis.__lennyHubDb;
  fs.mkdirSync(path.dirname(paths.database), { recursive: true });
  const db = new Database(paths.database);
  migrate(db);
  globalThis.__lennyHubDb = db;
  return db;
}

export function hasImportedContent() {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS count FROM content_items")
    .get() as { count: number };
  return row.count > 0;
}

export async function ensureImported() {
  if (process.env.SUPABASE_DATABASE_URL) return;
  if (hasImportedContent()) return;
  const { importAllData } = await import("@/lib/importer");
  importAllData();
}
