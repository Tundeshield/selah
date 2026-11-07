import clsx from "clsx";
import { Check } from "lucide-react";
import { useChurch } from "../context/ChurchContext";

export type VideoStyleId = "bold" | "clean" | "cinematic" | "glow" | "brand";

interface Meta {
  label: string;
  blurb: string;
  upper: boolean;
  karaoke: boolean;
  highlight: string; // hex | "accent"
  dim: boolean;
  glow?: boolean;
  capFont: "black" | "sans";
  hook: "box-white" | "box-accent" | "box-primary" | "plain" | "big";
  progress: string | null;
  letterbox?: boolean;
}

export const VIDEO_STYLES: Record<VideoStyleId, Meta> = {
  bold: { label: "Bold", blurb: "Big words, yellow highlight", upper: true, karaoke: true, highlight: "#FFD60A", dim: false, capFont: "black", hook: "box-white", progress: "#FFD60A" },
  clean: { label: "Clean", blurb: "Simple, calm captions", upper: false, karaoke: true, highlight: "#FFFFFF", dim: true, capFont: "sans", hook: "plain", progress: "#FFFFFF" },
  cinematic: { label: "Cinematic", blurb: "Film look, letterbox", upper: false, karaoke: false, highlight: "#FFFFFF", dim: false, capFont: "sans", hook: "big", progress: null, letterbox: true },
  glow: { label: "Glow", blurb: "Glowing accent words", upper: true, karaoke: true, highlight: "accent", dim: false, glow: true, capFont: "black", hook: "box-accent", progress: "accent" },
  brand: { label: "Church brand", blurb: "Your church colours", upper: false, karaoke: true, highlight: "accent", dim: false, capFont: "black", hook: "box-primary", progress: "accent" },
};
export const VIDEO_STYLE_IDS = Object.keys(VIDEO_STYLES) as VideoStyleId[];

/** Small type sample showing a style's caption look. */
function Sample({ id }: { id: VideoStyleId | null }) {
  const { church } = useChurch();
  const accent = church?.brand?.accent || "#2ECBBE";
  const m = id ? VIDEO_STYLES[id] : null;
  const hl = m ? (m.highlight === "accent" ? accent : m.highlight) : "#FFFFFF";
  return (
    <span
      aria-hidden
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#121618] leading-none"
      style={{
        fontFamily: '"Archivo Variable", sans-serif',
        fontWeight: m?.capFont === "black" ? 900 : 700,
        fontSize: m?.capFont === "black" ? "0.95rem" : "0.9rem",
        textTransform: m?.upper ? "uppercase" : "none",
        boxShadow: m?.letterbox ? "inset 0 6px 0 #000, inset 0 -6px 0 #000" : undefined,
      }}
    >
      <span style={{ color: "#fff", opacity: m?.dim ? 0.55 : 1 }}>A</span>
      <span style={{ color: m?.karaoke ? hl : "#fff", textShadow: m?.glow ? `0 0 6px ${accent}` : undefined }}>a</span>
    </span>
  );
}

/** Compact, list-style picker. */
export function StyleList({ value, onChange }: { value: VideoStyleId | null; onChange: (v: VideoStyleId | null) => void }) {
  const items: (VideoStyleId | null)[] = [...VIDEO_STYLE_IDS, null];
  return (
    <div role="radiogroup" aria-label="Video style" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {items.map((id) => {
        const m = id ? VIDEO_STYLES[id] : null;
        const sel = value === id;
        return (
          <button
            key={id ?? "basic"}
            type="button"
            role="radio"
            aria-checked={sel}
            onClick={() => onChange(id)}
            className={clsx("flex items-center gap-3 rounded-xl p-2 pr-3 text-left transition", sel ? "bg-brand-50 ring-2 ring-brand-500" : "bg-white ring-1 ring-gray-200 hover:ring-gray-400")}
          >
            <Sample id={id} />
            <span className="min-w-0 flex-1">
              <span className="block text-[0.875rem] font-semibold text-fg">{m ? m.label : "Basic"}</span>
              <span className="block truncate text-xs text-fg-muted">{m ? m.blurb : "Plain captions only"}</span>
            </span>
            {sel && <Check className="h-4 w-4 shrink-0 text-brand-700" />}
          </button>
        );
      })}
    </div>
  );
}
