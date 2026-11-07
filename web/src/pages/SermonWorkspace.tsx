import { useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { ref, uploadBytesResumable } from "firebase/storage";
import clsx from "clsx";
import { ArrowLeft, CheckCircle2, Circle, Download, Loader2, Pencil, RotateCcw, Sparkles, Trash2, XCircle, LayoutGrid, Search, Quote, FileText, MinusCircle, UploadCloud , CheckCheck } from "lucide-react";
import { useChurch } from "../context/ChurchContext";
import { db, storage } from "../lib/firebase";
import { useDocData, useStorageUrl } from "../lib/hooks";
import { api } from "../lib/api";
import { CONTENT_TYPE_OPTIONS, STAGE_LABELS, EXT_MIME } from "../lib/constants";
import { errMessage, fmtBytes, fmtClock, fmtDuration, fmtServiceDate } from "../lib/format";
import { parseTranscript } from "../lib/transcriptImport";
import type { Segment, Sermon, StageName, Transcript } from "../lib/types";
import { useFlags } from "../lib/flags";
import { openFlagCount } from "../components/SourceReview";
import { VIDEO_STYLES, VIDEO_STYLE_IDS, VideoStyleId } from "../components/VideoStylePicker";
import type { Asset } from "../lib/types";
import { Button, Card, Checkbox, EmptyState, Input, Modal, Notice, PageLoading, Tabs, Textarea, useToast } from "../components/ui";
import { SermonStatusBadge } from "../components/bits";
import { AssetCard } from "../components/AssetCard";

type Tab = "overview" | "transcript" | "summary" | "content" | "history";
const STAGES: StageName[] = ["probe", "transcribe", "analyse", "generate", "render"];

export default function SermonWorkspace() {
  const { sermonId = "" } = useParams();
  const { churchId, assets, can } = useChurch();
  const toast = useToast();
  const navigate = useNavigate();
  const sermonQ = useDocData<Sermon>(`churches/${churchId}/sermons/${sermonId}`);
  const transcriptQ = useDocData<Transcript>(`churches/${churchId}/transcripts/${sermonId}`);
  const sermon = sermonQ.data;
  const mediaUrl = useStorageUrl(sermon?.media?.path && sermon.status !== "uploading" ? sermon.media.path : null);
  const [tab, setTab] = useState<Tab>("overview");
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const playerRef = useRef<HTMLVideoElement & HTMLAudioElement>(null);
  const flags = useFlags();
  const sermonAssets = useMemo(() => assets.filter((a) => a.sermonId === sermonId), [assets, sermonId]);

  if (sermonQ.loading) return <PageLoading />;
  if (!sermon) {
    return (
      <EmptyState title="Sermon not found" action={<Button onClick={() => navigate("/sermons")}>Back to sermons</Button>}>
        It may have been deleted, or you may not have access to it.
      </EmptyState>
    );
  }

  const processing = ["queued", "processing"].includes(sermon.status);
  const renderStarted = sermon.processing?.stages?.render?.startedAt?.toMillis?.() ?? 0;
  const rendersStalled = sermon.status === "processing" && sermon.processing?.stages?.render?.status === "running" && renderStarted > 0 && Date.now() - renderStarted > 15 * 60 * 1000;
  const stopped = ["failed", "needs_configuration"].includes(sermon.status);

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

  function seek(t: number) {
    if (playerRef.current) {
      playerRef.current.currentTime = t;
      playerRef.current.play().catch(() => undefined);
      setTab("overview");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  const isVideo = sermon.media?.hasVideo ?? sermon.media?.kind === "video";

  return (
    <>
      <Link to="/sermons" className="mb-5 inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg"><ArrowLeft className="h-4 w-4" /> Sermons</Link>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2"><SermonStatusBadge status={sermon.status} /></div>
          <h1 className="h-page">{sermon.title}</h1>
          <p className="mt-2 text-sm text-fg-muted">
            {sermon.preacher || "—"} · {fmtServiceDate(sermon.serviceDate)} · {fmtDuration(sermon.durationSec)}
            {sermon.scripture ? ` · ${sermon.scripture}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can("contributor") && <Button variant="secondary" size="sm" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditOpen(true)}>Edit details</Button>}
          {sermonAssets.length > 0 && <Button variant="secondary" size="sm" icon={<LayoutGrid className="h-4 w-4" />} onClick={() => navigate(`/studio?sermon=${sermon.id}`)}>Open in Content</Button>}
          {can("contributor") && ["ready", "published"].includes(sermon.status) && <Button variant="secondary" size="sm" icon={<Sparkles className="h-4 w-4" />} onClick={() => setMoreOpen(true)}>Generate more</Button>}
          {mediaUrl.url && <a href={mediaUrl.url} download={sermon.media?.fileName} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-[0.8125rem] font-medium text-fg hover:bg-gray-50"><Download className="h-4 w-4" />Original</a>}
          {can("editor") && <Button variant="ghost" size="sm" icon={<Trash2 className="h-4 w-4" />} onClick={() => setDeleteOpen(true)} aria-label="Delete sermon">Delete</Button>}
        </div>
      </div>

      {sermon.status === "uploading" && <ResumeUpload sermon={sermon} churchId={churchId} />}

      {rendersStalled && can("contributor") && (
        <div className="mb-6">
          <Notice
            tone="warn"
            title="Rendering is taking longer than expected"
            action={<div className="flex flex-wrap gap-2"><Button size="sm" icon={<RotateCcw className="h-4 w-4" />} loading={busy === "resume"} onClick={() => run("resume", () => api.retryProcessing({ churchId, sermonId }), "Rendering resumed")}>Resume rendering</Button><Button size="sm" variant="secondary" loading={busy === "skip"} onClick={() => run("skip", () => api.skipRemainingRenders({ churchId, sermonId }), "Remaining clips skipped")}>Skip remaining clips</Button></div>}
          >
            Some clips seem to have stalled. Resume to pick up where it left off, or skip the unfinished clips — finished clips are kept either way.
          </Notice>
        </div>
      )}

      {stopped && (
        <div className="mb-6">
          <Notice
            tone={sermon.status === "failed" ? "error" : "warn"}
            title={sermon.status === "failed" ? "Processing stopped" : "An integration needs setting up"}
            action={can("contributor") && <Button size="sm" icon={<RotateCcw className="h-4 w-4" />} loading={busy === "retry"} onClick={() => run("retry", () => api.retryProcessing({ churchId, sermonId }), "Processing restarted")}>Retry</Button>}
          >
            {sermon.processing?.error || "Something went wrong while processing this sermon."}
            {sermon.processing?.failedStage === "transcribe" && can("contributor") && <ImportTranscriptInline churchId={churchId} sermonId={sermonId} />}
          </Notice>
        </div>
      )}

      <Tabs
        className="mb-6"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "transcript", label: "Transcript" },
          { id: "summary", label: "Summary" },
          { id: "content", label: "Generated content", count: sermonAssets.length },
          { id: "history", label: "Processing history" },
        ]}
      />

      <div className={clsx(tab !== "overview" && "hidden")}>
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Card className="overflow-hidden">
            {mediaUrl.url ? (
              isVideo ? (
                <video ref={playerRef} src={mediaUrl.url} controls preload="metadata" className="aspect-video w-full bg-gray-950" />
              ) : (
                <div className="border-b border-gray-200 bg-gray-50 p-6"><audio ref={playerRef} src={mediaUrl.url} controls preload="metadata" className="w-full" /></div>
              )
            ) : (
              <div className="flex aspect-video items-center justify-center bg-gray-100 text-sm text-fg-muted">{sermon.status === "uploading" ? "Recording not uploaded yet" : "Loading recording…"}</div>
            )}
            <div className="grid grid-cols-2 gap-4 p-5 text-sm sm:grid-cols-4">
              <div><div className="text-xs text-gray-500">Preacher</div><div className="font-medium text-fg">{sermon.preacher || "—"}</div></div>
              <div><div className="text-xs text-gray-500">Service date</div><div className="font-medium text-fg">{fmtServiceDate(sermon.serviceDate)}</div></div>
              <div><div className="text-xs text-gray-500">Duration</div><div className="font-medium text-fg">{fmtDuration(sermon.durationSec)}</div></div>
              <div><div className="text-xs text-gray-500">File</div><div className="truncate font-medium text-fg">{sermon.media?.size ? fmtBytes(sermon.media.size) : "—"}</div></div>
            </div>
            {sermon.description && <p className="border-t border-gray-200 px-5 py-4 text-sm text-fg-muted">{sermon.description}</p>}
          </Card>

          <Card className="p-5">
            <h2 className="h-section mb-4">Processing</h2>
            <ol className="space-y-3">
              {STAGES.map((st) => {
                const s = sermon.processing?.stages?.[st];
                const status = s?.status || (sermon.status === "uploading" ? "pending" : "pending");
                return (
                  <li key={st} className="flex items-start gap-3">
                    {status === "done" ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-gray-500" /> : status === "running" ? <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-fg" /> : status === "failed" ? <XCircle className="mt-0.5 h-5 w-5 text-red-500" /> : status === "skipped" ? <MinusCircle className="mt-0.5 h-5 w-5 text-gray-300" /> : <Circle className="mt-0.5 h-5 w-5 text-gray-300" />}
                    <div className="min-w-0">
                      <div className={clsx("text-sm font-medium", status === "pending" ? "text-gray-500" : "text-fg")}>{STAGE_LABELS[st]}</div>
                      {st === "render" && status === "running" && !!sermon.processing?.pendingRenders && (
                        <div className="flex flex-wrap items-center gap-2 text-xs text-fg-muted">
                          {sermon.processing.pendingRenders} remaining
                          {can("contributor") && <button type="button" className="font-medium text-fg underline underline-offset-2 hover:text-brand-600 disabled:opacity-50" disabled={busy === "skip"} onClick={() => run("skip", () => api.skipRemainingRenders({ churchId, sermonId }), "Remaining clips skipped")}>Skip the rest</button>}
                        </div>
                      )}
                      {s?.error && <div className="text-xs text-red-600">{s.error}</div>}
                    </div>
                  </li>
                );
              })}
            </ol>
            {processing && <p className="mt-5 rounded-lg bg-gray-50 px-3 py-2 text-xs text-fg">You can leave this page. We'll notify you when content is ready.</p>}
            {sermon.status === "ready" && sermonAssets.length > 0 && (
              <Button className="mt-5 w-full" onClick={() => navigate(`/studio?sermon=${sermon.id}&status=needs_review`)}>Review content</Button>
            )}
          </Card>
        </div>
      </div>

      {tab === "transcript" && <TranscriptPanel churchId={churchId} sermon={sermon} transcript={transcriptQ.data} loading={transcriptQ.loading} onSeek={seek} canEdit={can("contributor")} />}
      {tab === "summary" && <SummaryPanel sermon={sermon} onSeek={seek} />}
      {tab === "content" && (
        sermonAssets.length ? (
          <>
            <ContentBoard churchId={churchId} assets={sermonAssets} showStyleBar={flags.videoStyles && can("contributor")} />
          </>
        ) : (
          <EmptyState title="No content yet">{processing ? "Content will appear here as it is generated." : "Nothing has been generated from this sermon yet."}</EmptyState>
        )
      )}
      {tab === "history" && (
        <Card className="divide-y divide-gray-200">
          {(sermon.processing?.history || []).length === 0 ? (
            <p className="p-5 text-sm text-fg-muted">No processing activity yet.</p>
          ) : (
            [...(sermon.processing?.history || [])].reverse().map((h, i) => (
              <div key={i} className="flex gap-3 px-5 py-3 text-sm">
                <span className={clsx("mt-1.5 h-2 w-2 shrink-0 rounded-full", h.level === "error" ? "bg-red-500" : "bg-gray-400")} />
                <div className="min-w-0 flex-1 text-gray-800">{h.message}</div>
                <time className="shrink-0 text-xs text-gray-500">{new Date(h.at).toLocaleString()}</time>
              </div>
            ))
          )}
        </Card>
      )}

      <EditSermonModal open={editOpen} onClose={() => setEditOpen(false)} sermon={sermon} churchId={churchId} />
      <GenerateMoreModal open={moreOpen} onClose={() => setMoreOpen(false)} churchId={churchId} sermonId={sermonId} />
      <Modal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete this sermon?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button
              variant="danger"
              loading={busy === "delete"}
              onClick={() =>
                run("delete", async () => {
                  await api.deleteSermon({ churchId, sermonId });
                  navigate("/sermons", { replace: true });
                }, "Sermon deleted")
              }
            >
              Delete sermon
            </Button>
          </>
        }
      >
        <p className="text-sm text-gray-800">This permanently deletes “{sermon.title}”, its original recording and transcript.</p>
        {sermonAssets.length > 0 && (
          <Notice tone="warn">
            {sermonAssets.length} generated asset{sermonAssets.length === 1 ? "" : "s"} — including any scheduled or published records — will also be deleted. Content already posted on other platforms is not affected.
          </Notice>
        )}
      </Modal>
    </>
  );
}

function ResumeUpload({ sermon, churchId }: { sermon: Sermon; churchId: string }) {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function go(file?: File | null) {
    if (!file) return;
    setError(null);
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    const contentType = EXT_MIME[ext] || file.type;
    if (!EXT_MIME[ext]) return setError("That file type isn't supported.");
    const path = `churches/${churchId}/sermons/${sermon.id}/original.${ext}`;
    try {
      const task = uploadBytesResumable(ref(storage, path), file, { contentType });
      await new Promise<void>((res, rej) => task.on("state_changed", (s) => setProgress(s.bytesTransferred / s.totalBytes), rej, () => res()));
      await updateDoc(doc(db, "churches", churchId, "sermons", sermon.id), {
        media: { path, fileName: file.name, contentType, size: file.size, kind: contentType.startsWith("video") ? "video" : "audio" },
        uploadError: null,
        updatedAt: serverTimestamp(),
      });
      await api.startProcessing({ churchId, sermonId: sermon.id });
    } catch (e) {
      setError(errMessage(e));
      setProgress(null);
    }
  }
  return (
    <div className="mb-6">
      <Notice
        tone="warn"
        title="The recording hasn't finished uploading"
        action={
          <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg bg-brand-500 px-3 text-[0.8125rem] font-medium text-white hover:bg-brand-600">
            <UploadCloud className="h-4 w-4" /> {progress !== null ? `${Math.round(progress * 100)}%` : "Upload recording"}
            <input type="file" className="sr-only" accept="audio/*,video/*" onChange={(e) => go(e.target.files?.[0])} disabled={progress !== null} />
          </label>
        }
      >
        {error || sermon.uploadError || "Choose the recording again to finish the upload and start processing."}
      </Notice>
    </div>
  );
}

function ImportTranscriptInline({ churchId, sermonId }: { churchId: string; sermonId: string }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 font-medium underline underline-offset-4">
      <FileText className="h-4 w-4" /> {busy ? "Importing…" : "Import a transcript file instead (.txt, .srt, .vtt)"}
      <input
        type="file"
        accept=".txt,.srt,.vtt"
        className="sr-only"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          setBusy(true);
          try {
            const parsed = parseTranscript(f.name, await f.text());
            await api.importTranscript({ churchId, sermonId, segments: parsed.segments, hasTimestamps: parsed.hasTimestamps });
            await api.retryProcessing({ churchId, sermonId });
            toast("Transcript imported — processing continues");
          } catch (err) {
            toast(errMessage(err), "error");
          } finally {
            setBusy(false);
          }
        }}
      />
    </label>
  );
}

function TranscriptPanel({ churchId, sermon, transcript, loading, onSeek, canEdit }: { churchId: string; sermon: Sermon; transcript: (Transcript & { id: string }) | null; loading: boolean; onSeek: (t: number) => void; canEdit: boolean }) {
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [quoteFor, setQuoteFor] = useState<Segment | null>(null);
  const toast = useToast();
  const navigate = useNavigate();
  if (loading) return <PageLoading />;
  if (!transcript) return <EmptyState title="No transcript yet">{["queued", "processing"].includes(sermon.status) ? "The transcript will appear here once transcription finishes." : "This sermon doesn't have a transcript."}</EmptyState>;
  const term = q.trim().toLowerCase();
  const segs = term ? transcript.segments.filter((s) => s.text.toLowerCase().includes(term)) : transcript.segments;

  async function save(i: number) {
    const segments = transcript!.segments.map((s) => (s.i === i ? { ...s, text: draft.trim() } : s));
    try {
      await updateDoc(doc(db, "churches", churchId, "transcripts", sermon.id), {
        segments,
        searchText: segments.map((s) => s.text).join(" ").toLowerCase().slice(0, 600000),
        updatedAt: serverTimestamp(),
      });
      setEditing(null);
      toast("Transcript corrected");
    } catch (e) {
      toast(errMessage(e), "error");
    }
  }

  const highlight = (text: string) => {
    if (!term) return text;
    const parts = text.split(new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "ig"));
    return parts.map((p, k) => (p.toLowerCase() === term ? <mark key={k} className="rounded bg-brand-100 px-0.5 text-fg">{p}</mark> : p));
  };

  return (
    <Card>
      <div className="flex flex-col gap-3 border-b border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:w-80">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input className="field pl-9" placeholder="Search within transcript" aria-label="Search within transcript" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <p className="text-xs text-gray-500">
          {term ? `${segs.length} matching segment${segs.length === 1 ? "" : "s"}` : `${transcript.segments.length} segments`} · {transcript.source === "import" ? "Imported transcript" : "Automatic transcript"}
          {!transcript.hasTimestamps && " · no timestamps"}
        </p>
      </div>
      <ol className="max-h-[70vh] divide-y divide-gray-100 overflow-y-auto">
        {segs.map((s) => (
          <li key={s.i} className="group flex gap-4 px-4 py-3 hover:bg-gray-50">
            {transcript.hasTimestamps ? (
              <button onClick={() => onSeek(s.start)} className="w-14 shrink-0 pt-0.5 text-left font-mono text-xs text-brand-700 hover:text-fg hover:underline" aria-label={`Play from ${fmtClock(s.start)}`}>{fmtDuration(s.start)}</button>
            ) : (
              <span className="w-14 shrink-0 pt-0.5 font-mono text-xs text-gray-500">#{s.i + 1}</span>
            )}
            <div className="min-w-0 flex-1">
              {editing === s.i ? (
                <div className="space-y-2">
                  <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} aria-label="Edit transcript segment" />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => save(s.i)} disabled={!draft.trim()}>Save correction</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <p className="text-[0.9375rem] leading-relaxed text-gray-800">{highlight(s.text)}</p>
              )}
            </div>
            {canEdit && editing !== s.i && (
              <div className="flex shrink-0 gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                <button className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-fg" onClick={() => { setEditing(s.i); setDraft(s.text); }} aria-label="Correct this segment" title="Correct transcript"><Pencil className="h-4 w-4" /></button>
                <button className="rounded p-1.5 text-gray-500 hover:bg-gray-100 hover:text-fg" onClick={() => setQuoteFor(s)} aria-label="Create quote graphic" title="Create quote graphic"><Quote className="h-4 w-4" /></button>
              </div>
            )}
          </li>
        ))}
      </ol>
      {quoteFor && (
        <QuoteFromSegment
          segment={quoteFor}
          onClose={() => setQuoteFor(null)}
          onCreate={async (text) => {
            const r = await api.createQuoteGraphic({ churchId, sermonId: sermon.id, text, segment: quoteFor.i });
            setQuoteFor(null);
            toast("Draft quote graphic created");
            navigate(`/studio/${r.assetId}`);
          }}
        />
      )}
    </Card>
  );
}

function QuoteFromSegment({ segment, onClose, onCreate }: { segment: Segment; onClose: () => void; onCreate: (t: string) => Promise<void> }) {
  const [text, setText] = useState(segment.text);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title="Create a quote graphic"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button loading={busy} onClick={async () => { setBusy(true); setErr(null); try { await onCreate(text); } catch (e) { setErr(errMessage(e)); } finally { setBusy(false); } }}>Create draft</Button>
        </>
      }
    >
      <Textarea label="Quote" value={text} onChange={(e) => setText(e.target.value)} rows={4} hint="Trim to the words you want — quotes must match the transcript word-for-word." />
      {err && <div className="mt-3"><Notice tone="error">{err}</Notice></div>}
    </Modal>
  );
}

function SummaryPanel({ sermon, onSeek }: { sermon: Sermon; onSeek: (t: number) => void }) {
  const s = sermon.summary;
  if (!s) return <EmptyState title="No summary yet">The sermon summary appears after the message has been analysed.</EmptyState>;
  const Section = ({ title, items }: { title: string; items?: string[] }) =>
    items?.length ? (
      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-[0.06em] text-gray-500">{title}</h3>
        <ul className="space-y-1.5">{items.map((x, i) => <li key={i} className="flex gap-2 text-[0.9375rem] leading-relaxed text-gray-800"><span className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-brand-500" />{x}</li>)}</ul>
      </div>
    ) : null;
  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <Card className="space-y-6 p-6">
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-[0.06em] text-gray-500">Main theme</h3>
          <p className="font-semibold tracking-tight text-2xl leading-snug text-fg">{s.mainTheme}</p>
        </div>
        <Section title="Key points" items={s.keyPoints} />
        <Section title="Practical applications" items={s.practicalApplications} />
        <Section title="Illustrations" items={s.illustrations} />
        {s.conclusion && <div><h3 className="mb-2 text-xs font-medium uppercase tracking-[0.06em] text-gray-500">Conclusion</h3><p className="text-[0.9375rem] leading-relaxed text-gray-800">{s.conclusion}</p></div>}
      </Card>
      <div className="space-y-6">
        <Card className="p-5">
          <h3 className="mb-3 text-xs font-medium uppercase tracking-[0.06em] text-gray-500">Scripture references</h3>
          {sermon.scriptureReferences?.length ? (
            <ul className="space-y-2.5">
              {sermon.scriptureReferences.map((r, i) => (
                <li key={i} className="text-sm">
                  <div className="flex items-center gap-2 font-medium text-fg">{r.reference}{!r.verified && <span className="rounded bg-brand-100 px-1.5 text-[0.6875rem] font-medium text-brand-700">check</span>}</div>
                  <div className="text-xs text-fg-muted">{r.context}</div>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-fg-muted">No scripture references were identified.</p>}
        </Card>
        <Card className="p-5">
          <h3 className="mb-3 text-xs font-medium uppercase tracking-[0.06em] text-gray-500">Important statements</h3>
          {s.importantStatements?.length ? (
            <ul className="space-y-3">
              {s.importantStatements.map((x, i) => (
                <li key={i} className="border-l-2 border-brand-500 pl-3 text-sm italic leading-relaxed text-gray-800">
                  “{x.text}”
                  {x.start !== null && <button onClick={() => onSeek(x.start!)} className="ml-1 font-mono text-xs not-italic text-brand-700 hover:underline">{fmtDuration(x.start)}</button>}
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-fg-muted">None identified.</p>}
        </Card>
        {!!s.uncertainties?.length && (
          <Notice tone="warn" title="Parts of the transcript were unclear">
            <ul className="mt-1 list-disc space-y-1 pl-4">{s.uncertainties.map((u, i) => <li key={i}>{u.note}{u.start !== null ? ` (${fmtDuration(u.start)})` : ""}</li>)}</ul>
          </Notice>
        )}
      </div>
    </div>
  );
}

function EditSermonModal({ open, onClose, sermon, churchId }: { open: boolean; onClose: () => void; sermon: Sermon; churchId: string }) {
  const [m, setM] = useState({ title: sermon.title, preacher: sermon.preacher || "", serviceDate: sermon.serviceDate, scripture: sermon.scripture || "", description: sermon.description || "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toast = useToast();
  async function save() {
    if (!m.title.trim()) return setErr("Title is required.");
    setBusy(true);
    try {
      await updateDoc(doc(db, "churches", churchId, "sermons", sermon.id), { ...m, title: m.title.trim(), updatedAt: serverTimestamp() });
      toast("Sermon details saved");
      onClose();
    } catch (e) {
      setErr(errMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Edit sermon details" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={save} loading={busy}>Save</Button></>}>
      <div className="space-y-4">
        {err && <Notice tone="error">{err}</Notice>}
        <Input label="Title" value={m.title} onChange={(e) => setM({ ...m, title: e.target.value })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Preacher" value={m.preacher} onChange={(e) => setM({ ...m, preacher: e.target.value })} />
          <Input label="Service date" type="date" value={m.serviceDate} onChange={(e) => setM({ ...m, serviceDate: e.target.value })} />
        </div>
        <Input label="Scripture reference" value={m.scripture} onChange={(e) => setM({ ...m, scripture: e.target.value })} />
        <Textarea label="Description" value={m.description} onChange={(e) => setM({ ...m, description: e.target.value })} rows={3} />
        <p className="text-xs text-gray-500">Changes apply to the sermon record. Content already generated keeps its current text until you edit it.</p>
      </div>
    </Modal>
  );
}

function GenerateMoreModal({ open, onClose, churchId, sermonId }: { open: boolean; onClose: () => void; churchId: string; sermonId: string }) {
  const [types, setTypes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const opts = CONTENT_TYPE_OPTIONS.filter((c) => c.id !== "audio");
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Generate additional content"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            loading={busy}
            disabled={!types.length}
            onClick={async () => {
              setBusy(true);
              try {
                await api.generateMoreContent({ churchId, sermonId, types });
                toast("Generating — we'll notify you when it's ready");
                onClose();
                setTypes([]);
              } catch (e) {
                toast(errMessage(e), "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            Generate
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-fg-muted">New content is added alongside what you already have and goes to review.</p>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {opts.map((o) => <Checkbox key={o.id} checked={types.includes(o.id)} onChange={(v) => setTypes(v ? [...types, o.id] : types.filter((t) => t !== o.id))} label={o.label} />)}
      </div>
    </Modal>
  );
}

/** One-click: give every clip from this sermon the same style and re-render them. */
function ApplyStyleBar({ churchId, clips }: { churchId: string; clips: Asset[] }) {
  const toast = useToast();
  const current = clips.length && clips.every((c) => c.content?.videoStyle === clips[0].content?.videoStyle) ? ((clips[0].content?.videoStyle as VideoStyleId) || null) : undefined;
  const [pick, setPick] = useState<VideoStyleId | null>(current ?? "bold");
  const [busy, setBusy] = useState(false);
  if (!clips.length) return null;
  const ready = clips.filter((c) => c.status !== "processing");
  const apply = async () => {
    setBusy(true);
    let done = 0;
    try {
      for (const a of ready) {
        if ((a.content?.videoStyle || null) === pick) continue;
        await api.updateAsset({ churchId, assetId: a.id, expectedVersion: a.version, patch: { content: pick ? { videoStyle: pick, hook: a.content?.hook ?? a.title, endCard: a.content?.endCard ?? true } : { videoStyle: null } } });
        done++;
      }
      toast(done ? `Re-rendering ${done} clip${done === 1 ? "" : "s"} in ${pick ? VIDEO_STYLES[pick].label : "Basic"}` : "All clips already use this style", "success");
    } catch (e) {
      toast(errMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl bg-white p-4 ring-1 ring-gray-200">
      <div className="min-w-0">
        <div className="text-[0.94rem] font-semibold text-fg">Clip style</div>
        <div className="text-xs text-fg-muted">{current === undefined ? "Clips use different styles" : `All clips: ${current ? VIDEO_STYLES[current].label : "Basic"}`}</div>
      </div>
      <div className="flex flex-1 flex-wrap gap-1.5">
        {[...VIDEO_STYLE_IDS, null].map((id) => (
          <button key={id ?? "none"} type="button" onClick={() => setPick(id)} aria-pressed={pick === id} className={clsx("rounded-full px-3 py-1.5 text-[0.8125rem] font-medium ring-1 transition", pick === id ? "bg-ink text-white ring-ink" : "bg-white text-fg ring-gray-200 hover:ring-gray-400")}>
            {id ? VIDEO_STYLES[id].label : "Basic"}
          </button>
        ))}
      </div>
      <Button size="sm" loading={busy} disabled={!ready.length || pick === current} onClick={apply}>
        Apply to {ready.length} clip{ready.length === 1 ? "" : "s"}
      </Button>
    </div>
  );
}

type Group = "all" | "media" | "quotes" | "written";
const GROUPS: { id: Group; label: string; match: (a: Asset) => boolean }[] = [
  { id: "all", label: "All", match: () => true },
  { id: "media", label: "Clips & Audio", match: (a) => a.category === "video" || a.category === "audio" },
  { id: "quotes", label: "Quote cards", match: (a) => a.category === "graphic" },
  { id: "written", label: "Written", match: (a) => a.category === "written" },
];

/** A sermon's generated content, grouped by format, with one-click approval of everything that's ready. */
export function ContentBoard({ churchId, assets, showStyleBar }: { churchId: string; assets: Asset[]; showStyleBar: boolean }) {
  const { can } = useChurch();
  const toast = useToast();
  const [group, setGroup] = useState<Group>("all");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const flagged = assets.filter((a) => a.status === "needs_review" && openFlagCount(a) > 0);
  const ready = assets.filter((a) => a.status === "needs_review" && !openFlagCount(a));
  const firstFlagged = flagged[0];
  const pending = assets.filter((a) => a.category === "video" && a.status === "processing" && a.render?.status !== "running").map((a) => a.id);
  const queuePos = (a: Asset) => Math.max(0, pending.indexOf(a.id)) + (assets.some((x) => x.render?.status === "running") ? 1 : 0);

  const approveAll = async () => {
    setBusy(true);
    try {
      const r = await api.approveAssets({ churchId, assetIds: ready.map((a) => a.id) });
      toast(`${r.approved.length} approved${r.skipped.length ? ` · ${r.skipped.length} skipped` : ""}`, "success");
      setConfirm(false);
    } catch (e) {
      toast(errMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };

  const section = (g: Group, title: string, grid: string) => {
    const list = assets.filter(GROUPS.find((x) => x.id === g)!.match);
    if (!list.length) return null;
    return (
      <section key={g} className="mb-8">
        {group === "all" && <h3 className="mb-3 text-[0.8125rem] font-semibold text-fg">{title} <span className="font-normal text-fg-muted">{list.length}</span></h3>}
        <div className={grid}>{list.map((a) => <AssetCard key={a.id} asset={a} hideSermon queuePos={queuePos(a)} />)}</div>
      </section>
    );
  };

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-gray-200">
        <div className="min-w-0 flex-1 text-sm">
          <span className="font-semibold text-fg">{assets.length} items generated</span>
          <span className="text-fg-muted">
            {ready.length ? ` · ${ready.length} ready to approve` : ""}
            {flagged.length ? ` · ${flagged.length} need${flagged.length === 1 ? "s" : ""} verification` : ""}
            {!ready.length && !flagged.length ? " · nothing waiting for review" : ""}
          </span>
        </div>
        {firstFlagged && <Link to={`/studio/${firstFlagged.id}`} className="inline-flex h-9 items-center rounded-full px-4 text-sm font-medium text-fg ring-1 ring-gray-200 hover:bg-gray-50">Review flagged</Link>}
        {can("editor") && ready.length > 0 && <Button size="sm" variant="accent" icon={<CheckCheck className="h-4 w-4" />} onClick={() => setConfirm(true)}>Approve {ready.length} ready</Button>}
      </div>

      <div role="tablist" aria-label="Format" className="mb-5 flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-gray-200/70 p-1">
        {GROUPS.map((g) => {
          const n = assets.filter(g.match).length;
          if (g.id !== "all" && !n) return null;
          return (
            <button key={g.id} role="tab" aria-selected={group === g.id} type="button" onClick={() => setGroup(g.id)} className={clsx("whitespace-nowrap rounded-full px-3.5 py-1.5 text-[0.8125rem] font-medium transition", group === g.id ? "bg-white text-fg shadow-card" : "text-fg-muted hover:text-fg")}>
              {g.label} <span className="tabular-nums text-fg-muted">{n}</span>
            </button>
          );
        })}
      </div>

      {showStyleBar && (group === "all" || group === "media") && <ApplyStyleBar churchId={churchId} clips={assets.filter((a) => a.type === "video")} />}
      {(group === "all" || group === "media") && section("media", "Clips & Audio", "grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4")}
      {(group === "all" || group === "quotes") && section("quotes", "Quote cards", "grid grid-cols-2 gap-4 lg:grid-cols-3")}
      {(group === "all" || group === "written") && section("written", "Written", "grid gap-4 md:grid-cols-2 xl:grid-cols-3")}

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title={`Approve ${ready.length} item${ready.length === 1 ? "" : "s"}?`}
        footer={<><Button variant="ghost" onClick={() => setConfirm(false)}>Cancel</Button><Button variant="accent" loading={busy} onClick={approveAll}>Approve {ready.length}</Button></>}
      >
        <p className="text-sm text-gray-800">Everything waiting for review that has no unchecked source points will be approved and become ready to schedule.</p>
        {flagged.length > 0 && <p className="mt-2 text-sm text-fg-muted">{flagged.length} item{flagged.length === 1 ? "" : "s"} with points to verify will stay in review.</p>}
      </Modal>
    </>
  );
}
