import { runSync } from "@/lib/sync";

export async function POST() {
  try {
    return Response.json(await runSync("manual"));
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "同步失败" },
      { status: 502 },
    );
  }
}
