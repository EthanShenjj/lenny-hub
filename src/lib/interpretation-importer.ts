import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { getDb } from "@/lib/db";
import { paths } from "@/lib/paths";
import type { InsightCitation, InsightPayload, ContentType } from "@/lib/types";
import { cleanText, normalizeTitle, sha256, youtubeTimestampUrl } from "@/lib/utils";

type SqlRow = Record<string, unknown>;

interface ParsedInterpretation {
  type: ContentType;
  title: string;
  publishedAt: string | null;
  primaryTopic: string | null;
  guest: string | null;
  tags: string[];
  sections: Map<string, string>;
  rawMarkdown: string;
  relativePath: string;
  filePath: string;
}

interface MatchResult {
  row: SqlRow;
  method: "metadata" | "transcript" | "guest";
}

export interface InterpretationImportStats {
  total: number;
  added: number;
  updated: number;
  skipped: number;
  unmatched: string[];
  matchedBy: Record<MatchResult["method"], number>;
  citations: { total: number; matchedToSourceChunks: number };
}

function textValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function validDate(value: unknown) {
  const date = textValue(value);
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function sectionMap(body: string) {
  const sections = new Map<string, string>();
  const matches = [...body.matchAll(/^##\s+(.+?)\s*$/gm)];
  matches.forEach((match, index) => {
    const start = (match.index || 0) + match[0].length;
    const end = matches[index + 1]?.index ?? body.length;
    sections.set(match[1].trim(), body.slice(start, end).trim());
  });
  return sections;
}

function stripInlineMarkdown(value: string) {
  return cleanText(value.replace(/\\([*_])/g, "$1")).trim();
}

function paragraphs(value: string) {
  return value
    .split(/\n\s*\n/)
    .map((item) => stripInlineMarkdown(item))
    .filter(Boolean);
}

function listItems(value: string) {
  return value
    .split("\n")
    .map((line) => line.match(/^\s*(?:[-*]|\d+\.)\s+(.+?)\s*$/)?.[1] || "")
    .map(stripInlineMarkdown)
    .filter(Boolean);
}

function quoteItems(value: string) {
  return value
    .split("\n")
    .filter((line) => /^\s*>/.test(line))
    .map((line) => line.replace(/^\s*(?:>\s*)+/, ""))
    .map(stripInlineMarkdown)
    .filter(Boolean);
}

function metadataLine(body: string, label: string) {
  const match = body.match(new RegExp(`^-\\s*${label}：(.+?)\\s*$`, "m"));
  return match ? stripInlineMarkdown(match[1]) : null;
}

function parseInterpretation(filePath: string, relativePath: string): ParsedInterpretation {
  const rawMarkdown = fs.readFileSync(filePath, "utf8");
  const parsed = matter(rawMarkdown);
  const type = textValue(parsed.data.type);
  if (type !== "podcast" && type !== "newsletter") {
    throw new Error(`无效的解读类型：${relativePath}`);
  }
  const title = textValue(parsed.data.title);
  if (!title) throw new Error(`解读缺少标题：${relativePath}`);
  const tags = (sectionMap(parsed.content).get("检索标签") || "")
    .split(/[,，]/)
    .map(stripInlineMarkdown)
    .filter(Boolean);
  const primaryTopic = textValue(parsed.data.primary_topic);
  if (primaryTopic) tags.unshift(primaryTopic);

  return {
    type,
    title,
    publishedAt: validDate(parsed.data.date),
    primaryTopic,
    guest: metadataLine(parsed.content, "嘉宾"),
    tags: [...new Set(tags)],
    sections: sectionMap(parsed.content),
    rawMarkdown,
    relativePath,
    filePath,
  };
}

function oneRow(rows: SqlRow[]) {
  return rows.length === 1 ? rows[0] : null;
}

function transcriptSlugs(item: ParsedInterpretation) {
  const slugs = new Set<string>();
  for (const match of item.rawMarkdown.matchAll(/episodes\/([^/`]+)\/transcript\.md/g)) {
    slugs.add(match[1]);
  }
  const stem = path.basename(item.filePath, ".md");
  slugs.add(stem);
  slugs.add(stem.replace(/-(\d)-0$/, "-$10"));
  return [...slugs];
}

function matchFromTranscript(item: ParsedInterpretation) {
  const db = getDb();
  for (const slug of transcriptSlugs(item)) {
    const transcriptPath = path.join(paths.transcripts, "episodes", slug, "transcript.md");
    if (!fs.existsSync(transcriptPath)) continue;
    const metadata = matter(fs.readFileSync(transcriptPath, "utf8")).data;
    const videoId = textValue(metadata.video_id);
    if (videoId) {
      const row = db.prepare("SELECT * FROM content_items WHERE video_id = ?").get(videoId) as
        | SqlRow
        | undefined;
      if (row) return row;
    }
    const transcriptTitle = textValue(metadata.title);
    if (transcriptTitle) {
      const rows = db
        .prepare(
          `SELECT * FROM content_items
           WHERE type = ? AND normalized_title = ?
             AND COALESCE(published_at, '') = COALESCE(?, '')`,
        )
        .all(item.type, normalizeTitle(transcriptTitle), validDate(metadata.publish_date)) as SqlRow[];
      const row = oneRow(rows);
      if (row) return row;
    }
  }
  return null;
}

function findContent(item: ParsedInterpretation): MatchResult | null {
  const db = getDb();
  const exactRows = db
    .prepare(
      `SELECT * FROM content_items
       WHERE type = ? AND normalized_title = ?
         AND COALESCE(published_at, '') = COALESCE(?, '')`,
    )
    .all(item.type, normalizeTitle(item.title), item.publishedAt) as SqlRow[];
  const exact = oneRow(exactRows);
  if (exact) return { row: exact, method: "metadata" };

  const transcript = matchFromTranscript(item);
  if (transcript) return { row: transcript, method: "transcript" };

  const titleRows = db
    .prepare("SELECT * FROM content_items WHERE type = ? AND normalized_title = ?")
    .all(item.type, normalizeTitle(item.title)) as SqlRow[];
  const title = oneRow(titleRows);
  if (title) return { row: title, method: "metadata" };

  const guestRows = db
    .prepare("SELECT * FROM content_items WHERE type = ? AND guest = ?")
    .all(item.type, item.title) as SqlRow[];
  const guest = oneRow(guestRows);
  return guest ? { row: guest, method: "guest" } : null;
}

function normalizedEvidence(value: string) {
  return stripInlineMarkdown(value)
    .replace(/(?:…|\.{3})$/, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function tokenOverlap(left: string, right: string) {
  const tokens = new Set(left.split(" ").filter((token) => token.length > 2));
  if (!tokens.size) return 0;
  const rightTokens = new Set(right.split(" "));
  let common = 0;
  tokens.forEach((token) => {
    if (rightTokens.has(token)) common += 1;
  });
  return common / tokens.size;
}

function bestChunk(quote: string, chunks: SqlRow[]) {
  const needle = normalizedEvidence(quote);
  if (!needle) return null;
  const prefix = needle.slice(0, Math.min(100, needle.length));
  let best: { chunk: SqlRow; score: number } | null = null;
  for (const chunk of chunks) {
    const haystack = normalizedEvidence(String(chunk.quote_text || ""));
    const direct = haystack.includes(prefix) || needle.includes(haystack.slice(0, 100));
    const score = direct ? 1 : tokenOverlap(needle, haystack);
    if (!best || score > best.score) best = { chunk, score };
  }
  return best && best.score >= 0.45 ? best.chunk : null;
}

function shortTitle(value: string, index: number) {
  const sentence = value.split(/[。！？!?；;]/)[0].trim();
  if (!sentence) return `解读要点 ${index + 1}`;
  return sentence.length > 34 ? `${sentence.slice(0, 34)}…` : sentence;
}

function payloadAndCitations(item: ParsedInterpretation, content: SqlRow) {
  const db = getDb();
  const contentId = String(content.id);
  const chunks = db
    .prepare(
      `SELECT id, ordinal, heading, speaker, timestamp_seconds, quote_text, anchor
       FROM content_chunks WHERE content_item_id = ? ORDER BY ordinal`,
    )
    .all(contentId) as SqlRow[];
  const signals = quoteItems(item.sections.get("核心信号（原文短摘）") || "").slice(0, 8);
  let matchedToSourceChunks = 0;
  const citations: InsightCitation[] = signals.map((quote) => {
    const chunk = bestChunk(quote, chunks);
    if (chunk) matchedToSourceChunks += 1;
    const chunkId = chunk
      ? String(chunk.id)
      : `cit_${sha256(`${contentId}:${quote}`).slice(0, 20)}`;
    const timestamp = chunk?.timestamp_seconds === null || chunk?.timestamp_seconds === undefined
      ? null
      : Number(chunk.timestamp_seconds);
    return {
      chunkId,
      label: chunk
        ? String(chunk.speaker || chunk.heading || `段落 ${Number(chunk.ordinal) + 1}`)
        : "导入解读中的原文短摘",
      quote,
      sourceUrl: youtubeTimestampUrl(
        content.source_url ? String(content.source_url) : null,
        timestamp,
      ),
      timestampSeconds: timestamp,
      anchor: chunk ? String(chunk.anchor) : `imported-${chunkId}`,
    };
  });
  const citationIds = citations.map((citation) => citation.chunkId);
  const interpretationParagraphs = paragraphs(item.sections.get("解读") || "");
  const outline = listItems(item.sections.get("内容脉络") || "");
  const oneLine = paragraphs(item.sections.get("一句话定位") || "")[0] || item.title;
  const coreSource = interpretationParagraphs.length >= 2
    ? interpretationParagraphs
    : [...interpretationParagraphs, ...outline];
  const corePoints = coreSource.slice(0, 5).map((explanation, index) => ({
    title: shortTitle(explanation, index),
    explanation,
    citationIds: citationIds.length ? [citationIds[index % citationIds.length]] : [],
  }));
  const boundaryParagraphs = paragraphs(item.sections.get("适用边界") || "");
  const openQuestions = [...interpretationParagraphs, ...boundaryParagraphs]
    .filter((text) => /追问|补问|[?？]/.test(text))
    .slice(0, 8);
  const argumentChain = [...new Set([...outline, oneLine, ...interpretationParagraphs])].slice(
    0,
    8,
  );

  const payload: InsightPayload = {
    oneLineConclusion: oneLine,
    whyItMatters: interpretationParagraphs[0] || oneLine,
    corePoints,
    argumentChain,
    casesAndData: signals.map((statement, index) => ({
      statement,
      citationIds: citationIds[index] ? [citationIds[index]] : [],
    })),
    applications: listItems(item.sections.get("可执行清单") || "").slice(0, 8),
    myTake: interpretationParagraphs.join("\n\n") || oneLine,
    boundaries: boundaryParagraphs.slice(0, 8),
    openQuestions,
  };
  return { payload, citations, matchedToSourceChunks };
}

function mergeTags(contentId: string, tags: string[]) {
  if (!tags.length) return;
  const db = getDb();
  const row = db.prepare("SELECT tags_json FROM content_items WHERE id = ?").get(contentId) as
    | { tags_json: string }
    | undefined;
  const existing = row ? (JSON.parse(row.tags_json || "[]") as string[]) : [];
  const merged = [...new Set([...existing, ...tags])];
  if (JSON.stringify(existing) !== JSON.stringify(merged)) {
    db.prepare("UPDATE content_items SET tags_json = ?, updated_at = ? WHERE id = ?").run(
      JSON.stringify(merged),
      new Date().toISOString(),
      contentId,
    );
  }
}

function persistInterpretation(item: ParsedInterpretation, match: MatchResult) {
  const db = getDb();
  const contentId = String(match.row.id);
  const insightId = `ins_${sha256(`local-interpretation:${item.relativePath}`).slice(0, 20)}`;
  const importHash = sha256(item.rawMarkdown);
  const sourceHash = String(match.row.content_hash);
  const existing = db.prepare("SELECT * FROM insights WHERE id = ?").get(insightId) as
    | SqlRow
    | undefined;
  const { payload, citations, matchedToSourceChunks } = payloadAndCitations(item, match.row);
  const payloadJson = JSON.stringify(payload);
  const citationsJson = JSON.stringify(citations);
  const unchanged =
    existing &&
    String(existing.import_hash || "") === importHash &&
    String(existing.source_hash) === sourceHash &&
    String(existing.payload_json) === payloadJson &&
    String(existing.citations_json) === citationsJson &&
    Number(existing.stale) === 0;
  const now = new Date().toISOString();

  const transaction = db.transaction(() => {
    if (!unchanged) {
      db.prepare(
        `INSERT INTO insights (
          id, content_item_id, payload_json, citations_json, source_hash,
          model, provider, stale, created_at, raw_markdown, source_path, import_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          payload_json = excluded.payload_json,
          citations_json = excluded.citations_json,
          source_hash = excluded.source_hash,
          model = excluded.model,
          provider = excluded.provider,
          stale = 0,
          created_at = excluded.created_at,
          raw_markdown = excluded.raw_markdown,
          source_path = excluded.source_path,
          import_hash = excluded.import_hash`,
      ).run(
        insightId,
        contentId,
        payloadJson,
        citationsJson,
        sourceHash,
        "offline-structured-interpretation",
        "local-markdown-import",
        now,
        item.rawMarkdown,
        item.relativePath,
        importHash,
      );
    }
    mergeTags(contentId, item.tags);
  });
  transaction();
  return {
    status: unchanged ? "skipped" as const : existing ? "updated" as const : "added" as const,
    citations: citations.length,
    matchedToSourceChunks,
  };
}

function interpretationFiles(root: string) {
  const contentRoot = fs.existsSync(path.join(root, "解读")) ? path.join(root, "解读") : root;
  const files: Array<{ filePath: string; relativePath: string }> = [];
  for (const type of ["newsletter", "podcast"] as const) {
    const directory = path.join(contentRoot, type);
    if (!fs.existsSync(directory)) continue;
    for (const name of fs.readdirSync(directory).sort()) {
      if (!name.endsWith(".md")) continue;
      files.push({
        filePath: path.join(directory, name),
        relativePath: path.posix.join(type, name),
      });
    }
  }
  return files;
}

export function importInterpretations(root: string): InterpretationImportStats {
  if (!fs.existsSync(root)) throw new Error(`解读目录不存在：${root}`);
  const files = interpretationFiles(root);
  const stats: InterpretationImportStats = {
    total: files.length,
    added: 0,
    updated: 0,
    skipped: 0,
    unmatched: [],
    matchedBy: { metadata: 0, transcript: 0, guest: 0 },
    citations: { total: 0, matchedToSourceChunks: 0 },
  };
  for (const file of files) {
    const item = parseInterpretation(file.filePath, file.relativePath);
    const match = findContent(item);
    if (!match) {
      stats.unmatched.push(file.relativePath);
      continue;
    }
    stats.matchedBy[match.method] += 1;
    const result = persistInterpretation(item, match);
    stats[result.status] += 1;
    stats.citations.total += result.citations;
    stats.citations.matchedToSourceChunks += result.matchedToSourceChunks;
  }
  return stats;
}

export const interpretationImporterInternals = {
  listItems,
  paragraphs,
  parseInterpretation,
  quoteItems,
  sectionMap,
};
