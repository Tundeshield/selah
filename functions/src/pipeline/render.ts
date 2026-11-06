import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import ffmpegPath from "ffmpeg-static";
import type { Cue } from "../lib/types";

const FONTS_DIR = path.join(__dirname, "..", "..", "assets", "fonts");

export function runFfmpeg(args: string[], timeoutMs = 25 * 60 * 1000): Promise<{ stderr: string }> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) return reject(new Error("Video rendering is unavailable: ffmpeg binary not found."));
    const proc = spawn(ffmpegPath, ["-hide_banner", "-nostdin", ...args]);
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("Rendering timed out."));
    }, timeoutMs);
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
      if (stderr.length > 200_000) stderr = stderr.slice(-100_000);
    });
    proc.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stderr });
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.split("\n").slice(-6).join(" ").slice(0, 600)}`));
    });
  });
}

/** Read duration and whether the media has a video stream. */
export async function probeMedia(url: string): Promise<{ durationSec: number | null; hasVideo: boolean }> {
  let stderr = "";
  try {
    // `-f null` with -t 0 reads only headers; ffmpeg exits 0.
    stderr = (await runFfmpeg(["-i", url, "-t", "0", "-f", "null", "-"], 120_000)).stderr;
  } catch (e) {
    stderr = String((e as Error).message);
  }
  const m = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  const durationSec = m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : null;
  // Ignore attached cover art (mjpeg/png in audio files).
  const hasVideo = /Stream #\d+:\d+[^\n]*: Video: (?!mjpeg|png)/.test(stderr);
  return { durationSec, hasVideo };
}

export type Aspect = "9:16" | "1:1" | "16:9";
export const ASPECTS: Record<Aspect, { w: number; h: number }> = {
  "9:16": { w: 1080, h: 1920 },
  "1:1": { w: 1080, h: 1080 },
  "16:9": { w: 1920, h: 1080 },
};

export type CaptionStyle = "clean" | "bold" | "boxed" | "none";
export type LogoPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right" | "none";

function assTime(t: number) {
  const s = Math.max(0, t);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = (s % 60).toFixed(2).padStart(5, "0");
  return `${h}:${String(m).padStart(2, "0")}:${sec}`;
}

function hexToAss(hex: string, alpha = "00") {
  const h = hex.replace("#", "").padEnd(6, "0");
  return `&H${alpha}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase();
}

export function buildAss(cues: Cue[], aspect: Aspect, style: CaptionStyle, accent = "#C5A56A"): string {
  const { w, h } = ASPECTS[aspect];
  const size = Math.round((aspect === "16:9" ? 54 : 64) * (style === "bold" ? 1.15 : 1));
  const marginV = aspect === "9:16" ? Math.round(h * 0.22) : Math.round(h * 0.1);
  const borderStyle = style === "boxed" ? 3 : 1;
  const outline = style === "boxed" ? 14 : style === "bold" ? 4 : 2;
  const back = style === "boxed" ? hexToAss("#20342C", "30") : hexToAss("#000000", "80");
  const primary = hexToAss("#FFFFFF");
  const outlineColour = style === "boxed" ? hexToAss("#20342C", "30") : hexToAss("#000000", "40");
  const bold = style === "bold" ? -1 : 0;
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${w}
PlayResY: ${h}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Liberation Sans,${size},${primary},${hexToAss(accent)},${outlineColour},${back},${bold},0,0,0,100,100,0,0,${borderStyle},${outline},0,2,80,80,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const lines = cues
    .filter((c) => c.text.trim())
    .map((c) => `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Default,,0,0,0,,${c.text.replace(/[{}]/g, "").replace(/\n/g, "\\N")}`);
  return header + lines.join("\n") + "\n";
}

export function buildVtt(cues: Cue[]): string {
  const t = (s: number) => {
    const ms = Math.round(Math.max(0, s) * 1000);
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const sec = Math.floor((ms % 60000) / 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`;
  };
  return "WEBVTT\n\n" + cues.map((c, i) => `${i + 1}\n${t(c.start)} --> ${t(c.end)}\n${c.text}\n`).join("\n");
}

export interface ClipRenderInput {
  sourceUrl: string;
  hasVideo: boolean;
  start: number;
  end: number;
  aspect: Aspect;
  captionStyle: CaptionStyle;
  cues: Cue[];
  logoFile?: string | null;
  logoPosition: LogoPosition;
  background?: string; // for audio-only sermons
  accent?: string;
}

/** Render a short clip to MP4 (H.264/AAC) with burned-in captions and optional church logo. */
export async function renderClip(input: ClipRenderInput): Promise<{ videoFile: string; thumbFile: string; dir: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "clip-"));
  const { w, h } = ASPECTS[input.aspect];
  const dur = Math.max(1, input.end - input.start);
  const out = path.join(dir, "clip.mp4");
  const thumb = path.join(dir, "thumb.jpg");
  const args: string[] = ["-y", "-ss", String(input.start), "-t", String(dur), "-i", input.sourceUrl];
  let inputs = 1;
  const filters: string[] = [];
  let v = "v0";

  if (input.hasVideo) {
    filters.push(`[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,fps=30[v0]`);
  } else {
    const bg = (input.background || "#20342C").replace("#", "0x");
    args.push("-f", "lavfi", "-t", String(dur), "-i", `color=c=${bg}:s=${w}x${h}:r=30`);
    inputs++;
    const wave = (input.accent || "#C5A56A").replace("#", "0x");
    filters.push(`[0:a]aformat=channel_layouts=mono,showwaves=s=${Math.round(w * 0.8)}x${Math.round(h * 0.18)}:mode=cline:rate=30:colors=${wave}[wv]`);
    filters.push(`[1:v][wv]overlay=(W-w)/2:(H-h)/2-${Math.round(h * 0.05)}:shortest=1[v0]`);
  }

  if (input.logoFile && input.logoPosition !== "none") {
    args.push("-i", input.logoFile);
    const logoIdx = inputs++;
    const lw = Math.round(w * 0.16);
    const pad = Math.round(w * 0.05);
    const pos: Record<string, string> = {
      "top-left": `${pad}:${pad}`,
      "top-right": `W-w-${pad}:${pad}`,
      "bottom-left": `${pad}:H-h-${pad}`,
      "bottom-right": `W-w-${pad}:H-h-${pad}`,
    };
    filters.push(`[${logoIdx}:v]scale=${lw}:-1,format=rgba,colorchannelmixer=aa=0.92[lg]`);
    filters.push(`[${v}][lg]overlay=${pos[input.logoPosition] || pos["top-right"]}[v1]`);
    v = "v1";
  }

  if (input.captionStyle !== "none" && input.cues.length) {
    const assFile = path.join(dir, "captions.ass");
    await fs.writeFile(assFile, buildAss(input.cues, input.aspect, input.captionStyle, input.accent));
    filters.push(`[${v}]subtitles=${escapeFilterPath(assFile)}:fontsdir=${escapeFilterPath(FONTS_DIR)}[v2]`);
    v = "v2";
  }

  args.push(
    "-filter_complex", filters.join(";"),
    "-map", `[${v}]`, "-map", "0:a:0?",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "21", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k", "-ar", "44100",
    "-movflags", "+faststart", "-shortest", out,
  );
  await runFfmpeg(args);
  await runFfmpeg(["-y", "-ss", String(Math.min(1.5, dur / 2)), "-i", out, "-frames:v", "1", "-q:v", "3", thumb], 60_000);
  return { videoFile: out, thumbFile: thumb, dir };
}

/** Podcast-ready MP3: mono-safe stereo, loudness-normalised to -16 LUFS. */
export async function renderPodcastAudio(sourceUrl: string): Promise<{ file: string; dir: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "pod-"));
  const out = path.join(dir, "podcast.mp3");
  await runFfmpeg([
    "-y", "-i", sourceUrl, "-vn",
    "-af", "highpass=f=70,loudnorm=I=-16:TP=-1.5:LRA=11",
    "-ac", "2", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "128k", out,
  ]);
  return { file: out, dir };
}

/** A still frame from a video sermon for thumbnails. */
export async function renderPoster(sourceUrl: string, atSec: number): Promise<{ file: string; dir: string }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "poster-"));
  const out = path.join(dir, "poster.jpg");
  await runFfmpeg(["-y", "-ss", String(atSec), "-i", sourceUrl, "-frames:v", "1", "-vf", "scale=960:-2", "-q:v", "4", out], 120_000);
  return { file: out, dir };
}

function escapeFilterPath(p: string) {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

export async function cleanup(dir: string) {
  await fs.rm(dir, { recursive: true, force: true }).catch(() => undefined);
}
