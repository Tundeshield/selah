import { onCall, HttpsError } from "firebase-functions/v2/https";
import { DocumentData } from "firebase-admin/firestore";
import { assetRef, bucket, churchRef, db, FieldValue, REGION, sermonRef, transcriptRef } from "./lib/admin";
import { MemberContext, requireMember, str } from "./lib/auth";
import { audit } from "./lib/events";
import { isApprovedCurrent, saveVersion } from "./lib/assets";
import type { AssetFlag, Cue, Segment } from "./lib/types";
import { enqueue } from "./pipeline/queue";
import { verifyQuote, windowText } from "./pipeline/integrity";
import { refreshStatuses } from "./publishing";
import { finalizeSermon } from "./pipeline/tasks";
import { STYLE_IDS } from "./pipeline/styles";
import { polishCaption, POLISH_ACTIONS } from "./pipeline/ai";
import { ANTHROPIC_API_KEY } from "./lib/config";

const opts = { region: REGION };

const RENDER_KEYS = ["cues", "aspectRatio", "framing", "captionStyle", "logoPosition", "videoStyle", "hook", "endCard", "bgPath"];
const MINOR_KEYS = ["socialCaption", "title"];

const s = (v: unknown, max = 20000) => (typeof v === "string" ? v.slice(0, max) : "");
const arr = (v: unknown, max = 50) => (Array.isArray(v) ? v.slice(0, max).map((x) => s(x, 2000)) : []);

const num = (v: unknown, min: number, max: number, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : d;
};

/** A photo background on a quote graphic: a library photo + its edit settings. */
function sanitizePhoto(v: unknown, churchId: string): unknown {
  if (!v || typeof v !== "object") return null;
  const p = v as Record<string, unknown>;
  const path = s(p.path, 300);
  if (!path.startsWith(`churches/${churchId}/media/`) || path.includes("..")) return null;
  const e = (p.edit && typeof p.edit === "object" ? p.edit : {}) as Record<string, unknown>;
  const pick = <T extends string>(x: unknown, opts: T[], d: T) => (opts.includes(String(x) as T) ? (String(x) as T) : d);
  return {
    path,
    mediaId: s(p.mediaId, 100),
    edit: {
      zoom: num(e.zoom, 1, 3, 1),
      panX: num(e.panX, -1, 1, 0),
      panY: num(e.panY, -1, 1, 0),
      flip: e.flip === true,
      filter: s(e.filter, 30) || "original",
      brightness: num(e.brightness, -100, 100, 0),
      contrast: num(e.contrast, -100, 100, 0),
      saturation: num(e.saturation, -100, 100, 0),
      warmth: num(e.warmth, -100, 100, 0),
      fade: num(e.fade, 0, 100, 0),
      blur: num(e.blur, 0, 100, 0),
      vignette: num(e.vignette, 0, 100, 0),
      grain: num(e.grain, 0, 100, 0),
      overlay: pick(e.overlay, ["none", "dark", "brand", "light"], "dark"),
      overlayStyle: pick(e.overlayStyle, ["full", "bottom", "top"], "full"),
      overlayAmount: num(e.overlayAmount, 0, 90, 50),
    },
  };
}

function sanitizeContent(type: string, current: DocumentData, patch: Record<string, unknown>, churchId = ""): Record<string, unknown> {
  const out: Record<string, unknown> = { ...current };
  const pick = (k: string, fn: (v: unknown) => unknown) => {
    if (k in patch) out[k] = fn(patch[k]);
  };
  switch (type) {
    case "video":
      pick("socialCaption", (v) => s(v, 3000));
      pick("aspectRatio", (v) => (["9:16", "1:1", "16:9"].includes(String(v)) ? v : "9:16"));
      pick("framing", (v) => (["fill", "fit", "auto"].includes(String(v)) ? v : "auto"));
      pick("captionStyle", (v) => (["clean", "bold", "boxed", "none"].includes(String(v)) ? v : "clean"));
      pick("logoPosition", (v) => (["top-left", "top-right", "bottom-left", "bottom-right", "none"].includes(String(v)) ? v : "top-right"));
      pick("videoStyle", (v) => ((STYLE_IDS as string[]).includes(String(v)) ? v : null));
      pick("hook", (v) => s(v, 140));
      pick("endCard", (v) => v !== false);
      pick("bgPath", (v) => {
        const p = s(v, 300);
        return p.startsWith(`churches/${churchId}/media/`) && !p.includes("..") ? p : null;
      });
      pick("cues", (v) =>
        (Array.isArray(v) ? v : []).slice(0, 400).map((c: any): Cue => ({
          start: Math.max(0, Number(c.start) || 0),
          end: Math.max(0, Number(c.end) || 0),
          text: s(c.text, 200),
        })),
      );
      break;
    case "graphic":
      for (const k of ["quote", "attribution", "sermonTitle", "scripture"]) pick(k, (v) => s(v, 600));
      pick("template", (v) => (/^[a-z][a-z-]{1,23}$/.test(String(v)) ? v : "cream"));
      pick("photo", (v) => sanitizePhoto(v, churchId));
      pick("font", (v) => (["modern", "serif", "display"].includes(String(v)) ? v : null));
      pick("artSeed", (v) => (Number.isFinite(Number(v)) ? Math.abs(Math.floor(Number(v))) % 1e9 : 1));
      pick("align", (v) => (["left", "center"].includes(String(v)) ? v : "center"));
      pick("logoPosition", (v) => (["top", "bottom", "none"].includes(String(v)) ? v : "bottom"));
      pick("size", (v) => (["square", "portrait", "story", "landscape"].includes(String(v)) ? v : "square"));
      break;
    case "summary":
      for (const k of ["title", "mainTheme", "body"]) pick(k, (v) => s(v));
      pick("keyPoints", arr);
      pick("scriptureReferences", arr);
      break;
    case "devotional":
      for (const k of ["title", "scripture", "reflection", "application", "prayer"]) pick(k, (v) => s(v));
      break;
    case "article":
      for (const k of ["title", "introduction", "application", "conclusion"]) pick(k, (v) => s(v));
      pick("scriptureReferences", arr);
      pick("sections", (v) =>
        (Array.isArray(v) ? v : []).slice(0, 20).map((x: any) => ({ heading: s(x?.heading, 300), body: s(x?.body) })),
      );
      break;
    case "captions":
      pick("platforms", (v) => {
        const o: Record<string, string> = {};
        if (v && typeof v === "object") for (const [k, val] of Object.entries(v)) if (/^[a-z_]{2,20}$/.test(k)) o[k] = s(val, 3000);
        return o;
      });
      break;
    case "audio":
      pick("showNotes", (v) => s(v, 5000));
      break;
  }
  return out;
}

/** Edit an asset. Creates a new version and, when required, sends it back for approval. */
export const updateAsset = onCall(opts, async (req) => {
  const d = (req.data || {}) as Record<string, any>;
  const m = await requireMember(req, d.churchId, "contributor");
  const assetId = str(d.assetId, "Asset");
  const ref = assetRef(m.churchId, assetId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Asset not found.");
  const a = snap.data()!;
  if (a.status === "processing") throw new HttpsError("failed-precondition", "This asset is still being generated. Try again when it's ready.");
  if (typeof d.expectedVersion === "number" && d.expectedVersion !== Number(a.version)) {
    throw new HttpsError("aborted", "Someone else changed this asset. Reload to see the latest version before editing.");
  }

  const patch = (d.patch || {}) as Record<string, any>;
  const changedKeys: string[] = [];
  const update: Record<string, unknown> = {};

  if (typeof patch.title === "string" && patch.title.trim() && patch.title !== a.title) {
    update.title = patch.title.trim().slice(0, 200);
    changedKeys.push("title");
  }
  if (patch.content && typeof patch.content === "object") {
    const next = sanitizeContent(a.type, a.content || {}, patch.content, m.churchId);
    for (const k of Object.keys(next)) {
      if (JSON.stringify(next[k]) !== JSON.stringify((a.content || {})[k])) changedKeys.push(k);
    }
    update.content = next;
  }
  if (a.type === "video" && patch.source && typeof patch.source === "object") {
    const start = Number(patch.source.start);
    const end = Number(patch.source.end);
    const sermon = (await sermonRef(m.churchId, a.sermonId).get()).data();
    const max = Number(sermon?.durationSec || 1e9);
    if (!(start >= 0 && end > start && end <= max + 1)) throw new HttpsError("invalid-argument", "Clip start and end must fall within the sermon.");
    if (end - start < 5 || end - start > 300) throw new HttpsError("invalid-argument", "Clips must be between 5 seconds and 5 minutes.");
    if (Math.abs(start - a.source.start) > 0.01 || Math.abs(end - a.source.end) > 0.01) {
      const t = await transcriptRef(m.churchId, a.sermonId).get();
      const segs = (t.get("segments") || []) as Segment[];
      const inRange = segs.filter((x) => x.end > start && x.start < end);
      update.source = { ...a.source, start, end, segmentFrom: inRange[0]?.i ?? a.source.segmentFrom, segmentTo: inRange[inRange.length - 1]?.i ?? a.source.segmentTo };
      update.transcriptExcerpt = inRange.map((x) => x.text).join(" ");
      update.durationSec = Math.round(end - start);
      changedKeys.push("source");
      // Re-time captions if the user didn't edit them in the same save.
      if (!("cues" in (patch.content || {}))) {
        const shift = a.source.start - start;
        const cues = ((a.content?.cues || []) as Cue[])
          .map((c) => ({ ...c, start: c.start + shift, end: c.end + shift }))
          .filter((c) => c.end > 0 && c.start < end - start)
          .map((c) => ({ ...c, start: Math.max(0, c.start), end: Math.min(end - start, c.end) }));
        update.content = { ...((update.content as object) || a.content), cues };
      }
    }
  }
  if (!changedKeys.length) return { ok: true, unchanged: true, version: a.version };

  // Flags: edited quotes that no longer match the sermon word-for-word.
  let flags: AssetFlag[] = (a.flags || []).filter((f: AssetFlag) => f.code !== "quote_edited");
  if (a.type === "graphic" && changedKeys.includes("quote")) {
    const t = await transcriptRef(m.churchId, a.sermonId).get();
    const segs = (t.get("segments") || []) as Segment[];
    const quote = (update.content as { quote: string }).quote;
    const match = verifyQuote(quote, segs, a.source?.segmentFrom ?? 0);
    if (match) {
      update.source = { ...a.source, segmentFrom: match.from, segmentTo: match.to, start: segs[match.from]?.start ?? null, end: segs[match.to]?.end ?? null };
      update.transcriptExcerpt = windowText(segs, match.from, match.to);
    } else {
      flags = [...flags, { code: "quote_edited", message: "This quote no longer matches the sermon transcript word-for-word. Confirm it is faithful before approving." }];
    }
  }
  update.flags = flags;

  const church = (await churchRef(m.churchId).get()).data()!;
  const requireReapproval = church.approval?.requireReapproval !== false;
  const wasApproved = isApprovedCurrent(a);
  const minorOnly = changedKeys.every((k) => MINOR_KEYS.includes(k));
  const needsRender = a.type === "video" && changedKeys.some((k) => RENDER_KEYS.includes(k) || k === "source");
  const newVersion = Number(a.version || 1) + 1;

  update.version = newVersion;
  update.updatedAt = FieldValue.serverTimestamp();
  update.updatedBy = m.uid;
  update.updatedByName = m.name;

  let reapprovalRequired = false;
  if (wasApproved && (!requireReapproval && minorOnly)) {
    update.approvedVersion = newVersion; // approval carries over for minor edits when the church allows it
  } else if (wasApproved) {
    reapprovalRequired = true;
    update.status = "needs_review";
  } else if (a.status === "changes_requested") {
    update.status = "needs_review";
  }
  if (needsRender) {
    update.status = "processing";
    update.media = null;
    update.render = { status: "pending" };
  }

  await ref.update(update);
  const after = (await ref.get()).data()!;
  await saveVersion(ref, after, { uid: m.uid, name: m.name }, `Edited: ${changedKeys.join(", ")}`);
  if (needsRender) await enqueue("renderAssetTask", { churchId: m.churchId, assetId, reason: "edit" });
  if (!needsRender && !reapprovalRequired) await refreshStatuses(m.churchId, assetId);
  await audit(m.churchId, m.uid, { type: "asset", id: assetId }, "asset.edited", { version: a.version, status: a.status }, { version: newVersion, status: after.status, changed: changedKeys });
  return { ok: true, version: newVersion, reapprovalRequired, rendering: needsRender };
});

export const submitForReview = onCall(opts, async (req) => {
  const d = (req.data || {}) as Record<string, unknown>;
  const m = await requireMember(req, d.churchId, "contributor");
  const assetId = str(d.assetId, "Asset");
  const ref = assetRef(m.churchId, assetId);
  const a = (await ref.get()).data();
  if (!a) throw new HttpsError("not-found", "Asset not found.");
  if (a.status !== "draft") throw new HttpsError("failed-precondition", "Only drafts can be submitted for review.");
  await ref.update({ status: "needs_review", updatedAt: FieldValue.serverTimestamp() });
  await audit(m.churchId, m.uid, { type: "asset", id: assetId }, "asset.submitted", { status: "draft" }, { status: "needs_review" });
  return { ok: true };
});

function ids(v: unknown): string[] {
  if (!Array.isArray(v) || !v.length) throw new HttpsError("invalid-argument", "Select at least one asset.");
  if (v.length > 100) throw new HttpsError("invalid-argument", "Select up to 100 assets at a time.");
  return v.map((x) => str(x, "Asset", 100));
}

/** Approve one or many assets. Only assets awaiting review are eligible — nothing is auto-approved. */
export const approveAssets = onCall(opts, async (req) => {
  const d = (req.data || {}) as Record<string, unknown>;
  const m = await requireMember(req, d.churchId, "editor");
  const assetIds = ids(d.assetIds);
  const approved: string[] = [];
  const skipped: { id: string; reason: string }[] = [];
  for (const id of assetIds) {
    const ref = assetRef(m.churchId, id);
    const snap = await ref.get();
    const a = snap.data();
    if (!a) {
      skipped.push({ id, reason: "Not found" });
      continue;
    }
    if (a.status !== "needs_review") {
      skipped.push({ id, reason: `Status is ${a.status.replace("_", " ")}` });
      continue;
    }
    if (["video", "audio"].includes(a.type) && !a.media?.path) {
      skipped.push({ id, reason: "Media has not been rendered" });
      continue;
    }
    await ref.update({
      status: "approved",
      approvedVersion: Number(a.version),
      approvedBy: m.uid,
      approvedByName: m.name,
      approvedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    await ref.collection("versions").doc(String(a.version)).set({ status: "approved", approvedBy: m.uid, approvedByName: m.name }, { merge: true });
    await refreshStatuses(m.churchId, id);
    await audit(m.churchId, m.uid, { type: "asset", id }, "asset.approved", { status: a.status }, { status: "approved", version: a.version });
    approved.push(id);
  }
  return { approved, skipped };
});

export const REVISION_REASONS = ["correct_captions", "change_duration", "improve_context", "change_branding", "correct_quote", "regenerate", "other"];

/** Return assets for revision. The original version is preserved; a revised version is generated and returned to review. */
export const requestChanges = onCall(opts, async (req) => {
  const d = (req.data || {}) as Record<string, unknown>;
  const m = await requireMember(req, d.churchId, "contributor");
  const assetIds = ids(d.assetIds);
  const reasons = (Array.isArray(d.reasons) ? d.reasons : []).map(String).filter((r) => REVISION_REASONS.includes(r));
  const instructions = str(d.instructions, "Instructions", 2000, true);
  if (!reasons.length && !instructions) throw new HttpsError("invalid-argument", "Tell us what should change.");
  const requested: string[] = [];
  const skipped: { id: string; reason: string }[] = [];
  for (const id of assetIds) {
    const r = await requestOne(m, id, reasons, instructions).catch((e: Error) => e);
    if (r instanceof Error) skipped.push({ id, reason: r.message });
    else requested.push(id);
  }
  return { requested, skipped };
});

async function requestOne(m: MemberContext, assetId: string, reasons: string[], instructions: string) {
  const ref = assetRef(m.churchId, assetId);
  const a = (await ref.get()).data();
  if (!a) throw new Error("Not found");
  if (!["needs_review", "approved", "scheduled", "failed", "draft"].includes(a.status)) throw new Error(`Status is ${String(a.status).replace("_", " ")}`);
  if (a.status === "failed" && a.render?.status === "failed") throw new Error("Rendering failed — retry the render instead");
  if (a.type === "audio") throw new Error("Podcast audio can't be revised automatically");
  const rev = ref.collection("revisions").doc();
  await rev.set({
    assetId,
    fromVersion: Number(a.version),
    previousVersion: Number(a.version),
    reasons,
    instructions,
    status: "pending",
    createdBy: m.uid,
    createdByName: m.name,
    createdAt: FieldValue.serverTimestamp(),
  });
  await ref.update({ status: "changes_requested", revisionError: null, lastRevisionId: rev.id, updatedAt: FieldValue.serverTimestamp() });
  await enqueue("reviseAssetTask", { churchId: m.churchId, assetId, revisionId: rev.id });
  await audit(m.churchId, m.uid, { type: "asset", id: assetId }, "asset.changes_requested", { status: a.status, version: a.version }, { reasons, instructions });
}

export const deleteAsset = onCall(opts, async (req) => {
  const d = (req.data || {}) as Record<string, unknown>;
  const m = await requireMember(req, d.churchId, "editor");
  const assetId = str(d.assetId, "Asset");
  const ref = assetRef(m.churchId, assetId);
  const a = (await ref.get()).data();
  if (!a) throw new HttpsError("not-found", "Asset not found.");
  let finalize = false;
  if (a.status === "processing" && !a.render?.counted) {
    const sRef = sermonRef(m.churchId, a.sermonId);
    const left = await db.runTransaction(async (tx) => {
      const s = await tx.get(sRef);
      const n = Number(s.get("processing.pendingRenders") || 0);
      if (n <= 0) return -1;
      tx.update(sRef, { "processing.pendingRenders": n - 1 });
      return n - 1;
    });
    finalize = left === 0;
  }
  const pubs = await churchRef(m.churchId).collection("publications").where("assetId", "==", assetId).get();
  const batch = db.batch();
  pubs.docs.forEach((p) => batch.delete(p.ref));
  await batch.commit();
  await db.recursiveDelete(ref);
  await bucket().deleteFiles({ prefix: `churches/${m.churchId}/assets/${assetId}/` }).catch(() => undefined);
  if (finalize) await finalizeSermon(m.churchId, a.sermonId);
  await audit(m.churchId, m.uid, { type: "asset", id: assetId }, "asset.deleted", { title: a.title, type: a.type, status: a.status }, null);
  return { ok: true };
});

/** One-tap AI rewrite of one platform caption. Returns text only — nothing is saved until the user saves. */
export const polishSocialCaption = onCall({ region: REGION, secrets: [ANTHROPIC_API_KEY], timeoutSeconds: 60 }, async (req) => {
  const d = (req.data || {}) as Record<string, unknown>;
  const m = await requireMember(req, d.churchId, "contributor");
  const assetId = str(d.assetId, "Asset", 100);
  const action = str(d.action, "Action", 20);
  const platform = str(d.platform, "Platform", 30);
  const text = str(d.text, "Caption", 6000);
  if (!POLISH_ACTIONS.includes(action)) throw new HttpsError("invalid-argument", "Unknown rewrite.");
  const [aSnap, cSnap] = await Promise.all([assetRef(m.churchId, assetId).get(), churchRef(m.churchId).get()]);
  if (!aSnap.exists || aSnap.data()!.type !== "captions") throw new HttpsError("not-found", "Caption set not found.");
  const a = aSnap.data()!;
  try {
    const out = await polishCaption({ text, action, platform, church: cSnap.data() as never, sermon: { title: a.sermonTitle, preacher: a.preacher } });
    return { text: out.slice(0, 6000) };
  } catch (e) {
    throw new HttpsError("unavailable", (e as Error).message || "Could not rewrite the caption.");
  }
});

/** Mark one "please check" point as verified against the recording (or un-mark it). */
export const checkAssetFlag = onCall(opts, async (req) => {
  const d = (req.data || {}) as Record<string, unknown>;
  const m = await requireMember(req, d.churchId, "contributor");
  const assetId = str(d.assetId, "Asset", 100);
  const index = Number(d.index);
  const checked = d.checked === true;
  const ref = assetRef(m.churchId, assetId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Asset not found.");
    const flags = [...((snap.data()!.flags || []) as AssetFlag[])];
    if (!Number.isInteger(index) || index < 0 || index >= flags.length) throw new HttpsError("invalid-argument", "Unknown item.");
    flags[index] = checked
      ? { ...flags[index], checked: true, checkedBy: m.uid, checkedByName: m.name }
      : { code: flags[index].code, message: flags[index].message, ...(flags[index].segment !== undefined ? { segment: flags[index].segment } : {}), ...(flags[index].at !== undefined ? { at: flags[index].at } : {}) };
    tx.update(ref, { flags, flagsOpen: flags.filter((f) => !f.checked).length });
  });
  await audit(m.churchId, m.uid, { type: "asset", id: assetId }, checked ? "asset.flag_checked" : "asset.flag_unchecked", { index });
  return { ok: true };
});
