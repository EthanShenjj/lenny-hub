import { analyzeContentItem } from "@/lib/analysis";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const content = await analyzeContentItem(id);
    return Response.json({ content, message: "解读已生成" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "分析失败";
    const status = message.includes("OPENAI_API_KEY") ? 503 : 422;
    return Response.json({ error: message }, { status });
  }
}
