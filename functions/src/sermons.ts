import { onCall, HttpsError } from "firebase-functions/v2/https";
import { assetRef, bucket, churchRef, db, FieldValue, REGION, sermonRef, transcriptRef } from "./lib/admin";
import { requireMember, str } from "./lib/auth";
import { audit } from "./lib/events";
import { saveVersion } from "./lib/assets";
import type { Segment, StageName } from "./lib/types";
import { STAGES } from "./lib/types";
import { enqueue } from "./pipeline/queue";
import { verifyQuote, windowText } from "./pipeline/integrity";

const opts = { region: REGION };

export const SUPPORTED_TYPES = /^(audio\/(mpeg|mp3|mp4|x-m4a|m4a|aac|wav|x-wav|wave|webm|ogg|flac|x-flac)|video\/(mp4|quicktime|webm|x-matroska))$/;
export const MAX_BYTES = 2 * 1024 * 1024 * 1024;
const STALL_MS = 15 * 60 * 1000;

function freshProcessing(from: StageName) {
  const stages: Record<string, unknown> = {};
  const idx = STAGES.indexOf(from);
  STAGES.forEach((s, i) => {
    stages[s] = { status: i < idx ? "done" : "pending", error: null };
  });
  return stages;
}

export const startProcessing = onCall(opts, async (req) => {
  const d = (req.data || {}) as Record<string, unknown>;
  const m = await requireMember(req, d.churchId, "contributor");
  const sermonId = str(d.sermonId, "Sermon");
  const ref = sermonRef(m.churchId, sermonId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Sermon not found.");
  const s = snap.data()!;
  if (!["uploading", "failed", "needs_configuration"].includes(s.status)) {
    throw new HttpsError("failed-precondition", "This sermon is already being processed.");
  }
  const path = s.media?.path as string | undefined;
  if (!path || !path.startsWith(`churches/${m.churchId}/sermons/${sermonId}/`)) {
    throw new HttpsError("failed-precondition", "Upload the recording before starting processing.");
  }
  const file = bucket().file(path);
  const [exists] = await file.exists();
  if (!exists) throw new HttpsError("failed-precondition", "The upload did not finish. Please upload the recording again.");
  const [meta] = await file.getMetadata();
  if (!SUPPORTED_TYPES.test(String(meta.contentType || ""))) throw new HttpsError("invalid-argument", "This file type isn't supported.");
  if (Number(meta.size) > MAX_BYTES) throw new HttpsError("invalid-argument", "Recordings must be smaller than 2 GB.");

  await ref.update({
    status: "queued",
    "media.size": Number(meta.size),
    "media.contentType": meta.contentType,
    processing: {
      stage: "probe",
      stages: freshProcessing("probe"),
      error: null,
      pendingRenders: 0,
      history: [{ at: new Date().toISOString(), level: "info", message: "Recording uploaded. Processing queued." }],
      startedAt: FieldValue.serverTimestamp(),
    },
    updatedAt: FieldValue.serverTimestamp(),
  });
  await enqueue("processSermonTask", { churchId: m.churchId, sermonId, stage: "probe", requestedBy: m.uid });
  await audit(m.churchId, m.uid, { type: "sermon", id: sermonId }, "sermon.processing_started");
  return { ok: true };
});

export const retryProcessing = onCall(opts, async (req) => {
  const d = (req.data || {}) as Record<string, unknown>;
  const m = await requireMember(req, d.churchId, "contributor");
  const sermonId = str(d.sermonId, "Sermon");
  const ref = sermonRef(m.churchId, sermonId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Sermon not found.");
  const s = snap.data()!;
  // Resume renders that stalled (e.g. an instance died mid-render).
  if (s.status === "processing" && (s.processing?.stage === "generate" || s.processing?.stages?.render?.status === "running")) {
    const stuck = await churchRef(m.churchId).collection("assets").where("sermonId", "==", sermonId).where("status", "==", "processing").get();
    const stale = stuck.docs.filter((d) => {
      const t = d.get("render.startedAt")?.toMillis?.() ?? d.get("updatedAt")?.toMillis?.() ?? 0;
      return Date.now() - t > STALL_MS;
    });
    if (!stale.length) throw new HttpsError("failed-precondition", "Rendering is still in progress. Give it a few more minutes.");
    for (const d of stale) {
      await d.ref.update({ "render.status": "pending", "render.error": null, "render.startedAt": FieldValue.serverTimestamp() });
      await enqueue("renderAssetTask", { churchId: m.churchId, assetId: d.id, reason: "retry" });
    }
    await ref.update({ "processing.history": FieldValue.arrayUnion({ at: new Date().toISOString(), level: "info", message: `Resumed ${stale.length} stalled render${stale.length === 1 ? "" : "s"}.` }) });
    return { ok: true, from: "render" };
  }
  if (!["failed", "needs_configuration"].includes(s.status)) {
    throw new HttpsError("failed-precondition", "Only sermons that stopped processing can be retried.");
  }
  let from = (s.processing?.failedStage as StageName) || "probe";
  if (from === "render") from = "generate";
  const stagesPatch: Record<string, unknown> = {};
  STAGES.slice(STAGES.indexOf(from)).forEach((st) => {
    stagesPatch[`processing.stages.${st}`] = { status: "pending", error: null };
  });
  await ref.update({
    ...stagesPatch,
    status: "queued",
    "processing.stage": from,
    "processing.error": null,
    "processing.failedStage": null,
    "processing.pendingRenders": 0,
    "processing.history": FieldValue.arrayUnion({ at: new Date().toISOString(), level: "info", message: `Retry requested from “${from}”.` }),
  });
  await enqueue("processSermonTask", { churchId: m.churchId, sermonId, stage: from, requestedBy: m.uid });
  await audit(m.churchId, m.uid, { type: "sermon", id: sermonId }, "sermon.processing_retried", { stage: from });
  return { ok: true, from };
});

/** Import a transcript file (.txt/.srt/.vtt parsed in the browser) — a usable path when transcription isn't configured. */
export const importTranscript = onCall(opts, async (req) => {
  const d = (req.data || {}) as Record<string, unknown>;
  const m = await requireMember(req, d.churchId, "contributor");
  const sermonId = str(d.sermonId, "Sermon");
  const raw = d.segments;
  if (!Array.isArray(raw) || !raw.length) throw new HttpsError("invalid-argument", "The transcript is empty.");
  if (raw.length > 6000) throw new HttpsError("invalid-argument", "The transcript is too long.");
  const hasTimestamps = d.hasTimestamps === true;
  const segments: Segment[] = raw.map((r: any, i: number) => ({
    i,
    start: hasTimestamps ? Math.max(0, Number(r.start) || 0) : 0,
    end: hasTimestamps ? Math.max(0, Number(r.end) || 0) : 0,
    speaker: null,
    text: String(r.text || "").slice(0, 4000).trim(),
  })).filter((s) => s.text);
  const ref = sermonRef(m.churchId, sermonId);
  const s = (await ref.get()).data();
  if (!s) throw new HttpsError("not-found", "Sermon not found.");
  await transcriptRef(m.churchId, sermonId).set({
    churchId: m.churchId,
    sermonId,
    segments: segments.map((x, i) => ({ ...x, i })),
    hasTimestamps,
    source: "import",
    language: null,
    searchText: segments.map((x) => x.text).join(" ").toLowerCase().slice(0, 600_000),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    editedBy: m.uid,
  });
  await ref.update({ hasTranscript: true, "processing.history": FieldValue.arrayUnion({ at: new Date().toISOString(), level: "info", message: `Transcript imported by ${m.name}.` }) });
  await audit(m.churchId, m.uid, { type: "sermon", id: sermonId }, "sermon.transcript_imported", null, { segments: segments.length, hasTimestamps });
  return { ok: true, segments: segments.length };
});

export const generateMoreContent = onCall(opts, async (req) => {
  const d = (req.data || {}) as Record<string, unknown>;
  const m = await requireMember(req, d.churchId, "contributor");
  const sermonId = str(d.sermonId, "Sermon");
  const types = Array.isArray(d.types) ? (d.types as string[]).filter((t) => ["video", "graphic", "summary", "devotional", "article", "captions"].includes(t)) : [];
  if (!types.length) throw new HttpsError("invalid-argument", "Choose at least one content type.");
  const ref = sermonRef(m.churchId, sermonId);
  const s = (await ref.get()).data();
  if (!s) throw new HttpsError("not-found", "Sermon not found.");
  if (!["ready", "published"].includes(s.status)) throw new HttpsError("failed-precondition", "Wait until the sermon has finished processing.");
  await ref.update({
    status: "processing",
    "processing.stage": "generate",
    "processing.stages.generate": { status: "pending", error: null },
    "processing.history": FieldValue.arrayUnion({ at: new Date().toISOString(), level: "info", message: `Additional content requested: ${types.join(", ")}.` }),
  });
  await enqueue("processSermonTask", { churchId: m.churchId, sermonId, stage: "generate", only: types, requestedBy: m.uid });
  await audit(m.churchId, m.uid, { type: "sermon", id: sermonId }, "sermon.generate_more", null, { types });
  return { ok: true };
});

export const deleteSermon = onCall(opts, async (req) => {
  const d = (req.data || {}) as Record<string, unknown>;
  const m = await requireMember(req, d.churchId, "editor");
  const sermonId = str(d.sermonId, "Sermon");
  const ref = sermonRef(m.churchId, sermonId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Sermon not found.");
  const assets = await churchRef(m.churchId).collection("assets").where("sermonId", "==", sermonId).get();
  const pubs = await churchRef(m.churchId).collection("publications").where("sermonId", "==", sermonId).get();
  for (const a of assets.docs) {
    await db.recursiveDelete(a.ref);
    await bucket().deleteFiles({ prefix: `churches/${m.churchId}/assets/${a.id}/` }).catch(() => undefined);
  }
  const batch = db.batch();
  pubs.docs.forEach((p) => batch.delete(p.ref));
  batch.delete(transcriptRef(m.churchId, sermonId));
  await batch.commit();
  await bucket().deleteFiles({ prefix: `churches/${m.churchId}/sermons/${sermonId}/` }).catch(() => undefined);
  await bucket().deleteFiles({ prefix: `churches/${m.churchId}/assets/sermons/${sermonId}/` }).catch(() => undefined);
  await bucket().deleteFiles({ prefix: `churches/${m.churchId}/assets/transcripts/${sermonId}/` }).catch(() => undefined);
  await ref.delete();
  await audit(m.churchId, m.uid, { type: "sermon", id: sermonId }, "sermon.deleted", { title: snap.get("title"), assets: assets.size, publications: pubs.size }, null);
  return { ok: true, deletedAssets: assets.size };
});

/** Create a draft quote graphic from a passage the user selected in the transcript. */
export const createQuoteGraphic = onCall(opts, async (req) => {
  const d = (req.data || {}) as Record<string, unknown>;
  const m = await requireMember(req, d.churchId, "contributor");
  const sermonId = str(d.sermonId, "Sermon");
  const text = str(d.text, "Quote", 400);
  const segment = Number(d.segment);
  const t = await transcriptRef(m.churchId, sermonId).get();
  if (!t.exists) throw new HttpsError("failed-precondition", "This sermon has no transcript yet.");
  const segments = t.get("segments") as Segment[];
  const match = verifyQuote(text, segments, Number.isInteger(segment) ? segment : 0);
  if (!match) throw new HttpsError("invalid-argument", "Quotes must match the transcript word-for-word.");
  const s = (await sermonRef(m.churchId, sermonId).get()).data()!;
  const church = (await churchRef(m.churchId).get()).data()!;
  const ref = churchRef(m.churchId).collection("assets").doc();
  const data = {
    churchId: m.churchId,
    sermonId,
    sermonTitle: s.title,
    preacher: s.preacher || "",
    serviceDate: s.serviceDate || null,
    type: "graphic",
    category: "graphic",
    status: "draft",
    version: 1,
    approvedVersion: 0,
    generatedBy: m.uid,
    title: text.slice(0, 60),
    source: { segmentFrom: match.from, segmentTo: match.to, start: segments[match.from]?.start ?? null, end: segments[match.to]?.end ?? null },
    transcriptExcerpt: windowText(segments, match.from, match.to),
    content: {
      quote: text,
      attribution: s.preacher || "",
      sermonTitle: s.title,
      scripture: s.scripture || "",
      template: church.brand?.graphicTemplate || "cream",
      align: "center",
      logoPosition: "bottom",
      size: "square",
    },
    flags: [],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.set(data);
  await saveVersion(ref, data, { uid: m.uid, name: m.name }, "Created from transcript");
  await audit(m.churchId, m.uid, { type: "asset", id: ref.id }, "asset.created", null, { type: "graphic" });
  return { assetId: ref.id };
});

export const retryRender = onCall(opts, async (req) => {
  const d = (req.data || {}) as Record<string, unknown>;
  const m = await requireMember(req, d.churchId, "contributor");
  const assetId = str(d.assetId, "Asset");
  const ref = assetRef(m.churchId, assetId);
  const a = (await ref.get()).data();
  if (!a) throw new HttpsError("not-found", "Asset not found.");
  const startedMs = a.render?.startedAt?.toMillis?.() ?? a.updatedAt?.toMillis?.() ?? 0;
  const stalled = ["pending", "running"].includes(a.render?.status) && Date.now() - startedMs > STALL_MS;
  if (a.render?.status !== "failed" && !stalled) throw new HttpsError("failed-precondition", "This asset is still rendering. Try again in a few minutes.");
  await ref.update({ status: "processing", "render.status": "pending", "render.error": null });
  await enqueue("renderAssetTask", { churchId: m.churchId, assetId, reason: "retry" });
  return { ok: true };
});
