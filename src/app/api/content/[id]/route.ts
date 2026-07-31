import { getContentById } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const content = await getContentById(id);
    if (!content) return Response.json({ error: "内容不存在" }, { status: 404 });
    return Response.json(content);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "内容加载失败" },
      { status: 500 },
    );
  }
}
