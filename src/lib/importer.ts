import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { getDb } from "@/lib/db";
import { paths } from "@/lib/paths";
import { parseChunks } from "@/lib/markdown";
import type { BodyStatus, ContentType } from "@/lib/types";
import { normalizeTitle, sha256 } from "@/lib/utils";

interface IndexEntry {
  title: string;
  filename: string;
  tags?: string[];
  word_count?: number;
  date?: string;
  description?: string;
  guest?: string;
  subtitle?: string;
  post_url?: string;
}

export interface ImportCandidate {
  type: ContentType;
  title: string;
  guest: string | null;
  publishedAt: string | null;
  sourceUrl: string | null;
  videoId: string | null;
  description: string | null;
  tags: string[];
  body: string;
  wordCount: number;
  bodyStatus: BodyStatus;
  importedSource: string;
}

interface ImportStats {
  added: number;
  updated: number;
  skipped: number;
  chunks: number;
}

function readJson<T>(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
}

function readMarkdown(filePath: string) {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = matter(raw);
  return { data: parsed.data as Record<string, unknown>, body: parsed.content.trim() };
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function stringArray(value: unknown) {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return [];
}

function bodyStatus(body: string, explicitlyPreview = false): BodyStatus {
  if (!body.trim()) return "missing";
  if (explicitlyPreview || body.length < 800) return "preview";
  return "available";
}

function wordCount(body: string) {
  return body.trim() ? body.trim().split(/\s+/).length : 0;
}

function candidateFromIndex(
  root: string,
  type: ContentType,
  entry: IndexEntry,
  importedSource: string,
) {
  const filePath = path.join(root, entry.filename);
  if (!fs.existsSync(filePath)) return null;
  const { data, body } = readMarkdown(filePath);
  const title = stringValue(data.title) || entry.title;
  const tags = [...new Set([...stringArray(data.tags), ...(entry.tags || [])])];
  const sourceUrl =
    stringValue(data.youtube_url) ||
    stringValue(data.post_url) ||
    entry.post_url ||
    null;

  return {
    type,
    title,
    guest: stringValue(data.guest) || entry.guest || null,
    publishedAt: stringValue(data.date) || entry.date || null,
    sourceUrl,
    videoId: stringValue(data.video_id),
    description:
      stringValue(data.description) ||
      entry.description ||
      stringValue(data.subtitle) ||
      entry.subtitle ||
      null,
    tags,
    body,
    wordCount: numberValue(data.word_count) || entry.word_count || wordCount(body),
    bodyStatus: bodyStatus(body),
    importedSource,
  } satisfies ImportCandidate;
}

function listTranscriptFiles(root: string) {
  const episodesDir = path.join(root, "episodes");
  if (!fs.existsSync(episodesDir)) return [];
  return fs
    .readdirSync(episodesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(episodesDir, entry.name, "transcript.md"))
    .filter((filePath) => fs.existsSync(filePath));
}

function transcriptCandidate(filePath: string): ImportCandidate | null {
  const { data, body } = readMarkdown(filePath);
  const title = stringValue(data.title);
  if (!title) return null;
  return {
    type: "podcast",
    title,
    guest: stringValue(data.guest),
    publishedAt: stringValue(data.publish_date) || stringValue(data.date),
    sourceUrl: stringValue(data.youtube_url),
    videoId: stringValue(data.video_id),
    description: stringValue(data.description),
    tags: stringArray(data.tags),
    body,
    wordCount: numberValue(data.word_count) || wordCount(body),
    bodyStatus: bodyStatus(body),
    importedSource: "timestamp-transcripts",
  };
}

function dedupeKey(candidate: ImportCandidate) {
  if (candidate.videoId) return `video:${candidate.videoId}`;
  if (candidate.sourceUrl) return `url:${candidate.sourceUrl.replace(/\/$/, "")}`;
  return [
    candidate.type,
    normalizeTitle(candidate.title),
    candidate.publishedAt || "unknown-date",
  ].join(":");
}

function findExisting(candidate: ImportCandidate) {
  const db = getDb();
  if (candidate.videoId) {
    const row = db
      .prepare("SELECT * FROM content_items WHERE video_id = ? LIMIT 1")
      .get(candidate.videoId);
    if (row) return row as Record<string, unknown>;
  }
  if (candidate.sourceUrl) {
    const row = db
      .prepare("SELECT * FROM content_items WHERE source_url = ? LIMIT 1")
      .get(candidate.sourceUrl);
    if (row) return row as Record<string, unknown>;
  }
  return db
    .prepare(
      `SELECT * FROM content_items
       WHERE type = ? AND normalized_title = ?
         AND COALESCE(published_at, '') = COALESCE(?, '')
       LIMIT 1`,
    )
    .get(candidate.type, normalizeTitle(candidate.title), candidate.publishedAt) as
    | Record<string, unknown>
    | undefined;
}

function chooseCandidate(existing: Record<string, unknown>, incoming: ImportCandidate) {
  const currentBody = String(existing.body || "");
  const incomingWinsBody =
    incoming.body.length > currentBody.length ||
    (incoming.importedSource === "timestamp-transcripts" &&
      incoming.body.includes("**") &&
      incoming.body.includes("):"));
  const existingTags = JSON.parse(String(existing.tags_json || "[]")) as string[];

  return {
    ...incoming,
    title: incoming.title || String(existing.title),
    guest: incoming.guest || stringValue(existing.guest),
    publishedAt: incoming.publishedAt || stringValue(existing.published_at),
    sourceUrl: incoming.sourceUrl || stringValue(existing.source_url),
    videoId: incoming.videoId || stringValue(existing.video_id),
    description: incoming.description || stringValue(existing.description),
    tags: [...new Set([...existingTags, ...incoming.tags])],
    body: incomingWinsBody ? incoming.body : currentBody,
    wordCount: incomingWinsBody
      ? incoming.wordCount
      : Number(existing.word_count || 0),
    bodyStatus: incomingWinsBody
      ? incoming.bodyStatus
      : (String(existing.body_status) as BodyStatus),
    importedSource:
      incomingWinsBody || incoming.sourceUrl || incoming.videoId
        ? `${String(existing.imported_source)}+${incoming.importedSource}`
        : String(existing.imported_source),
  } satisfies ImportCandidate;
}

export function upsertCandidate(
  candidate: ImportCandidate,
): "added" | "updated" | "skipped" {
  const db = getDb();
  const existing = findExisting(candidate);
  const merged = existing ? chooseCandidate(existing, candidate) : candidate;
  const contentHash = sha256(merged.body);
  const now = new Date().toISOString();

  if (existing && String(existing.content_hash) === contentHash) {
    const metadataChanged =
      (!existing.source_url && merged.sourceUrl) ||
      (!existing.video_id && merged.videoId) ||
      (!existing.guest && merged.guest) ||
      String(existing.tags_json) !== JSON.stringify(merged.tags);
    if (!metadataChanged) return "skipped";
  }

  const id = existing
    ? String(existing.id)
    : `cnt_${sha256(dedupeKey(candidate)).slice(0, 20)}`;

  const transaction = db.transaction(() => {
    if (existing) {
      db.prepare(
        `UPDATE content_items SET
          title = ?, normalized_title = ?, guest = ?, published_at = ?,
          source_url = ?, video_id = ?, description = ?, tags_json = ?,
          body = ?, word_count = ?, body_status = ?, content_hash = ?,
          imported_source = ?, updated_at = ?
         WHERE id = ?`,
      ).run(
        merged.title,
        normalizeTitle(merged.title),
        merged.guest,
        merged.publishedAt,
        merged.sourceUrl,
        merged.videoId,
        merged.description,
        JSON.stringify(merged.tags),
        merged.body,
        merged.wordCount,
        merged.bodyStatus,
        contentHash,
        merged.importedSource,
        now,
        id,
      );
      if (String(existing.content_hash) !== contentHash) {
        db.prepare("UPDATE insights SET stale = 1 WHERE content_item_id = ?").run(id);
        db.prepare("DELETE FROM content_embeddings WHERE content_item_id = ?").run(id);
      }
    } else {
      db.prepare(
        `INSERT INTO content_items (
          id, dedupe_key, type, title, normalized_title, guest, published_at,
          source_url, video_id, description, tags_json, body, word_count,
          body_status, content_hash, imported_source, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        dedupeKey(candidate),
        merged.type,
        merged.title,
        normalizeTitle(merged.title),
        merged.guest,
        merged.publishedAt,
        merged.sourceUrl,
        merged.videoId,
        merged.description,
        JSON.stringify(merged.tags),
        merged.body,
        merged.wordCount,
        merged.bodyStatus,
        contentHash,
        merged.importedSource,
        now,
        now,
      );
    }

    db.prepare("DELETE FROM content_chunks WHERE content_item_id = ?").run(id);
    const insertChunk = db.prepare(
      `INSERT INTO content_chunks (
        id, content_item_id, ordinal, heading, speaker, timestamp_seconds,
        quote_text, anchor
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const chunk of parseChunks(id, merged.type, merged.body)) {
      insertChunk.run(
        chunk.id,
        id,
        chunk.ordinal,
        chunk.heading,
        chunk.speaker,
        chunk.timestampSeconds,
        chunk.quoteText,
        chunk.anchor,
      );
    }

    db.prepare("DELETE FROM content_fts WHERE content_item_id = ?").run(id);
    db.prepare(
      `INSERT INTO content_fts (content_item_id, title, guest, tags, body)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(id, merged.title, merged.guest || "", merged.tags.join(" "), merged.body);
  });

  transaction();
  return existing ? "updated" : "added";
}

function countChunks() {
  return (
    getDb().prepare("SELECT COUNT(*) AS count FROM content_chunks").get() as {
      count: number;
    }
  ).count;
}

export function importAllData(): ImportStats {
  const stats: ImportStats = { added: 0, updated: 0, skipped: 0, chunks: 0 };
  const apply = (candidate: ImportCandidate | null) => {
    if (!candidate) return;
    const result = upsertCandidate(candidate);
    stats[result] += 1;
  };

  const baseIndexPath = path.join(
    paths.baseData,
    "references",
    "01-start-here",
    "index.json",
  );
  const baseIndex = readJson<{
    podcasts: IndexEntry[];
    newsletters: IndexEntry[];
  }>(baseIndexPath);
  for (const entry of baseIndex.podcasts) {
    apply(
      candidateFromIndex(
        path.join(paths.baseData, "references"),
        "podcast",
        entry,
        "baseline-638",
      ),
    );
  }
  for (const entry of baseIndex.newsletters) {
    apply(
      candidateFromIndex(
        path.join(paths.baseData, "references"),
        "newsletter",
        entry,
        "baseline-638",
      ),
    );
  }

  const starterIndexPath = path.join(paths.starterData, "index.json");
  if (fs.existsSync(starterIndexPath)) {
    const starterIndex = readJson<{
      podcasts: IndexEntry[];
      newsletters: IndexEntry[];
    }>(starterIndexPath);
    for (const entry of starterIndex.podcasts) {
      apply(candidateFromIndex(paths.starterData, "podcast", entry, "official-starter"));
    }
    for (const entry of starterIndex.newsletters) {
      apply(
        candidateFromIndex(paths.starterData, "newsletter", entry, "official-starter"),
      );
    }
  }

  for (const transcript of listTranscriptFiles(paths.transcripts)) {
    apply(transcriptCandidate(transcript));
  }

  stats.chunks = countChunks();
  return stats;
}

export const importerInternals = {
  dedupeKey,
  normalizeTitle,
  parseChunks,
};
