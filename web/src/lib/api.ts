import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

function call<Req, Res = { ok: true }>(name: string) {
  return async (data: Req): Promise<Res> => {
    const fn = httpsCallable<Req, Res>(functions, name);
    const res = await fn(data);
    return res.data;
  };
}

type C = { churchId: string };

export const api = {
  integrationStatus: call<Record<string, never>, { transcription: boolean; ai: boolean; rendering: boolean; directPublishing: boolean }>("getIntegrationStatus"),
  ensureUserProfile: call<{ name?: string }, { invites: { id: string; churchId: string; churchName: string; role: string }[] }>("ensureUserProfile"),
  createChurch: call<{ name: string; pastor?: string; website?: string; country?: string; language?: string; bibleTranslation?: string }, { churchId: string }>("createChurch"),
  inviteMember: call<C & { email: string; role: string }, { inviteId: string }>("inviteMember"),
  revokeInvite: call<C & { inviteId: string }>("revokeInvite"),
  acceptInvite: call<{ inviteId: string }, { churchId: string }>("acceptInvite"),
  updateMemberRole: call<C & { uid: string; role: string }>("updateMemberRole"),
  removeMember: call<C & { uid: string }>("removeMember"),

  startProcessing: call<C & { sermonId: string }>("startProcessing"),
  retryProcessing: call<C & { sermonId: string }, { ok: true; from: string }>("retryProcessing"),
  importTranscript: call<C & { sermonId: string; segments: { start: number; end: number; text: string }[]; hasTimestamps: boolean }, { ok: true; segments: number }>("importTranscript"),
  generateMoreContent: call<C & { sermonId: string; types: string[] }>("generateMoreContent"),
  deleteSermon: call<C & { sermonId: string }, { ok: true; deletedAssets: number }>("deleteSermon"),
  createQuoteGraphic: call<C & { sermonId: string; text: string; segment: number }, { assetId: string }>("createQuoteGraphic"),
  retryRender: call<C & { assetId: string }>("retryRender"),
  skipRemainingRenders: call<C & { sermonId: string }, { ok: true; removed: number }>("skipRemainingRenders"),

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  updateAsset: call<C & { assetId: string; expectedVersion?: number; patch: { title?: string; content?: any; source?: { start: number; end: number } } }, { ok: true; version: number; reapprovalRequired?: boolean; rendering?: boolean; unchanged?: boolean }>("updateAsset"),
  submitForReview: call<C & { assetId: string }>("submitForReview"),
  approveAssets: call<C & { assetIds: string[] }, { approved: string[]; skipped: { id: string; reason: string }[] }>("approveAssets"),
  checkAssetFlag: call<C & { assetId: string; index: number; checked: boolean }, { ok: true }>("checkAssetFlag"),
  polishSocialCaption: call<C & { assetId: string; platform: string; action: string; text: string }, { text: string }>("polishSocialCaption"),
  requestChanges: call<C & { assetIds: string[]; reasons: string[]; instructions: string }, { requested: string[]; skipped: { id: string; reason: string }[] }>("requestChanges"),
  deleteAsset: call<C & { assetId: string }>("deleteAsset"),

  schedulePublication: call<C & { assetId: string; platform: string; scheduledAt: string; caption?: string }, { publicationId: string }>("schedulePublication"),
  updatePublication: call<C & { publicationId: string; scheduledAt?: string; caption?: string; platform?: string }>("updatePublication"),
  cancelPublication: call<C & { publicationId: string }>("cancelPublication"),
  markPublished: call<C & { publicationId?: string; assetId?: string; platform?: string; externalUrl?: string; caption?: string }, { ok: true; publicationId: string }>("markPublished"),
  markPublicationFailed: call<C & { publicationId: string; error: string }>("markPublicationFailed"),
};
