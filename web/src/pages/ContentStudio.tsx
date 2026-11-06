import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, CheckCheck, MessageSquareWarning, X, LayoutGrid } from "lucide-react";
import { useChurch } from "../context/ChurchContext";
import { api } from "../lib/api";
import { errMessage } from "../lib/format";
import { REVISION_REASONS } from "../lib/constants";
import type { Asset } from "../lib/types";
import { Button, Checkbox, EmptyState, Modal, PageHeader, PageLoading, Select, Tabs, Textarea, useToast } from "../components/ui";
import { AssetCard } from "../components/AssetCard";

type StatusFilter = "all" | "needs_review" | "approved" | "scheduled" | "published" | "failed";
type TypeFilter = "all" | "video" | "graphic" | "audio" | "written";

const STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All content" },
  { id: "needs_review", label: "Needs review" },
  { id: "approved", label: "Approved" },
  { id: "scheduled", label: "Scheduled" },
  { id: "published", label: "Published" },
  { id: "failed", label: "Failed" },
];

export default function ContentStudio() {
  const { assets, sermons, loading, churchId, can } = useChurch();
  const [params, setParams] = useSearchParams();
  const status = (params.get("status") as StatusFilter) || "all";
  const type = (params.get("type") as TypeFilter) || "all";
  const sermonId = params.get("sermon") || "";
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [changesOpen, setChangesOpen] = useState(false);
  const toast = useToast();

  const set = (k: string, v: string) => {
    const p = new URLSearchParams(params);
    if (!v || v === "all") p.delete(k);
    else p.set(k, v);
    setParams(p, { replace: true });
    setSelected(new Set());
  };

  const matchStatus = (a: Asset, s: StatusFilter) =>
    s === "all" ? true : s === "needs_review" ? ["needs_review", "draft"].includes(a.status) : a.status === s;

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return assets.filter(
      (a) =>
        matchStatus(a, status) &&
        (type === "all" || a.category === type) &&
        (!sermonId || a.sermonId === sermonId) &&
        (!term || [a.title, a.sermonTitle, a.content?.quote, a.content?.socialCaption, a.transcriptExcerpt].filter(Boolean).join(" ").toLowerCase().includes(term)),
    );
  }, [assets, status, type, sermonId, q]);

  if (loading) return <PageLoading />;

  const base = assets.filter((a) => (type === "all" || a.category === type) && (!sermonId || a.sermonId === sermonId));
  const selectedAssets = filtered.filter((a) => selected.has(a.id));
  const approvable = selectedAssets.filter((a) => a.status === "needs_review");
  const allSelectable = filtered.filter((a) => ["needs_review", "approved"].includes(a.status));

  async function bulkApprove() {
    setBusy(true);
    try {
      const r = await api.approveAssets({ churchId, assetIds: approvable.map((a) => a.id) });
      toast(`${r.approved.length} approved${r.skipped.length ? ` · ${r.skipped.length} skipped` : ""}`);
      setSelected(new Set());
    } catch (e) {
      toast(errMessage(e), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Content Studio" subtitle="Every asset generated from your sermons — review, refine and approve what's ready to share." />

      <div className="mb-4 flex flex-col gap-3">
        <Tabs value={status} onChange={(v) => set("status", v)} tabs={STATUS_TABS.map((t) => ({ ...t, count: base.filter((a) => matchStatus(a, t.id)).length }))} />
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <input className="field pl-9" placeholder="Search content" aria-label="Search content" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select aria-label="Content type" value={type} onChange={(e) => set("type", e.target.value)}>
            <option value="all">All types</option>
            <option value="video">Video</option>
            <option value="graphic">Graphics</option>
            <option value="audio">Audio</option>
            <option value="written">Written content</option>
          </Select>
          <Select aria-label="Sermon" value={sermonId} onChange={(e) => set("sermon", e.target.value)} className="sm:max-w-xs">
            <option value="">All sermons</option>
            {sermons.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </Select>
        </div>
      </div>

      {allSelectable.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
          <Checkbox
            checked={selected.size > 0 && allSelectable.every((a) => selected.has(a.id))}
            onChange={(v) => setSelected(v ? new Set(allSelectable.map((a) => a.id)) : new Set())}
            label={<span className="text-fg-muted">Select all reviewable ({allSelectable.length})</span>}
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState icon={<LayoutGrid className="h-5 w-5" />} title={assets.length ? "Nothing here" : "No content yet"}>
          {assets.length ? "No assets match these filters." : "Upload a sermon and its generated content will appear here for review."}
        </EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((a) => (
            <AssetCard
              key={a.id}
              asset={a}
              selectable={["needs_review", "approved"].includes(a.status)}
              selected={selected.has(a.id)}
              onSelect={(v) => {
                const n = new Set(selected);
                if (v) n.add(a.id);
                else n.delete(a.id);
                setSelected(n);
              }}
            />
          ))}
        </div>
      )}

      {selected.size > 0 && (
        <div className="fixed inset-x-3 bottom-20 z-40 mx-auto flex max-w-2xl flex-wrap items-center gap-2 rounded-xl bg-gray-950 px-4 py-3 text-white shadow-pop md:bottom-6">
          <span className="mr-auto text-sm"><strong>{selected.size}</strong> selected{approvable.length !== selected.size && can("editor") ? ` · ${approvable.length} can be approved` : ""}</span>
          {can("editor") && <Button size="sm" variant="gold" icon={<CheckCheck className="h-4 w-4" />} loading={busy} disabled={!approvable.length} onClick={bulkApprove}>Approve selected</Button>}
          <Button size="sm" variant="secondary" icon={<MessageSquareWarning className="h-4 w-4" />} onClick={() => setChangesOpen(true)}>Request changes</Button>
          <button onClick={() => setSelected(new Set())} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white" aria-label="Clear selection"><X className="h-4 w-4" /></button>
        </div>
      )}

      <RequestChangesModal open={changesOpen} onClose={() => setChangesOpen(false)} assetIds={[...selected]} onDone={() => setSelected(new Set())} />
    </>
  );
}

export function RequestChangesModal({ open, onClose, assetIds, onDone, assetType }: { open: boolean; onClose: () => void; assetIds: string[]; onDone?: () => void; assetType?: string }) {
  const { churchId } = useChurch();
  const [reasons, setReasons] = useState<string[]>([]);
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();
  const options = REVISION_REASONS.filter((r) => {
    if (!assetType) return true;
    if (["correct_captions", "change_duration"].includes(r.id)) return assetType === "video";
    if (r.id === "correct_quote") return assetType === "graphic";
    return true;
  });
  async function submit() {
    if (!reasons.length && !instructions.trim()) return setErr("Choose a reason or describe the change.");
    setBusy(true);
    setErr(null);
    try {
      const r = await api.requestChanges({ churchId, assetIds, reasons, instructions: instructions.trim() });
      toast(r.requested.length ? `Revision requested for ${r.requested.length} asset${r.requested.length === 1 ? "" : "s"}` : "No assets were eligible");
      if (r.skipped.length) toast(`${r.skipped.length} skipped: ${r.skipped[0].reason}`, "error");
      setReasons([]);
      setInstructions("");
      onDone?.();
      onClose();
    } catch (e) {
      setErr(errMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Request changes" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy}>Send for revision</Button></>}>
      <p className="mb-4 text-sm text-fg-muted">The current version is kept in history. Selah Studio prepares a revised version and returns it to review.</p>
      <fieldset className="mb-4">
        <legend className="label">What needs to change?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {options.map((r) => <Checkbox key={r.id} checked={reasons.includes(r.id)} onChange={(v) => setReasons(v ? [...reasons, r.id] : reasons.filter((x) => x !== r.id))} label={r.label} />)}
        </div>
      </fieldset>
      <Textarea label="Instructions" placeholder="e.g. Start the clip where he reads Romans 8:28, and end after “He is still working.”" value={instructions} onChange={(e) => setInstructions(e.target.value)} rows={4} />
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
    </Modal>
  );
}
