import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const runtimeBin = path.dirname(process.execPath);
const childEnvironment = {
  ...process.env,
  PATH: [runtimeBin, process.env.PATH].filter(Boolean).join(path.delimiter),
  NODE: process.execPath,
  npm_node_execpath: process.execPath,
};

function openMemoryDatabase() {
  const Database = require("better-sqlite3");
  const database = new Database(":memory:");
  database.prepare("select 1").get();
  database.close();
}

try {
  openMemoryDatabase();
  console.log(
    `[native] better-sqlite3 is ready for Node ${process.versions.node} (ABI ${process.versions.modules}).`,
  );
} catch (error) {
  const isBinaryMismatch =
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "ERR_DLOPEN_FAILED";

  if (!isBinaryMismatch) throw error;

  const npmExecPath = process.env.npm_execpath;
  if (!npmExecPath) {
    throw new Error(
      "无法定位当前 Node 对应的 npm。请通过 `npm run native:ensure` 执行自检。",
      { cause: error },
    );
  }

  console.log(
    `[native] Detected an ABI mismatch for Node ${process.versions.node}; rebuilding better-sqlite3...`,
  );
  const rebuild = spawnSync(
    process.execPath,
    [npmExecPath, "rebuild", "better-sqlite3"],
    { env: childEnvironment, stdio: "inherit" },
  );

  if (rebuild.status !== 0) {
    process.exit(rebuild.status ?? 1);
  }

  const verify = spawnSync(
    process.execPath,
    [
      "-e",
      "const D=require('better-sqlite3');const d=new D(':memory:');d.prepare('select 1').get();d.close()",
    ],
    { cwd: process.cwd(), env: childEnvironment, stdio: "inherit" },
  );

  if (verify.status !== 0) {
    process.exit(verify.status ?? 1);
  }

  console.log("[native] better-sqlite3 rebuilt successfully.");
}
