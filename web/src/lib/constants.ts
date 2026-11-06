import type { AssetStatus, AssetType, SermonStatus } from "./types";

// Must match storage.rules and functions/src/sermons.ts
export const SUPPORTED_UPLOAD = {
  mime: /^(audio\/(mpeg|mp3|mp4|x-m4a|m4a|aac|wav|x-wav|wave|webm|ogg|flac|x-flac)|video\/(mp4|quicktime|webm|x-matroska))$/,
  extensions: ["mp3", "m4a", "aac", "wav", "ogg", "flac", "mp4", "mov", "webm", "mkv"],
  maxBytes: 2 * 1024 * 1024 * 1024,
  label: "MP3, M4A, WAV, AAC, OGG, FLAC, MP4, MOV, WEBM or MKV — up to 2 GB",
};

export const EXT_MIME: Record<string, string> = {
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  ogg: "audio/ogg",
  flac: "audio/flac",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
};

export const SERMON_STATUS: Record<SermonStatus, { label: string; tone: Tone }> = {
  uploading: { label: "Upload incomplete", tone: "muted" },
  queued: { label: "Queued", tone: "progress" },
  processing: { label: "Processing", tone: "progress" },
  ready: { label: "Ready", tone: "good" },
  published: { label: "Published", tone: "forest" },
  failed: { label: "Failed", tone: "bad" },
  needs_configuration: { label: "Needs setup", tone: "warn" },
};

export const ASSET_STATUS: Record<AssetStatus, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "muted" },
  processing: { label: "Processing", tone: "progress" },
  needs_review: { label: "Needs review", tone: "warn" },
  changes_requested: { label: "Changes requested", tone: "progress" },
  approved: { label: "Approved", tone: "good" },
  scheduled: { label: "Scheduled", tone: "gold" },
  published: { label: "Published", tone: "forest" },
  failed: { label: "Failed", tone: "bad" },
};

export type Tone = "muted" | "progress" | "good" | "forest" | "bad" | "warn" | "gold";

export const ASSET_TYPE: Record<AssetType, { label: string; category: "video" | "graphic" | "written" | "audio" }> = {
  video: { label: "Video clip", category: "video" },
  graphic: { label: "Quote graphic", category: "graphic" },
  summary: { label: "Sermon summary", category: "written" },
  devotional: { label: "Devotional", category: "written" },
  article: { label: "Article", category: "written" },
  captions: { label: "Social captions", category: "written" },
  audio: { label: "Podcast audio", category: "audio" },
};

export const PLATFORMS: { id: string; label: string }[] = [
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "tiktok", label: "TikTok" },
  { id: "youtube", label: "YouTube" },
  { id: "x", label: "X" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "website", label: "Website" },
  { id: "email", label: "Email newsletter" },
  { id: "podcast", label: "Podcast" },
  { id: "other", label: "Other" },
];
export const platformLabel = (id: string) => PLATFORMS.find((p) => p.id === id)?.label || id;

export const REVISION_REASONS = [
  { id: "correct_captions", label: "Correct captions" },
  { id: "change_duration", label: "Change clip duration" },
  { id: "improve_context", label: "Improve context" },
  { id: "change_branding", label: "Change branding" },
  { id: "correct_quote", label: "Correct quote" },
  { id: "regenerate", label: "Regenerate content" },
  { id: "other", label: "Other" },
];

export const STAGE_LABELS: Record<string, string> = {
  probe: "Checking recording",
  transcribe: "Transcribing",
  analyse: "Understanding the message",
  generate: "Generating content",
  render: "Rendering media",
};

export const BIBLE_TRANSLATIONS = ["NIV", "KJV", "NKJV", "ESV", "NLT", "NASB", "AMP", "CSB", "MSG", "RSV", "NRSV", "Other"];
export const LANGUAGES = [
  { id: "en", label: "English" },
  { id: "fr", label: "French" },
  { id: "es", label: "Spanish" },
  { id: "pt", label: "Portuguese" },
  { id: "de", label: "German" },
  { id: "auto", label: "Detect automatically" },
];
export const TONES = ["warm and pastoral", "encouraging", "reflective", "joyful", "plain and direct", "scholarly"];

export const CONTENT_TYPE_OPTIONS = [
  { id: "video", label: "Short video clips" },
  { id: "graphic", label: "Quote graphics" },
  { id: "summary", label: "Sermon summary" },
  { id: "devotional", label: "Devotional" },
  { id: "article", label: "Article" },
  { id: "captions", label: "Social captions" },
  { id: "audio", label: "Podcast audio" },
];

/** Clips cut from audio-only sermons are audiograms (captioned waveform videos). */
export function assetTypeLabel(a: { type: AssetType; fromAudio?: boolean }) {
  if (a.type === "video" && a.fromAudio) return "Audiogram";
  return ASSET_TYPE[a.type]?.label || a.type;
}
