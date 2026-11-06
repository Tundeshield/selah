import { DEEPGRAM_API_KEY, DEEPGRAM_MODEL, IntegrationMissingError, integrationStatus } from "../lib/config";
import type { Segment } from "../lib/types";

export interface Word {
  s: number;
  e: number;
  w: string;
}

export interface TranscriptionResult {
  segments: Segment[];
  words: Word[];
  language: string | null;
  durationSec: number | null;
}

/**
 * Transcribe a recording with Deepgram's pre-recorded API.
 * Deepgram fetches the media itself from a short-lived signed URL.
 */
export async function transcribeWithDeepgram(mediaUrl: string, language?: string): Promise<TranscriptionResult> {
  if (!integrationStatus().transcription) {
    throw new IntegrationMissingError(
      "transcription",
      "Transcription is not configured. Add a DEEPGRAM_API_KEY secret, or import a transcript file for this sermon.",
    );
  }
  const params = new URLSearchParams({
    model: DEEPGRAM_MODEL(),
    smart_format: "true",
    punctuate: "true",
    paragraphs: "true",
    utterances: "true",
    diarize: "true",
  });
  if (language && language !== "auto") params.set("language", language);
  else params.set("detect_language", "true");

  const res = await fetch(`https://api.deepgram.com/v1/listen?${params}`, {
    method: "POST",
    headers: {
      Authorization: `Token ${DEEPGRAM_API_KEY.value()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url: mediaUrl }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Transcription service returned ${res.status}. ${body.slice(0, 300)}`);
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json: any = await res.json();
  const channel = json?.results?.channels?.[0];
  const alt = channel?.alternatives?.[0];
  const words: Word[] = (alt?.words || []).map((w: any) => ({
    s: round(w.start),
    e: round(w.end),
    w: String(w.punctuated_word || w.word || ""),
  }));

  // Prefer paragraph sentences — they give natural, readable segments.
  const segments: Segment[] = [];
  const paragraphs = alt?.paragraphs?.paragraphs || [];
  for (const p of paragraphs) {
    for (const s of p.sentences || []) {
      segments.push({ i: segments.length, start: round(s.start), end: round(s.end), speaker: p.speaker ?? null, text: String(s.text).trim() });
    }
  }
  if (!segments.length) {
    for (const u of json?.results?.utterances || []) {
      segments.push({ i: segments.length, start: round(u.start), end: round(u.end), speaker: u.speaker ?? null, text: String(u.transcript).trim() });
    }
  }
  return {
    segments: mergeShort(segments),
    words,
    language: channel?.detected_language || language || null,
    durationSec: json?.metadata?.duration ? round(json.metadata.duration) : null,
  };
}

function round(n: number) {
  return Math.round(Number(n) * 100) / 100;
}

/** Merge very short sentences so each segment is a readable thought (≤ ~25s). */
function mergeShort(segs: Segment[]): Segment[] {
  const out: Segment[] = [];
  for (const s of segs) {
    const last = out[out.length - 1];
    if (last && last.speaker === s.speaker && last.text.split(" ").length < 6 && s.end - last.start < 25) {
      last.text = `${last.text} ${s.text}`;
      last.end = s.end;
    } else {
      out.push({ ...s });
    }
  }
  return out.map((s, i) => ({ ...s, i }));
}
