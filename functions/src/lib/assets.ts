import { DocumentReference, DocumentData } from "firebase-admin/firestore";
import { FieldValue } from "./admin";
import type { AssetStatus } from "./types";

/** Fields that make up one version of an asset. */
export const VERSIONED_FIELDS = ["title", "content", "source", "media", "transcriptExcerpt", "flags"] as const;

export function versionSnapshot(data: DocumentData) {
  const snap: Record<string, unknown> = {};
  for (const f of VERSIONED_FIELDS) snap[f] = data[f] ?? null;
  return snap;
}

/** Persist an immutable copy of the asset at its current version. */
export async function saveVersion(
  ref: DocumentReference,
  data: DocumentData,
  by: { uid: string | null; name: string },
  reason: string,
  extra: Record<string, unknown> = {},
) {
  const version = Number(data.version || 1);
  await ref
    .collection("versions")
    .doc(String(version))
    .set(
      {
        version,
        ...versionSnapshot(data),
        status: data.status,
        reason,
        createdBy: by.uid,
        createdByName: by.name,
        createdAt: FieldValue.serverTimestamp(),
        ...extra,
      },
      { merge: true },
    );
}

// --------------------------------------------------------------------------
// Review workflow
// --------------------------------------------------------------------------

export const TRANSITIONS: Record<AssetStatus, AssetStatus[]> = {
  draft: ["needs_review"],
  processing: ["needs_review", "failed"],
  needs_review: ["approved", "changes_requested", "processing"],
  changes_requested: ["needs_review", "processing"],
  approved: ["scheduled", "published", "needs_review", "changes_requested", "processing"],
  scheduled: ["published", "failed", "approved", "needs_review", "processing"],
  published: ["scheduled", "needs_review", "processing"],
  failed: ["scheduled", "published", "approved", "needs_review", "processing"],
};

export function canTransition(from: AssetStatus, to: AssetStatus) {
  return from === to || (TRANSITIONS[from] || []).includes(to);
}

/** Approved means: a human approved exactly the version that exists now. */
export function isApprovedCurrent(data: DocumentData) {
  return (
    ["approved", "scheduled", "published", "failed"].includes(data.status) &&
    Number(data.approvedVersion || 0) === Number(data.version || 0)
  );
}
