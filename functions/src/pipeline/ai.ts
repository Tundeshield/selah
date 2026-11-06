import Anthropic from "@anthropic-ai/sdk";
import { ANTHROPIC_API_KEY, ANTHROPIC_MODEL, IntegrationMissingError, integrationStatus } from "../lib/config";
import type { ChurchDoc, Segment } from "../lib/types";
import { fmtTime } from "./integrity";

const INTEGRITY_RULES = `You are the media assistant inside Selah Studio, working for a church's media team.
You turn a sermon transcript into content the team will review before anything is published.

Non-negotiable integrity rules:
- Never invent quotations. A quote must be copied word-for-word from the transcript (you may omit filler words such as "um").
- Never invent scripture references. Only cite scripture the preacher actually referenced in the transcript.
- Never change the meaning of the sermon or add doctrinal claims the preacher did not make.
- Never attribute words to the pastor that are not in the transcript. Generated prose (summaries, devotionals, articles, captions) is written ABOUT the sermon, not as if the pastor said it.
- Never create testimonies, stories or illustrations that are not in the transcript.
- If the transcript is unclear, garbled or ambiguous at a point you rely on, report it in "uncertainties" instead of guessing.
Write warmly and plainly, in the church's preferred tone and language.`;

function client() {
  if (!integrationStatus().ai) {
    throw new IntegrationMissingError(
      "ai",
      "AI content generation is not configured. Add an ANTHROPIC_API_KEY secret to enable sermon analysis.",
    );
  }
  return new Anthropic({ apiKey: ANTHROPIC_API_KEY.value() });
}

export function transcriptForPrompt(segments: Segment[]): string {
  return segments.map((s) => `[${s.i}|${fmtTime(s.start)}] ${s.text}`).join("\n");
}

function churchContext(church: ChurchDoc, sermon: { title?: string; preacher?: string; scripture?: string }) {
  const c = church.content || {};
  return [
    `Church: ${church.name}`,
    `Sermon title: ${sermon.title || "(untitled)"}`,
    `Preacher: ${sermon.preacher || "(not given)"}`,
    sermon.scripture ? `Main scripture given by the team: ${sermon.scripture}` : "",
    `Preferred language: ${c.language || "English"}`,
    `Preferred tone: ${c.tone || "warm and pastoral"}`,
    `Preferred Bible translation (for naming only — do not quote verses that were not read aloud): ${c.bibleTranslation || "not specified"}`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function callTool<T>(name: string, description: string, schema: Record<string, unknown>, prompt: string, maxTokens = 8000): Promise<T> {
  // Newer models don't allow forcing a specific tool, so we offer one tool,
  // instruct the model to use it, and fall back to parsing JSON from text.
  const instruction = `\n\nRecord your answer by calling the "${name}" tool exactly once. Do not reply with plain text.`;
  let lastText = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await client().messages.create({
      model: ANTHROPIC_MODEL(),
      max_tokens: maxTokens,
      system: INTEGRITY_RULES,
      tools: [{ name, description, input_schema: schema as Anthropic.Tool["input_schema"] }],
      tool_choice: { type: "auto" },
      messages: [{ role: "user", content: prompt + instruction }],
    });
    const block = res.content.find((b) => b.type === "tool_use" && b.name === name);
    if (block && block.type === "tool_use") return block.input as T;
    lastText = res.content.map((b) => (b.type === "text" ? b.text : "")).join("\n");
    const json = extractJson(lastText);
    if (json) return json as T;
  }
  throw new Error(`The AI service did not return structured content. ${lastText.slice(0, 160)}`);
}

function extractJson(text: string): unknown | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = fenced ? fenced[1] : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  if (!candidate || !candidate.trim().startsWith("{")) return null;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Stage 1: analysis (summary, scripture, clip candidates, quotes)
// ---------------------------------------------------------------------------

export interface AnalysisResult {
  mainTheme: string;
  keyPoints: string[];
  illustrations: string[];
  practicalApplications: string[];
  conclusion: string;
  scriptureReferences: { reference: string; segment: number; context: string }[];
  importantStatements: { text: string; segment: number }[];
  clips: { title: string; startSegment: number; endSegment: number; rationale: string; socialCaption: string }[];
  quotes: { text: string; segment: number }[];
  uncertainties: { segment: number; note: string }[];
  suggestedTitle?: string;
}

const analysisSchema = {
  type: "object",
  properties: {
    suggestedTitle: { type: "string", description: "A short title for the sermon based on its content." },
    mainTheme: { type: "string" },
    keyPoints: { type: "array", items: { type: "string" } },
    illustrations: { type: "array", items: { type: "string" }, description: "Stories/illustrations the preacher actually told." },
    practicalApplications: { type: "array", items: { type: "string" } },
    conclusion: { type: "string" },
    scriptureReferences: {
      type: "array",
      items: {
        type: "object",
        properties: {
          reference: { type: "string", description: "e.g. John 3:16 — only if referenced in the transcript" },
          segment: { type: "integer", description: "Segment number where it is referenced" },
          context: { type: "string" },
        },
        required: ["reference", "segment", "context"],
      },
    },
    importantStatements: {
      type: "array",
      items: {
        type: "object",
        properties: { text: { type: "string", description: "Verbatim from transcript" }, segment: { type: "integer" } },
        required: ["text", "segment"],
      },
    },
    clips: {
      type: "array",
      description: "Candidate short video moments. Each must be a complete thought with a natural start and end and enough context to stand alone.",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          startSegment: { type: "integer" },
          endSegment: { type: "integer" },
          rationale: { type: "string", description: "Why this moment stands alone and teaches something meaningful." },
          socialCaption: { type: "string", description: "A short social post caption written about the clip (not in the pastor's voice)." },
        },
        required: ["title", "startSegment", "endSegment", "rationale", "socialCaption"],
      },
    },
    quotes: {
      type: "array",
      description: "Memorable statements for quote graphics, copied verbatim. 8–30 words each.",
      items: {
        type: "object",
        properties: { text: { type: "string" }, segment: { type: "integer" } },
        required: ["text", "segment"],
      },
    },
    uncertainties: {
      type: "array",
      items: {
        type: "object",
        properties: { segment: { type: "integer" }, note: { type: "string" } },
        required: ["segment", "note"],
      },
    },
  },
  required: [
    "mainTheme", "keyPoints", "illustrations", "practicalApplications", "conclusion",
    "scriptureReferences", "importantStatements", "clips", "quotes", "uncertainties",
  ],
};

export async function analyseSermon(
  church: ChurchDoc,
  sermon: { title?: string; preacher?: string; scripture?: string },
  segments: Segment[],
  opts: { clipMin: number; clipMax: number; hasTimestamps: boolean; maxClips?: number; maxQuotes?: number; avoid?: string },
): Promise<AnalysisResult> {
  const prompt = `${churchContext(church, sermon)}

Analyse the sermon transcript below. Each line is "[segment|timestamp] text".

Clip candidates:
- ${opts.hasTimestamps ? `Choose up to ${opts.maxClips ?? 8} moments (aim for 3–8; fewer is fine if the sermon has fewer suitable moments).` : "This transcript has no reliable timestamps — return an empty clips list."}
- Each clip should run roughly ${opts.clipMin}–${opts.clipMax} seconds.
- Prioritise complete thoughts, clear context, meaningful teaching and a natural beginning and ending. Do not pick moments just because they are loud or emotional.
- Avoid clips that begin mid-sentence or depend on something said earlier.

Quotes: choose up to ${opts.maxQuotes ?? 6} memorable statements, copied word-for-word.
${opts.avoid ? `\nThe team already has content from these moments — choose DIFFERENT clips and quotes:\n${opts.avoid}\n` : ""}
<transcript>
${transcriptForPrompt(segments)}
</transcript>`;
  const r = await callTool<Partial<AnalysisResult>>("record_sermon_analysis", "Record the analysis of the sermon.", analysisSchema, prompt, 10000);
  const arr = <X,>(v: X[] | undefined) => (Array.isArray(v) ? v : []);
  return {
    suggestedTitle: r.suggestedTitle,
    mainTheme: r.mainTheme || "",
    keyPoints: arr(r.keyPoints),
    illustrations: arr(r.illustrations),
    practicalApplications: arr(r.practicalApplications),
    conclusion: r.conclusion || "",
    scriptureReferences: arr(r.scriptureReferences),
    importantStatements: arr(r.importantStatements),
    clips: arr(r.clips),
    quotes: arr(r.quotes),
    uncertainties: arr(r.uncertainties),
  };
}

// ---------------------------------------------------------------------------
// Stage 2: written content
// ---------------------------------------------------------------------------

export interface WrittenResult {
  summary?: { title: string; mainTheme: string; keyPoints: string[]; scriptureReferences: string[]; body: string };
  devotional?: { title: string; scripture: string; reflection: string; application: string; prayer: string };
  article?: {
    title: string;
    introduction: string;
    sections: { heading: string; body: string }[];
    scriptureReferences: string[];
    application: string;
    conclusion: string;
  };
  captions?: Record<string, string>;
  uncertainties?: string[];
}

export async function writeContent(
  church: ChurchDoc,
  sermon: { title?: string; preacher?: string; scripture?: string },
  segments: Segment[],
  analysis: Pick<AnalysisResult, "mainTheme" | "keyPoints" | "practicalApplications" | "conclusion"> & { scriptureReferences: string[] },
  types: ("summary" | "devotional" | "article" | "captions")[],
  platforms: string[],
): Promise<WrittenResult> {
  const props: Record<string, unknown> = {
    uncertainties: { type: "array", items: { type: "string" }, description: "Anything in the transcript you were unsure about." },
  };
  const required: string[] = ["uncertainties"];
  if (types.includes("summary")) {
    props.summary = {
      type: "object",
      properties: {
        title: { type: "string" },
        mainTheme: { type: "string" },
        keyPoints: { type: "array", items: { type: "string" } },
        scriptureReferences: { type: "array", items: { type: "string" } },
        body: { type: "string", description: "A concise 120–220 word summary of the message." },
      },
      required: ["title", "mainTheme", "keyPoints", "scriptureReferences", "body"],
    };
    required.push("summary");
  }
  if (types.includes("devotional")) {
    props.devotional = {
      type: "object",
      properties: {
        title: { type: "string" },
        scripture: { type: "string", description: "One scripture reference from the sermon's verified list." },
        reflection: { type: "string", description: "150–250 words." },
        application: { type: "string" },
        prayer: { type: "string", description: "A short prayer written for the reader (not attributed to the pastor)." },
      },
      required: ["title", "scripture", "reflection", "application", "prayer"],
    };
    required.push("devotional");
  }
  if (types.includes("article")) {
    props.article = {
      type: "object",
      properties: {
        title: { type: "string" },
        introduction: { type: "string" },
        sections: {
          type: "array",
          items: { type: "object", properties: { heading: { type: "string" }, body: { type: "string" } }, required: ["heading", "body"] },
        },
        scriptureReferences: { type: "array", items: { type: "string" } },
        application: { type: "string" },
        conclusion: { type: "string" },
      },
      required: ["title", "introduction", "sections", "scriptureReferences", "application", "conclusion"],
    };
    required.push("article");
  }
  if (types.includes("captions")) {
    const capProps: Record<string, unknown> = {};
    for (const p of platforms) capProps[p] = { type: "string" };
    props.captions = { type: "object", properties: capProps, required: platforms };
    required.push("captions");
  }

  const prompt = `${churchContext(church, sermon)}

Verified analysis of the sermon:
- Main theme: ${analysis.mainTheme}
- Key points: ${analysis.keyPoints.join(" | ")}
- Practical applications: ${analysis.practicalApplications.join(" | ")}
- Conclusion: ${analysis.conclusion}
- Scripture referenced in the sermon (use ONLY these): ${analysis.scriptureReferences.join(", ") || "none"}

Write the requested content: ${types.join(", ")}.
${types.includes("captions") ? `Social captions are for these platforms: ${platforms.join(", ")}. Match each platform's norms and length. Hashtags sparingly.` : ""}
If you quote the preacher, the words must appear verbatim in the transcript and be clearly marked as a quote.

<transcript>
${transcriptForPrompt(segments)}
</transcript>`;

  return callTool<WrittenResult>(
    "record_written_content",
    "Record the written content generated from the sermon.",
    { type: "object", properties: props, required },
    prompt,
    12000,
  );
}

// ---------------------------------------------------------------------------
// Revisions
// ---------------------------------------------------------------------------

export async function reviseContent(
  church: ChurchDoc,
  sermon: { title?: string; preacher?: string },
  segments: Segment[],
  assetType: string,
  current: unknown,
  request: { reasons: string[]; instructions: string },
  schema: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const prompt = `${churchContext(church, sermon)}

A reviewer requested changes to a ${assetType} generated from this sermon.
Reasons: ${request.reasons.join(", ") || "not specified"}
Instructions from the reviewer: ${request.instructions || "(none)"}

Current version (JSON):
${JSON.stringify(current, null, 2)}

Produce a revised version that addresses the request while staying faithful to the sermon.
For clips, choose segment numbers from the transcript. For quotes, copy the words verbatim from the transcript.

<transcript>
${transcriptForPrompt(segments)}
</transcript>`;
  return callTool<Record<string, unknown>>("record_revision", `Record the revised ${assetType}.`, schema, prompt, 8000);
}
