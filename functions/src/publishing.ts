import { onCall, HttpsError } from "firebase-functions/v2/https";
import { assetRef, churchRef, FieldValue, publicationRef, REGION, sermonRef, Timestamp } from "./lib/admin";
import { requireMember, str, MemberContext } from "./lib/auth";
import { audit, notify } from "./lib/events";
import { isApprovedCurrent } from "./lib/assets";
import { ROLE_RANK, Role } from "./lib/types";

const opts = { region: REGION };

export const PLATFORMS = ["instagram", "facebook", "tiktok", "youtube", "x", "whatsapp", "website", "email", "podcast", "other"];

/**
 * Recompute an asset's status from its publications, and its sermon's status.
 * Only applies when the current version is approved — otherwise the asset
 * stays in review and nothing can be published.
 */
export async function refreshStatuses(churchId: string, assetId: string) {
  const ref = assetRef(churchId, assetId);
  const a = (await ref.get()).data();
  if (!a) return;
  if (isApprovedCurrent(a) || a.status === "approved") {
    const pubs = await churchRef(churchId).collection("publications").where("assetId", "==", assetId).get();
    const states = pubs.docs.map((p) => p.get("status") as string);
    let status = "approved";
    if (states.includes("failed")) status = "failed";
    else if (states.includes("scheduled")) status = "scheduled";
    else if (states.includes("published")) status = "published";
    if (status !== a.status) await ref.update({ status, updatedAt: FieldValue.serverTimestamp() });
  }
  // Sermon is "published" once any of its content has been published.
  const published = await churchRef(churchId).collection("assets").where("sermonId", "==", a.sermonId).where("status", "==", "published").limit(1).get();
  const sRef = sermonRef(churchId, a.sermonId);
  const sermon = (await sRef.get()).data();
  if (sermon && ["ready", "published"].includes(sermon.status)) {
    const next = published.empty ? "ready" : "published";
    if (next !== sermon.status) await sRef.update({ status: next });
  }
}

async function requirePublisher(req: Parameters<typeof requireMember>[0], churchId: unknown): Promise<MemberContext> {
  const m = await requireMember(req, churchId, "contributor");
  const church = (await churchRef(m.churchId).get()).data();
  const needed = (church?.approval?.publishingRole as Role) || "editor";
  if (ROLE_RANK[m.role] < ROLE_RANK[needed]) {
    throw new HttpsError("permission-denied", `Only ${needed === "admin" ? "administrators" : "editors and administrators"} can schedule or publish content.`);
  }
  return m;
}

function parseWhen(v: unknown): Timestamp {
  const d = new Date(String(v));
  if (isNaN(d.getTime())) throw new HttpsError("invalid-argument", "Choose a valid publication date and time.");
  return Timestamp.fromDate(d);
}

function platform(v: unknown) {
  const p = String(v || "").toLowerCase();
  if (!PLATFORMS.includes(p)) throw new HttpsError("invalid-argument", "Choose a platform.");
  return p;
}

function assertApproved(a: FirebaseFirestore.DocumentData | undefined) {
  if (!a) throw new HttpsError("not-found", "Asset not found.");
  if (!isApprovedCurrent(a)) {
    throw new HttpsError(
      "failed-precondition",
      a.status === "draft"
        ? "This is a draft. Submit it for review and approve it before scheduling."
        : "Approval is required. Approve the latest version of this asset before scheduling or publishing it.",
    );
  }
}

export const schedulePublication = onCall(opts, async (req) => {
  const d = (req.data || {}) as Record<string, unknown>;
  const m = await requirePublisher(req, d.churchId);
  const assetId = str(d.assetId, "Asset");
  const a = (await assetRef(m.churchId, assetId).get()).data();
  assertApproved(a);
  const when = parseWhen(d.scheduledAt);
  if (when.toMillis() < Date.now() - 5 * 60 * 1000) throw new HttpsError("invalid-argument", "Choose a time in the future, or mark it as published now.");
  const ref = churchRef(m.churchId).collection("publications").doc();
  const data = {
    assetId,
    assetTitle: a!.title,
    assetType: a!.type,
    category: a!.category,
    sermonId: a!.sermonId,
    sermonTitle: a!.sermonTitle,
    assetVersion: a!.version,
    platform: platform(d.platform),
    scheduledAt: when,
    caption: str(d.caption, "Caption", 5000, true) || a!.content?.socialCaption || "",
    status: "scheduled",
    method: "manual", // no verified direct-publishing integrations in the MVP
    externalUrl: null,
    externalId: null,
    error: null,
    createdBy: m.uid,
    createdByName: m.name,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.set(data);
  await refreshStatuses(m.churchId, assetId);
  await audit(m.churchId, m.uid, { type: "publication", id: ref.id }, "publication.scheduled", null, { assetId, platform: data.platform, scheduledAt: when.toDate().toISOString() });
  return { publicationId: ref.id };
});

export const updatePublication = onCall(opts, async (req) => {
  const d = (req.data || {}) as Record<string, unknown>;
  const m = await requirePublisher(req, d.churchId);
  const ref = publicationRef(m.churchId, str(d.publicationId, "Publication"));
  const p = (await ref.get()).data();
  if (!p) throw new HttpsError("not-found", "Scheduled item not found.");
  if (!["scheduled", "failed"].includes(p.status)) throw new HttpsError("failed-precondition", "Only scheduled or failed items can be changed.");
  const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
  if (d.scheduledAt !== undefined) patch.scheduledAt = parseWhen(d.scheduledAt);
  if (d.caption !== undefined) patch.caption = str(d.caption, "Caption", 5000, true);
  if (d.platform !== undefined) patch.platform = platform(d.platform);
  if (p.status === "failed") {
    // Recovery: Failed → Scheduled requires the asset to still be approved.
    assertApproved((await assetRef(m.churchId, p.assetId).get()).data());
    patch.status = "scheduled";
    patch.error = null;
  }
  await ref.update(patch);
  await refreshStatuses(m.churchId, p.assetId);
  await audit(m.churchId, m.uid, { type: "publication", id: ref.id }, "publication.updated", { status: p.status, scheduledAt: p.scheduledAt?.toDate?.()?.toISOString?.() }, { ...patch, scheduledAt: (patch.scheduledAt as Timestamp | undefined)?.toDate().toISOString(), updatedAt: undefined });
  return { ok: true };
});

export const cancelPublication = onCall(opts, async (req) => {
  const d = (req.data || {}) as Record<string, unknown>;
  const m = await requirePublisher(req, d.churchId);
  const ref = publicationRef(m.churchId, str(d.publicationId, "Publication"));
  const p = (await ref.get()).data();
  if (!p) throw new HttpsError("not-found", "Scheduled item not found.");
  if (!["scheduled", "failed"].includes(p.status)) throw new HttpsError("failed-precondition", "Published items can't be unscheduled.");
  await ref.delete();
  await refreshStatuses(m.churchId, p.assetId);
  await audit(m.churchId, m.uid, { type: "publication", id: ref.id }, "publication.removed", { status: p.status, platform: p.platform }, null);
  return { ok: true };
});

/**
 * Record that content was published manually (no direct integrations yet).
 * Never called automatically — a person confirms each publication.
 */
export const markPublished = onCall(opts, async (req) => {
  const d = (req.data || {}) as Record<string, unknown>;
  const m = await requirePublisher(req, d.churchId);
  let ref;
  let assetId: string;
  if (d.publicationId) {
    ref = publicationRef(m.churchId, str(d.publicationId, "Publication"));
    const p = (await ref.get()).data();
    if (!p) throw new HttpsError("not-found", "Scheduled item not found.");
    if (p.status === "published") return { ok: true };
    assetId = p.assetId;
  } else {
    assetId = str(d.assetId, "Asset");
    ref = churchRef(m.churchId).collection("publications").doc();
  }
  const a = (await assetRef(m.churchId, assetId).get()).data();
  assertApproved(a);
  const url = str(d.externalUrl, "Link", 1000, true);
  if (url && !/^https?:\/\//i.test(url)) throw new HttpsError("invalid-argument", "Links must start with http:// or https://");
  const common = {
    status: "published",
    method: "manual",
    externalUrl: url || null,
    publishedAt: FieldValue.serverTimestamp(),
    publishedBy: m.uid,
    publishedByName: m.name,
    assetVersion: a!.version,
    error: null,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (d.publicationId) {
    await ref.update(common);
  } else {
    await ref.set({
      ...common,
      assetId,
      assetTitle: a!.title,
      assetType: a!.type,
      category: a!.category,
      sermonId: a!.sermonId,
      sermonTitle: a!.sermonTitle,
      platform: platform(d.platform),
      scheduledAt: Timestamp.now(),
      caption: str(d.caption, "Caption", 5000, true) || a!.content?.socialCaption || "",
      createdBy: m.uid,
      createdByName: m.name,
      createdAt: FieldValue.serverTimestamp(),
    });
  }
  await refreshStatuses(m.churchId, assetId);
  await audit(m.churchId, m.uid, { type: "publication", id: ref.id }, "publication.published_manually", null, { assetId, url: url || null });
  return { ok: true, publicationId: ref.id };
});

export const markPublicationFailed = onCall(opts, async (req) => {
  const d = (req.data || {}) as Record<string, unknown>;
  const m = await requirePublisher(req, d.churchId);
  const ref = publicationRef(m.churchId, str(d.publicationId, "Publication"));
  const p = (await ref.get()).data();
  if (!p) throw new HttpsError("not-found", "Scheduled item not found.");
  if (p.status !== "scheduled") throw new HttpsError("failed-precondition", "Only scheduled items can be marked as failed.");
  const error = str(d.error, "Reason", 1000, true) || "Publication failed";
  await ref.update({ status: "failed", error, updatedAt: FieldValue.serverTimestamp() });
  await refreshStatuses(m.churchId, p.assetId);
  await notify(m.churchId, {
    type: "publication_failed",
    title: "Publication failed",
    message: `“${p.assetTitle}” on ${p.platform}: ${error}`,
    link: `/calendar`,
    entity: { type: "publication", id: ref.id },
  });
  await audit(m.churchId, m.uid, { type: "publication", id: ref.id }, "publication.failed", { status: "scheduled" }, { status: "failed", error });
  return { ok: true };
});
