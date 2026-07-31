import path from "node:path";
import { importInterpretations } from "../src/lib/interpretation-importer";
import { paths } from "../src/lib/paths";

const input = process.argv[2] || process.env.LENNY_INTERPRETATIONS_DIR;
if (!input) {
  throw new Error(
    "请传入中文解读目录：npm run import:interpretations -- /absolute/path/to/lenny中文解读",
  );
}

const startedAt = Date.now();
const result = importInterpretations(path.resolve(input));
console.log(
  JSON.stringify(
    {
      database: paths.database,
      source: path.resolve(input),
      durationMs: Date.now() - startedAt,
      ...result,
    },
    null,
    2,
  ),
);

if (result.unmatched.length) process.exitCode = 1;
