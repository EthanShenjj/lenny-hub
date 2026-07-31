import type { BodyStatus, ContentQuery, ContentType, InsightStatus } from "@/lib/types";
import { getContent } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query: ContentQuery = {
    q: params.get("q") || undefined,
    mode: params.get("mode") === "semantic" ? "semantic" : "keyword",
    type: (params.get("type") || "all") as ContentType | "all",
    topic: params.get("topic") || undefined,
    year: params.get("year") || undefined,
    guest: params.get("guest") || undefined,
    bodyStatus: (params.get("bodyStatus") || "all") as BodyStatus | "all",
    insightStatus: (params.get("insightStatus") || "all") as
      | InsightStatus
      | "all",
    sort: (params.get("sort") || "relevance") as ContentQuery["sort"],
    page: Number(params.get("page") || 1),
    pageSize: Number(params.get("pageSize") || 20),
  };
  try {
    return Response.json(await getContent(query));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "内容检索失败" },
      { status: 500 },
    );
  }
}
