import { ReactNode, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Link } from "react-router-dom";
import { Film, Image as ImageIcon, FileText, Mic, Loader2, AlertTriangle } from "lucide-react";
import { Badge } from "./ui";
import { ASSET_STATUS, ASSET_TYPE, SERMON_STATUS } from "../lib/constants";
import type { Asset, AssetStatus, SermonStatus } from "../lib/types";
import { useStorageUrl } from "../lib/hooks";
import { drawGraphic, GraphicSettings, loadImage } from "../lib/graphic";
import { useChurch } from "../context/ChurchContext";
import { fmtDuration } from "../lib/format";

export function Logo({ className, light }: { className?: string; light?: boolean }) {
  return (
    <div className={clsx("flex items-center gap-2.5", className)}>
      <svg viewBox="0 0 64 64" className="h-8 w-8" aria-hidden>
        <rect width="64" height="64" rx="14" fill={light ? "#F7F4ED" : "#20342C"} />
        <path d="M20 40c6-1 10-4 13-9 2 5 6 8 11 9-5 2-9 5-11 10-3-6-7-9-13-10z" fill="#C5A56A" />
        <circle cx="32" cy="22" r="5" fill={light ? "#20342C" : "#F7F4ED"} />
      </svg>
      <span className={clsx("font-serif text-xl leading-none", light ? "text-cream" : "text-forest")}>Selah Studio</span>
    </div>
  );
}

export function SermonStatusBadge({ status, className }: { status: SermonStatus; className?: string }) {
  const s = SERMON_STATUS[status] || SERMON_STATUS.processing;
  return <Badge tone={s.tone} className={className} pulse={status === "processing" || status === "queued"}>{s.label}</Badge>;
}

export function AssetStatusBadge({ asset }: { asset: Pick<Asset, "status" | "render"> }) {
  if (asset.status === "failed" && asset.render?.status === "failed") return <Badge tone="bad">Render failed</Badge>;
  const s = ASSET_STATUS[asset.status as AssetStatus] || ASSET_STATUS.processing;
  return <Badge tone={s.tone} pulse={asset.status === "processing" || asset.status === "changes_requested"}>{s.label}</Badge>;
}

export function TypeIcon({ type, className }: { type: Asset["type"]; className?: string }) {
  const cat = ASSET_TYPE[type]?.category;
  const I = cat === "video" ? Film : cat === "graphic" ? ImageIcon : cat === "audio" ? Mic : FileText;
  return <I className={clsx("h-4 w-4", className)} aria-hidden />;
}

export function StorageImage({ path, alt, className, fallback }: { path?: string | null; alt: string; className?: string; fallback?: ReactNode }) {
  const { url } = useStorageUrl(path);
  if (!path || !url) return <>{fallback ?? <div className={clsx("bg-sage-100", className)} />}</>;
  return <img src={url} alt={alt} className={className} loading="lazy" />;
}

/** Live canvas rendering of a quote graphic. */
export function GraphicCanvas({ settings, className, canvasRef }: { settings: GraphicSettings; className?: string; canvasRef?: React.MutableRefObject<HTMLCanvasElement | null> }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const { church } = useChurch();
  const [logo, setLogo] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (church?.logoUrl) loadImage(church.logoUrl).then(setLogo);
  }, [church?.logoUrl]);
  useEffect(() => {
    if (ref.current) drawGraphic(ref.current, settings, { churchName: church?.name, logo, brandAccent: church?.brand?.accent });
    if (canvasRef) canvasRef.current = ref.current;
  }, [settings, logo, church?.name, church?.brand?.accent, canvasRef]);
  return <canvas ref={ref} className={clsx("h-auto w-full", className)} role="img" aria-label={`Quote graphic: ${settings.quote}`} />;
}

/** Visual preview used in cards — never a generic file icon. */
export function AssetThumb({ asset, className }: { asset: Asset; className?: string }) {
  const cat = asset.category;
  if (cat === "video") {
    return (
      <div className={clsx("relative overflow-hidden bg-forest", className)}>
        {asset.media?.thumbnailPath ? (
          <StorageImage path={asset.media.thumbnailPath} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center text-cream/80">
            {asset.render?.status === "failed" ? <AlertTriangle className="h-5 w-5 text-gold" /> : <Loader2 className="h-5 w-5 animate-spin text-gold" />}
            <span className="line-clamp-3 text-xs">{asset.render?.status === "failed" ? "Rendering failed" : "Rendering clip…"}</span>
          </div>
        )}
        {asset.durationSec ? <span className="absolute bottom-2 right-2 rounded bg-forest-900/80 px-1.5 py-0.5 text-[11px] font-medium text-cream">{fmtDuration(asset.durationSec)}</span> : null}
      </div>
    );
  }
  if (cat === "graphic") {
    return (
      <div className={clsx("overflow-hidden bg-cream-200", className)}>
        <GraphicCanvas settings={{ ...asset.content, size: "square" }} className="h-full w-full object-cover" />
      </div>
    );
  }
  if (cat === "audio") {
    return (
      <div className={clsx("flex flex-col items-center justify-center gap-3 bg-sage-100 p-4", className)}>
        <div className="flex h-10 items-end gap-[3px]" aria-hidden>
          {[14, 26, 18, 34, 22, 40, 28, 16, 30, 20, 36, 18, 24, 12].map((h, i) => (
            <span key={i} className="w-1.5 rounded-full bg-forest/70" style={{ height: h }} />
          ))}
        </div>
        <span className="text-xs font-medium text-forest">{asset.media?.path ? `Podcast MP3 · ${fmtDuration(asset.durationSec)}` : "Preparing audio…"}</span>
      </div>
    );
  }
  // Written: readable text preview
  const c = asset.content || {};
  const text =
    asset.type === "captions"
      ? Object.values(c.platforms || {})[0]
      : c.body || c.reflection || c.introduction || "";
  return (
    <div className={clsx("relative overflow-hidden bg-cream-50 p-4", className)}>
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-gold-700">{ASSET_TYPE[asset.type].label}</div>
      <div className="font-serif text-[17px] leading-snug text-forest line-clamp-2">{c.title || asset.title}</div>
      <p className="mt-2 text-[13px] leading-relaxed text-charcoal-500 line-clamp-4">{String(text || "")}</p>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-cream-50" />
    </div>
  );
}

export function Stat({ label, value, tone, href, icon }: { label: string; value: number | string; tone?: "warn" | "bad"; href?: string; icon?: ReactNode }) {
  const inner = (
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className={clsx("text-2xl font-semibold tabular-nums", tone === "bad" && Number(value) > 0 ? "text-[#8E3B2F]" : "text-forest")}>{value}</div>
        <div className="mt-0.5 text-[13px] text-charcoal-500">{label}</div>
      </div>
      {icon && <div className="text-sage-500">{icon}</div>}
    </div>
  );
  return href ? (
    <Link to={href} className="card block p-4 transition-colors hover:border-sage-300">{inner}</Link>
  ) : (
    <div className="card p-4">{inner}</div>
  );
}
