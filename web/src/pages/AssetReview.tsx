import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { collection, orderBy, query } from "firebase/firestore";
import clsx from "clsx";
import { ArrowLeft, Check, CalendarPlus, Download, MessageSquareWarning, RefreshCw, Trash2, AlertTriangle, Loader2, Send, Mic2, Plus, Minus, History, Upload as UploadIcon, Shuffle } from "lucide-react";
import { useChurch } from "../context/ChurchContext";
import { db } from "../lib/firebase";
import { useDocData, useQueryData, useStorageUrl, useUnsavedWarning } from "../lib/hooks";
import { api } from "../lib/api";
import { ASSET_TYPE, assetTypeLabel, platformLabel } from "../lib/constants";
import { errMessage, fmtClock, fmtDuration, fmtRelative, tsDate } from "../lib/format";
import { GRAPHIC_SIZES, TEMPLATES, drawBackground } from "../lib/graphic";
import type { Asset, AssetVersion, Cue, Revision, Sermon } from "../lib/types";
import { Button, Card, EmptyState, Input, Modal, Notice, PageLoading, Select, Tabs, Textarea, useToast } from "../components/ui";
import { AssetStatusBadge, GraphicCanvas, TypeIcon } from "../components/bits";
import { RequestChangesModal } from "./ContentStudio";
import { MarkPublishedModal, ScheduleModal } from "../components/PublishModals";
import { format } from "date-fns";

export default function AssetReview() {
  const { assetId = "" } = useParams();
  const { churchId, can, canPublish, publications } = useChurch();
  const navigate = useNavigate();
  const toast = useToast();
  const assetQ = useDocData<Asset>(`churches/${churchId}/assets/${assetId}`);
  const asset = assetQ.data;
  const sermonQ = useDocData<Sermon>(asset ? `churches/${churchId}/sermons/${asset.sermonId}` : null);
  const versions = useQueryData<AssetVersion>(query(collection(db, "churches", churchId, "assets", assetId, "versions"), orderBy("version", "desc")), `v/${assetId}`);
  const revisions = useQueryData<Revision>(query(collection(db, "churches", churchId, "assets", assetId, "revisions"), orderBy("createdAt", "desc")), `r/${assetId}`);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [draft, setDraft] = useState<{ title: string; content: any; source?: { start: number; end: number } } | null>(null);
  const [baseVersion, setBaseVersion] = useState<number | null>(null);
  const [panel, setPanel] = useState<"edit" | "source" | "history">("edit");
  const [busy, setBusy] = useState<string | null>(null);
  const [changesOpen, setChangesOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Reset the draft whenever a new version arrives (unless the user is mid-edit on the same version).
  useEffect(() => {
    if (!asset) return;
    if (baseVersion === null || asset.version !== baseVersion) {
      setDraft({ title: asset.title, content: structuredClone(asset.content || {}), source: asset.source?.start !== undefined ? { start: asset.source.start!, end: asset.source.end! } : undefined });
      setBaseVersion(asset.version);
    }
  }, [asset, baseVersion]);

  const dirty = useMemo(() => {
    if (!asset || !draft) return false;
    return (
      draft.title !== asset.title ||
      JSON.stringify(draft.content) !== JSON.stringify(asset.content || {}) ||
      (draft.source && asset.source && (Math.abs(draft.source.start - (asset.source.start || 0)) > 0.01 || Math.abs(draft.source.end - (asset.source.end || 0)) > 0.01))
    );
  }, [asset, draft]);
  useUnsavedWarning(!!dirty);

  if (assetQ.loading) return <PageLoading />;
  if (!asset || !draft) {
    return <EmptyState title="Asset not found" action={<Button onClick={() => navigate("/studio")}>Back to Content Studio</Button>}>It may have been deleted.</EmptyState>;
  }

  const typeLabel = assetTypeLabel({ type: asset.type, fromAudio: asset.fromAudio ?? (asset.type === "video" && sermonQ.data ? sermonQ.data.media?.hasVideo === false || (sermonQ.data.media?.hasVideo === undefined && sermonQ.data.media?.kind === "audio") : false) });
  const approvedCurrent = asset.approvedVersion === asset.version && ["approved", "scheduled", "published", "failed"].includes(asset.status);
  const editable = !["processing", "changes_requested"].includes(asset.status) && can("contributor");
  const assetPubs = publications.filter((p) => p.assetId === asset.id);

  async function run(key: string, fn: () => Promise<unknown>, ok?: string) {
    setBusy(key);
    try {
      await fn();
      if (ok) toast(ok);
    } catch (e) {
      toast(errMessage(e), "error");
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    if (!asset || !draft) return;
    const patch: Parameters<typeof api.updateAsset>[0]["patch"] = {};
    if (draft.title !== asset.title) patch.title = draft.title;
    if (JSON.stringify(draft.content) !== JSON.stringify(asset.content)) patch.content = draft.content;
    if (draft.source && asset.source && (draft.source.start !== asset.source.start || draft.source.end !== asset.source.end)) patch.source = draft.source;
    await run("save", async () => {
      const r = await api.updateAsset({ churchId, assetId: asset.id, expectedVersion: asset.version, patch });
      setBaseVersion(null);
      if (r.rendering) toast("Saved — re-rendering the clip");
      else if (r.reapprovalRequired) toast("Saved as a new version. It needs approval again before publishing.");
      else toast("Changes saved");
    });
  }

  const approve = () => run("approve", () => api.approveAssets({ churchId, assetIds: [asset.id] }).then((r) => { if (!r.approved.length) throw new Error(r.skipped[0]?.reason || "Could not approve"); }), "Approved");

  return (
    <>
      <Link to="/studio" className="mb-5 inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg"><ArrowLeft className="h-4 w-4" /> Content Studio</Link>

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-medium text-fg-muted">
            <span className="inline-flex items-center gap-1.5"><TypeIcon type={asset.type} className="h-3.5 w-3.5" />{typeLabel}</span>
            <span>·</span><span>Version {asset.version}</span>
            <AssetStatusBadge asset={asset} />
          </div>
          <h1 className="h-page line-clamp-2">{asset.title}</h1>
          <p className="mt-2 text-sm text-fg-muted">
            From <Link className="link" to={`/sermons/${asset.sermonId}`}>{asset.sermonTitle}</Link>
            {asset.source?.start !== undefined && asset.category !== "written" ? ` · ${fmtClock(asset.source.start)}–${fmtClock(asset.source.end)} in the sermon` : ""}
          </p>
        </div>
        <ReviewActions
          asset={asset}
          busy={busy}
          dirty={!!dirty}
          canApprove={can("editor")}
          canPublish={canPublish}
          approvedCurrent={approvedCurrent}
          onApprove={approve}
          onChanges={() => setChangesOpen(true)}
          onRegenerate={() => run("regen", () => api.requestChanges({ churchId, assetIds: [asset.id], reasons: ["regenerate"], instructions: "" }), "Regenerating a new version")}
          onSchedule={() => setScheduleOpen(true)}
          onPublish={() => setPublishOpen(true)}
          onSubmit={() => run("submit", () => api.submitForReview({ churchId, assetId: asset.id }), "Submitted for review")}
          onRetryRender={() => run("render", () => api.retryRender({ churchId, assetId: asset.id }), "Rendering again")}
          canvasRef={canvasRef}
        />
      </div>

      {asset.status === "changes_requested" && <div className="mb-5"><Notice tone="info" title="Revision in progress">A revised version is being prepared. The current version is preserved in the history.</Notice></div>}
      {asset.revisionError && asset.status === "needs_review" && <div className="mb-5"><Notice tone="warn" title="The last revision couldn't be generated">{asset.revisionError}</Notice></div>}
      {asset.status === "processing" && <div className="mb-5"><Notice tone="info" title="Rendering"><span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />This asset is being rendered. It will return to review automatically.</span></Notice></div>}
      {asset.render?.status === "failed" && <div className="mb-5"><Notice tone="error" title="Rendering failed">{asset.render.error}</Notice></div>}
      {!approvedCurrent && (asset.approvedVersion || 0) > 0 && asset.status === "needs_review" && (
        <div className="mb-5"><Notice tone="warn" title="Needs approval again">This asset was edited after it was approved. {assetPubs.some((p) => p.status === "scheduled") && "Its scheduled posts are on hold until the new version is approved."}</Notice></div>
      )}
      {!!asset.flags?.length && (
        <div className="mb-5">
          <Notice tone="warn" title="Please check before approving">
            <ul className="mt-1 list-disc space-y-0.5 pl-4">{asset.flags.map((f, i) => <li key={i}>{f.message}</li>)}</ul>
          </Notice>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        {/* Preview */}
        <div className="min-w-0">
          <Preview asset={asset} draft={draft} canvasRef={canvasRef} sermon={sermonQ.data} />
          {assetPubs.length > 0 && (
            <Card className="mt-4 p-4">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-[0.06em] text-gray-500">Publication</h3>
              <ul className="space-y-1.5 text-sm">
                {assetPubs.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-fg">{platformLabel(p.platform)} · {format(tsDate(p.scheduledAt)!, "EEE d MMM, HH:mm")}</span>
                    <span className={clsx("text-xs font-medium", p.status === "failed" ? "text-red-600" : p.status === "published" ? "text-fg" : "text-brand-700")}>
                      {p.status === "published" ? (p.externalUrl ? <a className="link" href={p.externalUrl} target="_blank" rel="noreferrer">Published</a> : "Published (manual)") : p.status === "failed" ? `Failed — ${p.error}` : "Scheduled · manual publication"}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        {/* Panel */}
        <div className="min-w-0">
          <Tabs className="mb-4" value={panel} onChange={setPanel} tabs={[{ id: "edit", label: "Edit" }, { id: "source", label: "Source" }, { id: "history", label: "History", count: versions.data.length }]} />
          {panel === "edit" && (
            <Card className="p-5">
              {!editable && asset.status !== "processing" && <p className="mb-4 text-sm text-fg-muted">{asset.status === "changes_requested" ? "Editing is paused while the revision is prepared." : "You can view this asset but not edit it."}</p>}
              <fieldset disabled={!editable || busy === "save"} className="space-y-4">
                <Input label="Title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
                <Editor asset={asset} draft={draft} setDraft={setDraft} sermon={sermonQ.data} />
              </fieldset>
              {editable && (
                <div className="mt-5 flex items-center justify-between gap-3 border-t border-gray-200 pt-4">
                  <span className="text-xs text-gray-500">{dirty ? (approvedCurrent ? "Saving creates a new version that needs approval again." : "Unsaved changes") : `Last updated ${fmtRelative(asset.updatedAt)}${asset.updatedByName ? ` by ${asset.updatedByName}` : ""}`}</span>
                  <div className="flex gap-2">
                    {dirty && <Button variant="ghost" size="sm" onClick={() => setBaseVersion(null)}>Discard</Button>}
                    <Button size="sm" onClick={save} disabled={!dirty} loading={busy === "save"}>Save changes</Button>
                  </div>
                </div>
              )}
            </Card>
          )}
          {panel === "source" && (
            <Card className="space-y-4 p-5">
              <div>
                <h3 className="mb-1 text-xs font-medium uppercase tracking-[0.06em] text-gray-500">Original sermon</h3>
                <Link className="link" to={`/sermons/${asset.sermonId}`}>{asset.sermonTitle}</Link>
                <p className="text-sm text-fg-muted">{asset.preacher}</p>
              </div>
              {asset.transcriptExcerpt ? (
                <div>
                  <h3 className="mb-1 text-xs font-medium uppercase tracking-[0.06em] text-gray-500">
                    Transcript excerpt {asset.source?.start !== undefined && `· ${fmtClock(asset.source.start)}–${fmtClock(asset.source.end)}`}
                  </h3>
                  <blockquote className="border-l-2 border-brand-500 pl-3 text-[0.9375rem] leading-relaxed text-gray-800">{asset.transcriptExcerpt}</blockquote>
                </div>
              ) : (
                <p className="text-sm text-fg-muted">This asset draws on the whole sermon. Open the sermon to read the full transcript.</p>
              )}
              {asset.description && <div><h3 className="mb-1 text-xs font-medium uppercase tracking-[0.06em] text-gray-500">Why this moment</h3><p className="text-sm text-fg-muted">{asset.description}</p></div>}
              {(asset.content?.scriptureReferences?.length || asset.content?.scripture) && (
                <div>
                  <h3 className="mb-1 text-xs font-medium uppercase tracking-[0.06em] text-gray-500">Scripture references</h3>
                  <p className="text-sm text-fg">{(asset.content.scriptureReferences || [asset.content.scripture]).filter(Boolean).join(", ")}</p>
                </div>
              )}
            </Card>
          )}
          {panel === "history" && <HistoryPanel versions={versions.data} revisions={revisions.data} current={asset.version} />}
          {can("editor") && (
            <div className="mt-4 text-right">
              <button onClick={() => setDeleteOpen(true)} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-700"><Trash2 className="h-4 w-4" />Delete asset</button>
            </div>
          )}
        </div>
      </div>

      <RequestChangesModal open={changesOpen} onClose={() => setChangesOpen(false)} assetIds={[asset.id]} assetType={asset.type} />
      {scheduleOpen && <ScheduleModal open onClose={() => setScheduleOpen(false)} asset={asset} />}
      {publishOpen && <MarkPublishedModal open onClose={() => setPublishOpen(false)} asset={asset} />}
      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete this asset?"
        footer={<><Button variant="ghost" onClick={() => setDeleteOpen(false)}>Cancel</Button><Button variant="danger" loading={busy === "delete"} onClick={() => run("delete", async () => { await api.deleteAsset({ churchId, assetId: asset.id }); navigate("/studio", { replace: true }); }, "Asset deleted")}>Delete</Button></>}
      >
        <p className="text-sm text-gray-800">“{asset.title}”, all its versions and any schedule entries will be removed. The sermon and its other content are not affected.</p>
      </Modal>
    </>
  );
}

function ReviewActions(props: {
  asset: Asset; busy: string | null; dirty: boolean; canApprove: boolean; canPublish: boolean; approvedCurrent: boolean;
  onApprove: () => void; onChanges: () => void; onRegenerate: () => void; onSchedule: () => void; onPublish: () => void; onSubmit: () => void; onRetryRender: () => void;
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
}) {
  const { asset, busy } = props;
  const s = asset.status;
  return (
    <div className="flex flex-wrap gap-2">
      {s === "draft" && <Button icon={<Send className="h-4 w-4" />} loading={busy === "submit"} disabled={props.dirty} onClick={props.onSubmit}>Submit for review</Button>}
      {s === "needs_review" && props.canApprove && <Button icon={<Check className="h-4 w-4" />} loading={busy === "approve"} disabled={props.dirty} onClick={props.onApprove} title={props.dirty ? "Save your changes first" : undefined}>Approve</Button>}
      {["needs_review", "approved", "draft"].includes(s) && asset.type !== "audio" && <Button variant="secondary" icon={<MessageSquareWarning className="h-4 w-4" />} onClick={props.onChanges}>Request changes</Button>}
      {["needs_review", "draft"].includes(s) && asset.type !== "audio" && <Button variant="ghost" icon={<RefreshCw className="h-4 w-4" />} loading={busy === "regen"} onClick={props.onRegenerate}>Regenerate</Button>}
      {(asset.render?.status === "failed" || renderStalled(asset)) && <Button icon={<RefreshCw className="h-4 w-4" />} loading={busy === "render"} onClick={props.onRetryRender}>Retry render</Button>}
      {props.approvedCurrent && props.canPublish && (
        <>
          <Button icon={<CalendarPlus className="h-4 w-4" />} onClick={props.onSchedule}>Schedule</Button>
          <Button variant="secondary" icon={<UploadIcon className="h-4 w-4" />} onClick={props.onPublish}>Mark as published</Button>
        </>
      )}
      <DownloadButton asset={asset} canvasRef={props.canvasRef} />
    </div>
  );
}

function renderStalled(a: Asset) {
  const r = a.render as (Asset["render"] & { startedAt?: { toMillis?: () => number } }) | undefined;
  const t = r?.startedAt?.toMillis?.() ?? a.updatedAt?.toMillis?.() ?? 0;
  return a.status === "processing" && !!r && ["pending", "running"].includes(r.status) && t > 0 && Date.now() - t > 15 * 60 * 1000;
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "asset";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function writtenToMarkdown(a: Asset, c: any): string {
  switch (a.type) {
    case "summary":
      return `# ${c.title || a.title}\n\n**Main theme:** ${c.mainTheme}\n\n${c.body}\n\n## Key points\n${(c.keyPoints || []).map((k: string) => `- ${k}`).join("\n")}\n\n**Scripture:** ${(c.scriptureReferences || []).join(", ")}\n`;
    case "devotional":
      return `# ${c.title}\n\n*${c.scripture}*\n\n${c.reflection}\n\n## Apply it\n${c.application}\n\n## Prayer\n${c.prayer}\n`;
    case "article":
      return `# ${c.title}\n\n${c.introduction}\n\n${(c.sections || []).map((s: { heading: string; body: string }) => `## ${s.heading}\n\n${s.body}`).join("\n\n")}\n\n## Putting it into practice\n${c.application}\n\n${c.conclusion}\n\n*Scripture: ${(c.scriptureReferences || []).join(", ")}*\n`;
    case "captions":
      return Object.entries(c.platforms || {}).map(([p, t]) => `## ${platformLabel(p)}\n\n${t}`).join("\n\n");
    default:
      return JSON.stringify(c, null, 2);
  }
}

function DownloadButton({ asset, canvasRef }: { asset: Asset; canvasRef: React.MutableRefObject<HTMLCanvasElement | null> }) {
  const { url } = useStorageUrl(asset.media?.path);
  const toast = useToast();
  if (asset.category === "video" || asset.category === "audio") {
    if (!url) return null;
    return (
      <a href={url} target="_blank" rel="noreferrer" download={`${slug(asset.title)}.${asset.category === "video" ? "mp4" : "mp3"}`} className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-fg hover:bg-gray-50">
        <Download className="h-4 w-4" /> Download
      </a>
    );
  }
  const go = () => {
    if (asset.category === "graphic") {
      const c = canvasRef.current;
      if (!c) return;
      try {
        c.toBlob((b) => {
          if (!b) return toast("Couldn't export the image.", "error");
          const a = document.createElement("a");
          a.href = URL.createObjectURL(b);
          a.download = `${slug(asset.title)}.png`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        }, "image/png");
      } catch {
        toast("Your logo's storage settings blocked the export. See README → Storage CORS.", "error");
      }
      return;
    }
    const blob = new Blob([writtenToMarkdown(asset, asset.content)], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${slug(asset.title)}.md`;
    a.click();
  };
  return <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={go}>Download</Button>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Preview({ asset, draft, canvasRef, sermon }: { asset: Asset; draft: { title: string; content: any }; canvasRef: React.MutableRefObject<HTMLCanvasElement | null>; sermon: Sermon | null }) {
  const media = useStorageUrl(asset.media?.path);
  void sermon;
  if (asset.category === "video") {
    const ar = asset.content?.aspectRatio || "9:16";
    return (
      <Card className="flex items-center justify-center overflow-hidden bg-gray-950 p-4">
        {media.url && asset.status !== "processing" ? (
          <video key={media.url} src={media.url} controls playsInline preload="metadata" className={clsx("max-h-[72vh] rounded-lg bg-black", ar === "16:9" ? "w-full" : ar === "1:1" ? "aspect-square max-w-[560px]" : "aspect-[9/16] max-w-[380px]")} />
        ) : (
          <div className={clsx("flex flex-col items-center justify-center gap-3 rounded-lg bg-gray-800 text-sm text-gray-300", ar === "16:9" ? "aspect-video w-full" : "aspect-[9/16] w-full max-w-[340px]")}>
            {asset.render?.status === "failed" ? <AlertTriangle className="h-6 w-6 text-brand-500" /> : <Loader2 className="h-6 w-6 animate-spin text-brand-500" />}
            {asset.render?.status === "failed" ? "Rendering failed" : asset.fromAudio ? "Rendering audiogram…" : "Rendering clip…"}
          </div>
        )}
      </Card>
    );
  }
  if (asset.category === "graphic") {
    return (
      <Card className="flex justify-center bg-gray-100 p-4 sm:p-8">
        <div className={clsx("w-full shadow-pop", draft.content.size === "story" ? "max-w-[340px]" : draft.content.size === "landscape" ? "max-w-full" : "max-w-[520px]")}>
          <GraphicCanvas settings={draft.content} canvasRef={canvasRef} />
        </div>
      </Card>
    );
  }
  if (asset.category === "audio") {
    return (
      <Card className="p-8">
        <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-100 text-brand-700"><Mic2 className="h-5 w-5" /></div>
        <h2 className="text-2xl font-semibold tracking-tight text-fg">{asset.title}</h2>
        <p className="mt-1 text-sm text-gray-500">MP3 · 128 kbps · loudness-normalised (-16 LUFS) · {fmtDuration(asset.durationSec)}</p>
        {media.url ? <audio src={media.url} controls className="mt-6 w-full" /> : <p className="mt-6 inline-flex items-center gap-2 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Preparing audio…</p>}
      </Card>
    );
  }
  return <WrittenPreview asset={asset} c={draft.content} />;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function WrittenPreview({ asset, c }: { asset: Asset; c: any }) {
  return (
    <Card className="p-6 sm:p-10">
      <article className="mx-auto max-w-prose">
        <div className="mb-3 text-xs font-medium uppercase tracking-[0.06em] text-brand-700">{ASSET_TYPE[asset.type].label}</div>
        {asset.type === "captions" ? (
          <div className="space-y-5">
            {Object.entries(c.platforms || {}).map(([p, t]) => (
              <div key={p} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                <div className="mb-2 text-xs font-semibold text-fg">{platformLabel(p)}</div>
                <p className="whitespace-pre-wrap text-[0.9375rem] leading-relaxed text-gray-800">{String(t)}</p>
              </div>
            ))}
          </div>
        ) : (
          <>
            <h2 className="font-semibold tracking-tight text-3xl leading-tight text-fg">{c.title}</h2>
            {asset.type === "devotional" && (
              <>
                <p className="mt-3 font-medium text-brand-700">{c.scripture}</p>
                <p className="mt-5 whitespace-pre-wrap text-[1rem] leading-[1.75] text-gray-800">{c.reflection}</p>
                <h3 className="mt-7 font-semibold tracking-tight text-xl text-fg">Apply it</h3>
                <p className="mt-2 whitespace-pre-wrap leading-[1.75] text-gray-800">{c.application}</p>
                <h3 className="mt-7 font-semibold tracking-tight text-xl text-fg">Prayer</h3>
                <p className="mt-2 whitespace-pre-wrap italic leading-[1.75] text-gray-800">{c.prayer}</p>
              </>
            )}
            {asset.type === "summary" && (
              <>
                <p className="mt-3 text-[0.9375rem] font-medium text-fg">{c.mainTheme}</p>
                <p className="mt-5 whitespace-pre-wrap text-[1rem] leading-[1.75] text-gray-800">{c.body}</p>
                <h3 className="mt-7 font-semibold tracking-tight text-xl text-fg">Key points</h3>
                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-gray-800">{(c.keyPoints || []).map((k: string, i: number) => <li key={i}>{k}</li>)}</ul>
                {!!c.scriptureReferences?.length && <p className="mt-6 text-sm text-fg-muted">Scripture: {c.scriptureReferences.join(", ")}</p>}
              </>
            )}
            {asset.type === "article" && (
              <>
                <p className="mt-5 whitespace-pre-wrap text-[1.0625rem] leading-[1.75] text-gray-800">{c.introduction}</p>
                {(c.sections || []).map((s: { heading: string; body: string }, i: number) => (
                  <section key={i}>
                    <h3 className="mt-8 font-semibold tracking-tight text-2xl text-fg">{s.heading}</h3>
                    <p className="mt-2 whitespace-pre-wrap leading-[1.75] text-gray-800">{s.body}</p>
                  </section>
                ))}
                <h3 className="mt-8 font-semibold tracking-tight text-2xl text-fg">Putting it into practice</h3>
                <p className="mt-2 whitespace-pre-wrap leading-[1.75] text-gray-800">{c.application}</p>
                <p className="mt-6 whitespace-pre-wrap leading-[1.75] text-gray-800">{c.conclusion}</p>
                {!!c.scriptureReferences?.length && <p className="mt-6 text-sm text-fg-muted">Scripture: {c.scriptureReferences.join(", ")}</p>}
              </>
            )}
          </>
        )}
      </article>
    </Card>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Draft = { title: string; content: any; source?: { start: number; end: number } };

function Editor({ asset, draft, setDraft, sermon }: { asset: Asset; draft: Draft; setDraft: (d: Draft) => void; sermon: Sermon | null }) {
  const c = draft.content;
  const setC = (patch: Record<string, unknown>) => setDraft({ ...draft, content: { ...c, ...patch } });
  const brandAccent = useChurch().church?.brand?.accent;

  if (asset.type === "video") {
    const src = draft.source || { start: 0, end: 0 };
    const max = sermon?.durationSec || src.end + 60;
    const nudge = (k: "start" | "end", d: number) => {
      const v = Math.max(0, Math.min(max, +(src[k] + d).toFixed(2)));
      setDraft({ ...draft, source: { ...src, [k]: v } });
    };
    return (
      <>
        <Textarea label="Social caption" value={c.socialCaption || ""} onChange={(e) => setC({ socialCaption: e.target.value })} rows={3} />
        <div>
          <span className="label">Clip timing</span>
          <div className="grid grid-cols-2 gap-3">
            {(["start", "end"] as const).map((k) => (
              <div key={k} className="rounded-lg border border-gray-200 p-2.5">
                <div className="mb-1 text-xs capitalize text-gray-500">{k}</div>
                <div className="flex items-center justify-between gap-1">
                  <button type="button" className="rounded p-1 hover:bg-gray-100" onClick={() => nudge(k, -1)} aria-label={`Move ${k} earlier by 1 second`}><Minus className="h-4 w-4" /></button>
                  <span className="font-mono text-sm text-fg">{fmtClock(src[k])}</span>
                  <button type="button" className="rounded p-1 hover:bg-gray-100" onClick={() => nudge(k, 1)} aria-label={`Move ${k} later by 1 second`}><Plus className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
          </div>
          <p className="hint">Clip length {fmtDuration(src.end - src.start)}. Changing timing re-renders the clip and re-times captions.</p>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Select label="Aspect ratio" value={c.aspectRatio} onChange={(e) => setC({ aspectRatio: e.target.value })}>
            <option value="9:16">Vertical 9:16</option>
            <option value="1:1">Square 1:1</option>
            <option value="16:9">Landscape 16:9</option>
          </Select>
          <Select label="Caption style" value={c.captionStyle} onChange={(e) => setC({ captionStyle: e.target.value })}>
            <option value="clean">Clean</option>
            <option value="bold">Bold</option>
            <option value="boxed">Boxed</option>
            <option value="none">No captions</option>
          </Select>
          <Select label="Logo" value={c.logoPosition} onChange={(e) => setC({ logoPosition: e.target.value })}>
            <option value="top-right">Top right</option>
            <option value="top-left">Top left</option>
            <option value="bottom-right">Bottom right</option>
            <option value="bottom-left">Bottom left</option>
            <option value="none">Hidden</option>
          </Select>
        </div>
        <details className="rounded-lg border border-gray-200">
          <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium text-fg">Edit on-screen captions ({(c.cues || []).length})</summary>
          <ol className="max-h-80 space-y-2 overflow-y-auto border-t border-gray-200 p-3">
            {(c.cues || []).map((cue: Cue, i: number) => (
              <li key={i} className="flex items-center gap-2">
                <span className="w-12 shrink-0 font-mono text-[0.6875rem] text-gray-500">{fmtClock(cue.start)}</span>
                <input
                  className="field py-1.5"
                  aria-label={`Caption at ${fmtClock(cue.start)}`}
                  value={cue.text}
                  onChange={(e) => setC({ cues: c.cues.map((x: Cue, j: number) => (j === i ? { ...x, text: e.target.value } : x)) })}
                />
              </li>
            ))}
          </ol>
        </details>
      </>
    );
  }

  if (asset.type === "graphic") {
    return (
      <>
        <Textarea label="Quote text" value={c.quote} onChange={(e) => setC({ quote: e.target.value })} rows={4} hint="Keep the preacher's exact words. Edited quotes are flagged if they no longer match the transcript." />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Attribution" value={c.attribution || ""} onChange={(e) => setC({ attribution: e.target.value })} />
          <Input label="Scripture reference" value={c.scripture || ""} onChange={(e) => setC({ scripture: e.target.value })} />
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="label mb-0">Design</span>
            {TEMPLATES[c.template]?.art && (
              <button type="button" className="inline-flex items-center gap-1.5 text-xs font-medium text-fg hover:text-brand-600" onClick={() => setC({ artSeed: Math.floor(Math.random() * 1e9) })}>
                <Shuffle className="h-3.5 w-3.5" />New variation
              </button>
            )}
          </div>
          {(["art", "plain"] as const).map((g) => (
            <div key={g} className="mb-3">
              <div className="mb-1.5 text-xs text-fg-muted">{g === "art" ? "Artwork" : "Plain"}</div>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                {Object.entries(TEMPLATES).filter(([, t]) => t.group === g).map(([id, t]) => (
                  <button key={id} type="button" onClick={() => setC({ template: id })} className="group text-center" aria-label={t.label} aria-pressed={c.template === id}>
                    <TemplateSwatch id={id} accent={brandAccent} selected={c.template === id} />
                    <span className={clsx("mt-1 block truncate text-[0.6875rem]", c.template === id ? "font-semibold text-fg" : "text-fg-muted")}>{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Select label="Size" value={c.size} onChange={(e) => setC({ size: e.target.value })}>
            {Object.entries(GRAPHIC_SIZES).map(([id, s]) => <option key={id} value={id}>{s.label}</option>)}
          </Select>
          <Select label="Alignment" value={c.align} onChange={(e) => setC({ align: e.target.value })}>
            <option value="center">Centre</option>
            <option value="left">Left</option>
          </Select>
          <Select label="Logo" value={c.logoPosition} onChange={(e) => setC({ logoPosition: e.target.value })}>
            <option value="bottom">Bottom</option>
            <option value="top">Top</option>
            <option value="none">Hidden</option>
          </Select>
        </div>
      </>
    );
  }

  if (asset.type === "devotional") {
    return (
      <>
        <Input label="Scripture" value={c.scripture || ""} onChange={(e) => setC({ scripture: e.target.value })} />
        <Textarea label="Reflection" value={c.reflection || ""} onChange={(e) => setC({ reflection: e.target.value })} rows={8} />
        <Textarea label="Practical application" value={c.application || ""} onChange={(e) => setC({ application: e.target.value })} rows={3} />
        <Textarea label="Prayer" value={c.prayer || ""} onChange={(e) => setC({ prayer: e.target.value })} rows={3} />
      </>
    );
  }

  if (asset.type === "summary") {
    return (
      <>
        <Input label="Main theme" value={c.mainTheme || ""} onChange={(e) => setC({ mainTheme: e.target.value })} />
        <Textarea label="Summary" value={c.body || ""} onChange={(e) => setC({ body: e.target.value })} rows={7} />
        <Textarea label="Key points (one per line)" value={(c.keyPoints || []).join("\n")} onChange={(e) => setC({ keyPoints: e.target.value.split("\n") })} rows={4} />
        <Input label="Scripture references (comma separated)" value={(c.scriptureReferences || []).join(", ")} onChange={(e) => setC({ scriptureReferences: e.target.value.split(",").map((x) => x.trim()) })} />
      </>
    );
  }

  if (asset.type === "article") {
    return (
      <>
        <Textarea label="Introduction" value={c.introduction || ""} onChange={(e) => setC({ introduction: e.target.value })} rows={4} />
        {(c.sections || []).map((s: { heading: string; body: string }, i: number) => (
          <div key={i} className="space-y-2 rounded-lg border border-gray-200 p-3">
            <Input label={`Section ${i + 1} heading`} value={s.heading} onChange={(e) => setC({ sections: c.sections.map((x: object, j: number) => (j === i ? { ...x, heading: e.target.value } : x)) })} />
            <Textarea aria-label={`Section ${i + 1} body`} value={s.body} onChange={(e) => setC({ sections: c.sections.map((x: object, j: number) => (j === i ? { ...x, body: e.target.value } : x)) })} rows={5} />
          </div>
        ))}
        <Textarea label="Practical application" value={c.application || ""} onChange={(e) => setC({ application: e.target.value })} rows={3} />
        <Textarea label="Conclusion" value={c.conclusion || ""} onChange={(e) => setC({ conclusion: e.target.value })} rows={3} />
        <Input label="Scripture references (comma separated)" value={(c.scriptureReferences || []).join(", ")} onChange={(e) => setC({ scriptureReferences: e.target.value.split(",").map((x) => x.trim()) })} />
      </>
    );
  }

  if (asset.type === "captions") {
    return (
      <>
        {Object.entries(c.platforms || {}).map(([p, t]) => (
          <Textarea key={p} label={platformLabel(p)} value={String(t)} onChange={(e) => setC({ platforms: { ...c.platforms, [p]: e.target.value } })} rows={4} hint={`${String(t).length} characters`} />
        ))}
      </>
    );
  }

  if (asset.type === "audio") {
    return <Textarea label="Show notes" value={c.showNotes || ""} onChange={(e) => setC({ showNotes: e.target.value })} rows={6} hint="Used when you publish the episode to your podcast host." />;
  }
  return null;
}

function HistoryPanel({ versions, revisions, current }: { versions: AssetVersion[]; revisions: Revision[]; current: number }) {
  return (
    <Card className="divide-y divide-gray-200">
      {versions.length === 0 && <p className="p-5 text-sm text-fg-muted">No history yet.</p>}
      {versions.map((v) => {
        const rev = revisions.find((r) => r.newVersion === v.version);
        return (
          <div key={v.id} className="px-5 py-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-gray-500" />
                <span className="text-sm font-semibold text-fg">Version {v.version}</span>
                {v.version === current && <span className="rounded bg-gray-100 px-1.5 text-[0.6875rem] font-medium text-fg">Current</span>}
                {v.approvedByName && <span className="rounded bg-brand-100 px-1.5 text-[0.6875rem] font-medium text-fg">Approved by {v.approvedByName}</span>}
              </div>
              <time className="text-xs text-gray-500">{fmtRelative(v.createdAt)}</time>
            </div>
            <p className="mt-1 text-sm text-fg-muted">{v.reason}{v.createdByName ? ` · ${v.createdByName}` : ""}</p>
            {rev && (
              <p className="mt-1 text-xs text-gray-500">
                Requested: {rev.reasons.map((r) => r.replace(/_/g, " ")).join(", ")}{rev.instructions ? ` — “${rev.instructions}”` : ""}
              </p>
            )}
            {v.media?.path && <VersionMedia path={v.media.path} />}
          </div>
        );
      })}
      {revisions.filter((r) => r.status === "failed" || r.status === "pending").map((r) => (
        <div key={r.id} className="px-5 py-3 text-xs text-fg-muted">
          Revision from v{r.fromVersion}: {r.status === "pending" ? "in progress…" : `failed — ${r.error}`}
        </div>
      ))}
    </Card>
  );
}

function VersionMedia({ path }: { path: string }) {
  const { url } = useStorageUrl(path);
  if (!url) return null;
  return <a href={url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs font-medium text-fg underline underline-offset-2">Open this version's file</a>;
}

function TemplateSwatch({ id, accent, selected }: { id: string; accent?: string; selected: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    cv.width = 160;
    cv.height = 160;
    const ctx = cv.getContext("2d")!;
    const t = TEMPLATES[id];
    drawBackground(ctx, 160, 160, id, t.accent === "#2ECBBE" && accent ? accent : t.accent, 7);
    ctx.fillStyle = t.fg;
    ctx.font = '700 64px "Archivo Variable", Archivo, sans-serif';
    ctx.textAlign = "center";
    ctx.fillText("“", 80, 112);
  }, [id, accent]);
  return <canvas ref={ref} className={clsx("aspect-square w-full rounded-lg ring-1 ring-black/10 transition", selected ? "outline outline-2 outline-offset-2 outline-brand-500" : "group-hover:ring-black/30")} />;
}
