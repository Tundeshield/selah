import { randomUUID } from "crypto";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getFunctions } from "firebase-admin/functions";

if (!getApps().length) initializeApp();

export const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });

export const bucket = () => getStorage().bucket();
export const fns = () => getFunctions();
export { FieldValue, Timestamp };

export const REGION = process.env.FUNCTIONS_REGION || "us-central1";

export const churchRef = (churchId: string) => db.collection("churches").doc(churchId);
export const sermonRef = (churchId: string, sermonId: string) =>
  churchRef(churchId).collection("sermons").doc(sermonId);
export const transcriptRef = (churchId: string, sermonId: string) =>
  churchRef(churchId).collection("transcripts").doc(sermonId);
export const assetRef = (churchId: string, assetId: string) =>
  churchRef(churchId).collection("assets").doc(assetId);
export const publicationRef = (churchId: string, id: string) =>
  churchRef(churchId).collection("publications").doc(id);

/**
 * A read URL that external services (Deepgram, ffmpeg) can stream from.
 * Uses the Firebase Storage download-token mechanism (the same one the web
 * SDK's getDownloadURL uses), so no extra IAM signing permissions are needed.
 * The URL is only ever sent server-to-server and never stored.
 */
export async function signedReadUrl(path: string, _minutes = 120): Promise<string> {
  const b = bucket();
  if (process.env.FUNCTIONS_EMULATOR === "true" && process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
    return `http://${process.env.FIREBASE_STORAGE_EMULATOR_HOST}/v0/b/${b.name}/o/${encodeURIComponent(path)}?alt=media`;
  }
  const file = b.file(path);
  const [meta] = await file.getMetadata();
  let token = String(meta.metadata?.firebaseStorageDownloadTokens || "").split(",")[0];
  if (!token) {
    token = randomUUID();
    await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: token } });
  }
  return `https://firebasestorage.googleapis.com/v0/b/${b.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
}
