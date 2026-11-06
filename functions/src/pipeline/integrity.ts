import type { Cue, Segment } from "../lib/types";
import type { Word } from "./transcribe";

/** Lower-case, strip punctuation and collapse whitespace for verbatim comparisons. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/[^\p{L}\p{N}' ]+/gu, " ")
    .replace(/'/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const FILLERS = new Set(["um", "uh", "er", "ah", "erm", "hmm"]);
function stripFillers(s: string) {
  return s
    .split(" ")
    .filter((w) => !FILLERS.has(w))
    .join(" ");
}

export function windowText(segments: Segment[], from: number, to: number): string {
  return segments
    .filter((s) => s.i >= from && s.i <= to)
    .map((s) => s.text)
    .join(" ");
}

/**
 * A quote is only accepted when it appears verbatim (ignoring punctuation,
 * case and filler words) in the transcript near the cited segment.
 * Returns the segment range that contains it, or null.
 */
export function verifyQuote(
  quote: string,
  segments: Segment[],
  aroundSegment: number,
): { from: number; to: number } | null {
  const q = stripFillers(norm(quote));
  if (q.split(" ").length < 4) return null;
  // Smallest window (up to 3 segments) that includes the cited segment.
  for (let span = 0; span <= 2; span++) {
    for (let from = aroundSegment - span; from <= aroundSegment; from++) {
      if (from < 0) continue;
      const to = from + span;
      if (stripFillers(norm(windowText(segments, from, to))).includes(q)) return { from, to };
    }
  }
  // Fallback: search the whole transcript (model cited the wrong segment).
  for (const s of segments) {
    const hay = stripFillers(norm(windowText(segments, s.i, s.i + 2)));
    if (hay.includes(q)) {
      // tighten end
      for (let to = s.i; to <= s.i + 2; to++) {
        if (stripFillers(norm(windowText(segments, s.i, to))).includes(q)) return { from: s.i, to };
      }
      return { from: s.i, to: s.i + 2 };
    }
  }
  return null;
}

const BOOKS = [
  "genesis","exodus","leviticus","numbers","deuteronomy","joshua","judges","ruth","samuel","kings","chronicles",
  "ezra","nehemiah","esther","job","psalm","psalms","proverbs","ecclesiastes","song","isaiah","jeremiah",
  "lamentations","ezekiel","daniel","hosea","joel","amos","obadiah","jonah","micah","nahum","habakkuk",
  "zephaniah","haggai","zechariah","malachi","matthew","mark","luke","john","acts","romans","corinthians",
  "galatians","ephesians","philippians","colossians","thessalonians","timothy","titus","philemon","hebrews",
  "james","peter","jude","revelation",
];

export function bookOf(reference: string): string | null {
  const n = norm(reference).replace(/^(1|2|3|i|ii|iii|first|second|third)\s+/, "");
  const first = n.split(" ")[0];
  if (first === "psalms") return "psalm";
  if (first === "revelations") return "revelation";
  return BOOKS.includes(first) ? first : null;
}

/**
 * A scripture reference is "verified" when its book is spoken in the transcript
 * near the cited segment. Anything else is kept but flagged for human review.
 */
export function verifyScripture(reference: string, segments: Segment[], aroundSegment: number | null): boolean {
  const book = bookOf(reference);
  if (!book) return false;
  const re = new RegExp(`\\b${book}s?\\b`);
  if (aroundSegment !== null && aroundSegment !== undefined) {
    if (re.test(norm(windowText(segments, aroundSegment - 3, aroundSegment + 3)))) return true;
  }
  return re.test(norm(segments.map((s) => s.text).join(" ")));
}

/** Build short on-screen caption cues (relative to clip start) from word timings. */
export function buildCues(start: number, end: number, words: Word[], segments: Segment[]): Cue[] {
  const inClip = words.filter((w) => w.s >= start - 0.05 && w.e <= end + 0.05);
  const cues: Cue[] = [];
  if (inClip.length) {
    let cur: Word[] = [];
    const flush = () => {
      if (!cur.length) return;
      cues.push({
        start: Math.max(0, round(cur[0].s - start)),
        end: round(cur[cur.length - 1].e - start),
        text: cur.map((w) => w.w).join(" "),
      });
      cur = [];
    };
    for (const w of inClip) {
      cur.push(w);
      const text = cur.map((x) => x.w).join(" ");
      if (cur.length >= 6 || text.length > 32 || /[.!?]$/.test(w.w)) flush();
    }
    flush();
    return cues;
  }
  // No word timings (imported transcript) — interpolate within segments.
  for (const s of segments.filter((x) => x.end > start && x.start < end)) {
    const tokens = s.text.split(/\s+/);
    const chunks: string[] = [];
    for (let i = 0; i < tokens.length; i += 6) chunks.push(tokens.slice(i, i + 6).join(" "));
    const per = (s.end - s.start) / Math.max(chunks.length, 1);
    chunks.forEach((c, k) => {
      const cs = s.start + k * per;
      const ce = cs + per;
      if (ce <= start || cs >= end) return;
      cues.push({ start: round(Math.max(0, cs - start)), end: round(Math.min(end, ce) - start), text: c });
    });
  }
  return cues;
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
}
