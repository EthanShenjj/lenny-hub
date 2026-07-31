import { createHash } from "node:crypto";

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeTitle(value: string) {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function cleanText(value: string) {
  return value
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/[*_`>#]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function secondsFromTimestamp(value?: string | null) {
  if (!value) return null;
  const parts = value.split(":").map(Number);
  if (parts.some(Number.isNaN)) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

export function formatTimestamp(seconds: number | null) {
  if (seconds === null) return "";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return hours > 0
    ? [hours, minutes, secs].map((part) => String(part).padStart(2, "0")).join(":")
    : [minutes, secs].map((part) => String(part).padStart(2, "0")).join(":");
}

export function youtubeTimestampUrl(sourceUrl: string | null, seconds: number | null) {
  if (!sourceUrl || seconds === null || !/youtu(\.be|be\.com)/.test(sourceUrl)) return sourceUrl;
  const url = new URL(sourceUrl);
  url.searchParams.set("t", `${Math.floor(seconds)}s`);
  return url.toString();
}

export function startOfWeek(date = new Date()) {
  const result = new Date(date);
  const day = result.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  result.setDate(result.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

export function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
