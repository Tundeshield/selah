import { setGlobalOptions } from "firebase-functions/v2";
import { REGION } from "./lib/admin";

setGlobalOptions({ region: REGION, maxInstances: 20 });

export {
  getIntegrationStatus, ensureUserProfile, createChurch, inviteMember, revokeInvite,
  acceptInvite, updateMemberRole, removeMember,
} from "./church";
export {
  startProcessing, retryProcessing, importTranscript, generateMoreContent, deleteSermon,
  createQuoteGraphic, retryRender, skipRemainingRenders,
} from "./sermons";
export { updateAsset, submitForReview, approveAssets, requestChanges, deleteAsset, polishSocialCaption } from "./review";
export {
  schedulePublication, updatePublication, cancelPublication, markPublished, markPublicationFailed,
} from "./publishing";
export { processSermonTask, renderAssetTask, reviseAssetTask } from "./pipeline/tasks";
