import { runMaintenance } from "@/lib/sync";

export async function POST() {
  try {
    return Response.json(await runMaintenance());
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "后台检查失败" },
      { status: 502 },
    );
  }
}
