import type { Timestamp } from "firebase-admin/firestore";

export type Role = "admin" | "editor" | "contributor";

export const ROLE_RANK: Record<Role, number> = { admin: 3, editor: 2, contributor: 1 };

export type SermonStatus =
  | "uploading"
  | "queued"
  | "processing"
  | "ready"
  | "published"
  | "failed"
  | "needs_configuration";

export type StageName = "probe" | "transcribe" | "analyse" | "generate" | "render";
export const STAGES: StageName[] = ["probe", "transcribe", "analyse", "generate", "render"];

export type StageStatus = "pending" | "running" | "done" | "failed" | "skipped";

export interface StageState {
  status: StageStatus;
  startedAt?: Timestamp | null;
  finishedAt?: Timestamp | null;
  error?: string | null;
  detail?: string | null;
}

export type AssetStatus =
  | "draft"
  | "processing"
  | "needs_review"
  | "changes_requested"
  | "approved"
  | "scheduled"
  | "published"
  | "failed";

export type AssetType =
  | "video"
  | "graphic"
  | "summary"
  | "devotional"
  | "article"
  | "captions"
  | "audio";

export type AssetCategory = "video" | "graphic" | "written" | "audio";

export function categoryOf(type: AssetType): AssetCategory {
  if (type === "video") return "video";
  if (type === "graphic") return "graphic";
  if (type === "audio") return "audio";
  return "written";
}

export interface Segment {
  i: number;
  start: number; // seconds
  end: number; // seconds
  speaker?: number | null;
  text: string;
}

export interface Cue {
  start: number; // seconds, relative to clip start
  end: number;
  text: string;
}

export interface AssetFlag {
  code: string;
  message: string;
  /** Transcript segment / time the note refers to, when known. */
  segment?: number;
  at?: number;
  /** Set when a reviewer has checked it against the recording. */
  checked?: boolean;
  checkedBy?: string;
  checkedByName?: string;
}

export interface ChurchDoc {
  name: string;
  logoPath?: string | null;
  logoUrl?: string | null;
  pastor?: string;
  website?: string;
  country?: string;
  brand?: {
    primary?: string;
    secondary?: string;
    accent?: string;
    font?: string;
    logoPlacement?: string;
    captionStyle?: string;
    graphicTemplate?: string;
  };
  content?: {
    language?: string;
    tone?: string;
    bibleTranslation?: string;
    scriptureFormat?: string;
    clipMin?: number;
    clipMax?: number;
    contentTypes?: string[];
    platforms?: string[];
  };
  approval?: {
    requireReapproval?: boolean;
    defaultReviewerId?: string | null;
    publishingRole?: "admin" | "editor";
  };
}
