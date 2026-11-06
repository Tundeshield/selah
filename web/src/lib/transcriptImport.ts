/** Parse .srt / .vtt / .txt transcripts into segments in the browser. */
export interface ParsedTranscript {
  segments: { start: number; end: number; text: string }[];
  hasTimestamps: boolean;
}

function toSec(t: string): number {
  const m = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/.exec(t.trim());
  if (!m) return NaN;
  return Number(m[1] || 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, "0")) / 1000;
}

export function parseTranscript(name: string, raw: string): ParsedTranscript {
  const text = raw.replace(/\r/g, "").replace(/^﻿/, "");
  const isCue = /-->/.test(text);
  if (isCue) {
    const blocks = text.split(/\n{2,}/);
    const cues: { start: number; end: number; text: string }[] = [];
    for (const b of blocks) {
      const lines = b.split("\n").filter(Boolean);
      const idx = lines.findIndex((l) => l.includes("-->"));
      if (idx < 0) continue;
      const [a, z] = lines[idx].split("-->");
      const start = toSec(a);
      const end = toSec(z.split(" ")[1] ? z.trim().split(" ")[0] : z);
      const t = lines
        .slice(idx + 1)
        .join(" ")
        .replace(/<[^>]+>/g, "")
        .trim();
      if (!isNaN(start) && !isNaN(end) && t) cues.push({ start, end, text: t });
    }
    // Merge cue fragments into sentence-like segments.
    const segs: typeof cues = [];
    for (const c of cues) {
      const last = segs[segs.length - 1];
      if (last && !/[.!?]["”']?$/.test(last.text) && c.end - last.start < 25) {
        last.text = `${last.text} ${c.text}`;
        last.end = c.end;
      } else segs.push({ ...c });
    }
    return { segments: segs, hasTimestamps: true };
  }
  // Plain text: split into paragraphs, then sentences of reasonable size.
  const paragraphs = text.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const segments: { start: number; end: number; text: string }[] = [];
  for (const p of paragraphs) {
    const sentences = p.match(/[^.!?]+[.!?]+["”']?|\S[^.!?]*$/g) || [p];
    let buf = "";
    for (const s of sentences) {
      buf = buf ? `${buf} ${s.trim()}` : s.trim();
      if (buf.split(" ").length >= 12) {
        segments.push({ start: 0, end: 0, text: buf });
        buf = "";
      }
    }
    if (buf) segments.push({ start: 0, end: 0, text: buf });
  }
  void name;
  return { segments, hasTimestamps: false };
}
