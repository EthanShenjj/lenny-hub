export type ContentType = "podcast" | "newsletter";
export type BodyStatus = "available" | "preview" | "missing";
export type InsightStatus = "not_started" | "ready" | "stale" | "failed" | "running";

export interface ContentSummary {
  id: string;
  type: ContentType;
  title: string;
  guest: string | null;
  publishedAt: string | null;
  sourceUrl: string | null;
  description: string | null;
  tags: string[];
  wordCount: number;
  bodyStatus: BodyStatus;
  insightStatus: InsightStatus;
  importedSource: string;
  relevance?: number;
}

export interface ContentChunk {
  id: string;
  ordinal: number;
  heading: string | null;
  speaker: string | null;
  timestampSeconds: number | null;
  quoteText: string;
  anchor: string;
}

export interface InsightCitation {
  chunkId: string;
  label: string;
  quote: string;
  sourceUrl: string | null;
  timestampSeconds: number | null;
  anchor: string;
}

export interface CorePoint {
  title: string;
  explanation: string;
  citationIds: string[];
}

export interface CaseAndData {
  statement: string;
  citationIds: string[];
}

export interface InsightPayload {
  oneLineConclusion: string;
  whyItMatters: string;
  corePoints: CorePoint[];
  argumentChain: string[];
  casesAndData: CaseAndData[];
  applications: string[];
  myTake: string;
  boundaries: string[];
  openQuestions: string[];
}

export interface StoredInsight {
  id: string;
  contentItemId: string;
  payload: InsightPayload;
  citations: InsightCitation[];
  model: string;
  createdAt: string;
  stale: boolean;
}

export interface ContentDetail extends ContentSummary {
  body: string;
  contentHash: string;
  chunks: ContentChunk[];
  insight: StoredInsight | null;
}

export interface ContentQuery {
  q?: string;
  mode?: "keyword" | "semantic";
  type?: ContentType | "all";
  topic?: string;
  year?: string;
  guest?: string;
  bodyStatus?: BodyStatus | "all";
  insightStatus?: InsightStatus | "all";
  sort?: "relevance" | "latest" | "length";
  page?: number;
  pageSize?: number;
}

export interface ContentSearchResult {
  items: ContentSummary[];
  total: number;
  page: number;
  pageSize: number;
  searchMode: "keyword" | "semantic" | "semantic-fallback";
  notice?: string;
  facets: {
    years: string[];
    guests: string[];
    topics: string[];
  };
}

export interface DashboardStats {
  totals: {
    all: number;
    podcasts: number;
    newsletters: number;
    topics: number;
    analyzed: number;
    addedThisWeek: number;
  };
  monthlyTrend: Array<{ month: string; podcast: number; newsletter: number }>;
  topicDistribution: Array<{ topic: string; count: number }>;
  topicCoverage: Array<{ topic: string; podcast: number; newsletter: number }>;
  recentInsights: Array<{
    contentId: string;
    title: string;
    type: ContentType;
    createdAt: string;
    model: string;
  }>;
  bodyAvailability: {
    available: number;
    preview: number;
    missing: number;
  };
}

export interface SyncRun {
  id: string;
  status: "running" | "success" | "partial" | "failed";
  trigger: "manual" | "startup" | "scheduled";
  startedAt: string;
  completedAt: string | null;
  addedCount: number;
  updatedCount: number;
  skippedCount: number;
  errorMessage: string | null;
  details: Record<string, unknown>;
}

export interface WeeklyDigestPayload {
  weekStart: string;
  weekEnd: string;
  summary: string;
  commonThemes: Array<{ theme: string; explanation: string; contentIds: string[] }>;
  connections: Array<{
    title: string;
    type: "agreement" | "tension" | "extension";
    explanation: string;
    contentIds: string[];
  }>;
  practices: string[];
  watchList: string[];
}

export interface WeeklyDigest {
  id: string;
  weekStart: string;
  weekEnd: string;
  payload: WeeklyDigestPayload;
  model: string;
  createdAt: string;
}
