import { format, formatDistanceToNowStrict, isToday, isYesterday } from "date-fns";
import type { Timestamp } from "firebase/firestore";

export function fmtDuration(sec?: number | null): string {
  if (sec === undefined || sec === null || isNaN(sec)) return "—";
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h) return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function fmtClock(sec?: number | null): string {
  if (sec === undefined || sec === null) return "—";
  const s = Math.max(0, sec);
  const m = Math.floor(s / 60);
  const r = (s % 60).toFixed(1).padStart(4, "0");
  return `${m}:${r}`;
}

export function fmtServiceDate(d?: string) {
  if (!d) return "—";
  const dt = new Date(`${d}T12:00:00`);
  return isNaN(dt.getTime()) ? d : format(dt, "d MMM yyyy");
}

export function tsDate(t?: Timestamp | null): Date | null {
  if (!t) return null;
  return typeof t.toDate === "function" ? t.toDate() : null;
}

export function fmtRelative(t?: Timestamp | null) {
  const d = tsDate(t);
  if (!d) return "just now";
  if (isToday(d)) return formatDistanceToNowStrict(d, { addSuffix: true });
  if (isYesterday(d)) return `Yesterday, ${format(d, "HH:mm")}`;
  return format(d, "d MMM, HH:mm");
}

export function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function titleFromFile(name: string) {
  return name
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b(\d{4})\s(\d{2})\s(\d{2})\b/, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

export function errMessage(e: unknown): string {
  // Firebase callable / SDK errors carry a friendly message; never show stack traces.
  const anyE = e as { message?: string; code?: string };
  const msg = anyE?.message || "Something went wrong. Please try again.";
  return msg.replace(/^Firebase:\s*/i, "").replace(/\s*\(auth\/[a-z-]+\)\.?$/i, "").replace(/^FirebaseError:\s*/i, "");
}

export function authError(e: unknown): string {
  const code = (e as { code?: string })?.code || "";
  const map: Record<string, string> = {
    "auth/invalid-credential": "That email and password don't match our records.",
    "auth/wrong-password": "That email and password don't match our records.",
    "auth/user-not-found": "That email and password don't match our records.",
    "auth/email-already-in-use": "An account already exists for this email. Try signing in.",
    "auth/weak-password": "Use a password of at least 8 characters.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/too-many-requests": "Too many attempts. Please wait a moment and try again.",
    "auth/network-request-failed": "We couldn't reach the server. Check your connection.",
  };
  return map[code] || errMessage(e);
}
