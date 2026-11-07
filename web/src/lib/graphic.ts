import { DEFAULT_EDIT, PhotoEdit, renderPhoto } from "./photo";

/**
 * Quote graphics are rendered deterministically from their stored settings,
 * both for previews and for the downloadable PNG.
 */
export interface GraphicSettings {
  quote: string;
  attribution?: string;
  sermonTitle?: string;
  scripture?: string;
  template: string;
  align: "left" | "center";
  logoPosition: "top" | "bottom" | "none";
  size: "square" | "portrait" | "story" | "landscape";
  /** Varies the generated artwork; unset = derived from the quote. */
  artSeed?: number;
  /** Quote typeface. Unset = church brand kit, then the theme's default. */
  font?: QuoteFont;
  /** Photo background (template "photo"). */
  photo?: { path: string; mediaId?: string; edit: PhotoEdit } | null;
}

export type QuoteFont = "modern" | "serif" | "display";
export const QUOTE_FONTS: { id: QuoteFont; label: string }[] = [
  { id: "modern", label: "Modern sans" },
  { id: "serif", label: "Editorial serif" },
  { id: "display", label: "Bold display" },
];
const FONT_SPEC: Record<QuoteFont, { family: string; weight: number; scale: number; stretch: string; lineH: number }> = {
  modern: { family: '"Inter Variable", Inter, sans-serif', weight: 600, scale: 0.98, stretch: "normal", lineH: 1.2 },
  serif: { family: '"Fraunces Variable", Fraunces, Georgia, serif', weight: 500, scale: 1.08, stretch: "normal", lineH: 1.16 },
  display: { family: '"Archivo Variable", Archivo, sans-serif', weight: 800, scale: 0.94, stretch: "expanded", lineH: 1.1 },
};

export const PHOTO_BG_EDIT: PhotoEdit = { ...DEFAULT_EDIT, overlay: "dark", overlayStyle: "full", overlayAmount: 50 };

export const GRAPHIC_SIZES: Record<GraphicSettings["size"], { w: number; h: number; label: string }> = {
  square: { w: 1080, h: 1080, label: "Square 1:1" },
  portrait: { w: 1080, h: 1350, label: "Portrait 4:5" },
  story: { w: 1080, h: 1920, label: "Story 9:16" },
  landscape: { w: 1600, h: 900, label: "Wide 16:9" },
};

type Rng = () => number;
type ArtFn = (ctx: CanvasRenderingContext2D, w: number, h: number, rnd: Rng, accent: string) => void;

export interface Template {
  label: string;
  group: "plain" | "art" | "photo" | "legacy";
  /** Default typeface for the theme. */
  font?: QuoteFont;
  /** Scripture shown as a coloured pill. */
  pill?: boolean;
  /** Background comes from the church's primary colour. */
  brandBg?: boolean;
  blurb?: string;
  bg: string;
  fg: string;
  accent: string;
  sub: string;
  frame?: boolean;
  art?: ArtFn;
}

/** Deterministic PRNG so the same seed always gives the same artwork. */
function mulberry32(a: number): Rng {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}
function rgba(hex: string, a: number) {
  const m = hex.replace("#", "");
  const n = parseInt(m.length === 3 ? m.split("").map((c) => c + c).join("") : m, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, a: number) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, a));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}
function grain(ctx: CanvasRenderingContext2D, w: number, h: number, rnd: Rng, light: boolean, amount = 0.05) {
  const n = Math.round((w * h) / 90);
  ctx.fillStyle = light ? `rgba(255,255,255,${amount})` : `rgba(0,0,0,${amount})`;
  const d = Math.max(1, Math.round(w / 700));
  for (let i = 0; i < n; i++) ctx.fillRect(rnd() * w, rnd() * h, d, d);
}

const ART: Record<string, ArtFn> = {
  ripples: (ctx, w, h, rnd, accent) => {
    const cx = w * (0.62 + rnd() * 0.3);
    const cy = h * (0.05 + rnd() * 0.2);
    glow(ctx, cx, cy, Math.max(w, h) * 0.7, accent, 0.28);
    const step = w * (0.045 + rnd() * 0.02);
    ctx.lineWidth = Math.max(1, w / 540);
    for (let i = 1; i < 40; i++) {
      ctx.strokeStyle = rgba(accent, Math.max(0, 0.42 - i * 0.012));
      ctx.beginPath();
      ctx.arc(cx, cy, i * step, 0, Math.PI * 2);
      ctx.stroke();
    }
    grain(ctx, w, h, rnd, true, 0.035);
  },
  aurora: (ctx, w, h, rnd, accent) => {
    const cols = [accent, "#0E7490", "#1D4ED8", accent, "#A5F3FC"];
    cols.forEach((c, i) => glow(ctx, w * rnd(), h * (i % 2 ? 0.75 + rnd() * 0.3 : rnd() * 0.35), Math.max(w, h) * (0.45 + rnd() * 0.3), c, i === 4 ? 0.12 : 0.38));
    ctx.fillStyle = "rgba(6,16,15,0.35)";
    ctx.fillRect(0, 0, w, h);
    grain(ctx, w, h, rnd, true, 0.05);
  },
  dawn: (ctx, w, h, rnd, accent) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#FFFFFF");
    g.addColorStop(1, rgba(accent, 0.35));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const sx = w * (0.3 + rnd() * 0.4);
    glow(ctx, sx, h * 1.02, h * 0.75, accent, 0.55);
    ctx.lineWidth = Math.max(1, w / 900);
    for (let i = 0; i < 9; i++) {
      const y = h * (0.8 + i * 0.024);
      ctx.strokeStyle = rgba("#0B0D0E", 0.05 + i * 0.008);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    grain(ctx, w, h, rnd, false, 0.03);
  },
  waves: (ctx, w, h, rnd, accent) => {
    glow(ctx, w * 0.5, h * 0.1, w, "#1D4ED8", 0.18);
    const bands = 6;
    for (let b = 0; b < bands; b++) {
      const base = h * (0.84 + b * 0.028);
      const amp = h * (0.012 + rnd() * 0.02);
      const freq = (1 + rnd() * 1.6) * Math.PI * 2;
      const ph = rnd() * Math.PI * 2;
      ctx.fillStyle = rgba(accent, 0.1 + b * 0.07);
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let x = 0; x <= w; x += w / 60) ctx.lineTo(x, base + Math.sin((x / w) * freq + ph) * amp);
      ctx.lineTo(w, h);
      ctx.closePath();
      ctx.fill();
    }
    grain(ctx, w, h, rnd, true, 0.035);
  },
  contour: (ctx, w, h, rnd, accent) => {
    const cx = w * (rnd() < 0.5 ? 0.1 + rnd() * 0.15 : 0.75 + rnd() * 0.15);
    const cy = h * (rnd() < 0.5 ? 0.1 + rnd() * 0.15 : 0.8 + rnd() * 0.15);
    const ph = [rnd() * 6, rnd() * 6, rnd() * 6];
    const step = Math.max(w, h) * 0.035;
    ctx.lineWidth = Math.max(1, w / 600);
    for (let k = 1; k < 34; k++) {
      ctx.strokeStyle = rgba(accent, k % 5 === 0 ? 0.5 : 0.24);
      ctx.beginPath();
      for (let a = 0; a <= Math.PI * 2 + 0.01; a += Math.PI / 90) {
        const r = k * step * (1 + 0.12 * Math.sin(3 * a + ph[0] + k * 0.12) + 0.07 * Math.sin(5 * a + ph[1]) + 0.05 * Math.sin(2 * a + ph[2] - k * 0.1));
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (a === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }
  },
  rays: (ctx, w, h, rnd, accent) => {
    const ox = w * (0.2 + rnd() * 0.6);
    const oy = -h * 0.08;
    glow(ctx, ox, oy, Math.max(w, h) * 0.9, accent, 0.32);
    const n = 14 + Math.floor(rnd() * 8);
    const len = Math.hypot(w, h) * 1.2;
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (0.12 + (0.76 * (i + rnd() * 0.5)) / n);
      const spread = 0.012 + rnd() * 0.03;
      ctx.fillStyle = rgba(accent, 0.04 + rnd() * 0.07);
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(ox + Math.cos(a - spread) * len, oy + Math.sin(a - spread) * len);
      ctx.lineTo(ox + Math.cos(a + spread) * len, oy + Math.sin(a + spread) * len);
      ctx.closePath();
      ctx.fill();
    }
    grain(ctx, w, h, rnd, true, 0.035);
  },
  dots: (ctx, w, h, rnd, accent) => {
    const gap = w / 30;
    const corner = Math.floor(rnd() * 4);
    const ox = corner % 2 ? w : 0;
    const oy = corner > 1 ? h : 0;
    const maxD = Math.hypot(w, h) * 0.42;
    ctx.fillStyle = accent;
    for (let y = gap / 2; y < h; y += gap)
      for (let x = gap / 2; x < w; x += gap) {
        const t = 1 - Math.hypot(x - ox, y - oy) / maxD;
        if (t <= 0) continue;
        ctx.beginPath();
        ctx.arc(x, y, gap * 0.42 * t * t, 0, Math.PI * 2);
        ctx.fill();
      }
  },
};

/** Ids are stored on assets; keep old ids working. */
export const TEMPLATES: Record<string, Template> = {
  cream: { label: "Editorial", blurb: "Paper, serif, calm", group: "plain", bg: "#F5F4F0", fg: "#111314", accent: "#0D8D86", sub: "#5C5A55", font: "serif" },
  forest: { label: "Midnight", blurb: "Charcoal, bold, accent pill", group: "plain", bg: "#141617", fg: "#FFFFFF", accent: "#2ECBBE", sub: "#A9AEAD", font: "display", pill: true },
  "photo-dark": { label: "Branded", blurb: "Your church colour", group: "plain", bg: "#0B3B38", fg: "#FFFFFF", accent: "#FFFFFF", sub: "rgba(255,255,255,0.78)", font: "modern", brandBg: true },
  sage: { label: "Tint", group: "legacy", bg: "#CCF7F0", fg: "#0B0D0E", accent: "#0F706B", sub: "#115A57" },
  "gold-line": { label: "Frame", group: "legacy", bg: "#FFFFFF", fg: "#0B0D0E", accent: "#2ECBBE", sub: "#57544F", frame: true },
  ripples: { label: "Ripples", group: "art", bg: "#0B0D0E", fg: "#FFFFFF", accent: "#2ECBBE", sub: "#B9C2C1", art: ART.ripples },
  aurora: { label: "Aurora", group: "art", bg: "#06100F", fg: "#FFFFFF", accent: "#2ECBBE", sub: "#C6D3D2", art: ART.aurora },
  rays: { label: "Light", group: "art", bg: "#081417", fg: "#FFFFFF", accent: "#2ECBBE", sub: "#B9C2C1", art: ART.rays },
  waves: { label: "Waves", group: "art", bg: "#0A1220", fg: "#FFFFFF", accent: "#2ECBBE", sub: "#B4BFCB", art: ART.waves },
  dawn: { label: "Dawn", group: "art", bg: "#FFFFFF", fg: "#0B0D0E", accent: "#0D8D86", sub: "#3F4A49", art: ART.dawn },
  contour: { label: "Contour", group: "art", bg: "#F4F4F1", fg: "#0B0D0E", accent: "#0D8D86", sub: "#57544F", art: ART.contour },
  photo: { label: "Photo", group: "photo", bg: "#0B0D0E", fg: "#FFFFFF", accent: "#2ECBBE", sub: "#E2E6E5" },
  dots: { label: "Halftone", group: "art", bg: "#FFFFFF", fg: "#0B0D0E", accent: "#2ECBBE", sub: "#57544F", art: ART.dots },
};

/** Paints only the background/artwork — used for the full graphic and template swatches. */
export function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number, templateId: string, accent?: string, seed = 1, brandPrimary?: string) {
  const t = TEMPLATES[templateId] || TEMPLATES.cream;
  const a = accent || t.accent;
  ctx.fillStyle = t.brandBg && brandPrimary ? brandPrimary : t.bg;
  ctx.fillRect(0, 0, w, h);
  if (t.art) {
    ctx.save();
    t.art(ctx, w, h, mulberry32(seed), a);
    ctx.restore();
  }
  if (t.frame) {
    const pad = Math.round(w * 0.1);
    ctx.strokeStyle = a;
    ctx.lineWidth = Math.max(2, w / 270);
    ctx.strokeRect(pad * 0.45, pad * 0.45, w - pad * 0.9, h - pad * 0.9);
  }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > maxW && line) {
      lines.push(line);
      line = w;
    } else line = t;
  }
  if (line) lines.push(line);
  return lines;
}

export interface DrawOpts {
  churchName?: string;
  logo?: HTMLImageElement | null;
  brandAccent?: string;
  brandPrimary?: string;
  brandFont?: QuoteFont;
  speaker?: string;
  photo?: HTMLImageElement | null;
}

function luminance(hex: string) {
  const n = parseInt((hex || "#000").replace("#", "").padEnd(6, "0").slice(0, 6), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export async function drawGraphic(canvas: HTMLCanvasElement, s: GraphicSettings, opts: DrawOpts = {}) {
  const { w, h } = GRAPHIC_SIZES[s.size] || GRAPHIC_SIZES.square;
  const t = TEMPLATES[s.template] || TEMPLATES.cream;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: s.template === "photo" })!;
  const font = FONT_SPEC[s.font || opts.brandFont || t.font || "modern"];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setStretch = (v: string) => "fontStretch" in ctx && ((ctx as any).fontStretch = v);
  try {
    await Promise.all([
      document.fonts.load(`${font.weight} 64px ${font.family.split(",")[0]}`),
      document.fonts.load(`600 28px "Inter Variable"`),
    ]);
  } catch {
    /* fonts optional */
  }

  // Branded: the church's primary colour; pick readable text for light brand colours.
  let fg = t.fg;
  let sub = t.sub;
  let accent = t.accent === "#2ECBBE" && opts.brandAccent ? opts.brandAccent : t.accent;
  if (t.brandBg && opts.brandPrimary && luminance(opts.brandPrimary) > 0.45) {
    fg = "#0B0D0E";
    sub = "rgba(11,13,14,0.72)";
    accent = "#0B0D0E";
  }

  drawBackground(ctx, w, h, s.template, accent, s.artSeed ?? hashStr(s.quote || ""), opts.brandPrimary);
  if (s.template === "photo" && opts.photo) renderPhoto(ctx, opts.photo, w, h, { ...PHOTO_BG_EDIT, ...(s.photo?.edit || {}) }, opts.brandAccent);

  const pad = Math.round(w * 0.1);
  const center = s.align === "center";
  ctx.textAlign = center ? "center" : "left";
  ctx.textBaseline = "alphabetic";
  const x = center ? w / 2 : pad;
  const speaker = (s.attribution || opts.speaker || "").trim();
  const scripture = (s.scripture || "").trim();
  const badgeOn = s.logoPosition !== "none";

  // Fit quote text
  const maxW = w - pad * 2;
  const quote = s.quote.trim();
  const maxH = h * (s.size === "story" ? 0.5 : s.size === "landscape" ? 0.5 : 0.54);
  let size = Math.round(w * (s.size === "story" ? 0.092 : 0.078) * font.scale);
  let lines: string[] = [];
  setStretch(font.stretch);
  for (; size > 26; size -= 2) {
    ctx.font = `${font.weight} ${size}px ${font.family}`;
    lines = wrap(ctx, quote, maxW);
    if (lines.length * size * font.lineH <= maxH) break;
  }
  const lineH = size * font.lineH;
  const blockH = lines.length * lineH;
  const footSize = Math.round(w * 0.027);
  const footerH = footSize * 3.2;
  let y = (h - blockH - footerH) / 2;
  if (s.logoPosition === "top") y += h * 0.03;

  // Oversized quote mark
  const markSize = Math.round(size * (t.font === "serif" || s.font === "serif" ? 2.6 : 2));
  ctx.fillStyle = accent;
  // Curly quote mark from the serif or display face (sans quote marks look like straight primes).
  ctx.font = `800 ${markSize}px ${font === FONT_SPEC.serif ? font.family : FONT_SPEC.display.family}`;
  ctx.globalAlpha = 0.9;
  ctx.fillText("“", x, y + markSize * 0.42);
  ctx.globalAlpha = 1;
  y += markSize * 0.28;

  ctx.fillStyle = fg;
  ctx.font = `${font.weight} ${size}px ${font.family}`;
  lines.forEach((l, i) => ctx.fillText(l, x, y + size + i * lineH));
  setStretch("normal");

  // Footer: rule, then "Speaker · Scripture"
  let fy = y + size + (lines.length - 1) * lineH + size * 0.9;
  ctx.fillStyle = accent;
  const ruleW = w * 0.07;
  ctx.fillRect(center ? w / 2 - ruleW / 2 : pad, fy, ruleW, Math.max(2, Math.round(w / 360)));
  fy += footSize * 2.1;
  ctx.font = `600 ${footSize}px "Inter Variable", Inter, sans-serif`;
  if (t.pill && scripture) {
    // Midnight: speaker text + scripture in an accent pill.
    const sp = speaker ? `${speaker}` : "";
    ctx.font = `600 ${footSize}px "Inter Variable", Inter, sans-serif`;
    const spW = sp ? ctx.measureText(sp).width : 0;
    ctx.font = `700 ${Math.round(footSize * 0.86)}px "Inter Variable", Inter, sans-serif`;
    const pw = ctx.measureText(scripture).width + footSize * 1.3;
    const ph = footSize * 1.7;
    const gap = sp ? footSize * 0.8 : 0;
    const total = spW + gap + pw;
    let cx = center ? w / 2 - total / 2 : pad;
    ctx.textAlign = "left";
    if (sp) {
      ctx.fillStyle = fg;
      ctx.font = `600 ${footSize}px "Inter Variable", Inter, sans-serif`;
      ctx.fillText(sp, cx, fy);
      cx += spW + gap;
    }
    ctx.fillStyle = accent;
    roundRect(ctx, cx, fy - ph * 0.72, pw, ph, ph / 2);
    ctx.fill();
    ctx.fillStyle = luminance(accent.startsWith("#") ? accent : "#2ECBBE") > 0.4 ? "#0B0D0E" : "#FFFFFF";
    ctx.font = `700 ${Math.round(footSize * 0.86)}px "Inter Variable", Inter, sans-serif`;
    ctx.fillText(scripture, cx + footSize * 0.65, fy);
    ctx.textAlign = center ? "center" : "left";
  } else {
    const parts = [speaker, scripture].filter(Boolean);
    if (parts.length) {
      ctx.fillStyle = fg;
      ctx.fillText(parts.join("  ·  "), x, fy);
    }
  }

  // Church badge: logo, or the church name in a quiet outlined pill.
  if (badgeOn) {
    const corner = t.brandBg; // Branded: watermark in the bottom corner
    const top = s.logoPosition === "top";
    const by = top ? pad * 0.62 : h - pad * 0.62;
    if (opts.logo && opts.logo.complete && opts.logo.naturalWidth) {
      const lh = Math.round(w * (corner ? 0.05 : 0.055));
      const lw = (opts.logo.naturalWidth / opts.logo.naturalHeight) * lh;
      const lx = corner ? w - pad * 0.6 - lw : center ? w / 2 - lw / 2 : pad;
      ctx.globalAlpha = corner ? 0.85 : 1;
      ctx.drawImage(opts.logo, lx, by - lh / 2, lw, lh);
      ctx.globalAlpha = 1;
    } else if (opts.churchName) {
      const bs = Math.round(w * 0.0185);
      ctx.font = `700 ${bs}px "Inter Variable", Inter, sans-serif`;
      const label = opts.churchName.toUpperCase();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ("letterSpacing" in ctx) (ctx as any).letterSpacing = `${Math.round(bs * 0.12)}px`;
      const tw = ctx.measureText(label).width;
      const bw = tw + bs * 2.2;
      const bh = bs * 2.3;
      const bx = corner ? w - pad * 0.6 - bw : center ? w / 2 - bw / 2 : pad;
      ctx.strokeStyle = sub;
      ctx.lineWidth = Math.max(1.5, w / 700);
      roundRect(ctx, bx, by - bh / 2, bw, bh, bh / 2);
      ctx.stroke();
      ctx.fillStyle = sub;
      ctx.textAlign = "left";
      ctx.fillText(label, bx + bs * 1.1, by + bs * 0.36);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ("letterSpacing" in ctx) (ctx as any).letterSpacing = "0px";
    }
  }
}

export function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
