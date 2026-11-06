import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { logger } from "firebase-functions/v2";
import { DocumentData } from "firebase-admin/firestore";
import {
  assetRef, bucket, churchRef, db, FieldValue, REGION, sermonRef, signedReadUrl, transcriptRef,
} from "../lib/admin";
import { ANTHROPIC_API_KEY, DEEPGRAM_API_KEY, IntegrationMissingError } from "../lib/config";
import { notify } from "../lib/events";
import { saveVersion } from "../lib/assets";
import type { AssetFlag, AssetType, ChurchDoc, Cue, Segment, StageName } from "../lib/types";
import { categoryOf, STAGES } from "../lib/types";
import { transcribeWithDeepgram, Word } from "./transcribe";
import { analyseSermon, reviseContent, writeContent, AnalysisResult } from "./ai";
import { buildCues, fmtTime, verifyQuote, verifyScripture, windowText } from "./integrity";
import { Aspect, buildVtt, CaptionStyle, cleanup, LogoPosition, probeMedia, renderClip, renderPodcastAudio, renderPoster } from "./render";
import { enqueue } from "./queue";

const taskOpts = {
  region: REGION,
  secrets: [ANTHROPIC_API_KEY, DEEPGRAM_API_KEY],
  timeoutSeconds: 1800,
  memory: "2GiB" as const,
  cpu: 2,
  retryConfig: { maxAttempts: 1 }, // failures are recorded and retried by the user
  rateLimits: { maxConcurrentDispatches: 6 },
};

export const DEFAULT_WRITTEN = ["summary", "devotional", "article", "captions"] as const;
type WrittenType = (typeof DEFAULT_WRITTEN)[number];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function setStage(churchId: string, sermonId: string, stage: StageName, patch: Record<string, unknown>) {
  const flat: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  for (const [k, v] of Object.entries(patch)) flat[`processing.stages.${stage}.${k}`] = v;
  await sermonRef(churchId, sermonId).update(flat);
}

async function logHistory(churchId: string, sermonId: string, message: string, level: "info" | "error" = "info") {
  await sermonRef(churchId, sermonId).update({
    "processing.history": FieldValue.arrayUnion({ at: new Date().toISOString(), level, message }),
  });
}

async function loadTranscript(churchId: string, sermonId: string): Promise<{ segments: Segment[]; hasTimestamps: boolean; words: Word[] }> {
  const t = await transcriptRef(churchId, sermonId).get();
  if (!t.exists) throw new Error("No transcript is available for this sermon yet.");
  const segments = (t.get("segments") || []) as Segment[];
  const hasTimestamps = t.get("hasTimestamps") !== false;
  let words: Word[] = [];
  const wordsPath = t.get("wordsPath") as string | undefined;
  if (wordsPath) {
    try {
      const [buf] = await bucket().file(wordsPath).download();
      words = JSON.parse(buf.toString("utf8"));
    } catch (e) {
      logger.warn("Could not load word timings", e);
    }
  }
  return { segments, hasTimestamps, words };
}

function friendly(e: unknown): string {
  if (e instanceof IntegrationMissingError) return e.message;
  const msg = e instanceof Error ? e.message : String(e);
  if (/ffmpeg/i.test(msg)) return "The recording could not be read or rendered. Check that the file plays correctly and try again.";
  if (/Transcription service returned 4/.test(msg)) return "The transcription service could not process this recording. Check the file format and try again.";
  if (/rate|overloaded|529|429/i.test(msg)) return "The AI service is busy right now. Please retry in a few minutes.";
  return msg.length > 240 ? msg.slice(0, 240) + "…" : msg;
}

// ---------------------------------------------------------------------------
// Sermon pipeline: probe → transcribe → analyse → generate → (render tasks)
// ---------------------------------------------------------------------------

interface ProcessPayload {
  churchId: string;
  sermonId: string;
  stage: StageName;
  /** For "generate additional content" runs. */
  only?: string[];
  requestedBy?: string;
}

export const processSermonTask = onTaskDispatched<ProcessPayload>(taskOpts, async (req) => {
  const { churchId, sermonId, stage } = req.data;
  const sRef = sermonRef(churchId, sermonId);
  const sermonSnap = await sRef.get();
  if (!sermonSnap.exists) return;
  const sermon = sermonSnap.data()!;
  const church = (await churchRef(churchId).get()).data() as ChurchDoc;

  await setStage(churchId, sermonId, stage, { status: "running", startedAt: FieldValue.serverTimestamp(), error: null });
  await sRef.update({ status: "processing", "processing.stage": stage, "processing.error": null });

  try {
    let next: StageName | null = null;
    if (stage === "probe") {
      await stageProbe(churchId, sermonId, sermon);
      next = "transcribe";
    } else if (stage === "transcribe") {
      await stageTranscribe(churchId, sermonId, sermon, church);
      next = "analyse";
    } else if (stage === "analyse") {
      await stageAnalyse(churchId, sermonId, sermon, church);
      next = "generate";
    } else if (stage === "generate") {
      await stageGenerate(churchId, sermonId, church, req.data.only);
      next = null; // render tasks finish the pipeline
    }
    await setStage(churchId, sermonId, stage, { status: "done", finishedAt: FieldValue.serverTimestamp() });
    if (next) {
      await setStage(churchId, sermonId, next, { status: "pending" });
      await enqueue("processSermonTask", { churchId, sermonId, stage: next });
    }
  } catch (e) {
    logger.error(`Stage ${stage} failed for ${churchId}/${sermonId}`, e);
    const message = friendly(e);
    const needsConfig = e instanceof IntegrationMissingError;
    await setStage(churchId, sermonId, stage, { status: "failed", finishedAt: FieldValue.serverTimestamp(), error: message });
    await sRef.update({
      status: needsConfig ? "needs_configuration" : "failed",
      "processing.error": message,
      "processing.failedStage": stage,
    });
    await logHistory(churchId, sermonId, `${stage}: ${message}`, "error");
    await notify(churchId, {
      type: "processing_failed",
      title: needsConfig ? "Integration needed" : "Processing stopped",
      message: `“${sermon.title}” — ${message}`,
      link: `/sermons/${sermonId}`,
      entity: { type: "sermon", id: sermonId },
    });
  }
});

async function stageProbe(churchId: string, sermonId: string, sermon: DocumentData) {
  if (!sermon.media?.path) throw new Error("The original recording is missing. Please upload it again.");
  const [exists] = await bucket().file(sermon.media.path).exists();
  if (!exists) throw new Error("The original recording could not be found in storage. Please upload it again.");
  const url = await signedReadUrl(sermon.media.path);
  const probe = await probeMedia(url);
  if (!probe.durationSec) throw new Error("This file does not look like a playable audio or video recording.");
  const patch: Record<string, unknown> = { durationSec: Math.round(probe.durationSec), "media.hasVideo": probe.hasVideo };
  if (probe.hasVideo) {
    try {
      const poster = await renderPoster(url, Math.min(120, probe.durationSec * 0.1));
      const dest = `churches/${churchId}/assets/sermons/${sermonId}/poster.jpg`;
      await bucket().upload(poster.file, { destination: dest, contentType: "image/jpeg" });
      patch.thumbnailPath = dest;
      await cleanup(poster.dir);
    } catch (e) {
      logger.warn("Poster frame failed", e);
    }
  }
  await sermonRef(churchId, sermonId).update(patch);
  await logHistory(churchId, sermonId, `Recording checked — ${fmtTime(probe.durationSec)}${probe.hasVideo ? ", video" : ", audio only"}.`);
}

async function stageTranscribe(churchId: string, sermonId: string, sermon: DocumentData, church: ChurchDoc) {
  const existing = await transcriptRef(churchId, sermonId).get();
  if (existing.exists && existing.get("source") === "import") {
    await logHistory(churchId, sermonId, "Using the imported transcript.");
    return;
  }
  const url = await signedReadUrl(sermon.media.path, 240);
  const result = await transcribeWithDeepgram(url, church.content?.language);
  if (!result.segments.length) throw new Error("No speech was detected in this recording.");
  const wordsPath = `churches/${churchId}/assets/transcripts/${sermonId}/words.json`;
  await bucket().file(wordsPath).save(JSON.stringify(result.words), { contentType: "application/json" });
  await transcriptRef(churchId, sermonId).set({
    churchId,
    sermonId,
    segments: result.segments,
    hasTimestamps: true,
    language: result.language,
    source: "deepgram",
    wordsPath,
    searchText: result.segments.map((s) => s.text).join(" ").toLowerCase().slice(0, 600_000),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const patch: Record<string, unknown> = { hasTranscript: true };
  if (!sermon.durationSec && result.durationSec) patch.durationSec = Math.round(result.durationSec);
  await sermonRef(churchId, sermonId).update(patch);
  await logHistory(churchId, sermonId, `Transcript created — ${result.segments.length} segments.`);
}

async function stageAnalyse(churchId: string, sermonId: string, sermon: DocumentData, church: ChurchDoc) {
  const { segments, hasTimestamps } = await loadTranscript(churchId, sermonId);
  const clipMin = church.content?.clipMin || 30;
  const clipMax = church.content?.clipMax || 90;
  const a = await analyseSermon(church, sermon, segments, { clipMin, clipMax, hasTimestamps });

  const scripture = a.scriptureReferences.map((r) => ({
    reference: r.reference,
    segment: r.segment,
    context: r.context,
    verified: verifyScripture(r.reference, segments, r.segment),
  }));
  const statements = a.importantStatements
    .map((s) => ({ ...s, match: verifyQuote(s.text, segments, s.segment) }))
    .filter((s) => s.match)
    .map((s) => ({ text: s.text, segment: s.match!.from, start: segments[s.match!.from]?.start ?? null }));
  const uncertainties = a.uncertainties.map((u) => ({ ...u, start: segments[u.segment]?.start ?? null }));

  const patch: Record<string, unknown> = {
    summary: {
      mainTheme: a.mainTheme,
      keyPoints: a.keyPoints,
      illustrations: a.illustrations,
      practicalApplications: a.practicalApplications,
      conclusion: a.conclusion,
      importantStatements: statements,
      uncertainties,
    },
    scriptureReferences: scripture,
    scriptureIndex: scripture.map((s) => s.reference.toLowerCase()),
    candidates: { clips: a.clips, quotes: a.quotes },
  };
  if (!sermon.title || /^untitled/i.test(sermon.title)) {
    if (a.suggestedTitle) patch.title = a.suggestedTitle;
  }
  await sermonRef(churchId, sermonId).update(patch);
  const dropped = a.importantStatements.length - statements.length;
  await logHistory(
    churchId,
    sermonId,
    `Sermon analysed — ${a.keyPoints.length} key points, ${scripture.length} scripture references${dropped ? `, ${dropped} unverifiable statements removed` : ""}.`,
  );
}

function clampClip(segments: Segment[], from: number, to: number, min: number, max: number) {
  from = Math.max(0, Math.min(from, segments.length - 1));
  to = Math.max(from, Math.min(to, segments.length - 1));
  // Extend forward until long enough, trim from the end if too long.
  while (segments[to].end - segments[from].start < min && to < segments.length - 1) to++;
  while (segments[to].end - segments[from].start > max && to > from) to--;
  const start = Math.max(0, segments[from].start - 0.15);
  const end = segments[to].end + 0.25;
  return { from, to, start, end };
}

async function stageGenerate(churchId: string, sermonId: string, church: ChurchDoc, only?: string[]) {
  const sSnap = await sermonRef(churchId, sermonId).get();
  const sermon = sSnap.data()!;
  const { segments, hasTimestamps, words } = await loadTranscript(churchId, sermonId);
  const prefs = church.content || {};
  const wanted = new Set(only?.length ? only : prefs.contentTypes?.length ? prefs.contentTypes : ["video", "graphic", "audio", ...DEFAULT_WRITTEN]);
  const platforms = prefs.platforms?.length ? prefs.platforms : ["instagram", "facebook", "whatsapp"];
  const isAdditional = !!only?.length;

  // A fresh full run replaces untouched pipeline assets from a previous attempt.
  if (!isAdditional) {
    const old = await churchRef(churchId).collection("assets").where("sermonId", "==", sermonId).get();
    const batch = db.batch();
    for (const d of old.docs) {
      const x = d.data();
      if (x.generatedBy === "pipeline" && Number(x.version) === 1 && ["processing", "needs_review", "failed"].includes(x.status) && !x.approvedVersion) {
        batch.delete(d.ref);
      }
    }
    await batch.commit();
  }

  const base = {
    churchId,
    sermonId,
    sermonTitle: sermon.title,
    preacher: sermon.preacher || "",
    serviceDate: sermon.serviceDate || null,
    version: 1,
    approvedVersion: 0,
    generatedBy: "pipeline",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  const created: { id: string; type: AssetType; needsRender: boolean }[] = [];
  const add = async (type: AssetType, doc: Record<string, unknown>, needsRender: boolean) => {
    const ref = churchRef(churchId).collection("assets").doc();
    const data = { ...base, type, category: categoryOf(type), status: needsRender ? "processing" : "needs_review", ...doc };
    await ref.set(data);
    await saveVersion(ref, { ...data, status: data.status }, { uid: null, name: "Selah Studio" }, "Generated from sermon");
    created.push({ id: ref.id, type, needsRender });
  };

  let candidates = sermon.candidates || { clips: [], quotes: [] };
  if (isAdditional && (wanted.has("video") || wanted.has("graphic"))) {
    // Ask for fresh moments that differ from what the team already has.
    const existing = await churchRef(churchId).collection("assets").where("sermonId", "==", sermonId).get();
    const avoid = existing.docs
      .map((d) => d.data())
      .filter((x) => x.type === "video" || x.type === "graphic")
      .map((x) => (x.type === "video" ? `- clip ${fmtTime(x.source?.start || 0)}–${fmtTime(x.source?.end || 0)}: ${x.title}` : `- quote: "${x.content?.quote}"`))
      .join("\n");
    const fresh = await analyseSermon(church, sermon, segments, {
      clipMin: prefs.clipMin || 30, clipMax: prefs.clipMax || 90, hasTimestamps, maxClips: 4, maxQuotes: 4, avoid,
    });
    candidates = { clips: fresh.clips, quotes: fresh.quotes };
  }
  const clipMin = prefs.clipMin || 30;
  const clipMax = prefs.clipMax || 90;
  const brand = church.brand || {};

  // --- Video clips ---
  if (wanted.has("video") && hasTimestamps) {
    const seen: { start: number; end: number }[] = [];
    for (const c of (candidates.clips || []) as AnalysisResult["clips"]) {
      if (!Number.isInteger(c.startSegment) || !segments[c.startSegment]) continue;
      const w = clampClip(segments, c.startSegment, c.endSegment, Math.max(10, clipMin * 0.6), clipMax * 1.25);
      if (w.end - w.start < 8) continue;
      if (seen.some((s) => Math.min(s.end, w.end) - Math.max(s.start, w.start) > (w.end - w.start) * 0.5)) continue; // overlapping
      seen.push(w);
      const cues: Cue[] = buildCues(w.start, w.end, words, segments);
      await add(
        "video",
        {
          title: c.title,
          description: c.rationale,
          source: { start: w.start, end: w.end, segmentFrom: w.from, segmentTo: w.to },
          transcriptExcerpt: windowText(segments, w.from, w.to),
          content: {
            socialCaption: c.socialCaption,
            cues,
            aspectRatio: "9:16",
            captionStyle: (brand.captionStyle as CaptionStyle) || "clean",
            logoPosition: (brand.logoPlacement as LogoPosition) || "top-right",
          },
          durationSec: Math.round(w.end - w.start),
          media: null,
          render: { status: "pending" },
          flags: [],
        },
        true,
      );
    }
  }

  // --- Quote graphics (verbatim only) ---
  if (wanted.has("graphic")) {
    for (const q of (candidates.quotes || []) as AnalysisResult["quotes"]) {
      const match = verifyQuote(q.text, segments, q.segment);
      if (!match) continue;
      const nearScripture = ((sermon.scriptureReferences || []) as { reference: string; segment: number; verified: boolean }[])
        .filter((r) => r.verified)
        .sort((x, y) => Math.abs(x.segment - match.from) - Math.abs(y.segment - match.from))[0];
      await add(
        "graphic",
        {
          title: q.text.length > 60 ? q.text.slice(0, 57).trimEnd() + "…" : q.text,
          source: hasTimestamps
            ? { start: segments[match.from].start, end: segments[match.to].end, segmentFrom: match.from, segmentTo: match.to }
            : { segmentFrom: match.from, segmentTo: match.to },
          transcriptExcerpt: windowText(segments, match.from, match.to),
          content: {
            quote: q.text.trim(),
            attribution: sermon.preacher || "",
            sermonTitle: sermon.title,
            scripture: nearScripture?.reference || sermon.scripture || "",
            template: brand.graphicTemplate || "cream",
            align: "center",
            logoPosition: "bottom",
            size: "square",
          },
          flags: [],
        },
        false,
      );
    }
  }

  // --- Written content ---
  const writtenTypes = (DEFAULT_WRITTEN as readonly string[]).filter((t) => wanted.has(t)) as WrittenType[];
  if (writtenTypes.length) {
    const verifiedScripture = ((sermon.scriptureReferences || []) as { reference: string; verified: boolean }[]).map((r) => r.reference);
    const s = sermon.summary || {};
    const written = await writeContent(
      church,
      sermon,
      segments,
      {
        mainTheme: s.mainTheme || "",
        keyPoints: s.keyPoints || [],
        practicalApplications: s.practicalApplications || [],
        conclusion: s.conclusion || "",
        scriptureReferences: verifiedScripture,
      },
      writtenTypes,
      platforms,
    );
    const flagsFor = (text: string): AssetFlag[] => {
      const flags: AssetFlag[] = (written.uncertainties || []).map((u) => ({ code: "unclear_transcript", message: u }));
      for (const ref of extractRefs(text)) {
        if (!verifyScripture(ref, segments, null)) flags.push({ code: "scripture_unverified", message: `“${ref}” was not found in the transcript — please check it.` });
      }
      return flags;
    };
    if (written.summary) {
      await add("summary", { title: written.summary.title || `Summary — ${sermon.title}`, content: written.summary, flags: flagsFor(JSON.stringify(written.summary)) }, false);
    }
    if (written.devotional) {
      await add("devotional", { title: written.devotional.title, content: written.devotional, flags: flagsFor(JSON.stringify(written.devotional)) }, false);
    }
    if (written.article) {
      await add("article", { title: written.article.title, content: written.article, flags: flagsFor(JSON.stringify(written.article)) }, false);
    }
    if (written.captions) {
      await add("captions", { title: `Social captions — ${sermon.title}`, content: { platforms: written.captions }, flags: [] }, false);
    }
  }

  // --- Podcast-ready audio ---
  if (wanted.has("audio") && !isAdditional) {
    await add(
      "audio",
      {
        title: `${sermon.title} — podcast audio`,
        content: { format: "mp3", bitrate: "128k", loudness: "-16 LUFS", showNotes: sermon.summary?.mainTheme || "" },
        durationSec: sermon.durationSec || null,
        media: null,
        render: { status: "pending" },
        flags: [],
      },
      true,
    );
  }

  const toRender = created.filter((c) => c.needsRender);
  await sermonRef(churchId, sermonId).update({
    "processing.pendingRenders": FieldValue.increment(toRender.length),
    "processing.lastRunAssetCount": created.length,
    "processing.additional": isAdditional,
    "processing.stages.render.status": toRender.length ? "running" : "skipped",
    "processing.stages.render.startedAt": FieldValue.serverTimestamp(),
  });
  await logHistory(churchId, sermonId, `${created.length} assets generated${toRender.length ? `, ${toRender.length} rendering` : ""}.`);

  for (const c of toRender) await enqueue("renderAssetTask", { churchId, assetId: c.id, reason: "initial" });
  if (!toRender.length) await finalizeSermon(churchId, sermonId);
}

function extractRefs(text: string): string[] {
  const re = /\b((?:[123]\s)?[A-Z][a-z]+)\s(\d{1,3}):(\d{1,3})(?:[-–]\d{1,3})?\b/g;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.add(m[0]);
  return [...out];
}

async function finalizeSermon(churchId: string, sermonId: string) {
  const sRef = sermonRef(churchId, sermonId);
  const assets = await churchRef(churchId).collection("assets").where("sermonId", "==", sermonId).get();
  const counts = { total: 0, video: 0, graphic: 0, written: 0, audio: 0, needsReview: 0, renderFailed: 0 };
  let anyPublished = false;
  for (const d of assets.docs) {
    const a = d.data();
    counts.total++;
    counts[a.category as "video" | "graphic" | "written" | "audio"]++;
    if (a.status === "needs_review") counts.needsReview++;
    if (a.render?.status === "failed") counts.renderFailed++;
    if (a.status === "published") anyPublished = true;
  }
  const sermon = (await sRef.get()).data()!;
  const wasReady = sermon.processing?.additional === true;
  await sRef.update({
    status: anyPublished ? "published" : "ready",
    assetCounts: counts,
    "processing.stage": "done",
    "processing.pendingRenders": 0,
    "processing.stages.render.status": "done",
    "processing.stages.render.finishedAt": FieldValue.serverTimestamp(),
    "processing.completedAt": FieldValue.serverTimestamp(),
  });
  const n = sermon.processing?.lastRunAssetCount ?? counts.total;
  await logHistory(churchId, sermonId, `Processing complete.`);
  await notify(churchId, {
    type: wasReady ? "review_ready" : "sermon_ready",
    title: wasReady ? "New content ready for review" : "Your sermon is ready",
    message: `“${sermon.title}” — ${n} asset${n === 1 ? " has" : "s have"} been generated${counts.renderFailed ? ` (${counts.renderFailed} could not be rendered)` : ""}.`,
    link: `/sermons/${sermonId}`,
    entity: { type: "sermon", id: sermonId },
  });
}

// ---------------------------------------------------------------------------
// Rendering (video clips, podcast audio)
// ---------------------------------------------------------------------------

interface RenderPayload {
  churchId: string;
  assetId: string;
  reason: "initial" | "edit" | "revision" | "retry";
  revisionId?: string;
}

export const renderAssetTask = onTaskDispatched<RenderPayload>(taskOpts, async (req) => {
  const { churchId, assetId, reason } = req.data;
  const aRef = assetRef(churchId, assetId);
  const snap = await aRef.get();
  if (!snap.exists) return;
  const asset = snap.data()!;
  const sermonSnap = await sermonRef(churchId, asset.sermonId).get();
  const sermon = sermonSnap.data();
  const church = (await churchRef(churchId).get()).data() as ChurchDoc;
  await aRef.update({ "render.status": "running", "render.startedAt": FieldValue.serverTimestamp(), "render.error": null });

  const dirs: string[] = [];
  try {
    if (!sermon?.media?.path) throw new Error("The original recording is no longer available.");
    const url = await signedReadUrl(sermon.media.path, 180);
    const v = Number(asset.version || 1);
    const prefix = `churches/${churchId}/assets/${assetId}/v${v}`;
    const media: Record<string, unknown> = {};

    if (asset.type === "video") {
      let logoFile: string | null = null;
      if (church.logoPath && asset.content?.logoPosition !== "none" && !/\.svg$/i.test(church.logoPath)) {
        const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "logo-"));
        dirs.push(tmp);
        logoFile = path.join(tmp, path.basename(church.logoPath));
        await bucket().file(church.logoPath).download({ destination: logoFile });
      }
      const r = await renderClip({
        sourceUrl: url,
        hasVideo: !!sermon.media.hasVideo,
        start: asset.source.start,
        end: asset.source.end,
        aspect: (asset.content?.aspectRatio as Aspect) || "9:16",
        captionStyle: (asset.content?.captionStyle as CaptionStyle) || "clean",
        cues: asset.content?.cues || [],
        logoFile,
        logoPosition: (asset.content?.logoPosition as LogoPosition) || "top-right",
        background: church.brand?.primary || "#18181B",
        accent: church.brand?.accent || "#418FAE",
      });
      dirs.push(r.dir);
      await bucket().upload(r.videoFile, { destination: `${prefix}.mp4`, contentType: "video/mp4" });
      await bucket().upload(r.thumbFile, { destination: `${prefix}.jpg`, contentType: "image/jpeg" });
      await bucket().file(`${prefix}.vtt`).save(buildVtt(asset.content?.cues || []), { contentType: "text/vtt" });
      Object.assign(media, { path: `${prefix}.mp4`, thumbnailPath: `${prefix}.jpg`, captionsPath: `${prefix}.vtt`, contentType: "video/mp4" });
    } else if (asset.type === "audio") {
      const r = await renderPodcastAudio(url);
      dirs.push(r.dir);
      await bucket().upload(r.file, { destination: `${prefix}.mp3`, contentType: "audio/mpeg" });
      Object.assign(media, { path: `${prefix}.mp3`, contentType: "audio/mpeg" });
    } else {
      throw new Error(`Assets of type ${asset.type} are not rendered.`);
    }

    await aRef.update({
      media,
      status: "needs_review",
      "render.status": "done",
      "render.finishedAt": FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    await aRef.collection("versions").doc(String(v)).set({ media }, { merge: true });
  } catch (e) {
    logger.error(`Render failed ${churchId}/${assetId}`, e);
    await aRef.update({
      status: "failed",
      "render.status": "failed",
      "render.error": friendly(e),
      "render.finishedAt": FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  } finally {
    for (const d of dirs) await cleanup(d);
  }

  if (reason === "initial") {
    // Count down the sermon's pending renders; the last one finalises the sermon.
    const sRef = sermonRef(churchId, asset.sermonId);
    const remaining = await db.runTransaction(async (tx) => {
      const s = await tx.get(sRef);
      const left = Math.max(0, Number(s.get("processing.pendingRenders") || 0) - 1);
      tx.update(sRef, { "processing.pendingRenders": left });
      return left;
    });
    if (remaining === 0) await finalizeSermon(churchId, asset.sermonId);
  } else {
    const after = (await aRef.get()).data()!;
    await notify(churchId, {
      type: after.render?.status === "failed" ? "processing_failed" : "revision_ready",
      title: after.render?.status === "failed" ? "Rendering failed" : "A revision is ready",
      message: after.render?.status === "failed" ? `“${after.title}” — ${after.render?.error}` : `“${after.title}” is ready for review.`,
      link: `/studio/${assetId}`,
      entity: { type: "asset", id: assetId },
    });
  }
});

// ---------------------------------------------------------------------------
// Revisions requested by reviewers
// ---------------------------------------------------------------------------

interface RevisePayload {
  churchId: string;
  assetId: string;
  revisionId: string;
}

const REVISION_SCHEMAS: Record<string, Record<string, unknown>> = {
  video: {
    type: "object",
    properties: {
      title: { type: "string" },
      startSegment: { type: "integer" },
      endSegment: { type: "integer" },
      socialCaption: { type: "string" },
    },
    required: ["title", "startSegment", "endSegment", "socialCaption"],
  },
  graphic: {
    type: "object",
    properties: { quote: { type: "string", description: "Verbatim from the transcript" }, segment: { type: "integer" }, scripture: { type: "string" } },
    required: ["quote", "segment"],
  },
  summary: {
    type: "object",
    properties: {
      title: { type: "string" }, mainTheme: { type: "string" }, keyPoints: { type: "array", items: { type: "string" } },
      scriptureReferences: { type: "array", items: { type: "string" } }, body: { type: "string" },
    },
    required: ["title", "mainTheme", "keyPoints", "scriptureReferences", "body"],
  },
  devotional: {
    type: "object",
    properties: { title: { type: "string" }, scripture: { type: "string" }, reflection: { type: "string" }, application: { type: "string" }, prayer: { type: "string" } },
    required: ["title", "scripture", "reflection", "application", "prayer"],
  },
  article: {
    type: "object",
    properties: {
      title: { type: "string" }, introduction: { type: "string" },
      sections: { type: "array", items: { type: "object", properties: { heading: { type: "string" }, body: { type: "string" } }, required: ["heading", "body"] } },
      scriptureReferences: { type: "array", items: { type: "string" } }, application: { type: "string" }, conclusion: { type: "string" },
    },
    required: ["title", "introduction", "sections", "scriptureReferences", "application", "conclusion"],
  },
  captions: {
    type: "object",
    properties: { platforms: { type: "object", additionalProperties: { type: "string" } } },
    required: ["platforms"],
  },
};

export const reviseAssetTask = onTaskDispatched<RevisePayload>(taskOpts, async (req) => {
  const { churchId, assetId, revisionId } = req.data;
  const aRef = assetRef(churchId, assetId);
  const revRef = aRef.collection("revisions").doc(revisionId);
  const [aSnap, revSnap] = await Promise.all([aRef.get(), revRef.get()]);
  if (!aSnap.exists || !revSnap.exists) return;
  const asset = aSnap.data()!;
  const rev = revSnap.data()!;
  const church = (await churchRef(churchId).get()).data() as ChurchDoc;
  const sermon = (await sermonRef(churchId, asset.sermonId).get()).data() || {};

  try {
    const { segments, words } = await loadTranscript(churchId, asset.sermonId);
    if (asset.type === "audio") throw new Error("Podcast audio is re-rendered from the original recording; use Regenerate instead.");
    const schema = REVISION_SCHEMAS[asset.type];
    const current = asset.type === "video"
      ? { title: asset.title, startSegment: asset.source?.segmentFrom, endSegment: asset.source?.segmentTo, socialCaption: asset.content?.socialCaption }
      : asset.type === "graphic"
        ? { quote: asset.content?.quote, segment: asset.source?.segmentFrom, scripture: asset.content?.scripture }
        : asset.content;
    const out = await reviseContent(church, sermon, segments, asset.type, current, { reasons: rev.reasons || [], instructions: rev.instructions || "" }, schema);

    const newVersion = Number(asset.version || 1) + 1;
    const patch: Record<string, unknown> = { version: newVersion, updatedAt: FieldValue.serverTimestamp() };
    let needsRender = false;
    const flags: AssetFlag[] = [];

    if (asset.type === "video") {
      const w = clampClip(segments, Number(out.startSegment), Number(out.endSegment), 8, (church.content?.clipMax || 90) * 1.5);
      patch.title = String(out.title || asset.title);
      patch.source = { start: w.start, end: w.end, segmentFrom: w.from, segmentTo: w.to };
      patch.transcriptExcerpt = windowText(segments, w.from, w.to);
      patch.durationSec = Math.round(w.end - w.start);
      patch.content = { ...asset.content, socialCaption: String(out.socialCaption || ""), cues: buildCues(w.start, w.end, words, segments) };
      patch.media = null;
      patch.render = { status: "pending" };
      patch.status = "processing";
      needsRender = true;
    } else if (asset.type === "graphic") {
      const match = verifyQuote(String(out.quote || ""), segments, Number(out.segment || 0));
      if (!match) throw new Error("The revised quote could not be found word-for-word in the transcript, so it was not used. Try editing the quote text directly.");
      patch.title = String(out.quote).slice(0, 60);
      patch.content = { ...asset.content, quote: String(out.quote).trim(), scripture: out.scripture ?? asset.content?.scripture };
      patch.source = { ...(asset.source || {}), segmentFrom: match.from, segmentTo: match.to, start: segments[match.from]?.start, end: segments[match.to]?.end };
      patch.transcriptExcerpt = windowText(segments, match.from, match.to);
      patch.status = "needs_review";
    } else {
      patch.content = out;
      if (typeof out.title === "string") patch.title = out.title;
      for (const ref of extractRefs(JSON.stringify(out))) {
        if (!verifyScripture(ref, segments, null)) flags.push({ code: "scripture_unverified", message: `“${ref}” was not found in the transcript — please check it.` });
      }
      patch.status = "needs_review";
    }
    patch.flags = flags;
    patch.lastRevisionId = revisionId;
    await aRef.update(patch);
    const after = (await aRef.get()).data()!;
    await saveVersion(aRef, after, { uid: rev.createdBy, name: rev.createdByName || "Reviewer" }, "Revision", { revisionId });
    await revRef.update({ status: needsRender ? "rendering" : "completed", newVersion, completedAt: FieldValue.serverTimestamp() });

    if (needsRender) {
      await enqueue("renderAssetTask", { churchId, assetId, reason: "revision", revisionId });
    } else {
      await notify(churchId, {
        type: "revision_ready",
        title: "A revision is ready",
        message: `“${after.title}” has a new version ready for review.`,
        link: `/studio/${assetId}`,
        entity: { type: "asset", id: assetId },
      });
    }
  } catch (e) {
    const message = friendly(e);
    await revRef.update({ status: "failed", error: message, completedAt: FieldValue.serverTimestamp() });
    // Return the untouched asset to review so the team can act on it manually.
    await aRef.update({ status: "needs_review", revisionError: message, updatedAt: FieldValue.serverTimestamp() });
    await notify(churchId, {
      type: "processing_failed",
      title: "Revision could not be generated",
      message: `“${asset.title}” — ${message}`,
      link: `/studio/${assetId}`,
      entity: { type: "asset", id: assetId },
    });
  }
});

export { STAGES };
