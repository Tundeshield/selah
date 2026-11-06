import { DragEvent, FormEvent, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { addDoc, collection, doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { ref, uploadBytesResumable, UploadTask } from "firebase/storage";
import clsx from "clsx";
import { format, previousSunday, isSunday } from "date-fns";
import { UploadCloud, FileAudio, FileVideo, X, RotateCcw, FileText } from "lucide-react";
import { useChurch } from "../context/ChurchContext";
import { useAuth } from "../context/AuthContext";
import { db, storage } from "../lib/firebase";
import { api } from "../lib/api";
import { EXT_MIME, SUPPORTED_UPLOAD } from "../lib/constants";
import { errMessage, fmtBytes, fmtDuration, titleFromFile } from "../lib/format";
import { parseTranscript, ParsedTranscript } from "../lib/transcriptImport";
import { useUnsavedWarning } from "../lib/hooks";
import { Button, Card, Input, Notice, PageHeader, Textarea } from "../components/ui";

type Phase = "select" | "uploading" | "starting" | "failed" | "cancelled";

function mimeFor(file: File) {
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (file.type && SUPPORTED_UPLOAD.mime.test(file.type)) return file.type;
  return EXT_MIME[ext] || file.type || "";
}

export default function UploadSermon() {
  const { churchId, church, integrations, can } = useChurch();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [drag, setDrag] = useState(false);
  const [meta, setMeta] = useState({
    title: "",
    preacher: church?.pastor || "",
    serviceDate: format(isSunday(new Date()) ? new Date() : previousSunday(new Date()), "yyyy-MM-dd"),
    scripture: "",
    description: "",
  });
  const [titleTouched, setTitleTouched] = useState(false);
  const [transcript, setTranscript] = useState<(ParsedTranscript & { name: string }) | null>(null);
  const [phase, setPhase] = useState<Phase>("select");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const taskRef = useRef<UploadTask | null>(null);
  const sermonIdRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useUnsavedWarning(phase === "uploading");
  useEffect(() => () => { taskRef.current?.cancel(); }, []);

  if (!can("contributor")) return <Notice tone="warn">You don't have permission to upload sermons.</Notice>;

  function pick(f?: File | null) {
    setFileError(null);
    setDuration(null);
    if (!f) return;
    const ext = f.name.split(".").pop()?.toLowerCase() || "";
    const mime = mimeFor(f);
    if (!SUPPORTED_UPLOAD.extensions.includes(ext) || !SUPPORTED_UPLOAD.mime.test(mime)) {
      setFile(null);
      return setFileError(`That file type isn't supported. Use ${SUPPORTED_UPLOAD.label}.`);
    }
    if (f.size > SUPPORTED_UPLOAD.maxBytes) {
      setFile(null);
      return setFileError("That file is larger than 2 GB. Export a smaller version and try again.");
    }
    if (f.size < 10 * 1024) {
      setFile(null);
      return setFileError("That file looks empty. Choose the full recording.");
    }
    setFile(f);
    if (!titleTouched) setMeta((m) => ({ ...m, title: titleFromFile(f.name) }));
    const url = URL.createObjectURL(f);
    const el = document.createElement(mime.startsWith("video") ? "video" : "audio");
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      if (isFinite(el.duration)) setDuration(el.duration);
      URL.revokeObjectURL(url);
    };
    el.onerror = () => URL.revokeObjectURL(url);
    el.src = url;
  }

  async function pickTranscript(f?: File | null) {
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) return setError("Transcript files must be smaller than 5 MB.");
    const parsed = parseTranscript(f.name, await f.text());
    if (!parsed.segments.length) return setError("We couldn't read any text from that transcript file.");
    setTranscript({ ...parsed, name: f.name });
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDrag(false);
    pick(e.dataTransfer.files?.[0]);
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!file || !user) return;
    if (!meta.title.trim()) return setError("Please give the sermon a title.");
    if (!meta.serviceDate) return setError("Please choose the service date.");
    setError(null);
    setPhase("uploading");
    setProgress(0);
    try {
      const ext = file.name.split(".").pop()!.toLowerCase();
      const contentType = mimeFor(file);
      let sermonId = sermonIdRef.current;
      if (!sermonId) {
        const docRef = await addDoc(collection(db, "churches", churchId, "sermons"), {
          title: meta.title.trim(),
          preacher: meta.preacher.trim(),
          serviceDate: meta.serviceDate,
          scripture: meta.scripture.trim(),
          description: meta.description.trim(),
          status: "uploading",
          media: { path: null, fileName: file.name, contentType, size: file.size, kind: contentType.startsWith("video") ? "video" : "audio" },
          durationSec: duration ? Math.round(duration) : null,
          createdBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        sermonId = docRef.id;
        sermonIdRef.current = sermonId;
      }
      const path = `churches/${churchId}/sermons/${sermonId}/original.${ext}`;
      const task = uploadBytesResumable(ref(storage, path), file, { contentType, customMetadata: { originalName: file.name } });
      taskRef.current = task;
      await new Promise<void>((resolve, reject) => {
        task.on("state_changed", (s) => setProgress(s.bytesTransferred / s.totalBytes), reject, () => resolve());
      });
      taskRef.current = null;
      setPhase("starting");
      await updateDoc(doc(db, "churches", churchId, "sermons", sermonId), {
        media: { path, fileName: file.name, contentType, size: file.size, kind: contentType.startsWith("video") ? "video" : "audio" },
        uploadError: null,
        updatedAt: serverTimestamp(),
      });
      if (transcript) {
        await api.importTranscript({ churchId, sermonId, segments: transcript.segments, hasTimestamps: transcript.hasTimestamps });
      }
      await api.startProcessing({ churchId, sermonId });
      navigate(`/sermons/${sermonId}`, { replace: true });
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "storage/canceled") {
        setPhase("cancelled");
        return;
      }
      setPhase("failed");
      setError(code === "storage/unauthorized" ? "Upload was refused. Check the file type and that you still have access to this church." : errMessage(err));
      if (sermonIdRef.current) {
        updateDoc(doc(db, "churches", churchId, "sermons", sermonIdRef.current), { uploadError: errMessage(err), updatedAt: serverTimestamp() }).catch(() => undefined);
      }
    }
  }

  const busy = phase === "uploading" || phase === "starting";
  const Icon = file && mimeFor(file).startsWith("video") ? FileVideo : FileAudio;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Upload a sermon" subtitle="Add the recording and a few details. You can leave once the upload finishes — processing continues in the background." />

      {integrations && !integrations.transcription && (
        <div className="mb-5">
          <Notice tone="warn" title="Automatic transcription isn't configured">
            You can still upload. Attach a transcript file (.txt, .srt or .vtt) below and Selah Studio will use it instead.
          </Notice>
        </div>
      )}

      <form onSubmit={submit} className="space-y-6">
        <Card className="p-5 sm:p-6">
          {!file ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={onDrop}
              className={clsx(
                "flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors",
                drag ? "border-forest bg-sage-50" : "border-cream-300 bg-cream-50",
              )}
            >
              <UploadCloud className="mb-3 h-10 w-10 text-sage-500" aria-hidden />
              <p className="font-serif text-xl text-forest">Drag your recording here</p>
              <p className="mt-1 text-sm text-charcoal-500">or</p>
              <Button type="button" variant="secondary" className="mt-3" onClick={() => inputRef.current?.click()}>Choose audio or video file</Button>
              <p className="mt-4 text-xs text-charcoal-400">{SUPPORTED_UPLOAD.label}</p>
              <input
                ref={inputRef}
                type="file"
                className="sr-only"
                aria-label="Choose sermon recording"
                accept={SUPPORTED_UPLOAD.extensions.map((e) => `.${e}`).join(",") + ",audio/*,video/*"}
                onChange={(e) => pick(e.target.files?.[0])}
              />
            </div>
          ) : (
            <div>
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sage-100 text-forest"><Icon className="h-6 w-6" /></div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-forest">{file.name}</div>
                  <div className="text-xs text-charcoal-500">{fmtBytes(file.size)}{duration ? ` · ${fmtDuration(duration)}` : ""}</div>
                </div>
                {!busy && (
                  <button type="button" className="rounded-lg p-2 text-charcoal-400 hover:bg-cream-200 hover:text-forest" onClick={() => { setFile(null); setPhase("select"); sermonIdRef.current = null; }} aria-label="Remove file">
                    <X className="h-5 w-5" />
                  </button>
                )}
              </div>
              {phase !== "select" && (
                <div className="mt-5">
                  <div className="mb-1.5 flex justify-between text-xs text-charcoal-500">
                    <span>
                      {phase === "uploading" && "Uploading…"}
                      {phase === "starting" && "Upload complete. Starting processing…"}
                      {phase === "failed" && "Upload failed"}
                      {phase === "cancelled" && "Upload cancelled"}
                    </span>
                    <span className="tabular-nums">{Math.round(progress * 100)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-cream-200" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress">
                    <div className={clsx("h-full rounded-full transition-all", phase === "failed" ? "bg-[#B5544A]" : "bg-forest")} style={{ width: `${progress * 100}%` }} />
                  </div>
                  <div className="mt-3 flex gap-2">
                    {phase === "uploading" && <Button type="button" variant="secondary" size="sm" onClick={() => taskRef.current?.cancel()}>Cancel upload</Button>}
                    {(phase === "failed" || phase === "cancelled") && <Button type="button" size="sm" icon={<RotateCcw className="h-4 w-4" />} onClick={() => submit()}>Retry upload</Button>}
                  </div>
                </div>
              )}
            </div>
          )}
          {fileError && <div className="mt-4"><Notice tone="error">{fileError}</Notice></div>}
        </Card>

        <Card className="space-y-5 p-5 sm:p-6">
          <h2 className="h-section">Sermon details</h2>
          <Input label="Sermon title" required value={meta.title} onChange={(e) => { setTitleTouched(true); setMeta({ ...meta, title: e.target.value }); }} disabled={busy} hint={file && !titleTouched ? "We filled this from the file name — edit it if needed." : undefined} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Preacher" value={meta.preacher} onChange={(e) => setMeta({ ...meta, preacher: e.target.value })} disabled={busy} />
            <Input label="Service date" type="date" required value={meta.serviceDate} onChange={(e) => setMeta({ ...meta, serviceDate: e.target.value })} disabled={busy} />
          </div>
          <Input label="Scripture reference" hint="Optional — e.g. Romans 8:28–39" value={meta.scripture} onChange={(e) => setMeta({ ...meta, scripture: e.target.value })} disabled={busy} />
          <Textarea label="Description" hint="Optional" rows={3} value={meta.description} onChange={(e) => setMeta({ ...meta, description: e.target.value })} disabled={busy} />

          <div className="rounded-lg border border-cream-300 bg-cream-50 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4 text-sage-500" aria-hidden />
                {transcript ? (
                  <span className="text-forest">{transcript.name} · {transcript.segments.length} segments{transcript.hasTimestamps ? "" : " (no timestamps — video clips will be skipped)"}</span>
                ) : (
                  <span className="text-charcoal-500">Have a transcript already? <span className="text-charcoal-400">Optional (.txt, .srt, .vtt)</span></span>
                )}
              </div>
              <label className="cursor-pointer text-sm font-medium text-forest hover:underline">
                {transcript ? "Replace" : "Attach transcript"}
                <input type="file" accept=".txt,.srt,.vtt,text/plain,text/vtt" className="sr-only" disabled={busy} onChange={(e) => pickTranscript(e.target.files?.[0])} />
              </label>
            </div>
          </div>
        </Card>

        {error && <Notice tone="error">{error}</Notice>}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={() => navigate(-1)} disabled={busy}>Cancel</Button>
          <Button type="submit" size="lg" loading={busy} disabled={!file || busy || phase === "failed" || phase === "cancelled"} icon={<UploadCloud className="h-4 w-4" />}>
            Upload and process
          </Button>
        </div>
      </form>
    </div>
  );
}
