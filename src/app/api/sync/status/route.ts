import { getSyncRuns } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const runs = await getSyncRuns();
    return Response.json({ current: runs.find((run) => run.status === "running") || null, runs });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "同步状态加载失败" },
      { status: 500 },
    );
  }
}
