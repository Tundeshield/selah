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
}

export const GRAPHIC_SIZES: Record<GraphicSettings["size"], { w: number; h: number; label: string }> = {
  square: { w: 1080, h: 1080, label: "Square · 1080×1080" },
  portrait: { w: 1080, h: 1350, label: "Portrait · 1080×1350" },
  story: { w: 1080, h: 1920, label: "Story · 1080×1920" },
  landscape: { w: 1600, h: 900, label: "Landscape · 1600×900" },
};

export const TEMPLATES: Record<string, { label: string; bg: string; fg: string; accent: string; sub: string; rule?: boolean; frame?: boolean }> = {
  cream: { label: "Light", bg: "#FFFFFF", fg: "#111111", accent: "#418FAE", sub: "#52525B" },
  forest: { label: "Dark", bg: "#18181B", fg: "#FFFFFF", accent: "#8DD4E6", sub: "#A1A1AA" },
  sage: { label: "Tint", bg: "#DFF9FD", fg: "#295B70", accent: "#418FAE", sub: "#2E6880" },
  "gold-line": { label: "Frame", bg: "#FCFCFC", fg: "#111111", accent: "#418FAE", sub: "#52525B", frame: true },
  "photo-dark": { label: "Accent", bg: "#418FAE", fg: "#FFFFFF", accent: "#DFF9FD", sub: "#DFF9FD", rule: true },
};

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

export async function drawGraphic(
  canvas: HTMLCanvasElement,
  s: GraphicSettings,
  opts: { churchName?: string; logo?: HTMLImageElement | null; brandAccent?: string } = {},
) {
  const { w, h } = GRAPHIC_SIZES[s.size] || GRAPHIC_SIZES.square;
  const t = TEMPLATES[s.template] || TEMPLATES.cream;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  try {
    await Promise.all([
      document.fonts.load(`700 64px "Outfit Variable"`),
      document.fonts.load(`500 28px "Outfit Variable"`),
    ]);
  } catch {
    /* fonts optional */
  }
  const accent = t.accent === "#418FAE" && opts.brandAccent ? opts.brandAccent : t.accent;

  ctx.fillStyle = t.bg;
  ctx.fillRect(0, 0, w, h);
  const pad = Math.round(w * 0.1);

  if (t.frame) {
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    ctx.strokeRect(pad * 0.45, pad * 0.45, w - pad * 0.9, h - pad * 0.9);
  }

  // Quote mark
  ctx.fillStyle = accent;
  ctx.font = `700 ${Math.round(w * 0.16)}px "Outfit Variable", Outfit, sans-serif`;
  ctx.textAlign = s.align === "center" ? "center" : "left";
  const x = s.align === "center" ? w / 2 : pad;

  // Fit quote text
  const maxW = w - pad * 2;
  let size = Math.round(w * 0.072);
  let lines: string[] = [];
  const quote = `${s.quote.trim()}`;
  const maxH = h * (s.size === "story" ? 0.5 : 0.52);
  for (; size > 26; size -= 2) {
    ctx.font = `600 ${size}px "Outfit Variable", Outfit, sans-serif`;
    lines = wrap(ctx, quote, maxW);
    if (lines.length * size * 1.22 <= maxH) break;
  }
  const lineH = size * 1.18;
  const blockH = lines.length * lineH;
  const footerH = size * 2.6;
  let y = (h - blockH - footerH) / 2 + size;
  if (s.logoPosition === "top") y += h * 0.04;

  ctx.fillStyle = accent;
  ctx.font = `700 ${Math.round(size * 1.6)}px "Outfit Variable", Outfit, sans-serif`;
  ctx.fillText("“", x, y - size * 0.45);

  ctx.fillStyle = t.fg;
  ctx.font = `600 ${size}px "Outfit Variable", Outfit, sans-serif`;
  lines.forEach((l, i) => ctx.fillText(l, x, y + size * 0.55 + i * lineH));

  // Rule + attribution
  let fy = y + size * 0.55 + blockH + size * 0.6;
  ctx.fillStyle = accent;
  const ruleW = w * 0.08;
  ctx.fillRect(s.align === "center" ? w / 2 - ruleW / 2 : pad, fy, ruleW, 3);
  fy += size * 0.95;
  ctx.fillStyle = t.fg;
  ctx.font = `600 ${Math.round(w * 0.026)}px "Outfit Variable", Outfit, sans-serif`;
  if (s.attribution) ctx.fillText(s.attribution, x, fy);
  ctx.fillStyle = t.sub;
  ctx.font = `400 ${Math.round(w * 0.022)}px "Outfit Variable", Outfit, sans-serif`;
  const meta = [s.sermonTitle, s.scripture].filter(Boolean).join("  ·  ");
  if (meta) ctx.fillText(meta, x, fy + w * 0.038);

  // Logo / church name
  if (s.logoPosition !== "none") {
    const ly = s.logoPosition === "top" ? pad * 0.75 : h - pad * 0.75;
    if (opts.logo && opts.logo.complete && opts.logo.naturalWidth) {
      const lh = Math.round(w * 0.06);
      const lw = (opts.logo.naturalWidth / opts.logo.naturalHeight) * lh;
      const lx = s.align === "center" ? w / 2 - lw / 2 : pad;
      ctx.drawImage(opts.logo, lx, s.logoPosition === "top" ? ly - lh / 2 : ly - lh / 2, lw, lh);
    } else if (opts.churchName) {
      ctx.fillStyle = t.sub;
      ctx.font = `600 ${Math.round(w * 0.02)}px "Outfit Variable", Outfit, sans-serif`;
      ctx.fillText(opts.churchName.toUpperCase(), x, ly + w * 0.007);
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
