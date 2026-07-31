import Database from "better-sqlite3";
import postgres from "postgres";
import { paths } from "../src/lib/paths";

type SourceRow = Record<string, unknown>;

const connectionString = process.env.SUPABASE_DATABASE_URL;
if (!connectionString) throw new Error("缺少 SUPABASE_DATABASE_URL。");
if (!process.argv.includes("--replace")) {
  throw new Error("迁移会替换 Supabase 中现有表数据，请显式添加 --replace。");
}

const source = new Database(paths.database, { readonly: true });
const target = postgres(connectionString, {
  max: 2,
  prepare: false,
  ssl: "require",
  connect_timeout: 20,
  idle_timeout: 30,
});

const schema = `
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
    created_at TEXT NOT NULL,
    raw_markdown TEXT,
    source_path TEXT,
    import_hash TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_insights_content
    ON insights(content_item_id, created_at DESC);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_insights_source_path
    ON insights(source_path) WHERE source_path IS NOT NULL;

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
`;

const tables = [
  {
    name: "content_items",
    columns: [
      "id", "dedupe_key", "type", "title", "normalized_title", "guest",
      "published_at", "source_url", "video_id", "description", "tags_json", "body",
      "word_count", "body_status", "content_hash", "imported_source", "created_at", "updated_at",
    ],
    batchSize: 25,
  },
  {
    name: "content_chunks",
    columns: [
      "id", "content_item_id", "ordinal", "heading", "speaker", "timestamp_seconds",
      "quote_text", "anchor",
    ],
    batchSize: 500,
  },
  {
    name: "insights",
    columns: [
      "id", "content_item_id", "payload_json", "citations_json", "source_hash", "model",
      "provider", "stale", "created_at", "raw_markdown", "source_path", "import_hash",
    ],
    batchSize: 50,
  },
  {
    name: "weekly_digests",
    columns: ["id", "week_start", "week_end", "payload_json", "model", "created_at"],
    batchSize: 100,
  },
  {
    name: "sync_runs",
    columns: [
      "id", "status", "trigger_type", "started_at", "completed_at", "added_count",
      "updated_count", "skipped_count", "error_message", "details_json",
    ],
    batchSize: 100,
  },
  {
    name: "analysis_jobs",
    columns: [
      "id", "content_item_id", "job_type", "status", "attempts", "error_message",
      "created_at", "updated_at",
    ],
    batchSize: 100,
  },
  {
    name: "content_embeddings",
    columns: ["content_item_id", "source_hash", "model", "vector_json", "created_at"],
    batchSize: 100,
  },
] as const;

async function insertBatch(table: string, columns: readonly string[], rows: SourceRow[]) {
  if (!rows.length) return;
  const values: unknown[] = [];
  const tuples = rows.map((row) => {
    const placeholders = columns.map((column) => {
      values.push(row[column] ?? null);
      return `$${values.length}`;
    });
    return `(${placeholders.join(", ")})`;
  });
  await target.unsafe(
    `INSERT INTO ${table} (${columns.join(",")}) VALUES ${tuples.join(",")}`,
    values as never[],
  );
}

async function main() {
  try {
    await target.unsafe(schema);
    await target.unsafe(
    `TRUNCATE content_embeddings, analysis_jobs, sync_runs, weekly_digests,
      insights, content_chunks, content_items RESTART IDENTITY CASCADE`,
    );
    for (const table of tables) {
      const rows = source.prepare(`SELECT ${table.columns.join(",")} FROM ${table.name}`).all() as SourceRow[];
      console.log(`${table.name}: 准备迁移 ${rows.length} 行`);
      for (let offset = 0; offset < rows.length; offset += table.batchSize) {
        await insertBatch(table.name, table.columns, rows.slice(offset, offset + table.batchSize));
        const completed = Math.min(offset + table.batchSize, rows.length);
        if (completed === rows.length || completed % (table.batchSize * 20) === 0) {
          console.log(`${table.name}: ${completed}/${rows.length}`);
        }
      }
    }
    const counts = await target.unsafe<Array<{ table_name: string; row_count: number }>>(`
      SELECT 'content_items' AS table_name, COUNT(*)::int AS row_count FROM content_items
      UNION ALL SELECT 'content_chunks', COUNT(*)::int FROM content_chunks
      UNION ALL SELECT 'insights', COUNT(*)::int FROM insights
    `);
    console.log("迁移完成：", Object.fromEntries(counts.map((row) => [row.table_name, row.row_count])));
  } finally {
    source.close();
    await target.end({ timeout: 10 });
  }
}

void main();
