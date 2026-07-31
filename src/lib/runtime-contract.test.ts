import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "../../next.config";

describe("native dependency runtime contract", () => {
  it("rebuilds better-sqlite3 with the active Node runtime before Next.js starts", () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.["native:rebuild"]).toBe(
      "npm rebuild better-sqlite3",
    );
    expect(packageJson.scripts?.["native:ensure"]).toBe(
      "node scripts/ensure-native.mjs",
    );
    expect(packageJson.scripts?.predev).toBe("npm run native:ensure");
    expect(packageJson.scripts?.prebuild).toBe("npm run native:ensure");
    expect(packageJson.scripts?.prestart).toBe("npm run native:ensure");
  });

  it("allows both local development origins to hydrate client navigation", () => {
    expect(nextConfig.allowedDevOrigins).toContain("127.0.0.1");
    expect(nextConfig.allowedDevOrigins).toContain("localhost");
  });
});
