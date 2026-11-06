import { doc, serverTimestamp, updateDoc } from "firebase/firestore";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { db, storage } from "./firebase";

export const LOGO_TYPES = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];

export async function uploadChurchLogo(churchId: string, file: File) {
  if (!LOGO_TYPES.includes(file.type)) throw new Error("Use a PNG, JPG, WEBP or SVG image.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Logos must be smaller than 5 MB.");
  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `churches/${churchId}/branding/logo-${Date.now()}.${ext}`;
  await uploadBytes(ref(storage, path), file, { contentType: file.type });
  const url = await getDownloadURL(ref(storage, path));
  await updateDoc(doc(db, "churches", churchId), { logoPath: path, logoUrl: url, updatedAt: serverTimestamp() });
  return { path, url };
}

export async function updateChurch(churchId: string, patch: Record<string, unknown>) {
  await updateDoc(doc(db, "churches", churchId), { ...patch, updatedAt: serverTimestamp() });
}
