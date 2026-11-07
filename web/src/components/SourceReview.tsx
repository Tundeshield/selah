import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { BookOpen, Check, FileWarning, Play, Quote, ShieldCheck } from "lucide-react";
import { useChurch } from "../context/ChurchContext";
import { useDocData, useStorageUrl } from "../lib/hooks";
import { api } from "../lib/api";
import { errMessage, fmtClock } from "../lib/format";
import type { Asset, AssetFlag, Sermon, Transcript } from "../lib/types";
import { Button, Modal, useToast } from "./ui";

export const openFlagCount = (a: Asset) => (a.flags || []).filter((f) => !f.checked).length;

const KIND: Record<string, { label: string; icon: typeof Quote }> = {
  quote_edited: { label: "Quote wording", icon: Quote },
  quote_unverified: { label: "Quote wording", icon: Quote },
  scripture_unverified: { label: "Scripture", icon: BookOpen },
  unclear_transcript: { label: "Unclear audio", icon: FileWarning },
};
const kind = (f: AssetFlag) => KIND[f.code] || { label: "Check", icon: FileWarning };

/** Compact banner that replaces the old "N items to check" warning. */
export function SourceReviewBanner({ asset, onOpen }: { asset: Asset; onOpen: () => void }) {
  const total = asset.flags?.length || 0;
  if (!total) return null;
  const open = openFlagCount(asset);
  return (
    <button type="button" onClick={onOpen} className={clsx("mb-5 flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left ring-1 transition", open ? "bg-amber-50 ring-amber-200 hover:ring-amber-300" : "bg-brand-50 ring-brand-200 hover:ring-brand-300")}>
      <ShieldCheck className={clsx("h-5 w-5 shrink-0", open ? "text-amber-700" : "text-brand-700")} />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-fg">Source review</span>
        <span className="block text-xs text-fg-muted">{open ? `${open} of ${total} point${total === 1 ? "" : "s"} still to check against the recording` : `All ${total} point${total === 1 ? "" : "s"} checked`}</span>
      </span>
      <span className="shrink-0 text-sm font-medium text-fg underline-offset-2 hover:underline">{open ? "Review" : "View"}</span>
    </button>
  );
}

export function SourceReviewModal({ asset, sermon, open, onClose, footer }: { asset: Asset; sermon: Sermon | null; open: boolean; onClose: () => void; footer?: React.ReactNode }) {
  const { churchId, can } = useChurch();
  const toast = useToast();
  const flags = asset.flags || [];
  const [sel, setSel] = useState(0);
  const [busy, setBusy] = useState<number | null>(null);
  const tq = useDocData<Transcript>(open ? `churches/${churchId}/transcripts/${asset.sermonId}` : null);
  const media = useStorageUrl(open ? sermon?.media?.path : null);
  const player = useRef<HTMLMediaElement | null>(null);
  const f = flags[sel];
  const segs = tq.data?.segments || [];
  const segIdx = f?.segment ?? (f?.at !== undefined ? segs.findIndex((s) => s.start <= f.at! && s.end >= f.at!) : -1);
  const at = f?.at ?? (segIdx >= 0 ? segs[segIdx]?.start : undefined);
  const context = segIdx >= 0 ? segs.slice(Math.max(0, segIdx - 1), segIdx + 2) : [];

  useEffect(() => {
    if (sel >= flags.length) setSel(0);
  }, [flags.length, sel]);

  const play = () => {
    const p = player.current;
    if (!p || at === undefined) return;
    p.currentTime = Math.max(0, at - 2);
    p.play().catch(() => undefined);
  };
  // Cue the recording when moving between points.
  useEffect(() => {
    const p = player.current;
    if (p && at !== undefined && p.readyState > 0) {
      p.pause();
      p.currentTime = Math.max(0, at - 2);
    }
  }, [at]);

  const toggle = async (i: number, checked: boolean) => {
    setBusy(i);
    try {
      await api.checkAssetFlag({ churchId, assetId: asset.id, index: i, checked });
      if (checked && i === sel) {
        const next = flags.findIndex((x, j) => j !== i && !x.checked);
        if (next >= 0) setSel(next);
      }
    } catch (e) {
      toast(errMessage(e), "error");
    } finally {
      setBusy(null);
    }
  };

  const done = flags.filter((x) => x.checked).length;
  const isVideo = !!sermon?.media?.hasVideo;

  return (
    <Modal open={open} onClose={onClose} title="Source review" wide footer={footer}>
      <p className="-mt-1 mb-4 text-sm text-fg-muted">Check each point against what was actually said. {done} of {flags.length} checked.</p>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <ol className="space-y-2">
          {flags.map((x, i) => {
            const k = kind(x);
            return (
              <li key={i}>
                <div className={clsx("flex items-start gap-3 rounded-xl p-3 ring-1 transition", i === sel ? "bg-white ring-2 ring-brand-500" : "bg-gray-50 ring-gray-200 hover:ring-gray-300")}>
                  <button type="button" onClick={() => setSel(i)} className="flex min-w-0 flex-1 items-start gap-2.5 text-left">
                    <k.icon className="mt-0.5 h-4 w-4 shrink-0 text-fg-muted" aria-hidden />
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 text-xs font-semibold text-fg">
                        {k.label}
                        {x.at !== undefined && <span className="rounded bg-ink px-1.5 py-px font-mono text-[0.625rem] text-white">{fmtClock(x.at)}</span>}
                      </span>
                      <span className="mt-0.5 block text-[0.8125rem] leading-snug text-gray-700">{x.message}</span>
                      {x.checked && x.checkedByName && <span className="mt-1 block text-[0.6875rem] text-brand-700">Checked by {x.checkedByName}</span>}
                    </span>
                  </button>
                  {can("contributor") && (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={!!x.checked}
                      aria-label={x.checked ? "Mark as not checked" : "Mark as checked"}
                      disabled={busy === i}
                      onClick={() => toggle(i, !x.checked)}
                      className={clsx("flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-semibold transition", x.checked ? "bg-brand-500 text-ink" : "bg-white text-fg-muted ring-1 ring-gray-300 hover:text-fg")}
                    >
                      <Check className="h-3.5 w-3.5" />
                      {x.checked ? "Checked" : "Check"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>

        <div className="rounded-xl bg-gray-50 p-4 ring-1 ring-gray-200">
          {media.url ? (
            isVideo ? (
              <video ref={(el) => (player.current = el)} src={media.url} controls preload="metadata" className="mb-3 aspect-video w-full rounded-lg bg-black" />
            ) : (
              <audio ref={(el) => (player.current = el)} src={media.url} controls preload="metadata" className="mb-3 w-full" />
            )
          ) : (
            <p className="mb-3 text-xs text-fg-muted">{sermon?.media?.path ? "Loading recording…" : "No recording available for this sermon."}</p>
          )}
          {at !== undefined && media.url && (
            <Button size="sm" variant="secondary" icon={<Play className="h-4 w-4" />} onClick={play} className="mb-3">
              Play from {fmtClock(Math.max(0, at - 2))}
            </Button>
          )}
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-[0.06em] text-gray-500">Transcript</h4>
          {tq.loading ? (
            <p className="text-sm text-fg-muted">Loading…</p>
          ) : context.length ? (
            <div className="space-y-2">
              {context.map((s) => (
                <p key={s.i} className={clsx("rounded-lg p-2 text-[0.875rem] leading-relaxed", s.i === segs[segIdx]?.i ? "bg-white text-gray-900 ring-1 ring-amber-300" : "text-gray-500")}>
                  <span className="mr-2 font-mono text-[0.6875rem] text-gray-400">{fmtClock(s.start)}</span>
                  {s.text}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-sm text-fg-muted">
              This point isn't tied to one moment. <Link className="link" to={`/sermons/${asset.sermonId}`}>Open the full transcript</Link> to check it.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
