import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { interpretationImporterInternals } from "@/lib/interpretation-importer";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("Chinese interpretation parsing", () => {
  it("extracts frontmatter, sections, lists, and source quotes", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "lenny-interpretation-"));
    temporaryDirectories.push(directory);
    const filePath = path.join(directory, "example.md");
    fs.writeFileSync(
      filePath,
      `---
title: Example
type: newsletter
date: '2025-01-02'
primary_topic: 产品战略
---

- 嘉宾：Ada Lovelace

## 一句话定位

这是一个足够清晰的一句话定位。

## 内容脉络

- 第一个要点
- 第二个要点

## 核心信号（原文短摘）

> First source quote.
> Second source quote.

## 检索标签

产品战略, strategy, roadmap
`,
    );

    const parsed = interpretationImporterInternals.parseInterpretation(
      filePath,
      "newsletter/example.md",
    );
    expect(parsed).toMatchObject({
      title: "Example",
      type: "newsletter",
      publishedAt: "2025-01-02",
      primaryTopic: "产品战略",
      guest: "Ada Lovelace",
    });
    expect(parsed.tags).toEqual(["产品战略", "strategy", "roadmap"]);
    expect(
      interpretationImporterInternals.listItems(parsed.sections.get("内容脉络") || ""),
    ).toEqual(["第一个要点", "第二个要点"]);
    expect(
      interpretationImporterInternals.quoteItems(
        parsed.sections.get("核心信号（原文短摘）") || "",
      ),
    ).toEqual(["First source quote.", "Second source quote."]);
  });
});
