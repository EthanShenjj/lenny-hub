import { XMLParser } from "fast-xml-parser";
import { getDb, ensureImported } from "@/lib/db";
import { normalizeTitle, sha256 } from "@/lib/utils";
import { upsertCandidate, type ImportCandidate } from "@/lib/importer";
import type { SyncRun } from "@/lib/types";

const SOURCES = {
  newsletterRss: "https://www.lennysnewsletter.com/feed",
  newsletterSitemap: "https://www.lennysnewsletter.com/sitemap",
  podcastRss: "https://api.substack.com/feed/podcast/10845.rss",
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  trimValues: true,
});

function arrayify<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function textValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return textValue(object["#text"] || object.__cdata || "");
  }
  return "";
}

function stripHtml(value: string) {
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function isoDate(value: unknown) {
  const date = new Date(textValue(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function parseTags(value: unknown) {
  return arrayify(value)
    .map(textValue)
    .map((tag) => tag.toLowerCase().replace(/\s+/g, "-"))
    .filter(Boolean);
}

async function fetchXml(url: string) {
  const response = await fetch(url, {
    headers: { "User-Agent": "LennyInsightHub/0.1 (local personal reader)" },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`${url} 返回 HTTP ${response.status}`);
  return parser.parse(await response.text()) as Record<string, unknown>;
}

function rssItems(document: Record<string, unknown>) {
  const rss = (document.rss || document.feed || {}) as Record<string, unknown>;
  const channel = (rss.channel || rss) as Record<string, unknown>;
  return arrayify(channel.item || channel.entry) as Array<Record<string, unknown>>;
}

function rssCandidate(
  item: Record<string, unknown>,
  type: "podcast" | "newsletter",
): ImportCandidate | null {
  const title = textValue(item.title);
  if (!title) return null;
  const link =
    textValue(item.link) ||
    textValue((item.link as Record<string, unknown> | undefined)?.["@_href"]);
  const rawBody = textValue(
    item.encoded || item.description || item.summary || item.content,
  );
  const body = stripHtml(rawBody);
  const guest =
    type === "podcast"
      ? textValue(item.author || item.creator) ||
        title.match(/\|\s*([^|(]+)(?:\s*\(|$)/)?.[1]?.trim() ||
        null
      : null;
  return {
    type,
    title,
    guest,
    publishedAt: isoDate(item.pubDate || item.published || item.updated),
    sourceUrl: link || null,
    videoId: null,
    description: body.slice(0, 500) || null,
    tags: parseTags(item.category),
    body,
    wordCount: body ? body.split(/\s+/).length : 0,
    bodyStatus: body.length >= 800 ? "preview" : body ? "preview" : "missing",
    importedSource: type === "podcast" ? "podcast-rss" : "newsletter-rss",
  };
}

function sitemapUrls(document: Record<string, unknown>) {
  const urlset = (document.urlset || {}) as Record<string, unknown>;
  return arrayify(urlset.url)
    .map((entry) =>
      textValue(
        typeof entry === "object" && entry
          ? (entry as Record<string, unknown>).loc
          : entry,
      ),
    )
    .filter((url) => url.includes("/p/"));
}

function enrichFromSitemap(urls: string[]) {
  const db = getDb();
  let updated = 0;
  const candidates = db
    .prepare(
      `SELECT id, normalized_title FROM content_items
       WHERE type = 'newsletter' AND source_url IS NULL`,
    )
    .all() as Array<{ id: string; normalized_title: string }>;
  const bySlug = new Map(
    urls.map((url) => {
      const slug = new URL(url).pathname.split("/").filter(Boolean).at(-1) || "";
      return [normalizeTitle(slug.replaceAll("-", " ")), url];
    }),
  );
  const update = db.prepare(
    "UPDATE content_items SET source_url = ?, updated_at = ? WHERE id = ?",
  );
  const transaction = db.transaction(() => {
    for (const item of candidates) {
      const url = bySlug.get(item.normalized_title);
      if (!url) continue;
      update.run(url, new Date().toISOString(), item.id);
      updated += 1;
    }
  });
  transaction();
  return updated;
}

function rowToSyncRun(row: Record<string, unknown>): SyncRun {
  return {
    id: String(row.id),
    status: String(row.status) as SyncRun["status"],
    trigger: String(row.trigger_type) as SyncRun["trigger"],
    startedAt: String(row.started_at),
    completedAt: row.completed_at ? String(row.completed_at) : null,
    addedCount: Number(row.added_count),
    updatedCount: Number(row.updated_count),
    skippedCount: Number(row.skipped_count),
    errorMessage: row.error_message ? String(row.error_message) : null,
    details: JSON.parse(String(row.details_json || "{}")),
  };
}

export async function runSync(
  trigger: SyncRun["trigger"] = "manual",
): Promise<SyncRun> {
  await ensureImported();
  const db = getDb();
  const id = `sync_${sha256(`${trigger}:${Date.now()}`).slice(0, 20)}`;
  const startedAt = new Date().toISOString();
  db.prepare(
    `INSERT INTO sync_runs (id, status, trigger_type, started_at)
     VALUES (?, 'running', ?, ?)`,
  ).run(id, trigger, startedAt);

  let added = 0;
  let updated = 0;
  let skipped = 0;
  const errors: string[] = [];
  const details: Record<string, unknown> = {};

  const results = await Promise.allSettled([
    fetchXml(SOURCES.newsletterRss),
    fetchXml(SOURCES.podcastRss),
    fetchXml(SOURCES.newsletterSitemap),
  ]);

  const applyDocument = (
    result: PromiseSettledResult<Record<string, unknown>>,
    type: "podcast" | "newsletter",
    name: string,
  ) => {
    if (result.status === "rejected") {
      errors.push(`${name}: ${String(result.reason)}`);
      return;
    }
    const items = rssItems(result.value);
    details[name] = { received: items.length };
    for (const item of items) {
      const candidate = rssCandidate(item, type);
      if (!candidate) continue;
      const action = upsertCandidate(candidate);
      if (action === "added") added += 1;
      if (action === "updated") updated += 1;
      if (action === "skipped") skipped += 1;
    }
  };

  applyDocument(results[0], "newsletter", "newsletterRss");
  applyDocument(results[1], "podcast", "podcastRss");

  if (results[2].status === "fulfilled") {
    const urls = sitemapUrls(results[2].value);
    const enriched = enrichFromSitemap(urls);
    updated += enriched;
    details.newsletterSitemap = { received: urls.length, enriched };
  } else {
    errors.push(`newsletterSitemap: ${String(results[2].reason)}`);
  }

  const completedAt = new Date().toISOString();
  const status: SyncRun["status"] =
    errors.length === 0 ? "success" : errors.length < 3 ? "partial" : "failed";
  db.prepare(
    `UPDATE sync_runs SET
      status = ?, completed_at = ?, added_count = ?, updated_count = ?,
      skipped_count = ?, error_message = ?, details_json = ?
     WHERE id = ?`,
  ).run(
    status,
    completedAt,
    added,
    updated,
    skipped,
    errors.length ? errors.join("\n") : null,
    JSON.stringify(details),
    id,
  );
  return rowToSyncRun(
    db.prepare("SELECT * FROM sync_runs WHERE id = ?").get(id) as Record<
      string,
      unknown
    >,
  );
}

export async function runMaintenance() {
  await ensureImported();
  if (process.env.LENNY_AUTO_SYNC === "false") {
    return { ran: false, reason: "LENNY_AUTO_SYNC=false" };
  }
  const db = getDb();
  const latest = db
    .prepare(
      `SELECT completed_at FROM sync_runs
       WHERE status IN ('success', 'partial')
       ORDER BY completed_at DESC LIMIT 1`,
    )
    .get() as { completed_at: string } | undefined;
  const due =
    !latest ||
    Date.now() - new Date(latest.completed_at).getTime() > 24 * 60 * 60 * 1000;
  if (!due) return { ran: false, reason: "最近 24 小时已同步" };
  return { ran: true, sync: await runSync("startup") };
}
