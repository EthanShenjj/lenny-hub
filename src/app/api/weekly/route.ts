import { generateWeeklyDigest } from "@/lib/analysis";
import { getWeeklyDigests } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({ digests: await getWeeklyDigests() });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "周报加载失败" },
      { status: 500 },
    );
  }
}

export async function POST() {
  try {
    return Response.json(await generateWeeklyDigest());
  } catch (error) {
    const message = error instanceof Error ? error.message : "周报生成失败";
    return Response.json(
      { error: message },
      { status: message.includes("OPENAI_API_KEY") ? 503 : 422 },
    );
  }
}
