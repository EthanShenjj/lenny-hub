import { analyzeContentItem } from "../src/lib/analysis";
import { getDb } from "../src/lib/db";

type PendingRow = {
  id: string;
  title: string;
  type: "podcast" | "newsletter";
  published_at: string | null;
  word_count: number;
};

function readPositiveInteger(flag: string, fallback: number) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  const parsed = Number.parseInt(process.argv[index + 1] || "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`${flag} 必须是正整数。`);
  }
  return parsed;
}

async function main() {
  const concurrency = readPositiveInteger("--concurrency", 3);
  const requestedLimit = readPositiveInteger("--limit", Number.MAX_SAFE_INTEGER);
  const db = getDb();
  const pending = db
  .prepare(
    `SELECT c.id, c.title, c.type, c.published_at, c.word_count
     FROM content_items c
     WHERE c.body_status <> 'missing'
       AND NOT EXISTS (
         SELECT 1 FROM insights i
         WHERE i.content_item_id = c.id AND i.stale = 0
       )
     ORDER BY
       CASE WHEN c.body_status = 'available' THEN 0 ELSE 1 END,
       c.published_at DESC,
       c.id ASC
     LIMIT ?`,
  )
    .all(requestedLimit) as PendingRow[];

  if (!pending.length) {
    console.log("没有待解读内容。");
    return;
  }

  console.log(`待解读 ${pending.length} 条，并发数 ${concurrency}。`);

  let cursor = 0;
  let succeeded = 0;
  let failed = 0;
  const failures: Array<{ id: string; title: string; error: string }> = [];
  const startedAt = Date.now();

  async function worker(workerNumber: number) {
    while (true) {
      const index = cursor;
      cursor += 1;
      const item = pending[index];
      if (!item) return;

      const position = index + 1;
      console.log(
        `[${position}/${pending.length}] worker-${workerNumber} 开始 ${item.type}: ${item.title}`,
      );
      try {
        await analyzeContentItem(item.id);
        succeeded += 1;
        const elapsedMinutes = (Date.now() - startedAt) / 60_000;
        const completed = succeeded + failed;
        const rate = elapsedMinutes > 0 ? completed / elapsedMinutes : 0;
        const eta = rate > 0 ? (pending.length - completed) / rate : 0;
        console.log(
          `[${position}/${pending.length}] 完成 ${item.id} ` +
            `(成功 ${succeeded} / 失败 ${failed} / 预计剩余 ${eta.toFixed(1)} 分钟)`,
        );
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        failures.push({ id: item.id, title: item.title, error: message });
        console.error(`[${position}/${pending.length}] 失败 ${item.id}: ${message}`);
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, pending.length) }, (_, index) =>
      worker(index + 1),
    ),
  );

  const elapsedMinutes = (Date.now() - startedAt) / 60_000;
  console.log(
    `批处理结束：成功 ${succeeded}，失败 ${failed}，耗时 ${elapsedMinutes.toFixed(1)} 分钟。`,
  );
  if (failures.length) {
    console.log("失败清单：");
    for (const failure of failures) {
      console.log(`${failure.id}\t${failure.title}\t${failure.error}`);
    }
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
