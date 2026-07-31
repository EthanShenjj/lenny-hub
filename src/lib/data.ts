import { ensureImported, getDb } from "@/lib/db";
import { PAGE_SIZE, TOPICS } from "@/lib/constants";
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

type SqlRow = Record<string, unknown>;

function parseTags(value: unknown) {
  try {
    return JSON.parse(String(value || "[]")) as string[];
  } catch {
    return [];
  }
}

function insightStatus(row: SqlRow): ContentSummary["insightStatus"] {
  const status = String(row.insight_status || "not_started");
  if (
    status === "ready" ||
    status === "stale" ||
    status === "failed" ||
    status === "running"
  ) {
    return status;
  }
  return "not_started";
}

function summaryFromRow(row: SqlRow): ContentSummary {
  return {
    id: String(row.id),
    type: String(row.type) as ContentSummary["type"],
    title: String(row.title),
    guest: row.guest ? String(row.guest) : null,
    publishedAt: row.published_at ? String(row.published_at) : null,
    sourceUrl: row.source_url ? String(row.source_url) : null,
    description: row.description ? String(row.description) : null,
    tags: parseTags(row.tags_json),
    wordCount: Number(row.word_count || 0),
    bodyStatus: String(row.body_status) as ContentSummary["bodyStatus"],
    insightStatus: insightStatus(row),
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
      SELECT 1 FROM insights i
      WHERE i.content_item_id = c.id
    ) THEN 'stale'
    WHEN EXISTS (
      SELECT 1 FROM analysis_jobs j
      WHERE j.content_item_id = c.id AND j.status = 'failed'
    ) THEN 'failed'
    ELSE 'not_started'
  END
`;

function buildFtsQuery(value: string) {
  const tokens = value
    .trim()
    .split(/\s+/)
    .map((token) => token.replaceAll('"', ""))
    .filter(Boolean);
  return tokens.map((token) => `"${token}"*`).join(" AND ");
}

function buildContentSql(
  query: ContentQuery,
  options: { count?: boolean; limit?: number } = {},
) {
  const q = query.q?.trim() || "";
  const useFts = Boolean(q);
  const params: unknown[] = [];
  const where: string[] = [];

  if (query.type && query.type !== "all") {
    where.push("c.type = ?");
    params.push(query.type);
  }
  if (query.topic) {
    where.push("EXISTS (SELECT 1 FROM json_each(c.tags_json) WHERE value = ?)");
    params.push(query.topic);
  }
  if (query.year) {
    where.push("substr(c.published_at, 1, 4) = ?");
    params.push(query.year);
  }
  if (query.guest) {
    where.push("c.guest = ?");
    params.push(query.guest);
  }
  if (query.bodyStatus && query.bodyStatus !== "all") {
    where.push("c.body_status = ?");
    params.push(query.bodyStatus);
  }
  if (query.insightStatus && query.insightStatus !== "all") {
    where.push(`(${insightStatusSql}) = ?`);
    params.push(query.insightStatus);
  }
  if (useFts) {
    where.push("content_fts MATCH ?");
    params.push(buildFtsQuery(q));
  }

  const from = `FROM content_items c ${
    useFts ? "JOIN content_fts ON content_fts.content_item_id = c.id" : ""
  }`;
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  if (options.count) {
    return {
      sql: `SELECT COUNT(*) AS count ${from} ${whereSql}`,
      params,
    };
  }

  const relevanceSelect = useFts ? ", bm25(content_fts) AS relevance" : "";
  let orderBy = "c.published_at DESC, c.title ASC";
  if (query.sort === "length") orderBy = "c.word_count DESC, c.published_at DESC";
  if ((query.sort === "relevance" || !query.sort) && useFts) {
    orderBy = "relevance ASC, c.published_at DESC";
  }

  const page = Math.max(1, query.page || 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize || PAGE_SIZE));
  const limit = options.limit || pageSize;
  const offset = options.limit ? 0 : (page - 1) * pageSize;
  params.push(limit, offset);

  return {
    sql: `SELECT c.*, ${insightStatusSql} AS insight_status ${relevanceSelect}
          ${from} ${whereSql}
          ORDER BY ${orderBy}
          LIMIT ? OFFSET ?`,
    params,
  };
}

function getFacets() {
  const db = getDb();
  const years = db
    .prepare(
      `SELECT DISTINCT substr(published_at, 1, 4) AS value
       FROM content_items
       WHERE published_at IS NOT NULL
       ORDER BY value DESC`,
    )
    .all()
    .map((row) => String((row as { value: string }).value));
  const guests = db
    .prepare(
      `SELECT guest AS value, COUNT(*) AS count
       FROM content_items
       WHERE guest IS NOT NULL AND guest != ''
       GROUP BY guest ORDER BY count DESC, guest ASC`,
    )
    .all()
    .map((row) => String((row as { value: string }).value));
  const topics = db
    .prepare(
      `SELECT value, COUNT(*) AS count
       FROM content_items, json_each(tags_json)
       GROUP BY value ORDER BY count DESC`,
    )
    .all()
    .map((row) => String((row as { value: string }).value));
  return { years, guests, topics };
}

function cosine(a: number[], b: number[]) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
}

async function semanticSearch(query: ContentQuery): Promise<ContentSearchResult> {
  const db = getDb();
  const page = Math.max(1, query.page || 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize || PAGE_SIZE));
  const candidateQuery = {
    ...query,
    mode: "keyword" as const,
    page: 1,
    pageSize: 100,
  };
  const built = buildContentSql(candidateQuery, { limit: 100 });
  let rows: SqlRow[] = [];
  try {
    rows = db.prepare(built.sql).all(...built.params) as SqlRow[];
  } catch {
    const fallback = buildContentSql({ ...candidateQuery, q: "" }, { limit: 100 });
    rows = db.prepare(fallback.sql).all(...fallback.params) as SqlRow[];
  }
  const candidates = rows.map(summaryFromRow);
  const { getAnalysisProvider } = await import("@/lib/analysis");
  const provider = getAnalysisProvider();

  if (!provider.available || !query.q?.trim()) {
    return {
      items: candidates.slice((page - 1) * pageSize, page * pageSize),
      total: candidates.length,
      page,
      pageSize,
      searchMode: "semantic-fallback",
      notice: provider.available
        ? "请输入语义查询。"
        : "未配置 OPENAI_API_KEY，已使用本地全文检索结果。",
      facets: getFacets(),
    };
  }

  const model = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
  const missing = candidates.filter((item) => {
    const row = db
      .prepare(
        `SELECT 1 FROM content_embeddings e
         JOIN content_items c ON c.id = e.content_item_id
         WHERE e.content_item_id = ? AND e.source_hash = c.content_hash AND e.model = ?`,
      )
      .get(item.id, model);
    return !row;
  });

  if (missing.length) {
    const texts = missing.map(
      (item) =>
        `${item.title}\n${item.guest || ""}\n${item.description || ""}\n${item.tags.join(" ")}`,
    );
    const vectors = await provider.embedTexts(texts);
    const insert = db.prepare(
      `INSERT INTO content_embeddings (
        content_item_id, source_hash, model, vector_json, created_at
       ) SELECT ?, content_hash, ?, ?, ? FROM content_items WHERE id = ?
       ON CONFLICT(content_item_id) DO UPDATE SET
         source_hash = excluded.source_hash,
         model = excluded.model,
         vector_json = excluded.vector_json,
         created_at = excluded.created_at`,
    );
    const transaction = db.transaction(() => {
      missing.forEach((item, index) => {
        insert.run(
          item.id,
          model,
          JSON.stringify(vectors[index]),
          new Date().toISOString(),
          item.id,
        );
      });
    });
    transaction();
  }

  const [queryVector] = await provider.embedTexts([query.q]);
  const ranked = candidates
    .map((item) => {
      const row = db
        .prepare("SELECT vector_json FROM content_embeddings WHERE content_item_id = ?")
        .get(item.id) as { vector_json: string } | undefined;
      return {
        ...item,
        relevance: row ? cosine(queryVector, JSON.parse(row.vector_json) as number[]) : 0,
      };
    })
    .sort((a, b) => (b.relevance || 0) - (a.relevance || 0));

  return {
    items: ranked.slice((page - 1) * pageSize, page * pageSize),
    total: ranked.length,
    page,
    pageSize,
    searchMode: "semantic",
    facets: getFacets(),
  };
}

export async function getContent(query: ContentQuery): Promise<ContentSearchResult> {
  await ensureImported();
  if (query.mode === "semantic") return semanticSearch(query);

  const db = getDb();
  const page = Math.max(1, query.page || 1);
  const pageSize = Math.min(100, Math.max(1, query.pageSize || PAGE_SIZE));
  const built = buildContentSql({ ...query, page, pageSize });
  const countBuilt = buildContentSql(query, { count: true });
  try {
    const [rows, count] = [
      db.prepare(built.sql).all(...built.params) as SqlRow[],
      db.prepare(countBuilt.sql).get(...countBuilt.params) as { count: number },
    ];
    return {
      items: rows.map(summaryFromRow),
      total: count.count,
      page,
      pageSize,
      searchMode: "keyword",
      facets: getFacets(),
    };
  } catch (error) {
    if (query.q) {
      return {
        ...(await getContent({ ...query, q: "", page: 1 })),
        notice: "没有匹配的全文检索结果，请尝试更短或更通用的关键词。",
      };
    }
    throw error;
  }
}

function parseInsight(row: SqlRow | undefined): StoredInsight | null {
  if (!row) return null;
  return {
    id: String(row.id),
    contentItemId: String(row.content_item_id),
    payload: JSON.parse(String(row.payload_json)),
    citations: JSON.parse(String(row.citations_json)),
    model: String(row.model),
    createdAt: String(row.created_at),
    stale: Boolean(row.stale),
  };
}

export async function getContentById(id: string): Promise<ContentDetail | null> {
  await ensureImported();
  const db = getDb();
  const row = db
    .prepare(`SELECT c.*, ${insightStatusSql} AS insight_status FROM content_items c WHERE id = ?`)
    .get(id) as SqlRow | undefined;
  if (!row) return null;
  const chunks = db
    .prepare(
      `SELECT id, ordinal, heading, speaker, timestamp_seconds, quote_text, anchor
       FROM content_chunks WHERE content_item_id = ? ORDER BY ordinal`,
    )
    .all(id)
    .map((chunk) => {
      const value = chunk as SqlRow;
      return {
        id: String(value.id),
        ordinal: Number(value.ordinal),
        heading: value.heading ? String(value.heading) : null,
        speaker: value.speaker ? String(value.speaker) : null,
        timestampSeconds:
          value.timestamp_seconds === null ? null : Number(value.timestamp_seconds),
        quoteText: String(value.quote_text),
        anchor: String(value.anchor),
      };
    });
  const insight = parseInsight(
    db
      .prepare("SELECT * FROM insights WHERE content_item_id = ? ORDER BY created_at DESC LIMIT 1")
      .get(id) as SqlRow | undefined,
  );
  return {
    ...summaryFromRow(row),
    body: String(row.body),
    contentHash: String(row.content_hash),
    chunks,
    insight,
  };
}

export async function getDashboardStats(): Promise<DashboardStats> {
  await ensureImported();
  const db = getDb();
  const totals = db
    .prepare(
      `SELECT
        COUNT(*) AS all_count,
        SUM(CASE WHEN type = 'podcast' THEN 1 ELSE 0 END) AS podcasts,
        SUM(CASE WHEN type = 'newsletter' THEN 1 ELSE 0 END) AS newsletters,
        SUM(CASE WHEN created_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) AS added_this_week
       FROM content_items`,
    )
    .get() as SqlRow;
  const analyzed = (
    db
      .prepare("SELECT COUNT(DISTINCT content_item_id) AS count FROM insights WHERE stale = 0")
      .get() as { count: number }
  ).count;
  const monthlyTrend = db
    .prepare(
      `SELECT substr(published_at, 1, 7) AS month,
        SUM(CASE WHEN type = 'podcast' THEN 1 ELSE 0 END) AS podcast,
        SUM(CASE WHEN type = 'newsletter' THEN 1 ELSE 0 END) AS newsletter
       FROM content_items
       WHERE published_at IS NOT NULL
       GROUP BY month ORDER BY month DESC LIMIT 18`,
    )
    .all()
    .reverse()
    .map((row) => {
      const value = row as SqlRow;
      return {
        month: String(value.month),
        podcast: Number(value.podcast),
        newsletter: Number(value.newsletter),
      };
    });
  const distributionRows = db
    .prepare(
      `SELECT value AS topic, COUNT(*) AS count
       FROM content_items, json_each(tags_json)
       GROUP BY value ORDER BY count DESC`,
    )
    .all() as SqlRow[];
  const topicDistribution = TOPICS.map((topic) => ({
    topic,
    count: Number(distributionRows.find((row) => row.topic === topic)?.count || 0),
  }));
  const coverageRows = db
    .prepare(
      `SELECT tags.value AS topic,
        SUM(CASE WHEN c.type = 'podcast' THEN 1 ELSE 0 END) AS podcast,
        SUM(CASE WHEN c.type = 'newsletter' THEN 1 ELSE 0 END) AS newsletter
       FROM content_items c, json_each(c.tags_json) AS tags
       GROUP BY tags.value`,
    )
    .all() as SqlRow[];
  const topicCoverage = TOPICS.map((topic) => {
    const row = coverageRows.find((item) => item.topic === topic);
    return {
      topic,
      podcast: Number(row?.podcast || 0),
      newsletter: Number(row?.newsletter || 0),
    };
  });
  const recentInsights = db
    .prepare(
      `SELECT i.content_item_id, c.title, c.type, i.created_at, i.model
       FROM insights i JOIN content_items c ON c.id = i.content_item_id
       ORDER BY i.created_at DESC LIMIT 5`,
    )
    .all()
    .map((row) => {
      const value = row as SqlRow;
      return {
        contentId: String(value.content_item_id),
        title: String(value.title),
        type: String(value.type) as "podcast" | "newsletter",
        createdAt: String(value.created_at),
        model: String(value.model),
      };
    });
  const availability = db
    .prepare(
      `SELECT
        SUM(CASE WHEN body_status = 'available' THEN 1 ELSE 0 END) AS available,
        SUM(CASE WHEN body_status = 'preview' THEN 1 ELSE 0 END) AS preview,
        SUM(CASE WHEN body_status = 'missing' THEN 1 ELSE 0 END) AS missing
       FROM content_items`,
    )
    .get() as SqlRow;

  return {
    totals: {
      all: Number(totals.all_count),
      podcasts: Number(totals.podcasts),
      newsletters: Number(totals.newsletters),
      topics: TOPICS.length,
      analyzed,
      addedThisWeek: Number(totals.added_this_week),
    },
    monthlyTrend,
    topicDistribution,
    topicCoverage,
    recentInsights,
    bodyAvailability: {
      available: Number(availability.available),
      preview: Number(availability.preview),
      missing: Number(availability.missing),
    },
  };
}

export async function getSyncRuns(limit = 20): Promise<SyncRun[]> {
  await ensureImported();
  return getDb()
    .prepare("SELECT * FROM sync_runs ORDER BY started_at DESC LIMIT ?")
    .all(limit)
    .map((row) => {
      const value = row as SqlRow;
      return {
        id: String(value.id),
        status: String(value.status) as SyncRun["status"],
        trigger: String(value.trigger_type) as SyncRun["trigger"],
        startedAt: String(value.started_at),
        completedAt: value.completed_at ? String(value.completed_at) : null,
        addedCount: Number(value.added_count),
        updatedCount: Number(value.updated_count),
        skippedCount: Number(value.skipped_count),
        errorMessage: value.error_message ? String(value.error_message) : null,
        details: JSON.parse(String(value.details_json || "{}")),
      };
    });
}

export async function getWeeklyDigests(limit = 12): Promise<WeeklyDigest[]> {
  await ensureImported();
  return getDb()
    .prepare("SELECT * FROM weekly_digests ORDER BY week_start DESC LIMIT ?")
    .all(limit)
    .map((row) => {
      const value = row as SqlRow;
      return {
        id: String(value.id),
        weekStart: String(value.week_start),
        weekEnd: String(value.week_end),
        payload: JSON.parse(String(value.payload_json)),
        model: String(value.model),
        createdAt: String(value.created_at),
      };
    });
}
