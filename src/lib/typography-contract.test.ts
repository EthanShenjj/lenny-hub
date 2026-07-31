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
    expect(fontSizeFor(".page-description")).toBeGreaterThanOrEqual(16);
    expect(fontSizeFor(".search-box input")).toBeGreaterThanOrEqual(15);
    expect(fontSizeFor(".segmented-control button")).toBeGreaterThanOrEqual(14);
    expect(fontSizeFor(".filter-field select")).toBeGreaterThanOrEqual(14);
    expect(fontSizeFor(".results-toolbar")).toBeGreaterThanOrEqual(13);
    expect(fontSizeFor(".content-card h2")).toBeGreaterThanOrEqual(17);
    expect(fontSizeFor(".content-description")).toBeGreaterThanOrEqual(14);
    expect(fontSizeFor(".content-meta")).toBeGreaterThanOrEqual(13);
    expect(fontSizeFor(".type-label")).toBeGreaterThanOrEqual(11);
  });

  it("does not render any explicit text below 11px", () => {
    const sizes = [...css.matchAll(/font-size:\s*(\d+)px/g)].map((match) => Number(match[1]));
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(11);
  });
});
