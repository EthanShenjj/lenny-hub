import { getDashboardStats } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await getDashboardStats());
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "统计加载失败" },
      { status: 500 },
    );
  }
}
