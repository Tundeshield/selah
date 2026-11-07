/**
 * One-click video styles. Each style bundles captions (word-by-word or line),
 * an opening hook title, motion, colour grade, progress bar and end card.
 * Everything renders with ffmpeg + libass — no extra AI or services.
 */
import type { Cue } from "../lib/types";
import type { Word } from "./transcribe";

export type StyleId = "bold" | "clean" | "cinematic" | "glow" | "brand";
export const STYLE_IDS: StyleId[] = ["bold", "clean", "cinematic", "glow", "brand"];

interface StyleDef {
  font: string;
  size: number; // px at 1080×1920
  upper: boolean;
  karaoke: boolean;
  maxWords: number;
  text: string;
  inactiveAlpha: string; // ASS alpha for words not being spoken ("00" = opaque)
  highlight: string; // hex, or "accent"
  glow: boolean;
  outline: number;
  shadow: number;
  pos: number; // caption centre as a fraction of height (9:16)
  hookFont: string;
  hookSize: number;
  hookBox: string | null; // hex, "accent", "primary" or null (no box)
  hookText: string; // hex, "accent"
  motion: number; // zoom added over the clip (0.08 = 8%)
  grade: string | null; // extra ffmpeg filters
  letterbox?: boolean;
  progress: string | null; // hex or "accent"
}

export const STYLES: Record<StyleId, StyleDef> = {
  bold: {
    font: "Archivo Black", size: 98, upper: true, karaoke: true, maxWords: 3, text: "#FFFFFF", inactiveAlpha: "00",
    highlight: "#FFD60A", glow: false, outline: 6, shadow: 0, pos: 0.66,
    hookFont: "Anton", hookSize: 104, hookBox: "#FFFFFF", hookText: "#0B0D0E", motion: 0.08, grade: "eq=contrast=1.05:saturation=1.1", progress: "#FFD60A",
  },
  clean: {
    font: "Liberation Sans", size: 76, upper: false, karaoke: true, maxWords: 4, text: "#FFFFFF", inactiveAlpha: "45",
    highlight: "#FFFFFF", glow: false, outline: 3, shadow: 3, pos: 0.72,
    hookFont: "Liberation Sans", hookSize: 76, hookBox: null, hookText: "#FFFFFF", motion: 0.05, grade: null, progress: "#FFFFFF",
  },
  cinematic: {
    font: "Liberation Sans", size: 64, upper: false, karaoke: false, maxWords: 6, text: "#FFFFFF", inactiveAlpha: "00",
    highlight: "#FFFFFF", glow: false, outline: 1, shadow: 2, pos: 0.8,
    hookFont: "Anton", hookSize: 118, hookBox: null, hookText: "#FFFFFF", motion: 0.06,
    grade: "eq=contrast=1.08:saturation=0.8:gamma=0.97,vignette=PI/5,noise=alls=6:allf=t", progress: null, letterbox: true,
  },
  glow: {
    font: "Archivo Black", size: 94, upper: true, karaoke: true, maxWords: 3, text: "#FFFFFF", inactiveAlpha: "00",
    highlight: "accent", glow: true, outline: 3, shadow: 0, pos: 0.66,
    hookFont: "Anton", hookSize: 104, hookBox: "accent", hookText: "#0B0D0E", motion: 0.07, grade: "eq=contrast=1.06:saturation=0.9", progress: "accent",
  },
  brand: {
    font: "Archivo Black", size: 84, upper: false, karaoke: true, maxWords: 4, text: "#FFFFFF", inactiveAlpha: "00",
    highlight: "accent", glow: false, outline: 5, shadow: 0, pos: 0.68,
    hookFont: "Archivo Black", hookSize: 76, hookBox: "primary", hookText: "#FFFFFF", motion: 0.06, grade: null, progress: "accent",
  },
};

export interface StyleOptions {
  id: StyleId;
  hook: string;
  endCard: boolean;
  churchName: string;
  sermonTitle: string;
  accent: string;
  primary: string;
}

export function resolveColor(c: string | null, o: { accent: string; primary: string }) {
  if (c === "accent") return o.accent;
  if (c === "primary") return o.primary;
  return c;
}

function ass(hex: string, alpha = "00") {
  const h = hex.replace("#", "").padEnd(6, "0");
  return `&H${alpha}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}&`.toUpperCase();
}
function assT(t: number) {
  const s = Math.max(0, t);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, "0")}:${(s % 60).toFixed(2).padStart(5, "0")}`;
}
const clean = (t: string) => t.replace(/[{}\\]/g, "");
const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");

interface TW {
  w: string;
  s: number;
  e: number;
}

/**
 * Timings for each word of a caption. Uses the transcript's word timings when
 * the caption still matches the sermon; if a reviewer edited the caption, the
 * words are spread across the caption's time by length.
 */
export function wordTimings(cue: Cue, clipStart: number, words: Word[]): TW[] {
  const tokens = cue.text.split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const a = clipStart + cue.start - 0.15;
  const b = clipStart + cue.end + 0.15;
  const inRange = words.filter((w) => w.s >= a && w.e <= b);
  if (inRange.length === tokens.length && inRange.every((w, i) => norm(w.w) === norm(tokens[i]) || !norm(tokens[i]))) {
    return tokens.map((t, i) => ({ w: t, s: Math.max(cue.start, inRange[i].s - clipStart), e: Math.min(cue.end, inRange[i].e - clipStart) }));
  }
  const total = tokens.reduce((n, t) => n + t.length + 1, 0);
  const dur = Math.max(0.2, cue.end - cue.start);
  let t0 = cue.start;
  return tokens.map((t) => {
    const d = (dur * (t.length + 1)) / total;
    const tw = { w: t, s: t0, e: t0 + d };
    t0 += d;
    return tw;
  });
}

/** Split a caption into short on-screen chunks, breaking after sentence punctuation. */
function chunk(tw: TW[], max: number): TW[][] {
  const out: TW[][] = [];
  let cur: TW[] = [];
  for (const w of tw) {
    cur.push(w);
    if (cur.length >= max || /[.!?;:]$/.test(w.w) || (cur.length >= Math.ceil(max * 0.6) && /,$/.test(w.w))) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

export function buildStyledAss(
  cues: Cue[],
  words: Word[],
  clipStart: number,
  dur: number,
  frame: { w: number; h: number },
  o: StyleOptions,
  audioOnly: boolean,
  captionY?: number,
): string {
  const st = STYLES[o.id] || STYLES.bold;
  const { w, h } = frame;
  const vertical = h > w;
  const k = vertical ? 1 : h === w ? 0.9 : 0.8;
  const size = Math.round(st.size * k);
  const posY = Math.round(h * (captionY ?? (vertical ? st.pos : Math.min(0.84, st.pos + 0.1))));
  const hl = resolveColor(st.highlight, o)!;
  const outlineCol = "#000000";
  const hookBox = resolveColor(st.hookBox, o);
  const hookFg = resolveColor(st.hookText, o)!;
  const marg = Math.round(w * 0.08);

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${w}
PlayResY: ${h}
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Cap,${st.font},${size},${ass(st.text, st.inactiveAlpha)},${ass(hl)},${ass(outlineCol, "20")},${ass("#000000", "70")},${st.font === "Liberation Sans" ? -1 : 0},0,0,0,100,100,${st.upper ? 1 : 0},0,1,${st.outline},${st.shadow},5,${marg},${marg},0,1
Style: Hook,${st.hookFont},${Math.round(st.hookSize * k)},${ass(hookFg)},${ass(hookFg)},${ass(hookBox || "#000000", hookBox ? "00" : "60")},${ass(hookBox || "#000000", hookBox ? "00" : "80")},${st.hookFont === "Liberation Sans" ? -1 : 0},0,0,0,100,100,${st.hookFont === "Anton" ? 2 : 0},0,${hookBox ? 3 : 1},${hookBox ? Math.round(18 * k) : 3},${hookBox ? 0 : 3},8,${marg},${marg},0,1
Style: End,${st.hookFont},${Math.round((st.hookFont === "Anton" ? 110 : 84) * k)},${ass("#FFFFFF")},${ass("#FFFFFF")},${ass("#000000", "FF")},${ass("#000000", "FF")},0,0,0,0,100,100,0,0,1,0,0,5,${marg},${marg},0,1
Style: EndSub,Liberation Sans,${Math.round(46 * k)},${ass("#FFFFFF", "30")},${ass("#FFFFFF")},${ass("#000000", "FF")},${ass("#000000", "FF")},0,0,0,0,100,100,0,0,1,0,0,5,${marg},${marg},0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const ev: string[] = [];
  const up = (t: string) => (st.upper ? t.toUpperCase() : t);
  const cx = Math.round(w / 2);
  const endAt = o.endCard ? Math.max(1, dur - 2.4) : dur;

  // Captions
  const all = cues.flatMap((c) => wordTimings(c, clipStart, words)).filter((x) => x.s < endAt);
  const chunks = chunk(all, st.maxWords);
  chunks.forEach((ch, ci) => {
    const next = chunks[ci + 1];
    const chEnd = Math.min(endAt, next ? Math.min(next[0].s, ch[ch.length - 1].e + 0.6) : ch[ch.length - 1].e + 0.6);
    const pos = `\\pos(${cx},${posY})`;
    if (!st.karaoke) {
      ev.push(`Dialogue: 1,${assT(ch[0].s)},${assT(chEnd)},Cap,,0,0,0,,{${pos}\\fad(80,80)}${clean(up(ch.map((x) => x.w).join(" ")))}`);
      return;
    }
    ch.forEach((cw, wi) => {
      const s = wi === 0 ? ch[0].s : cw.s;
      const e = wi < ch.length - 1 ? ch[wi + 1].s : chEnd;
      if (e - s < 0.02) return;
      const active = st.glow
        ? `{\\1a&H00&\\3c${ass(hl)}\\bord${Math.round(10 * k)}\\blur${Math.round(8 * k)}\\fscx100\\fscy100\\t(0,90,\\fscx110\\fscy110)}`
        : `{\\1c${ass(hl)}\\1a&H00&\\fscx100\\fscy100\\t(0,90,\\fscx112\\fscy112)}`;
      const text = ch.map((x, j) => (j === wi ? `${active}${clean(up(x.w))}{\\r}` : clean(up(x.w)))).join(" ");
      ev.push(`Dialogue: 1,${assT(s)},${assT(e)},Cap,,0,0,0,,{${pos}${wi === 0 ? "\\fad(60,0)" : ""}}${text}`);
    });
  });

  // Hook title for the first seconds
  const hook = o.hook.trim();
  if (hook) {
    const hookEnd = Math.min(3.4, Math.max(1.5, dur * 0.35));
    const hy = Math.round(h * (vertical ? (audioOnly ? 0.16 : 0.15) : 0.1));
    ev.push(`Dialogue: 3,${assT(0)},${assT(hookEnd)},Hook,,0,0,0,,{\\an8\\pos(${cx},${hy})\\fad(150,250)}${clean(st.hookFont === "Anton" ? hook.toUpperCase() : hook)}`);
  }

  // End card: darken, church name, sermon title
  if (o.endCard && dur > 6) {
    const t0 = endAt;
    ev.push(`Dialogue: 5,${assT(t0)},${assT(dur)},End,,0,0,0,,{\\an7\\pos(0,0)\\1c${ass("#0B0D0E")}\\alpha&H10&\\fad(350,0)\\p1}m 0 0 l ${w} 0 ${w} ${h} 0 ${h}{\\p0}`);
    ev.push(`Dialogue: 6,${assT(t0 + 0.25)},${assT(dur)},End,,0,0,0,,{\\pos(${cx},${Math.round(h * 0.56)})\\fad(300,0)}${clean(st.hookFont === "Anton" ? o.churchName.toUpperCase() : o.churchName)}`);
    if (o.sermonTitle) ev.push(`Dialogue: 6,${assT(t0 + 0.45)},${assT(dur)},EndSub,,0,0,0,,{\\pos(${cx},${Math.round(h * 0.56 + 110 * k)})\\fad(300,0)}Full message: ${clean(o.sermonTitle)}`);
  }
  return header + ev.join("\n") + "\n";
}
