/**
 * Non-destructive photo editing. A photo's edit is a small settings object;
 * the original upload is never changed. Everything renders on a canvas in the
 * browser, so editing costs nothing to run.
 */

export interface PhotoEdit {
  zoom: number; // 1 – 3
  panX: number; // -1 – 1
  panY: number; // -1 – 1
  flip: boolean;
  filter: string;
  brightness: number; // -100 – 100
  contrast: number; // -100 – 100
  saturation: number; // -100 – 100
  warmth: number; // -100 – 100
  fade: number; // 0 – 100
  blur: number; // 0 – 100
  vignette: number; // 0 – 100
  grain: number; // 0 – 100
  overlay: "none" | "dark" | "brand" | "light";
  overlayStyle: "full" | "bottom" | "top";
  overlayAmount: number; // 0 – 90
}

export interface PhotoText {
  headline: string;
  sub: string;
  position: "top" | "center" | "bottom";
  align: "left" | "center";
  size: "s" | "m" | "l";
  color: "white" | "ink";
  logo: boolean;
}

export const DEFAULT_EDIT: PhotoEdit = {
  zoom: 1,
  panX: 0,
  panY: 0,
  flip: false,
  filter: "original",
  brightness: 0,
  contrast: 0,
  saturation: 0,
  warmth: 0,
  fade: 0,
  blur: 0,
  vignette: 0,
  grain: 0,
  overlay: "none",
  overlayStyle: "full",
  overlayAmount: 40,
};

export const DEFAULT_TEXT: PhotoText = { headline: "", sub: "", position: "bottom", align: "left", size: "m", color: "white", logo: true };

type Adj = Partial<Pick<PhotoEdit, "brightness" | "contrast" | "saturation" | "warmth" | "fade" | "vignette" | "grain">>;

/** One-tap looks. They stack on top of the manual sliders. */
export const FILTERS: { id: string; label: string; adj: Adj }[] = [
  { id: "original", label: "Original", adj: {} },
  { id: "vivid", label: "Vivid", adj: { saturation: 28, contrast: 12 } },
  { id: "warm", label: "Warm", adj: { warmth: 30, saturation: 8, brightness: 4 } },
  { id: "cool", label: "Cool", adj: { warmth: -28, contrast: 6 } },
  { id: "matte", label: "Matte", adj: { fade: 45, saturation: -18, contrast: -8 } },
  { id: "film", label: "Film", adj: { fade: 25, warmth: 12, grain: 35, saturation: -10 } },
  { id: "drama", label: "Drama", adj: { contrast: 35, saturation: -15, vignette: 45, brightness: -6 } },
  { id: "mono", label: "Mono", adj: { saturation: -100, contrast: 14 } },
  { id: "noir", label: "Noir", adj: { saturation: -100, contrast: 40, brightness: -10, vignette: 50, grain: 25 } },
  { id: "glow", label: "Glow", adj: { brightness: 12, fade: 20, saturation: 10, warmth: 8 } },
];

export function effective(e: PhotoEdit) {
  const f = FILTERS.find((x) => x.id === e.filter)?.adj || {};
  const add = (k: keyof Adj, min = -100, max = 100) => Math.max(min, Math.min(max, (e[k] as number) + (f[k] || 0)));
  return {
    brightness: add("brightness"),
    contrast: add("contrast"),
    saturation: add("saturation"),
    warmth: add("warmth"),
    fade: add("fade", 0),
    vignette: add("vignette", 0),
    grain: add("grain", 0),
  };
}

const OVERLAY_COLORS: Record<Exclude<PhotoEdit["overlay"], "none">, string> = { dark: "#05080A", brand: "#0B3B38", light: "#FFFFFF" };

function rgba(hex: string, a: number) {
  const n = parseInt(hex.replace("#", ""), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function rng(seed: number) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let scratch: HTMLCanvasElement | null = null;
function scratchCanvas(w: number, h: number) {
  scratch = scratch || document.createElement("canvas");
  scratch.width = Math.max(1, Math.round(w));
  scratch.height = Math.max(1, Math.round(h));
  return scratch;
}

/** Paint an edited photo filling (0,0,w,h). `brandColor` tints the brand overlay. */
export function renderPhoto(ctx: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number }, w: number, h: number, e: PhotoEdit, brandColor?: string) {
  const iw = (img as HTMLImageElement).naturalWidth || img.width;
  const ih = (img as HTMLImageElement).naturalHeight || img.height;
  const zoom = Math.max(1, Math.min(3, e.zoom || 1));
  const scale = Math.max(w / iw, h / ih) * zoom;
  const dw = iw * scale;
  const dh = ih * scale;
  const dx = (w - dw) / 2 + (e.panX || 0) * ((dw - w) / 2);
  const dy = (h - dh) / 2 + (e.panY || 0) * ((dh - h) / 2);

  ctx.save();
  ctx.imageSmoothingQuality = "high";
  if (e.blur > 0) {
    // Downscale → upscale is a fast blur that works in every browser.
    const f = 1 / (1 + e.blur / 7);
    const sc = scratchCanvas(w * f, h * f);
    const sctx = sc.getContext("2d")!;
    sctx.imageSmoothingQuality = "high";
    sctx.save();
    if (e.flip) {
      sctx.translate(sc.width, 0);
      sctx.scale(-1, 1);
    }
    sctx.drawImage(img, dx * f, dy * f, dw * f, dh * f);
    sctx.restore();
    ctx.drawImage(sc, 0, 0, sc.width, sc.height, -2, -2, w + 4, h + 4);
  } else {
    if (e.flip) {
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(img, dx, dy, dw, dh);
  }
  ctx.restore();

  const a = effective(e);
  if (a.brightness || a.contrast || a.saturation || a.warmth || a.fade) {
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    const data = ctx.getImageData(0, 0, W, H);
    const p = data.data;
    const bf = 1 + a.brightness / 160;
    const c = a.contrast * 1.28;
    const cf = (259 * (c + 255)) / (255 * (259 - c));
    const sf = 1 + a.saturation / 100;
    const warm = a.warmth * 0.45;
    const fade = (a.fade / 100) * 0.32;
    // Lookup table for the per-channel tone curve (brightness, contrast, fade).
    const lut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) {
      let v = i * bf;
      v = (v - 128) * cf + 128;
      v = v + (128 - v) * fade + fade * 18;
      lut[i] = v;
    }
    const doSat = sf !== 1;
    for (let i = 0; i < p.length; i += 4) {
      let r = lut[p[i]];
      let g = lut[p[i + 1]];
      let b = lut[p[i + 2]];
      if (doSat) {
        const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        r = l + (r - l) * sf;
        g = l + (g - l) * sf;
        b = l + (b - l) * sf;
      }
      if (warm) {
        r += warm;
        g += warm * 0.25;
        b -= warm;
      }
      p[i] = r;
      p[i + 1] = g;
      p[i + 2] = b;
    }
    ctx.putImageData(data, 0, 0);
  }

  if (a.vignette > 0) {
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.hypot(w, h) * 0.6);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(0,0,0,${(a.vignette / 100) * 0.75})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  if (e.overlay !== "none" && e.overlayAmount > 0) {
    const col = e.overlay === "brand" && brandColor ? darken(brandColor) : OVERLAY_COLORS[e.overlay];
    const op = e.overlayAmount / 100;
    if (e.overlayStyle === "full") {
      ctx.fillStyle = rgba(col, op);
    } else {
      const g = e.overlayStyle === "bottom" ? ctx.createLinearGradient(0, h, 0, h * 0.25) : ctx.createLinearGradient(0, 0, 0, h * 0.75);
      g.addColorStop(0, rgba(col, Math.min(1, op * 1.5)));
      g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g;
    }
    ctx.fillRect(0, 0, w, h);
  }

  if (a.grain > 0) {
    const r = rng(7);
    const n = Math.round(((w * h) / 70) * (a.grain / 100));
    const d = Math.max(1, Math.round(w / 700));
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = r() > 0.5 ? "rgba(255,255,255,0.09)" : "rgba(0,0,0,0.12)";
      ctx.fillRect(r() * w, r() * h, d, d);
    }
  }
}

/** Mix a brand colour toward black so a brand overlay keeps text readable. */
function darken(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  const m = (x: number) => Math.round(x * 0.35).toString(16).padStart(2, "0");
  return `#${m((n >> 16) & 255)}${m((n >> 8) & 255)}${m(n & 255)}`;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const t = line ? `${line} ${word}` : word;
      if (ctx.measureText(t).width > maxW && line) {
        out.push(line);
        line = word;
      } else line = t;
    }
    out.push(line);
  }
  return out;
}

/** Headline + subline + logo, laid out for social posts. */
export function renderText(ctx: CanvasRenderingContext2D, w: number, h: number, t: PhotoText, opts: { logo?: HTMLImageElement | null; churchName?: string } = {}) {
  const pad = Math.round(Math.min(w, h) * 0.08);
  const fg = t.color === "white" ? "#FFFFFF" : "#0B0D0E";
  const subFg = t.color === "white" ? "rgba(255,255,255,0.82)" : "rgba(11,13,14,0.72)";
  const base = Math.min(w, h) * ({ s: 0.058, m: 0.075, l: 0.098 } as const)[t.size];
  const x = t.align === "center" ? w / 2 : pad;
  ctx.textAlign = t.align === "center" ? "center" : "left";
  ctx.textBaseline = "alphabetic";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if ("fontStretch" in ctx) (ctx as any).fontStretch = "semi-expanded";
  if (t.color === "white") {
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = base * 0.35;
  }

  ctx.font = `700 ${base}px "Archivo Variable", Archivo, sans-serif`;
  const hl = t.headline.trim() ? wrap(ctx, t.headline.trim(), w - pad * 2) : [];
  const subSize = base * 0.42;
  ctx.font = `500 ${subSize}px "Inter Variable", Inter, sans-serif`;
  const sl = t.sub.trim() ? wrap(ctx, t.sub.trim(), w - pad * 2) : [];
  const hlH = hl.length * base * 1.08;
  const gap = hl.length && sl.length ? base * 0.45 : 0;
  const slH = sl.length * subSize * 1.4;
  const blockH = hlH + gap + slH;
  const logoH = Math.round(Math.min(w, h) * 0.055);
  const logoSpace = t.logo ? logoH + pad * 0.6 : 0;

  let top: number;
  if (t.position === "top") top = pad + (t.logo ? 0 : 0);
  else if (t.position === "center") top = (h - blockH) / 2;
  else top = h - pad - blockH - (t.logo ? logoSpace : 0);
  if (t.position === "top" && t.logo) top += logoSpace;

  ctx.fillStyle = fg;
  ctx.font = `700 ${base}px "Archivo Variable", Archivo, sans-serif`;
  hl.forEach((l, i) => ctx.fillText(l, x, top + base * 0.92 + i * base * 1.08));
  ctx.fillStyle = subFg;
  ctx.font = `500 ${subSize}px "Inter Variable", Inter, sans-serif`;
  sl.forEach((l, i) => ctx.fillText(l, x, top + hlH + gap + subSize * 1.05 + i * subSize * 1.4));
  ctx.shadowBlur = 0;
  ctx.shadowColor = "transparent";

  if (t.logo) {
    const ly = t.position === "top" ? pad : h - pad - logoH;
    if (opts.logo && opts.logo.naturalWidth) {
      const lw = (opts.logo.naturalWidth / opts.logo.naturalHeight) * logoH;
      ctx.drawImage(opts.logo, t.align === "center" ? w / 2 - lw / 2 : pad, ly, lw, logoH);
    } else if (opts.churchName) {
      ctx.fillStyle = subFg;
      ctx.font = `700 ${Math.round(logoH * 0.42)}px "Inter Variable", Inter, sans-serif`;
      ctx.fillText(opts.churchName.toUpperCase(), x, ly + logoH * 0.65);
    }
  }
}

/** Resize an uploaded photo in the browser before upload (faster, cheaper storage). */
export async function prepareUpload(file: File, maxEdge = 2560, thumbEdge = 480) {
  const bmp = await loadFileImage(file);
  const ratio = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const full = await toJpeg(bmp, Math.round(bmp.width * ratio), Math.round(bmp.height * ratio), 0.9);
  const tr = Math.min(1, thumbEdge / Math.max(bmp.width, bmp.height));
  const thumb = await toJpeg(bmp, Math.round(bmp.width * tr), Math.round(bmp.height * tr), 0.8);
  return { full, thumb, width: Math.round(bmp.width * ratio), height: Math.round(bmp.height * ratio) };
}

function loadFileImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("This photo couldn't be opened. Try a JPG or PNG (iPhone HEIC photos: export as JPG first)."));
    img.src = url;
  });
}

function toJpeg(img: HTMLImageElement, w: number, h: number, q: number): Promise<Blob> {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not process photo"))), "image/jpeg", q));
}

/** Clamp an untrusted edit object into a valid PhotoEdit. */
export function normalizeEdit(x: Partial<PhotoEdit> | undefined | null): PhotoEdit {
  return { ...DEFAULT_EDIT, ...(x || {}) };
}
