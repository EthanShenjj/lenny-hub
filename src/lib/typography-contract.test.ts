import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const css = fs.readFileSync(
  path.join(process.cwd(), "src/app/globals.css"),
  "utf8",
);

function fontSizeFor(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const block = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1];
  const size = block?.match(/font-size:\s*(\d+)px/)?.[1];
  return size ? Number(size) : 0;
}

describe("desktop typography", () => {
  it("keeps navigation and content-library copy at readable sizes", () => {
    expect(fontSizeFor(".nav-item")).toBeGreaterThanOrEqual(15);
    expect(fontSizeFor(".page-description")).toBeGreaterThanOrEqual(15);
    expect(fontSizeFor(".search-box input")).toBeGreaterThanOrEqual(14);
    expect(fontSizeFor(".segmented-control button")).toBeGreaterThanOrEqual(13);
    expect(fontSizeFor(".filter-field select")).toBeGreaterThanOrEqual(13);
    expect(fontSizeFor(".results-toolbar")).toBeGreaterThanOrEqual(12);
    expect(fontSizeFor(".content-card h2")).toBeGreaterThanOrEqual(16);
    expect(fontSizeFor(".content-description")).toBeGreaterThanOrEqual(13);
    expect(fontSizeFor(".content-meta")).toBeGreaterThanOrEqual(12);
    expect(fontSizeFor(".type-label")).toBeGreaterThanOrEqual(10);
  });
});
