import { defineSecret } from "firebase-functions/params";

// Secrets are set with `firebase functions:secrets:set NAME`.
// Setting a secret to the literal value "unset" lets you deploy before the
// integration exists; the app then reports the integration as not configured
// instead of pretending to process.
export const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
export const DEEPGRAM_API_KEY = defineSecret("DEEPGRAM_API_KEY");

export const ANTHROPIC_MODEL = () => process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
export const DEEPGRAM_MODEL = () => process.env.DEEPGRAM_MODEL || "nova-3";

function configured(v: string | undefined): v is string {
  return !!v && v.trim() !== "" && v.trim().toLowerCase() !== "unset";
}

export function integrationStatus() {
  let anthropic = false;
  let deepgram = false;
  try {
    anthropic = configured(ANTHROPIC_API_KEY.value());
  } catch {
    anthropic = false;
  }
  try {
    deepgram = configured(DEEPGRAM_API_KEY.value());
  } catch {
    deepgram = false;
  }
  return {
    transcription: deepgram,
    ai: anthropic,
    rendering: true, // ffmpeg is bundled with the functions
    directPublishing: false, // no verified platform integrations in the MVP
  };
}

export class IntegrationMissingError extends Error {
  constructor(public integration: "transcription" | "ai", message: string) {
    super(message);
  }
}
