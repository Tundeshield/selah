import { Link } from "react-router-dom";
import clsx from "clsx";
import { AlertTriangle } from "lucide-react";
import type { Asset } from "../lib/types";
import { ASSET_TYPE } from "../lib/constants";
import { fmtRelative } from "../lib/format";
import { AssetStatusBadge, AssetThumb, TypeIcon } from "./bits";

export function primaryActionLabel(a: Asset) {
  switch (a.status) {
    case "needs_review":
      return "Review";
    case "draft":
      return "Finish draft";
    case "approved":
      return "Schedule";
    case "scheduled":
      return "View schedule";
    case "published":
      return "View";
    case "failed":
      return a.render?.status === "failed" ? "Retry render" : "Resolve";
    case "changes_requested":
      return "Revising…";
    default:
      return "Open";
  }
}

export function AssetCard({ asset, selectable, selected, onSelect }: { asset: Asset; selectable?: boolean; selected?: boolean; onSelect?: (v: boolean) => void }) {
  const aspect = asset.category === "video" ? "aspect-[4/5]" : asset.category === "graphic" ? "aspect-square" : "aspect-[4/3]";
  return (
    <div className={clsx("card group relative flex flex-col overflow-hidden transition-colors hover:border-sage-300", selected && "ring-2 ring-forest")}>
      {selectable && (
        <label className="absolute right-3 top-3 z-10 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md bg-white/95 shadow-card">
          <input type="checkbox" className="h-4 w-4" checked={!!selected} onChange={(e) => onSelect?.(e.target.checked)} aria-label={`Select ${asset.title}`} />
        </label>
      )}
      <Link to={`/studio/${asset.id}`} className="flex flex-1 flex-col focus-visible:ring-inset">
        <AssetThumb asset={asset} className={clsx(aspect, "w-full")} />
        <div className="flex flex-1 flex-col p-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="inline-flex min-w-0 items-center gap-1.5 truncate text-xs font-medium text-charcoal-500">
              <TypeIcon type={asset.type} className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{ASSET_TYPE[asset.type]?.label}</span>
            </span>
            <AssetStatusBadge asset={asset} />
          </div>
          <h3 className="line-clamp-2 text-[15px] font-semibold leading-snug text-forest">{asset.title}</h3>
          <p className="mt-1 truncate text-xs text-charcoal-400">{asset.sermonTitle}</p>
          <div className="mt-auto flex items-center justify-between pt-3 text-xs">
            <span className="truncate text-charcoal-400">Updated {fmtRelative(asset.updatedAt)}</span>
            <span className="shrink-0 whitespace-nowrap pl-2 font-medium text-forest group-hover:underline">{primaryActionLabel(asset)}</span>
          </div>
          {!!asset.flags?.length && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-gold-700">
              <AlertTriangle className="h-3.5 w-3.5" /> {asset.flags.length} item{asset.flags.length === 1 ? "" : "s"} to check
            </div>
          )}
        </div>
      </Link>
    </div>
  );
}
