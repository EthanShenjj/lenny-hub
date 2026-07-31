import { importAllData } from "../src/lib/importer";
import { paths } from "../src/lib/paths";

const startedAt = Date.now();
const result = importAllData();

console.log(
  JSON.stringify(
    {
      database: paths.database,
      durationMs: Date.now() - startedAt,
      ...result,
    },
    null,
    2,
  ),
);
