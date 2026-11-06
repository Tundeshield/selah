import clsx from "clsx";
import { Check } from "lucide-react";
import { useChurch } from "../context/ChurchContext";
import { StorageImage } from "./bits";

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

/** A tiny static mock-up of the style, drawn with CSS on the clip's background. */
export function StyleCard({ id, selected, onClick, bgPath, sample = "Faith over fear today" }: { id: VideoStyleId | null; selected: boolean; onClick: () => void; bgPath?: string | null; sample?: string }) {
  const { church } = useChurch();
  const accent = church?.brand?.accent || "#2ECBBE";
  const primary = church?.brand?.primary || "#0B0D0E";
  const m = id ? VIDEO_STYLES[id] : null;
  const col = (c: string) => (c === "accent" ? accent : c);
  const words = sample.split(" ").slice(0, 3);
  return (
    <button type="button" onClick={onClick} aria-pressed={selected} className="group block w-full self-start text-left align-top">
      <div className={clsx("relative aspect-[9/16] overflow-hidden rounded-xl bg-[#0b0d0e] transition", selected ? "outline outline-[3px] outline-offset-2 outline-brand-500" : "ring-1 ring-black/10 group-hover:ring-black/30")}>
        {bgPath ? <StorageImage path={bgPath} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <div className="absolute inset-0" style={{ background: `radial-gradient(120% 70% at 80% 10%, ${accent}55, transparent 60%), linear-gradient(160deg, #10181a, #05080a)` }} />}
        <div className="absolute inset-0 bg-black/25" />
        {m?.letterbox && (
          <>
            <div className="absolute inset-x-0 top-0 h-[7%] bg-black" />
            <div className="absolute inset-x-0 bottom-0 h-[7%] bg-black" />
          </>
        )}
        {m ? (
          <>
            <div className="absolute inset-x-[8%] top-[13%] text-center">
              <span
                className={clsx("inline px-1 py-px leading-[1.35] [box-decoration-break:clone]", m.hook === "big" ? "text-[0.8rem]" : "text-[0.55rem]")}
                style={{
                  fontFamily: '"Archivo Variable", sans-serif',
                  fontWeight: m.hook === "plain" ? 700 : 800,
                  fontStretch: m.hook === "plain" ? "100%" : "62%",
                  textTransform: m.hook === "plain" ? "none" : "uppercase",
                  background: m.hook === "box-white" ? "#fff" : m.hook === "box-accent" ? accent : m.hook === "box-primary" ? primary : "transparent",
                  color: m.hook === "box-white" || m.hook === "box-accent" ? "#0b0d0e" : "#fff",
                  textShadow: m.hook === "plain" || m.hook === "big" ? "0 1px 3px rgba(0,0,0,.7)" : undefined,
                }}
              >
                Hook title here
              </span>
            </div>
            <div className="absolute inset-x-[6%] top-[62%] text-center leading-tight" style={{ fontFamily: '"Archivo Variable", sans-serif', fontWeight: m.capFont === "black" ? 900 : 700, fontSize: m.capFont === "black" ? "0.78rem" : "0.68rem", textTransform: m.upper ? "uppercase" : "none", WebkitTextStroke: m.capFont === "black" ? "0.6px #000" : undefined, textShadow: "0 1px 3px rgba(0,0,0,.8)" }}>
              {words.map((w, i) => (
                <span key={i} style={{ color: m.karaoke && i === 1 ? col(m.highlight) : "#fff", opacity: m.dim && i !== 1 ? 0.6 : 1, textShadow: m.glow && i === 1 ? `0 0 8px ${accent}, 0 0 2px ${accent}` : undefined }}>
                  {w}{" "}
                </span>
              ))}
            </div>
            {m.progress && <div className="absolute bottom-0 left-0 h-[3px] w-[45%]" style={{ background: col(m.progress) }} />}
          </>
        ) : (
          <div className="absolute inset-x-[6%] top-[66%] text-center text-[0.6rem] font-semibold text-white" style={{ textShadow: "0 1px 3px rgba(0,0,0,.8)" }}>{sample}</div>
        )}
        {selected && <span className="absolute right-1.5 top-1.5 rounded-full bg-brand-500 p-0.5 text-white"><Check className="h-3 w-3" /></span>}
      </div>
      <div className={clsx("mt-1.5 text-[0.8125rem]", selected ? "font-semibold text-fg" : "font-medium text-fg")}>{m ? m.label : "Basic"}</div>
      <div className="text-[0.6875rem] leading-snug text-fg-muted">{m ? m.blurb : "Plain captions only"}</div>
    </button>
  );
}

export function StyleGrid({ value, onChange, bgPath, allowBasic = true }: { value: VideoStyleId | null; onChange: (v: VideoStyleId | null) => void; bgPath?: string | null; allowBasic?: boolean }) {
  return (
    <div className="grid grid-cols-3 items-start gap-3 sm:grid-cols-6">
      {VIDEO_STYLE_IDS.map((id) => (
        <StyleCard key={id} id={id} selected={value === id} onClick={() => onChange(id)} bgPath={bgPath} />
      ))}
      {allowBasic && <StyleCard id={null} selected={!value} onClick={() => onChange(null)} bgPath={bgPath} />}
    </div>
  );
}
