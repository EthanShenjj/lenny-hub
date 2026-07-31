import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { getContentById } from "@/lib/data";
import type {
  ContentDetail,
  InsightCitation,
  InsightPayload,
  WeeklyDigestPayload,
} from "@/lib/types";
import { isoDate, sha256, startOfWeek, youtubeTimestampUrl } from "@/lib/utils";

const insightSchema = z.object({
  oneLineConclusion: z.string().min(8),
  whyItMatters: z.string().min(20),
  corePoints: z
    .array(
      z.object({
        title: z.string().min(2),
        explanation: z.string().min(12),
        citationIds: z.array(z.string()).min(1),
      }),
    )
    .min(2)
    .max(5),
  argumentChain: z.array(z.string().min(4)).min(2).max(8),
  casesAndData: z
    .array(
      z.object({
        statement: z.string().min(4),
        citationIds: z.array(z.string()).min(1),
      }),
    )
    .max(8),
  applications: z.array(z.string().min(4)).min(1).max(8),
  myTake: z.string().min(12),
  boundaries: z.array(z.string().min(4)).min(1).max(8),
  openQuestions: z.array(z.string().min(4)).min(1).max(8),
});

const weeklySchema = z.object({
  weekStart: z.string(),
  weekEnd: z.string(),
  summary: z.string().min(12),
  commonThemes: z.array(
    z.object({
      theme: z.string(),
      explanation: z.string(),
      contentIds: z.array(z.string()),
    }),
  ),
  connections: z.array(
    z.object({
      title: z.string(),
      type: z.enum(["agreement", "tension", "extension"]),
      explanation: z.string(),
      contentIds: z.array(z.string()),
    }),
  ),
  practices: z.array(z.string()),
  watchList: z.array(z.string()),
});

export interface AnalysisProvider {
  available: boolean;
  model: string;
  provider: string;
  analyzeContent(content: ContentDetail): Promise<InsightPayload>;
  createWeeklyDigest(
    context: string,
    weekStart: string,
    weekEnd: string,
  ): Promise<WeeklyDigestPayload>;
  embedTexts(texts: string[]): Promise<number[][]>;
}

function selectEvidenceChunks(content: ContentDetail) {
  const chunks = content.chunks.filter((chunk) => chunk.quoteText.length >= 30);
  if (chunks.length <= 30) return chunks;
  const selected = new Map<string, (typeof chunks)[number]>();
  chunks.slice(0, 6).forEach((chunk) => selected.set(chunk.id, chunk));
  const step = Math.max(1, Math.floor(chunks.length / 24));
  for (let index = 6; index < chunks.length; index += step) {
    const chunk = chunks[index];
    selected.set(chunk.id, chunk);
    if (selected.size >= 30) break;
  }
  return [...selected.values()].sort((a, b) => a.ordinal - b.ordinal);
}

function validateCitations(payload: InsightPayload, validIds: Set<string>) {
  const references = [
    ...payload.corePoints.flatMap((point) => point.citationIds),
    ...payload.casesAndData.flatMap((item) => item.citationIds),
  ];
  if (!references.length) throw new Error("模型输出没有引用任何原文片段。");
  const invalid = references.filter((id) => !validIds.has(id));
  if (invalid.length) {
    throw new Error(`模型返回了不存在的引用：${[...new Set(invalid)].join(", ")}`);
  }
}

class OpenAICompatibleAnalysisProvider implements AnalysisProvider {
  available = true;
  model = process.env.OPENAI_ANALYSIS_MODEL || "gpt-5.4-mini";
  provider = process.env.AI_PROVIDER || "openai";
  private client = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL,
  });

  async analyzeContent(content: ContentDetail) {
    const evidence = selectEvidenceChunks(content);
    if (!evidence.length) throw new Error("当前内容没有可供引用的正文片段。");
    const evidenceText = evidence
      .map(
        (chunk) =>
          `<chunk id="${chunk.id}" speaker="${chunk.speaker || ""}" timestamp="${
            chunk.timestampSeconds ?? ""
          }">\n${chunk.quoteText.slice(0, 1400)}\n</chunk>`,
      )
      .join("\n\n");

    const response = await this.client.chat.completions.parse({
      model: this.model,
      messages: [
        {
          role: "system",
          content:
            "你是严谨的中文产品研究员。只依据提供的原文片段分析；保留英文专有名词；不得虚构数字、链接、案例或观点。所有核心观点与案例数据都必须引用至少一个真实 chunk id。区分作者原意与你的推论。",
        },
        {
          role: "user",
          content: `请按固定结构深度解读以下内容。

标题：${content.title}
类型：${content.type}
嘉宾：${content.guest || "无"}
日期：${content.publishedAt || "未知"}
简介：${content.description || "无"}

原文证据：
${evidenceText}`,
        },
      ],
      response_format: zodResponseFormat(insightSchema, "lenny_content_insight"),
    });
    const parsed = response.choices[0]?.message.parsed;
    if (!parsed) throw new Error("模型没有返回有效的结构化解读。");
    const payload = insightSchema.parse(parsed);
    validateCitations(payload, new Set(evidence.map((chunk) => chunk.id)));
    return payload;
  }

  async createWeeklyDigest(context: string, weekStart: string, weekEnd: string) {
    const response = await this.client.chat.completions.parse({
      model: this.model,
      messages: [
        {
          role: "system",
          content:
            "你是严谨的中文研究编辑。仅依据给定内容生成周度洞察，明确观点之间的一致、张力或延伸，不生成社交媒体文案，不虚构来源。",
        },
        {
          role: "user",
          content: `请汇总 ${weekStart} 至 ${weekEnd} 的新增内容：\n\n${context}`,
        },
      ],
      response_format: zodResponseFormat(weeklySchema, "lenny_weekly_digest"),
    });
    const parsed = response.choices[0]?.message.parsed;
    if (!parsed) throw new Error("模型没有返回有效的结构化周报。");
    return weeklySchema.parse(parsed);
  }

  async embedTexts(texts: string[]) {
    const model = process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
    const response = await this.client.embeddings.create({
      model,
      input: texts,
    });
    return response.data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
  }
}

class UnavailableProvider implements AnalysisProvider {
  available = false;
  model = process.env.OPENAI_ANALYSIS_MODEL || "gpt-5.4-mini";
  provider = process.env.AI_PROVIDER || "openai";

  private missingKey(): never {
    throw new Error(
      "未配置 OPENAI_API_KEY。请复制 .env.example 为 .env.local 并填写密钥后重试。",
    );
  }

  async analyzeContent(): Promise<InsightPayload> {
    return this.missingKey();
  }

  async createWeeklyDigest(): Promise<WeeklyDigestPayload> {
    return this.missingKey();
  }

  async embedTexts(): Promise<number[][]> {
    return this.missingKey();
  }
}

let provider: AnalysisProvider | null = null;

export function getAnalysisProvider(): AnalysisProvider {
  if (!provider) {
    provider = process.env.OPENAI_API_KEY
      ? new OpenAICompatibleAnalysisProvider()
      : new UnavailableProvider();
  }
  return provider;
}

function createJob(contentItemId: string | null, jobType: string) {
  const db = getDb();
  const id = `job_${sha256(`${jobType}:${contentItemId}:${Date.now()}`).slice(0, 20)}`;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO analysis_jobs (
      id, content_item_id, job_type, status, attempts, created_at, updated_at
    ) VALUES (?, ?, ?, 'running', 0, ?, ?)`,
  ).run(id, contentItemId, jobType, now, now);
  return id;
}

function failJob(jobId: string, error: unknown, attempts: number) {
  getDb()
    .prepare(
      `UPDATE analysis_jobs SET status = 'failed', attempts = ?,
       error_message = ?, updated_at = ? WHERE id = ?`,
    )
    .run(
      attempts,
      error instanceof Error ? error.message : "未知错误",
      new Date().toISOString(),
      jobId,
    );
}

export async function analyzeContentItem(contentId: string) {
  const content = await getContentById(contentId);
  if (!content) throw new Error("内容不存在。");
  if (content.bodyStatus === "missing") throw new Error("正文缺失，暂时无法生成解读。");
  const analysisProvider = getAnalysisProvider();
  if (!analysisProvider.available) {
    throw new Error(
      "未配置 OPENAI_API_KEY。请复制 .env.example 为 .env.local 并填写密钥后重试。",
    );
  }

  const jobId = createJob(contentId, "content_analysis");
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      getDb()
        .prepare("UPDATE analysis_jobs SET attempts = ?, updated_at = ? WHERE id = ?")
        .run(attempt, new Date().toISOString(), jobId);
      const payload = await analysisProvider.analyzeContent(content);
      const citedIds = new Set([
        ...payload.corePoints.flatMap((point) => point.citationIds),
        ...payload.casesAndData.flatMap((item) => item.citationIds),
      ]);
      const citations: InsightCitation[] = content.chunks
        .filter((chunk) => citedIds.has(chunk.id))
        .map((chunk) => ({
          chunkId: chunk.id,
          label: chunk.speaker
            ? `${chunk.speaker}${
                chunk.timestampSeconds === null ? "" : ` · ${chunk.timestampSeconds}s`
              }`
            : chunk.heading || `段落 ${chunk.ordinal + 1}`,
          quote: chunk.quoteText,
          sourceUrl: youtubeTimestampUrl(content.sourceUrl, chunk.timestampSeconds),
          timestampSeconds: chunk.timestampSeconds,
          anchor: chunk.anchor,
        }));
      const insightId = `ins_${sha256(`${contentId}:${Date.now()}`).slice(0, 20)}`;
      const now = new Date().toISOString();
      const db = getDb();
      const transaction = db.transaction(() => {
        db.prepare("UPDATE insights SET stale = 1 WHERE content_item_id = ?").run(contentId);
        db.prepare(
          `INSERT INTO insights (
            id, content_item_id, payload_json, citations_json, source_hash,
            model, provider, stale, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        ).run(
          insightId,
          contentId,
          JSON.stringify(payload),
          JSON.stringify(citations),
          content.contentHash,
          analysisProvider.model,
          analysisProvider.provider,
          now,
        );
        db.prepare(
          "UPDATE analysis_jobs SET status = 'success', updated_at = ? WHERE id = ?",
        ).run(now, jobId);
      });
      transaction();
      return getContentById(contentId);
    } catch (error) {
      lastError = error;
      if (attempt === 2) failJob(jobId, error, attempt);
    }
  }
  throw lastError;
}

export async function generateWeeklyDigest(date = new Date()) {
  const analysisProvider = getAnalysisProvider();
  if (!analysisProvider.available) {
    throw new Error(
      "未配置 OPENAI_API_KEY。请复制 .env.example 为 .env.local 并填写密钥后重试。",
    );
  }
  const weekStartDate = startOfWeek(date);
  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setDate(weekEndDate.getDate() + 6);
  const weekStart = isoDate(weekStartDate);
  const weekEnd = isoDate(weekEndDate);
  const rows = getDb()
    .prepare(
      `SELECT c.id, c.title, c.type, c.guest, c.description, c.tags_json,
        i.payload_json
       FROM content_items c
       LEFT JOIN insights i ON i.id = (
         SELECT id FROM insights
         WHERE content_item_id = c.id AND stale = 0
         ORDER BY created_at DESC LIMIT 1
       )
       WHERE c.published_at BETWEEN ? AND ?
       ORDER BY c.published_at DESC LIMIT 40`,
    )
    .all(weekStart, weekEnd) as Array<Record<string, unknown>>;
  if (!rows.length) throw new Error("这一周没有可汇总的内容。");
  const context = rows
    .map((row) => {
      const payload = row.payload_json
        ? (JSON.parse(String(row.payload_json)) as InsightPayload)
        : null;
      return [
        `内容ID: ${row.id}`,
        `标题: ${row.title}`,
        `类型: ${row.type}`,
        `嘉宾: ${row.guest || "无"}`,
        `标签: ${parseJsonArray(row.tags_json).join(", ")}`,
        `简介: ${row.description || "无"}`,
        payload ? `已有解读: ${payload.oneLineConclusion}\n${payload.whyItMatters}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n---\n\n");

  const jobId = createJob(null, "weekly_digest");
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const payload = await analysisProvider.createWeeklyDigest(context, weekStart, weekEnd);
      const id = `week_${weekStart}`;
      const now = new Date().toISOString();
      getDb()
        .prepare(
          `INSERT INTO weekly_digests (
            id, week_start, week_end, payload_json, model, created_at
           ) VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(week_start) DO UPDATE SET
             week_end = excluded.week_end,
             payload_json = excluded.payload_json,
             model = excluded.model,
             created_at = excluded.created_at`,
        )
        .run(
          id,
          weekStart,
          weekEnd,
          JSON.stringify(payload),
          analysisProvider.model,
          now,
        );
      getDb()
        .prepare("UPDATE analysis_jobs SET status = 'success', attempts = ?, updated_at = ? WHERE id = ?")
        .run(attempt, now, jobId);
      return { id, weekStart, weekEnd, payload, model: analysisProvider.model, createdAt: now };
    } catch (error) {
      lastError = error;
      if (attempt === 2) failJob(jobId, error, attempt);
    }
  }
  throw lastError;
}

function parseJsonArray(value: unknown) {
  try {
    return JSON.parse(String(value || "[]")) as string[];
  } catch {
    return [];
  }
}
