import { churchRef, FieldValue } from "./admin";

/** Append an audit record for an important action. */
export async function audit(
  churchId: string,
  userId: string | null,
  entity: { type: string; id: string },
  action: string,
  previousState: unknown = null,
  newState: unknown = null,
) {
  await churchRef(churchId)
    .collection("auditEvents")
    .add({
      churchId,
      userId,
      entity,
      action,
      previousState: previousState ?? null,
      newState: newState ?? null,
      timestamp: FieldValue.serverTimestamp(),
    });
}

/**
 * Send one in-app notification to every active member of the church
 * (or to a specific list of users). Notifications are consolidated by the
 * caller — never one per generated asset.
 */
export async function notify(
  churchId: string,
  n: {
    type: "sermon_ready" | "review_ready" | "revision_ready" | "processing_failed" | "publication_failed" | "invite";
    title: string;
    message: string;
    link: string;
    entity: { type: string; id: string };
  },
  userIds?: string[],
) {
  let targets = userIds;
  if (!targets) {
    const members = await churchRef(churchId).collection("members").get();
    targets = members.docs.map((d) => d.id);
  }
  const batch = churchRef(churchId).firestore.batch();
  for (const userId of targets) {
    const ref = churchRef(churchId).collection("notifications").doc();
    batch.set(ref, { ...n, userId, churchId, read: false, createdAt: FieldValue.serverTimestamp() });
  }
  await batch.commit();
}
