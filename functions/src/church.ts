import { onCall, HttpsError } from "firebase-functions/v2/https";
import { churchRef, db, FieldValue, REGION } from "./lib/admin";
import { requireAuth, requireMember, str } from "./lib/auth";
import { audit } from "./lib/events";
import { ANTHROPIC_API_KEY, DEEPGRAM_API_KEY, integrationStatus } from "./lib/config";
import type { Role } from "./lib/types";

const opts = { region: REGION };

export const getIntegrationStatus = onCall({ ...opts, secrets: [ANTHROPIC_API_KEY, DEEPGRAM_API_KEY] }, async (req) => {
  requireAuth(req);
  return integrationStatus();
});

/** Creates the user's profile on first sign-in and returns any pending invitations. */
export const ensureUserProfile = onCall(opts, async (req) => {
  const user = requireAuth(req);
  const ref = db.collection("users").doc(user.uid);
  const snap = await ref.get();
  const name = typeof (req.data as { name?: unknown })?.name === "string" ? String((req.data as { name: string }).name).slice(0, 120) : null;
  if (!snap.exists) {
    await ref.set({
      uid: user.uid,
      email: user.email,
      name: name || user.name,
      churchIds: [],
      activeChurchId: null,
      createdAt: FieldValue.serverTimestamp(),
    });
  } else if (name && !snap.get("name")) {
    await ref.update({ name });
  }
  const invites = user.email
    ? await db.collectionGroup("invites").where("email", "==", user.email).where("status", "==", "pending").get()
    : null;
  return {
    invites: (invites?.docs || []).map((d) => ({ id: d.id, churchId: d.get("churchId"), churchName: d.get("churchName"), role: d.get("role") })),
  };
});

const COUNTRY_MAX = 80;

export const createChurch = onCall(opts, async (req) => {
  const user = requireAuth(req);
  const d = (req.data || {}) as Record<string, unknown>;
  const name = str(d.name, "Church name", 120);
  const ref = churchRef(db.collection("churches").doc().id);
  const userRef = db.collection("users").doc(user.uid);
  const userSnap = await userRef.get();
  const displayName = (userSnap.get("name") as string) || user.name;

  await db.runTransaction(async (tx) => {
    tx.set(ref, {
      name,
      pastor: str(d.pastor, "Pastor", 120, true),
      website: str(d.website, "Website", 200, true),
      country: str(d.country, "Country", COUNTRY_MAX, true),
      contact: { email: user.email || "", phone: "" },
      logoPath: null,
      logoUrl: null,
      brand: {
        primary: "#18181B",
        secondary: "#F4F4F5",
        accent: "#418FAE",
        font: "Outfit",
        logoPlacement: "top-right",
        captionStyle: "clean",
        graphicTemplate: "cream",
      },
      content: {
        language: str(d.language, "Language", 40, true) || "en",
        tone: "warm and pastoral",
        bibleTranslation: str(d.bibleTranslation, "Bible translation", 40, true) || "NIV",
        scriptureFormat: "Book Chapter:Verse (Translation)",
        clipMin: 30,
        clipMax: 90,
        contentTypes: ["video", "graphic", "summary", "devotional", "article", "captions", "audio"],
        platforms: ["instagram", "facebook", "whatsapp"],
      },
      approval: { requireReapproval: true, defaultReviewerId: user.uid, publishingRole: "editor" },
      onboarding: { completed: false },
      createdBy: user.uid,
      createdAt: FieldValue.serverTimestamp(),
    });
    tx.set(ref.collection("members").doc(user.uid), {
      uid: user.uid,
      name: displayName,
      email: user.email,
      role: "admin",
      status: "active",
      joinedAt: FieldValue.serverTimestamp(),
    });
    if (userSnap.exists) {
      tx.update(userRef, { churchIds: FieldValue.arrayUnion(ref.id), activeChurchId: ref.id });
    } else {
      tx.set(userRef, { uid: user.uid, email: user.email, name: displayName, churchIds: [ref.id], activeChurchId: ref.id, createdAt: FieldValue.serverTimestamp() });
    }
  });
  await audit(ref.id, user.uid, { type: "church", id: ref.id }, "church.created", null, { name });
  return { churchId: ref.id };
});

function inviteId(churchId: string, email: string) {
  return `${churchId}_${Buffer.from(email).toString("base64url")}`;
}

function inviteRef(id: string) {
  const churchId = id.split("_")[0];
  if (!churchId) throw new HttpsError("invalid-argument", "Invalid invitation.");
  return churchRef(churchId).collection("invites").doc(id);
}

export const inviteMember = onCall(opts, async (req) => {
  const d = (req.data || {}) as Record<string, unknown>;
  const m = await requireMember(req, d.churchId, "admin");
  const email = str(d.email, "Email", 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpsError("invalid-argument", "Enter a valid email address.");
  const role = (d.role as Role) || "contributor";
  if (!["admin", "editor", "contributor"].includes(role)) throw new HttpsError("invalid-argument", "Choose a valid role.");
  const existing = await churchRef(m.churchId).collection("members").where("email", "==", email).limit(1).get();
  if (!existing.empty) throw new HttpsError("already-exists", "This person is already on your team.");
  const church = await churchRef(m.churchId).get();
  const id = inviteId(m.churchId, email);
  await inviteRef(id).set({
    churchId: m.churchId,
    churchName: church.get("name"),
    email,
    role,
    status: "pending",
    invitedBy: m.uid,
    invitedByName: m.name,
    createdAt: FieldValue.serverTimestamp(),
  });
  await audit(m.churchId, m.uid, { type: "invite", id }, "member.invited", null, { email, role });
  return { inviteId: id };
});

export const revokeInvite = onCall(opts, async (req) => {
  const d = (req.data || {}) as Record<string, unknown>;
  const m = await requireMember(req, d.churchId, "admin");
  const ref = inviteRef(str(d.inviteId, "Invite"));
  const snap = await ref.get();
  if (!snap.exists || snap.get("churchId") !== m.churchId) throw new HttpsError("not-found", "Invitation not found.");
  await ref.update({ status: "revoked", revokedAt: FieldValue.serverTimestamp() });
  await audit(m.churchId, m.uid, { type: "invite", id: ref.id }, "member.invite_revoked");
  return { ok: true };
});

export const acceptInvite = onCall(opts, async (req) => {
  const user = requireAuth(req);
  const id = str((req.data as Record<string, unknown>)?.inviteId, "Invite");
  const ref = inviteRef(id);
  const snap = await ref.get();
  if (!snap.exists || snap.get("status") !== "pending") throw new HttpsError("not-found", "This invitation is no longer available.");
  if (!user.email || snap.get("email") !== user.email) {
    throw new HttpsError("permission-denied", "This invitation was sent to a different email address.");
  }
  if (req.auth?.token.email_verified !== true) {
    throw new HttpsError("failed-precondition", "Please verify your email address first — check your inbox for the verification link, then try again.");
  }
  const churchId = snap.get("churchId") as string;
  const userRef = db.collection("users").doc(user.uid);
  const userSnap = await userRef.get();
  await db.runTransaction(async (tx) => {
    tx.set(churchRef(churchId).collection("members").doc(user.uid), {
      uid: user.uid,
      name: (userSnap.get("name") as string) || user.name,
      email: user.email,
      role: snap.get("role"),
      status: "active",
      joinedAt: FieldValue.serverTimestamp(),
    });
    tx.set(userRef, { churchIds: FieldValue.arrayUnion(churchId), activeChurchId: churchId }, { merge: true });
    tx.update(ref, { status: "accepted", acceptedAt: FieldValue.serverTimestamp(), acceptedBy: user.uid });
  });
  await audit(churchId, user.uid, { type: "member", id: user.uid }, "member.joined", null, { role: snap.get("role") });
  return { churchId };
});

async function adminCount(churchId: string) {
  const s = await churchRef(churchId).collection("members").where("role", "==", "admin").get();
  return s.size;
}

export const updateMemberRole = onCall(opts, async (req) => {
  const d = (req.data || {}) as Record<string, unknown>;
  const m = await requireMember(req, d.churchId, "admin");
  const uid = str(d.uid, "Member");
  const role = d.role as Role;
  if (!["admin", "editor", "contributor"].includes(role)) throw new HttpsError("invalid-argument", "Choose a valid role.");
  const ref = churchRef(m.churchId).collection("members").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Member not found.");
  if (snap.get("role") === "admin" && role !== "admin" && (await adminCount(m.churchId)) <= 1) {
    throw new HttpsError("failed-precondition", "Your church needs at least one administrator.");
  }
  await ref.update({ role });
  await audit(m.churchId, m.uid, { type: "member", id: uid }, "member.role_changed", { role: snap.get("role") }, { role });
  return { ok: true };
});

export const removeMember = onCall(opts, async (req) => {
  const d = (req.data || {}) as Record<string, unknown>;
  const m = await requireMember(req, d.churchId, "admin");
  const uid = str(d.uid, "Member");
  const ref = churchRef(m.churchId).collection("members").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "Member not found.");
  if (snap.get("role") === "admin" && (await adminCount(m.churchId)) <= 1) {
    throw new HttpsError("failed-precondition", "You can't remove the only administrator.");
  }
  await ref.delete();
  await db.collection("users").doc(uid).set(
    { churchIds: FieldValue.arrayRemove(m.churchId) },
    { merge: true },
  );
  const u = await db.collection("users").doc(uid).get();
  if (u.get("activeChurchId") === m.churchId) await u.ref.update({ activeChurchId: (u.get("churchIds") || [])[0] || null });
  await audit(m.churchId, m.uid, { type: "member", id: uid }, "member.removed", { role: snap.get("role"), email: snap.get("email") }, null);
  return { ok: true };
});
