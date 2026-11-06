import type { Timestamp } from "firebase/firestore";

export type Role = "admin" | "editor" | "contributor";
export const ROLE_RANK: Record<Role, number> = { admin: 3, editor: 2, contributor: 1 };

export type SermonStatus = "uploading" | "queued" | "processing" | "ready" | "published" | "failed" | "needs_configuration";
export type StageName = "probe" | "transcribe" | "analyse" | "generate" | "render";
export type AssetStatus = "draft" | "processing" | "needs_review" | "changes_requested" | "approved" | "scheduled" | "published" | "failed";
export type AssetType = "video" | "graphic" | "summary" | "devotional" | "article" | "captions" | "audio";
export type AssetCategory = "video" | "graphic" | "written" | "audio";

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  churchIds: string[];
  activeChurchId: string | null;
  textSize?: "small" | "default" | "large" | "xlarge";
}

export interface Church {
  id: string;
  name: string;
  logoPath?: string | null;
  logoUrl?: string | null;
  pastor?: string;
  website?: string;
  country?: string;
  contact?: { email?: string; phone?: string };
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
  approval?: { requireReapproval?: boolean; defaultReviewerId?: string | null; publishingRole?: "admin" | "editor" };
  onboarding?: { completed?: boolean };
}

export interface Member {
  id: string;
  uid: string;
  name: string;
  email: string;
  role: Role;
}

export interface Invite {
  id: string;
  churchId: string;
  churchName: string;
  email: string;
  role: Role;
  status: "pending" | "accepted" | "revoked";
}

export interface StageState {
  status: "pending" | "running" | "done" | "failed" | "skipped";
  error?: string | null;
  startedAt?: Timestamp | null;
  finishedAt?: Timestamp | null;
}

export interface Sermon {
  id: string;
  title: string;
  preacher: string;
  serviceDate: string;
  scripture?: string;
  description?: string;
  status: SermonStatus;
  durationSec?: number;
  media?: { path: string; fileName: string; contentType: string; size: number; kind: "audio" | "video"; hasVideo?: boolean };
  thumbnailPath?: string;
  hasTranscript?: boolean;
  uploadError?: string | null;
  processing?: {
    stage?: string;
    stages?: Partial<Record<StageName, StageState>>;
    error?: string | null;
    failedStage?: StageName | null;
    pendingRenders?: number;
    history?: { at: string; level: "info" | "error"; message: string }[];
  };
  summary?: {
    mainTheme?: string;
    keyPoints?: string[];
    illustrations?: string[];
    practicalApplications?: string[];
    conclusion?: string;
    importantStatements?: { text: string; segment: number; start: number | null }[];
    uncertainties?: { segment: number; note: string; start: number | null }[];
  };
  scriptureReferences?: { reference: string; segment: number; context: string; verified: boolean }[];
  scriptureIndex?: string[];
  assetCounts?: { total: number; video: number; graphic: number; written: number; audio: number; needsReview: number };
  createdAt?: Timestamp;
  createdBy?: string;
}

export interface Segment {
  i: number;
  start: number;
  end: number;
  speaker?: number | null;
  text: string;
}

export interface Transcript {
  segments: Segment[];
  hasTimestamps: boolean;
  source: "deepgram" | "import";
  searchText?: string;
}

export interface Cue {
  start: number;
  end: number;
  text: string;
}

export interface Flag {
  code: string;
  message: string;
}

export interface Asset {
  id: string;
  sermonId: string;
  sermonTitle: string;
  preacher?: string;
  type: AssetType;
  category: AssetCategory;
  title: string;
  description?: string;
  status: AssetStatus;
  version: number;
  approvedVersion?: number;
  approvedByName?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: any;
  source?: { start?: number; end?: number; segmentFrom?: number; segmentTo?: number };
  transcriptExcerpt?: string;
  durationSec?: number;
  media?: { path?: string; thumbnailPath?: string; captionsPath?: string; contentType?: string } | null;
  render?: { status: "pending" | "running" | "done" | "failed"; error?: string | null };
  fromAudio?: boolean;
  flags?: Flag[];
  revisionError?: string | null;
  lastRevisionId?: string;
  updatedAt?: Timestamp;
  createdAt?: Timestamp;
  updatedByName?: string;
}

export interface AssetVersion {
  id: string;
  version: number;
  title: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: any;
  media?: Asset["media"];
  source?: Asset["source"];
  status?: AssetStatus;
  reason: string;
  createdByName?: string;
  approvedByName?: string;
  createdAt?: Timestamp;
}

export interface Revision {
  id: string;
  fromVersion: number;
  newVersion?: number;
  reasons: string[];
  instructions: string;
  status: "pending" | "rendering" | "completed" | "failed";
  error?: string;
  createdByName?: string;
  createdAt?: Timestamp;
}

export interface Publication {
  id: string;
  assetId: string;
  assetTitle: string;
  assetType: AssetType;
  category: AssetCategory;
  sermonId: string;
  sermonTitle: string;
  platform: string;
  scheduledAt: Timestamp;
  caption: string;
  status: "scheduled" | "published" | "failed";
  method: "manual" | "integration";
  externalUrl?: string | null;
  error?: string | null;
  publishedAt?: Timestamp;
  publishedByName?: string;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string;
  read: boolean;
  createdAt?: Timestamp;
}

export interface MediaItem {
  id: string;
  name: string;
  path: string;
  thumbPath: string;
  width: number;
  height: number;
  size: number;
  createdBy: string;
  createdAt?: { toDate: () => Date } | null;
  edit?: import("./photo").PhotoEdit;
  text?: import("./photo").PhotoText;
  outputSize?: string;
}
