import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { AtSign, BookOpen, Camera, Check, Copy, Globe, Mail, MessageCircle, Mic2, Music2, PlaySquare, Quote, Sparkles, ThumbsUp, Undo2, type LucideIcon } from "lucide-react";
import { useChurch } from "../context/ChurchContext";
import { useDocData } from "../lib/hooks";
import { api } from "../lib/api";
import { fmtClock } from "../lib/format";
import { errMessage } from "../lib/format";
import type { Asset, Sermon, Transcript } from "../lib/types";
import { useToast } from "./ui";

interface Channel {
  label: string;
  icon: LucideIcon;
  limit: number;
  /** Soft guide: longer still works but tends to perform worse. */
  recommended?: number;
  skin: "post" | "chat";
}

const CHANNELS: Record<string, Channel> = {
  youtube: { label: "YouTube", icon: PlaySquare, limit: 5000, recommended: 1000, skin: "post" },
  whatsapp: { label: "WhatsApp", icon: MessageCircle, limit: 65536, recommended: 700, skin: "chat" },
  instagram: { label: "Instagram", icon: Camera, limit: 2200, recommended: 1200, skin: "post" },
  facebook: { label: "Facebook", icon: ThumbsUp, limit: 63206, recommended: 500, skin: "post" },
  tiktok: { label: "TikTok", icon: Music2, limit: 4000, recommended: 300, skin: "post" },
  x: { label: "X", icon: AtSign, limit: 280, skin: "post" },
  website: { label: "Website", icon: Globe, limit: 100000, skin: "post" },
  email: { label: "Email", icon: Mail, limit: 100000, skin: "post" },
  podcast: { label: "Podcast", icon: Mic2, limit: 4000, skin: "post" },
};
const ORDER = ["youtube", "whatsapp", "instagram", "facebook", "tiktok", "x"];
const channel = (id: string): Channel => CHANNELS[id] || { label: id, icon: Globe, limit: 100000, skin: "post" };

const POLISH = [
  { id: "shorter", label: "Make it shorter" },
  { id: "pastoral", label: "More pastoral" },
  { id: "cta", label: "Add call-to-action" },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Draft = { title: string; content: any };

export function CaptionsReview({ asset, draft, setDraft, editable, sermon }: { asset: Asset; draft: Draft; setDraft: (d: Draft) => void; editable: boolean; sermon: Sermon | null }) {
  const platforms: Record<string, string> = draft.content?.platforms || {};
  const ids = useMemo(() => Object.keys(platforms).sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99)), [platforms]);
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    if (!ids.includes(active)) setActive(ids[0]);
  }, [ids, active]);
  const text = platforms[active] ?? "";
  const setText = (t: string) => setDraft({ ...draft, content: { ...draft.content, platforms: { ...platforms, [active]: t } } });

  if (!ids.length) return <p className="text-sm text-fg-muted">No captions in this set.</p>;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0">
        <ChannelTabs ids={ids} active={active} onChange={setActive} platforms={platforms} />
        <PreviewCard key={active} id={active} text={text} onChange={setText} editable={editable} />
      </div>
      <ContextPanel asset={asset} sermon={sermon} text={text} platform={active} editable={editable} onRewrite={setText} />
    </div>
  );
}

function ChannelTabs({ ids, active, onChange, platforms }: { ids: string[]; active: string; onChange: (id: string) => void; platforms: Record<string, string> }) {
  return (
    <div role="tablist" aria-label="Channel" className="mb-4 flex gap-1 overflow-x-auto rounded-full bg-gray-200/70 p-1">
      {ids.map((id) => {
        const ch = channel(id);
        const n = (platforms[id] || "").length;
        const over = n > ch.limit;
        const sel = id === active;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={sel}
            type="button"
            onClick={() => onChange(id)}
            className={clsx("flex shrink-0 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full px-3.5 py-2 text-[0.8125rem] font-medium transition", sel ? "bg-white text-fg shadow-card" : "text-fg-muted hover:text-fg")}
          >
            <ch.icon className="h-4 w-4" aria-hidden />
            {ch.label}
            <span className={clsx("tabular-nums text-[0.6875rem]", over ? "font-semibold text-red-600" : sel ? "text-fg-muted" : "text-gray-400")} aria-label={`${n} characters`}>{n.toLocaleString()}</span>
          </button>
        );
      })}
    </div>
  );
}

function PreviewCard({ id, text, onChange, editable }: { id: string; text: string; onChange: (t: string) => void; editable: boolean }) {
  const { church } = useChurch();
  const ch = channel(id);
  const ref = useRef<HTMLTextAreaElement>(null);
  const [copied, setCopied] = useState(false);
  const n = text.length;
  const state = n > ch.limit ? "over" : ch.recommended && n > ch.recommended ? "long" : "ok";

  useLayoutEffect(() => {
    const t = ref.current;
    if (!t) return;
    t.style.height = "0px";
    t.style.height = `${t.scrollHeight}px`;
  }, [text]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      ref.current?.select();
      document.execCommand("copy");
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const name = church?.name || "Your church";
  const avatar = church?.logoUrl ? <img src={church.logoUrl} alt="" className="h-9 w-9 rounded-full object-cover ring-1 ring-black/5" /> : <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ink text-xs font-semibold text-brand-300">{name.slice(0, 1)}</span>;

  const editor = (
    <textarea
      ref={ref}
      value={text}
      onChange={(e) => onChange(e.target.value)}
      readOnly={!editable}
      aria-label={`${ch.label} caption`}
      rows={3}
      spellCheck
      className={clsx("block w-full resize-none overflow-hidden border-0 bg-transparent p-0 text-[0.9375rem] leading-relaxed text-gray-900 focus:outline-none focus:ring-0", editable && "rounded-md hover:bg-black/[0.02] focus:bg-transparent")}
    />
  );

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-card ring-1 ring-gray-200">
      {ch.skin === "chat" ? (
        <div className="bg-[#efeae2] px-4 py-6 sm:px-8">
          <div className="ml-auto max-w-[34rem] rounded-xl rounded-tr-sm bg-[#d9fdd3] px-3.5 py-2.5 shadow-sm">
            {editor}
            <div className="mt-1 text-right text-[0.6875rem] text-gray-500">now ✓✓</div>
          </div>
        </div>
      ) : (
        <div className="p-5">
          <div className="mb-3 flex items-center gap-3">
            {avatar}
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-fg">{name}</div>
              <div className="text-xs text-fg-muted">{ch.label} · Draft</div>
            </div>
          </div>
          {editor}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 bg-gray-50/70 px-5 py-3">
        <div className="min-w-0 text-xs">
          <span className={clsx("font-semibold tabular-nums", state === "over" ? "text-red-600" : state === "long" ? "text-amber-700" : "text-fg")}>
            {n.toLocaleString()}
            {ch.limit < 10000 && <span className="font-normal text-fg-muted"> / {ch.limit.toLocaleString()}</span>}
          </span>
          <span className="ml-2 text-fg-muted">
            {state === "over" ? `Over ${ch.label}'s limit — shorten before posting.` : state === "long" ? `Longer than the ~${ch.recommended!.toLocaleString()} characters that usually work best.` : editable ? "Click the text to edit." : "Characters"}
          </span>
        </div>
        <button type="button" onClick={copy} className={clsx("inline-flex h-9 items-center gap-2 rounded-full px-4 text-sm font-medium transition", copied ? "bg-brand-500 text-ink" : "bg-ink text-white hover:bg-black")} aria-live="polite">
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}

const STOP = new Set("the and that this with have from your you our for are was were will what when they them their there then than into just about been being which would could should because these those very more most also some such only over even much many like really know going here".split(" "));
const words = (s: string) => s.toLowerCase().match(/[a-z']{4,}/g)?.filter((w) => !STOP.has(w)) || [];

const BOOKS = "Genesis|Exodus|Leviticus|Numbers|Deuteronomy|Joshua|Judges|Ruth|Samuel|Kings|Chronicles|Ezra|Nehemiah|Esther|Job|Psalms?|Proverbs|Ecclesiastes|Song of Songs|Song of Solomon|Isaiah|Jeremiah|Lamentations|Ezekiel|Daniel|Hosea|Joel|Amos|Obadiah|Jonah|Micah|Nahum|Habakkuk|Zephaniah|Haggai|Zechariah|Malachi|Matthew|Mark|Luke|John|Acts|Romans|Corinthians|Galatians|Ephesians|Philippians|Colossians|Thessalonians|Timothy|Titus|Philemon|Hebrews|James|Peter|Jude|Revelation";
const REF_RE = new RegExp(`\\b(?:[1-3]\\s?)?(?:${BOOKS})\\s\\d{1,3}(?::\\d{1,3}(?:\\s?[–-]\\s?\\d{1,3})?)?`, "g");
const norm = (r: string) => r.toLowerCase().replace(/\s+/g, " ").replace(/–/g, "-").replace(/psalm\b/, "psalms").trim();

function ContextPanel({ asset, sermon, text, platform, editable, onRewrite }: { asset: Asset; sermon: Sermon | null; text: string; platform: string; editable: boolean; onRewrite: (t: string) => void }) {
  const { churchId } = useChurch();
  const toast = useToast();
  const tq = useDocData<Transcript>(`churches/${churchId}/transcripts/${asset.sermonId}`);
  const [busy, setBusy] = useState<string | null>(null);
  const [undo, setUndo] = useState<{ platform: string; text: string } | null>(null);

  // Find the sermon moments this caption draws on: exact quotes first, then word overlap. Runs in the browser — no AI cost.
  const moments = useMemo(() => {
    const segs = tq.data?.segments || [];
    if (!segs.length || !text.trim()) return [];
    const quotes = Array.from(text.matchAll(/[“"']([^“”"']{18,})[”"']/g)).map((m) => m[1].toLowerCase().replace(/[^a-z0-9 ]/g, "").trim());
    const cw = new Set(words(text));
    const scored = segs.map((s, i) => {
      const win = [segs[i - 1]?.text, s.text, segs[i + 1]?.text].filter(Boolean).join(" ");
      const flat = win.toLowerCase().replace(/[^a-z0-9 ]/g, "");
      const quoted = quotes.some((q) => flat.includes(q.slice(0, 60)));
      const sw = new Set(words(s.text));
      let hit = 0;
      sw.forEach((w) => cw.has(w) && hit++);
      return { s, score: (quoted ? 100 : 0) + hit / Math.sqrt(sw.size + 4), quoted };
    });
    const top = scored.filter((x) => x.score > 0.9).sort((a, b) => b.score - a.score);
    const picked: typeof top = [];
    for (const x of top) {
      if (picked.length >= 2) break;
      if (picked.every((p) => Math.abs(p.s.start - x.s.start) > 45)) picked.push(x);
    }
    return picked.sort((a, b) => a.s.start - b.s.start);
  }, [tq.data, text]);

  const scripture = useMemo(() => {
    const found = Array.from(new Set((text.match(REF_RE) || []).map((r) => r.trim())));
    const sermonRefs = (sermon?.scriptureReferences || []).filter((r) => r.verified).map((r) => norm(r.reference));
    return found.map((r) => ({ ref: r, verified: sermonRefs.some((s) => s.startsWith(norm(r).split(":")[0]) && (norm(r).includes(":") ? s.includes(norm(r).split("-")[0]) || s === norm(r) : true)) }));
  }, [text, sermon?.scriptureReferences]);

  const polish = async (action: string) => {
    if (!text.trim()) return;
    setBusy(action);
    try {
      const r = await api.polishSocialCaption({ churchId, assetId: asset.id, platform, action, text });
      setUndo({ platform, text });
      onRewrite(r.text);
    } catch (e) {
      toast(errMessage(e), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
      <Panel title="AI polish" icon={Sparkles}>
        <div className="flex flex-wrap gap-1.5">
          {POLISH.map((p) => (
            <button key={p.id} type="button" disabled={!editable || !!busy} onClick={() => polish(p.id)} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[0.8125rem] font-medium text-fg ring-1 ring-gray-200 transition hover:ring-brand-500 disabled:opacity-50">
              {busy === p.id && <span className="h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-brand-600" />}
              {p.label}
            </button>
          ))}
        </div>
        {undo && undo.platform === platform && (
          <button type="button" onClick={() => { onRewrite(undo.text); setUndo(null); }} className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-fg-muted hover:text-fg">
            <Undo2 className="h-3.5 w-3.5" />Undo rewrite
          </button>
        )}
        <p className="mt-2 text-xs text-fg-muted">Rewrites this channel only. Nothing is saved until you save.</p>
      </Panel>

      <Panel title="Source sermon moments" icon={Quote}>
        {tq.loading ? (
          <p className="text-xs text-fg-muted">Loading transcript…</p>
        ) : moments.length ? (
          <ul className="space-y-3">
            {moments.map(({ s, quoted }) => (
              <li key={s.i}>
                <div className="mb-1 flex items-center gap-2">
                  <span className="rounded-md bg-ink px-1.5 py-0.5 font-mono text-[0.6875rem] font-semibold text-white">{fmtClock(s.start)}</span>
                  {quoted && <span className="text-[0.6875rem] font-semibold text-brand-700">Quoted word-for-word</span>}
                </div>
                <p className="line-clamp-4 text-[0.8125rem] leading-relaxed text-gray-700">{s.text}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-fg-muted">This caption summarises the whole message rather than one moment.</p>
        )}
        <Link to={`/sermons/${asset.sermonId}`} className="mt-3 inline-block text-xs font-medium text-brand-700 underline underline-offset-2">Open sermon</Link>
      </Panel>

      <Panel title="Scripture tagged" icon={BookOpen}>
        {scripture.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {scripture.map((r) => (
              <li key={r.ref} className={clsx("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium", r.verified ? "bg-brand-50 text-brand-800 ring-1 ring-brand-200" : "bg-amber-50 text-amber-800 ring-1 ring-amber-200")} title={r.verified ? "Read in the sermon" : "Not found among the passages read in this sermon — please check"}>
                {r.verified ? <Check className="h-3 w-3" /> : "!"} {r.ref}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-fg-muted">No Bible references in this caption.</p>
        )}
      </Panel>
    </aside>
  );
}

function Panel({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-4 ring-1 ring-gray-200">
      <h3 className="mb-3 flex items-center gap-2 text-[0.8125rem] font-semibold text-fg">
        <Icon className="h-4 w-4 text-fg-muted" aria-hidden />
        {title}
      </h3>
      {children}
    </section>
  );
}
