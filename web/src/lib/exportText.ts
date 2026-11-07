import type { Asset, Church } from "./types";
import { drawGraphic, loadImage, QuoteFont } from "./graphic";
import { loadStorageImage } from "./hooks";
import { platformLabel } from "./constants";

const speakerOf = (a: Asset) => (a.content?.attribution || a.preacher || "").trim();

/** Plain text a person would paste into a post or message. */
export function cleanText(a: Asset): string {
  const c = a.content || {};
  switch (a.type) {
    case "graphic":
      return [`“${(c.quote || "").trim()}”`, [speakerOf(a), c.scripture].filter(Boolean).join(" · ")].filter(Boolean).join("\n— ");
    case "devotional":
      return [c.title, c.scripture, "", c.reflection, "", c.application ? `Apply it: ${c.application}` : "", "", c.prayer ? `Prayer: ${c.prayer}` : ""].filter((x) => x !== undefined).join("\n").replace(/\n{3,}/g, "\n\n").trim();
    case "summary":
      return [c.title || a.title, c.mainTheme, "", c.body, "", ...(c.keyPoints || []).map((k: string) => `• ${k}`), "", (c.scriptureReferences || []).join(", ")].join("\n").replace(/\n{3,}/g, "\n\n").trim();
    case "article":
      return [c.title, "", c.introduction, ...(c.sections || []).flatMap((s: { heading: string; body: string }) => ["", s.heading, s.body]), "", c.application, "", c.conclusion].join("\n").replace(/\n{3,}/g, "\n\n").trim();
    case "captions":
      return Object.entries(c.platforms || {}).map(([p, t]) => `${platformLabel(p)}\n${t}`).join("\n\n");
    default:
      return (c.socialCaption || a.title || "").trim();
  }
}

/** Labelled blocks that map onto a design tool's text boxes (headline, body, speaker, citation). */
export function canvaText(a: Asset): string {
  const c = a.content || {};
  const speaker = speakerOf(a);
  const blocks: [string, string | undefined][] =
    a.type === "graphic"
      ? [["HEADLINE", `“${(c.quote || "").trim()}”`], ["SPEAKER", speaker], ["CITATION", c.scripture], ["CHURCH", undefined]]
      : a.type === "devotional"
        ? [["HEADLINE", c.title], ["BODY", c.reflection], ["APPLY IT", c.application], ["PRAYER", c.prayer], ["SPEAKER", speaker], ["CITATION", c.scripture]]
        : [["HEADLINE", c.title || a.title], ["BODY", c.body || c.introduction || c.socialCaption], ["SPEAKER", speaker], ["CITATION", (c.scriptureReferences || []).join(", ") || c.scripture]];
  return blocks.filter(([, v]) => v && String(v).trim()).map(([k, v]) => `${k}\n${String(v).trim()}`).join("\n\n");
}

export async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const t = document.createElement("textarea");
    t.value = text;
    document.body.appendChild(t);
    t.select();
    document.execCommand("copy");
    t.remove();
  }
}

/** Render a quote graphic at full size and download it as PNG. */
export async function downloadGraphicPng(a: Asset, church: Church | null) {
  const c = a.content || {};
  const [logo, photo] = await Promise.all([
    church?.logoUrl ? loadImage(church.logoUrl) : Promise.resolve(null),
    c.template === "photo" && c.photo?.path ? loadStorageImage(c.photo.path) : Promise.resolve(null),
  ]);
  const cv = document.createElement("canvas");
  const b = church?.brand;
  await drawGraphic(cv, c, { churchName: church?.name, logo, photo, brandAccent: b?.accent, brandPrimary: b?.primary, brandFont: b?.quoteFont as QuoteFont | undefined, speaker: a.preacher });
  await new Promise<void>((resolve) =>
    cv.toBlob((blob) => {
      if (blob) {
        const el = document.createElement("a");
        el.href = URL.createObjectURL(blob);
        el.download = `${(a.title || "quote").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 50)}-${c.size || "square"}.png`;
        el.click();
        setTimeout(() => URL.revokeObjectURL(el.href), 2000);
      }
      resolve();
    }, "image/png"),
  );
}
