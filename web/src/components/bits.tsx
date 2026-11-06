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
    <div className={clsx("flex items-center gap-2", className)}>
      <svg viewBox="0 0 64 64" className="h-7 w-7" aria-hidden>
        <rect width="64" height="64" rx="12" fill="rgb(var(--brand-500))" />
        <path d="M19 39c6.5-1 10.5-4.2 13-9.5 2.5 5.3 6.5 8.5 13 9.5-5.5 2-9.5 5.3-13 11-3.5-5.7-7.5-9-13-11z" fill="#fff" />
        <circle cx="32" cy="20" r="5" fill="#fff" />
      </svg>
      <span className={clsx("text-[22px] font-semibold leading-none tracking-tight", light ? "text-white" : "text-fg")}>selah</span>
      <span className={clsx("rounded border px-1 py-px text-[10px] font-semibold uppercase leading-tight tracking-wide", light ? "border-white/60 text-white" : "border-brand-500 text-brand-600")}>Studio</span>
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
  if (!path || !url) return <>{fallback ?? <div className={clsx("bg-gray-100", className)} />}</>;
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
      <div className={clsx("relative overflow-hidden bg-gray-900", className)}>
        {asset.media?.thumbnailPath ? (
          <StorageImage path={asset.media.thumbnailPath} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center text-white/80">
            {asset.render?.status === "failed" ? <AlertTriangle className="h-5 w-5 text-brand-500" /> : <Loader2 className="h-5 w-5 animate-spin text-brand-500" />}
            <span className="line-clamp-3 text-xs">{asset.render?.status === "failed" ? "Rendering failed" : "Rendering clip…"}</span>
          </div>
        )}
        {asset.durationSec ? <span className="absolute bottom-2 right-2 rounded bg-gray-950/80 px-1.5 py-0.5 text-[11px] font-medium text-white">{fmtDuration(asset.durationSec)}</span> : null}
      </div>
    );
  }
  if (cat === "graphic") {
    return (
      <div className={clsx("overflow-hidden bg-gray-100", className)}>
        <GraphicCanvas settings={{ ...asset.content, size: "square" }} className="h-full w-full object-cover" />
      </div>
    );
  }
  if (cat === "audio") {
    return (
      <div className={clsx("flex flex-col items-center justify-center gap-3 bg-gray-100 p-4", className)}>
        <div className="flex h-10 items-end gap-[3px]" aria-hidden>
          {[14, 26, 18, 34, 22, 40, 28, 16, 30, 20, 36, 18, 24, 12].map((h, i) => (
            <span key={i} className="w-1.5 rounded-full bg-brand-500/70" style={{ height: h }} />
          ))}
        </div>
        <span className="text-xs font-medium text-fg">{asset.media?.path ? `Podcast MP3 · ${fmtDuration(asset.durationSec)}` : "Preparing audio…"}</span>
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
    <div className={clsx("relative overflow-hidden bg-gray-50 p-4", className)}>
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-brand-700">{ASSET_TYPE[asset.type].label}</div>
      <div className="font-semibold tracking-tight text-[17px] leading-snug text-fg line-clamp-2">{c.title || asset.title}</div>
      <p className="mt-2 text-[13px] leading-relaxed text-fg-muted line-clamp-4">{String(text || "")}</p>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-gray-50" />
    </div>
  );
}

export function Stat({ label, value, tone, href, icon }: { label: string; value: number | string; tone?: "warn" | "bad"; href?: string; icon?: ReactNode }) {
  const inner = (
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className={clsx("text-2xl font-semibold tabular-nums", tone === "bad" && Number(value) > 0 ? "text-red-700" : "text-fg")}>{value}</div>
        <div className="mt-0.5 text-[13px] text-fg-muted">{label}</div>
      </div>
      {icon && <div className="text-gray-500">{icon}</div>}
    </div>
  );
  return href ? (
    <Link to={href} className="card block p-4 transition-colors hover:border-gray-300">{inner}</Link>
  ) : (
    <div className="card p-4">{inner}</div>
  );
}
