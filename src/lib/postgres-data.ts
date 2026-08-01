import { PAGE_SIZE, TOPICS } from "@/lib/constants";
import { getPostgres } from "@/lib/postgres";
import type {
  ContentDetail,
  ContentQuery,
  ContentSearchResult,
  ContentSummary,
  DashboardStats,
  StoredInsight,
  SyncRun,
  WeeklyDigest,
} from "@/lib/types";

type Row = Record<string, unknown>;

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "string") return value as T;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function summaryFromRow(row: Row): ContentSummary {
  const status = String(row.insight_status || "not_started");
  return {
    id: String(row.id),
    type: String(row.type) as ContentSummary["type"],
    title: String(row.title),
    guest: row.guest ? String(row.guest) : null,
    publishedAt: row.published_at ? String(row.published_at) : null,
    sourceUrl: row.source_url ? String(row.source_url) : null,
    description: row.description ? String(row.description) : null,
    tags: parseJson<string[]>(row.tags_json, []),
    wordCount: Number(row.word_count || 0),
    bodyStatus: String(row.body_status) as ContentSummary["bodyStatus"],
    insightStatus: ["ready", "stale", "failed", "running"].includes(status)
      ? (status as ContentSummary["insightStatus"])
      : "not_started",
    importedSource: String(row.imported_source),
    relevance:
      row.relevance === undefined || row.relevance === null
        ? undefined
        : Number(row.relevance),
  };
}

const insightStatusSql = `
  CASE
    WHEN EXISTS (
      SELECT 1 FROM analysis_jobs j
      WHERE j.content_item_id = c.id AND j.status = 'running'
    ) THEN 'running'
    WHEN EXISTS (
      SELECT 1 FROM insights i
      WHERE i.content_item_id = c.id AND i.stale = 0
    ) THEN 'ready'
    WHEN EXISTS (
      SELECT 1 FROM insights i WHERE i.content_item_id = c.id
    ) THEN 'stale'
    WHEN EXISTS (
      SELECT 1 FROM analysis_jobs j
      WHERE j.content_item_id = c.id AND j.status = 'failed'
    ) THEN 'failed'
    ELSE 'not_started'
  END
`;

const contentSummaryColumns = `
  c.id,
  c.type,
  c.title,
  c.guest,
  c.published_at,
  c.source_url,
  c.description,
  c.tags_json,
  c.word_count,
  c.body_status,
  c.imported_source
`;

function buildContentQuery(query: ContentQuery, count = false) {
  const values: unknown[] = [];
  const where: string[] = [];
  const add = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  const q = query.q?.trim();
  if (query.type && query.type !== "all") where.push(`c.type = ${add(query.type)}`);
  if (query.topic) {
    where.push(
      `EXISTS (SELECT 1 FROM jsonb_array_elements_text(c.tags_json::jsonb) tag WHERE tag = ${add(query.topic)})`,
    );
  }
  if (query.year) where.push(`substring(c.published_at, 1, 4) = ${add(query.year)}`);
  if (query.guest) where.push(`c.guest = ${add(query.guest)}`);
  if (query.bodyStatus && query.bodyStatus !== "all") {
    where.push(`c.body_status = ${add(query.bodyStatus)}`);
  }
  if (query.insightStatus && query.insightStatus !== "all") {
    where.push(`(${insightStatusSql}) = ${add(query.insightStatus)}`);
  }
  if (q) {
    const pattern = add(`%${q}%`);
    where.push(
      `(c.title ILIKE ${pattern} OR COALESCE(c.guest, '') ILIKE ${pattern} OR COALESCE(c.description, '') ILIKE ${pattern} OR c.tags_json ILIKE ${pattern})`,
    );
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  if (count) {
    return { text: `SELECT COUNT(*)::int AS count FROM content_items c ${whereSql}`, values };
  }

  let orderBy = "c.published_at DESC NULLS LAST, c.title ASC";
  if (query.sort === "length") orderBy = "c.word_count DESC, c.published_at DESC NULLS LAST";
  const page = Math.max(1, query.page || 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize || PAGE_SIZE));
  const limit = add(pageSize);
  const offset = add((page - 1) * pageSize);
  return {
    text: `SELECT ${contentSummaryColumns}, ${insightStatusSql} AS insight_status
      FROM content_items c ${whereSql}
      ORDER BY ${orderBy} LIMIT ${limit} OFFSET ${offset}`,
    values,
  };
}

async function getFacets() {
  const sql = getPostgres();
  const [yearRows, guestRows, topicRows] = await Promise.all([
    sql.unsafe<Row[]>(
      `SELECT DISTINCT substring(published_at, 1, 4) AS value
       FROM content_items WHERE published_at IS NOT NULL ORDER BY value DESC`,
    ),
    sql.unsafe<Row[]>(
      `SELECT guest AS value, COUNT(*) AS count FROM content_items
       WHERE guest IS NOT NULL AND guest != ''
       GROUP BY guest ORDER BY count DESC, guest ASC`,
    ),
    sql.unsafe<Row[]>(
      `SELECT tag AS value, COUNT(*) AS count
       FROM content_items c
       CROSS JOIN LATERAL jsonb_array_elements_text(c.tags_json::jsonb) tag
       GROUP BY tag ORDER BY count DESC`,
    ),
  ]);
  return {
    years: yearRows.map((row) => String(row.value)),
    guests: guestRows.map((row) => String(row.value)),
    topics: topicRows.map((row) => String(row.value)),
  };
}

export async function getPostgresContent(
  query: ContentQuery,
): Promise<ContentSearchResult> {
  const sql = getPostgres();
  const page = Math.max(1, query.page || 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize || PAGE_SIZE));
  const listQuery = buildContentQuery({ ...query, page, pageSize });
  const countQuery = buildContentQuery(query, true);
  const [rows, countRows, facets] = await Promise.all([
    sql.unsafe<Row[]>(listQuery.text, listQuery.values as never[]),
    sql.unsafe<Row[]>(countQuery.text, countQuery.values as never[]),
    getFacets(),
  ]);
  return {
    items: rows.map(summaryFromRow),
    total: Number(countRows[0]?.count || 0),
    page,
    pageSize,
    searchMode: query.mode === "semantic" ? "semantic-fallback" : "keyword",
    notice:
      query.mode === "semantic"
        ? "线上数据库暂以全文关键词检索返回结果。"
        : undefined,
    facets,
  };
}

function parseInsight(row: Row | undefined): StoredInsight | null {
  if (!row) return null;
  return {
    id: String(row.id),
    contentItemId: String(row.content_item_id),
    payload: parseJson(row.payload_json, {} as StoredInsight["payload"]),
    citations: parseJson(row.citations_json, []),
    model: String(row.model),
    createdAt: String(row.created_at),
    stale: Boolean(Number(row.stale)),
  };
}

export async function getPostgresContentById(id: string): Promise<ContentDetail | null> {
  const sql = getPostgres();
  const [items, chunks, insights] = await Promise.all([
    sql.unsafe<Row[]>(
      `SELECT c.*, ${insightStatusSql} AS insight_status FROM content_items c WHERE id = $1`,
      [id],
    ),
    sql.unsafe<Row[]>(
      `SELECT id, ordinal, heading, speaker, timestamp_seconds, quote_text, anchor
       FROM content_chunks WHERE content_item_id = $1 ORDER BY ordinal`,
      [id],
    ),
    sql.unsafe<Row[]>(
      `SELECT * FROM insights WHERE content_item_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [id],
    ),
  ]);
  const row = items[0];
  if (!row) return null;
  return {
    ...summaryFromRow(row),
    body: String(row.body || ""),
    contentHash: String(row.content_hash),
    chunks: chunks.map((chunk) => ({
      id: String(chunk.id),
      ordinal: Number(chunk.ordinal),
      heading: chunk.heading ? String(chunk.heading) : null,
      speaker: chunk.speaker ? String(chunk.speaker) : null,
      timestampSeconds:
        chunk.timestamp_seconds === null ? null : Number(chunk.timestamp_seconds),
      quoteText: String(chunk.quote_text),
      anchor: String(chunk.anchor),
    })),
    insight: parseInsight(insights[0]),
  };
}

export async function getPostgresDashboardStats(): Promise<DashboardStats> {
  const sql = getPostgres();
  const [totalsRows, analyzedRows, trendRows, distributionRows, coverageRows, recentRows, availabilityRows] =
    await Promise.all([
      sql.unsafe<Row[]>(`SELECT COUNT(*)::int AS all_count,
        COUNT(*) FILTER (WHERE type = 'podcast')::int AS podcasts,
        COUNT(*) FILTER (WHERE type = 'newsletter')::int AS newsletters,
        COUNT(*) FILTER (WHERE created_at::timestamptz >= now() - interval '7 days')::int AS added_this_week
        FROM content_items`),
      sql.unsafe<Row[]>(
        `SELECT COUNT(DISTINCT content_item_id)::int AS count FROM insights WHERE stale = 0`,
      ),
      sql.unsafe<Row[]>(`SELECT substring(published_at, 1, 7) AS month,
        COUNT(*) FILTER (WHERE type = 'podcast')::int AS podcast,
        COUNT(*) FILTER (WHERE type = 'newsletter')::int AS newsletter
        FROM content_items WHERE published_at IS NOT NULL
        GROUP BY month ORDER BY month DESC LIMIT 18`),
      sql.unsafe<Row[]>(`SELECT tag AS topic, COUNT(*)::int AS count
        FROM content_items c CROSS JOIN LATERAL jsonb_array_elements_text(c.tags_json::jsonb) tag
        GROUP BY tag ORDER BY count DESC`),
      sql.unsafe<Row[]>(`SELECT tag AS topic,
        COUNT(*) FILTER (WHERE c.type = 'podcast')::int AS podcast,
        COUNT(*) FILTER (WHERE c.type = 'newsletter')::int AS newsletter
        FROM content_items c CROSS JOIN LATERAL jsonb_array_elements_text(c.tags_json::jsonb) tag
        GROUP BY tag`),
      sql.unsafe<Row[]>(`SELECT i.content_item_id, c.title, c.type, i.created_at, i.model
        FROM insights i JOIN content_items c ON c.id = i.content_item_id
        ORDER BY i.created_at DESC LIMIT 5`),
      sql.unsafe<Row[]>(`SELECT
        COUNT(*) FILTER (WHERE body_status = 'available')::int AS available,
        COUNT(*) FILTER (WHERE body_status = 'preview')::int AS preview,
        COUNT(*) FILTER (WHERE body_status = 'missing')::int AS missing
        FROM content_items`),
    ]);
  const totals = totalsRows[0] || {};
  const availability = availabilityRows[0] || {};
  return {
    totals: {
      all: Number(totals.all_count || 0),
      podcasts: Number(totals.podcasts || 0),
      newsletters: Number(totals.newsletters || 0),
      topics: TOPICS.length,
      analyzed: Number(analyzedRows[0]?.count || 0),
      addedThisWeek: Number(totals.added_this_week || 0),
    },
    monthlyTrend: trendRows.reverse().map((row) => ({
      month: String(row.month),
      podcast: Number(row.podcast),
      newsletter: Number(row.newsletter),
    })),
    topicDistribution: TOPICS.map((topic) => ({
      topic,
      count: Number(distributionRows.find((row) => row.topic === topic)?.count || 0),
    })),
    topicCoverage: TOPICS.map((topic) => {
      const row = coverageRows.find((item) => item.topic === topic);
      return { topic, podcast: Number(row?.podcast || 0), newsletter: Number(row?.newsletter || 0) };
    }),
    recentInsights: recentRows.map((row) => ({
      contentId: String(row.content_item_id),
      title: String(row.title),
      type: String(row.type) as "podcast" | "newsletter",
      createdAt: String(row.created_at),
      model: String(row.model),
    })),
    bodyAvailability: {
      available: Number(availability.available || 0),
      preview: Number(availability.preview || 0),
      missing: Number(availability.missing || 0),
    },
  };
}

export async function getPostgresSyncRuns(limit = 20): Promise<SyncRun[]> {
  const rows = await getPostgres().unsafe<Row[]>(
    "SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT $1",
    [limit],
  );
  return rows.map((row) => ({
    id: String(row.id),
    status: String(row.status) as SyncRun["status"],
    trigger: String(row.trigger_type) as SyncRun["trigger"],
    startedAt: String(row.started_at),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    addedCount: Number(row.added_count),
    updatedCount: Number(row.updated_count),
    skippedCount: Number(row.skipped_count),
    errorMessage: row.error_message ? String(row.error_message) : null,
    details: parseJson(row.details_json, {}),
  }));
}

export async function getPostgresWeeklyDigests(limit = 12): Promise<WeeklyDigest[]> {
  const rows = await getPostgres().unsafe<Row[]>(
    "SELECT * FROM weekly_digests ORDER BY week_start DESC LIMIT $1",
    [limit],
  );
  return rows.map((row) => ({
    id: String(row.id),
    weekStart: String(row.week_start),
    weekEnd: String(row.week_end),
    payload: parseJson(row.payload_json, {} as WeeklyDigest["payload"]),
    model: String(row.model),
    createdAt: String(row.created_at),
  }));
}
