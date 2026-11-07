import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { CalendarPlus, Check, Pencil, Share2, ShieldCheck } from "lucide-react";
import type { Asset } from "../lib/types";
import { errMessage } from "../lib/format";
import { api } from "../lib/api";
import { useChurch } from "../context/ChurchContext";
import { canvaText, cleanText, copy, downloadGraphicPng } from "../lib/exportText";
import { openFlagCount } from "./SourceReview";
import { ScheduleModal } from "./PublishModals";
import { useToast } from "./ui";
import { AssetStatusBadge, AssetThumb, TypeIcon, useAssetTypeLabel } from "./bits";

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
  const typeLabel = useAssetTypeLabel(asset);
  const { churchId, church, can, canPublish } = useChurch();
  const toast = useToast();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const aspect = asset.category === "video" ? "aspect-[4/5]" : asset.category === "graphic" ? "aspect-square" : "aspect-[4/3]";
  const toCheck = openFlagCount(asset);
  const approvedCurrent = asset.approvedVersion === asset.version && ["approved", "scheduled"].includes(asset.status);
  const canQuickApprove = asset.status === "needs_review" && can("editor") && !toCheck;
  const exportable = asset.category === "graphic" || asset.category === "written";

  const quickApprove = async () => {
    setBusy(true);
    try {
      const r = await api.approveAssets({ churchId, assetIds: [asset.id] });
      if (!r.approved.length) throw new Error(r.skipped[0]?.reason || "Could not approve");
      toast("Approved", "success");
    } catch (e) {
      toast(errMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };
  const exportItems = [
    { label: asset.type === "graphic" ? "Copy quote & scripture" : "Copy clean text", run: async () => { await copy(cleanText(asset)); toast("Copied", "success"); } },
    ...(asset.type === "graphic" ? [{ label: "Download PNG", run: () => downloadGraphicPng(asset, church) }] : []),
    { label: "Copy for Canva", run: async () => { await copy(canvaText(asset)); toast("Copied — paste into your Canva text boxes", "success"); } },
  ];

  return (
    <div className={clsx("card group relative flex flex-col overflow-hidden transition-colors hover:border-gray-300", selected && "ring-2 ring-brand-500")}>
      {selectable && (
        <label className="absolute right-3 top-3 z-10 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md bg-white/95 shadow-card">
          <input type="checkbox" className="h-4 w-4" checked={!!selected} onChange={(e) => onSelect?.(e.target.checked)} aria-label={`Select ${asset.title}`} />
        </label>
      )}
      <div className="relative">
        <Link to={`/studio/${asset.id}`} tabIndex={-1} aria-hidden>
          <AssetThumb asset={asset} className={clsx(aspect, "w-full")} />
        </Link>
        {/* Quick actions: always visible on touch screens, on hover/focus elsewhere. */}
        <div className="absolute inset-x-2 bottom-2 flex items-center gap-1.5 transition md:translate-y-1 md:opacity-0 md:group-focus-within:translate-y-0 md:group-focus-within:opacity-100 md:group-hover:translate-y-0 md:group-hover:opacity-100">
          {canQuickApprove && <QuickBtn onClick={quickApprove} disabled={busy} primary icon={<Check className="h-3.5 w-3.5" />}>Approve</QuickBtn>}
          <QuickBtn onClick={() => navigate(`/studio/${asset.id}`)} icon={<Pencil className="h-3.5 w-3.5" />}>{asset.status === "needs_review" && !canQuickApprove ? "Review" : "Edit"}</QuickBtn>
          {approvedCurrent && canPublish && <QuickBtn onClick={() => setScheduleOpen(true)} icon={<CalendarPlus className="h-3.5 w-3.5" />}>Schedule</QuickBtn>}
          {exportable && <ExportMenu items={exportItems} />}
        </div>
      </div>
      <Link to={`/studio/${asset.id}`} className="flex flex-1 flex-col p-4 focus-visible:ring-inset">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="inline-flex min-w-0 items-center gap-1.5 truncate text-xs font-medium text-fg-muted">
            <TypeIcon type={asset.type} className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{typeLabel}</span>
          </span>
          <AssetStatusBadge asset={asset} />
        </div>
        <h3 className="line-clamp-2 text-[0.9375rem] font-semibold leading-snug text-fg">{asset.title}</h3>
        <div className="mt-auto flex items-center justify-between gap-2 pt-3 text-xs">
          <span className="truncate text-gray-500">{asset.sermonTitle}</span>
          {toCheck > 0 ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800 ring-1 ring-amber-200">
              <ShieldCheck className="h-3 w-3" />{toCheck} to verify
            </span>
          ) : (
            <span className="shrink-0 whitespace-nowrap font-medium text-fg group-hover:underline">{primaryActionLabel(asset)}</span>
          )}
        </div>
      </Link>
      {scheduleOpen && <ScheduleModal open onClose={() => setScheduleOpen(false)} asset={asset} />}
    </div>
  );
}

function QuickBtn({ children, onClick, icon, primary, disabled }: { children: React.ReactNode; onClick: () => void; icon: React.ReactNode; primary?: boolean; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={clsx("inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-semibold shadow-pop backdrop-blur transition disabled:opacity-60", primary ? "bg-brand-500 text-ink hover:bg-brand-400" : "bg-white/95 text-fg hover:bg-white")}>
      {icon}
      {children}
    </button>
  );
}

function ExportMenu({ items }: { items: { label: string; run: () => unknown }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  return (
    <div ref={ref} className="relative ml-auto">
      <button type="button" aria-label="Export" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/95 text-fg shadow-pop hover:bg-white">
        <Share2 className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div role="menu" className="absolute bottom-10 right-0 z-20 w-52 overflow-hidden rounded-xl bg-white py-1 shadow-pop ring-1 ring-gray-200">
          {items.map((it) => (
            <button key={it.label} role="menuitem" type="button" onClick={() => { setOpen(false); it.run(); }} className="block w-full px-3.5 py-2.5 text-left text-sm text-fg hover:bg-gray-50">
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
