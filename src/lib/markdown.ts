import { cleanText, secondsFromTimestamp, sha256 } from "@/lib/utils";
import type { ContentChunk, ContentType } from "@/lib/types";

type ParsedChunk = Omit<ContentChunk, "id">;

const speakerPattern =
  /^\*\*(?<speaker>[^*]+)\*\*\s*\((?<timestamp>\d{1,2}:\d{2}(?::\d{2})?)\):\s*(?<text>.*)$/;

function compactParagraph(lines: string[]) {
  return cleanText(lines.join(" "));
}

function chunkPodcast(body: string): ParsedChunk[] {
  const chunks: ParsedChunk[] = [];
  const lines = body.split(/\r?\n/);
  let current: {
    speaker: string;
    timestamp: string;
    lines: string[];
  } | null = null;

  const flush = () => {
    if (!current) return;
    const quoteText = compactParagraph(current.lines);
    if (quoteText.length >= 16) {
      const ordinal = chunks.length;
      chunks.push({
        ordinal,
        heading: null,
        speaker: current.speaker,
        timestampSeconds: secondsFromTimestamp(current.timestamp),
        quoteText,
        anchor: `chunk-${ordinal}`,
      });
    }
    current = null;
  };

  for (const line of lines) {
    const match = line.match(speakerPattern);
    if (match?.groups) {
      flush();
      current = {
        speaker: match.groups.speaker.trim(),
        timestamp: match.groups.timestamp,
        lines: [match.groups.text],
      };
    } else if (current && line.trim()) {
      current.lines.push(line.trim());
    }
  }
  flush();
  return chunks;
}

function chunkNewsletter(body: string): ParsedChunk[] {
  const chunks: ParsedChunk[] = [];
  const lines = body.split(/\r?\n/);
  let heading: string | null = null;
  let paragraph: string[] = [];

  const flush = () => {
    const quoteText = compactParagraph(paragraph);
    paragraph = [];
    // Chinese paragraphs carry more meaning per character than whitespace-tokenized
    // English, so retain shorter passages as independent evidence chunks.
    if (quoteText.length < 20) return;
    const ordinal = chunks.length;
    chunks.push({
      ordinal,
      heading,
      speaker: null,
      timestampSeconds: null,
      quoteText,
      anchor: `chunk-${ordinal}`,
    });
  };

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,4}\s+(.+)$/);
    if (headingMatch) {
      flush();
      heading = cleanText(headingMatch[1]);
      continue;
    }
    if (!line.trim()) {
      flush();
      continue;
    }
    paragraph.push(line.trim());
  }
  flush();
  return chunks;
}

export function parseChunks(contentId: string, type: ContentType, body: string): ContentChunk[] {
  const raw = type === "podcast" ? chunkPodcast(body) : chunkNewsletter(body);
  const fallback: ParsedChunk[] =
    raw.length > 0
      ? raw
      : body
          .split(/\n{2,}/)
          .map(cleanText)
          .filter((text) => text.length >= 32)
          .map((quoteText, ordinal) => ({
            ordinal,
            heading: null,
            speaker: null,
            timestampSeconds: null,
            quoteText,
            anchor: `chunk-${ordinal}`,
          }));

  return fallback.map((chunk) => ({
    ...chunk,
    id: `chk_${sha256(`${contentId}:${chunk.ordinal}:${chunk.quoteText}`).slice(0, 20)}`,
  }));
}
