import { describe, expect, it } from "vitest";
import { importerInternals, type ImportCandidate } from "@/lib/importer";

function candidate(overrides: Partial<ImportCandidate> = {}): ImportCandidate {
  return {
    type: "podcast",
    title: "How to Build Great Products",
    guest: "Ada Lovelace",
    publishedAt: "2025-01-02",
    sourceUrl: null,
    videoId: null,
    description: null,
    tags: ["product-management"],
    body: "Example body",
    wordCount: 2,
    bodyStatus: "available",
    importedSource: "test",
    ...overrides,
  };
}

describe("import deduplication", () => {
  it("prioritizes video ids", () => {
    expect(importerInternals.dedupeKey(candidate({ videoId: "abc123" }))).toBe(
      "video:abc123",
    );
  });

  it("uses normalized type, title and date when source is missing", () => {
    expect(
      importerInternals.dedupeKey(
        candidate({ title: "  How—to BUILD great products!  " }),
      ),
    ).toBe("podcast:how to build great products:2025-01-02");
  });

  it("keeps duplicate titles from different dates distinct", () => {
    const first = importerInternals.dedupeKey(candidate());
    const second = importerInternals.dedupeKey(
      candidate({ publishedAt: "2025-02-02" }),
    );
    expect(first).not.toBe(second);
  });
});

describe("markdown chunk parsing", () => {
  it("parses podcast speaker and timestamp", () => {
    const chunks = importerInternals.parseChunks(
      "content-1",
      "podcast",
      "**Lenny Rachitsky** (00:01:12):\nA sufficiently long source quote for testing.\n\n**Guest** (01:02:03):\nAnother source quote with enough content.",
    );
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({
      speaker: "Lenny Rachitsky",
      timestampSeconds: 72,
    });
    expect(chunks[1].timestampSeconds).toBe(3723);
  });

  it("preserves Chinese newsletter paragraphs", () => {
    const chunks = importerInternals.parseChunks(
      "content-2",
      "newsletter",
      "## 关键观点\n\n这是一段用于验证中文字符可以被完整解析和保留的正文内容，不应该出现乱码。\n\n第二段也应该成为独立的引用片段，便于后续生成带证据的中文解读。",
    );
    expect(chunks).toHaveLength(2);
    expect(chunks[0].heading).toBe("关键观点");
    expect(chunks[0].quoteText).toContain("中文字符");
  });
});
