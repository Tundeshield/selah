import { Link } from "react-router-dom";
import { ArrowRight, Check, Film, Image as ImageIcon, FileText, Mic, BookOpen, MessageSquareText, CalendarDays, UploadCloud, Eye, CheckCheck, Share2, Home, LayoutGrid, Settings, Quote } from "lucide-react";
import { Logo } from "../components/bits";

/* ------------------------------------------------------------------ */
/* Visual building blocks                                             */
/* ------------------------------------------------------------------ */

/** Selah's motif: a message rippling outward through the week. */
function Ripples({ className = "", size = 1100 }: { className?: string; size?: number }) {
  const rings = [0.28, 0.42, 0.57, 0.73, 0.9, 1.08];
  return (
    <div className={`ripples ${className}`} aria-hidden>
      <span className="glow" style={{ width: size * 0.75, height: size * 0.75 }} />
      {rings.map((r, i) => (
        <span key={r} style={{ width: size * r, height: size * r, opacity: 1 - i * 0.12 }} />
      ))}
      <span className="pulse" style={{ width: size * 0.5, height: size * 0.5, borderColor: "rgb(var(--brand-300) / 0.5)" }} />
    </div>
  );
}

function PhoneClip({ caption, small }: { caption: string; small?: boolean }) {
  return (
    <div className={`relative shrink-0 overflow-hidden rounded-[1.6rem] bg-ink p-1.5 shadow-pop ${small ? "w-[8.5rem]" : "w-[11rem]"}`}>
      <div className="relative aspect-[9/16] overflow-hidden rounded-[1.25rem] bg-gradient-to-b from-ink-700 via-ink-800 to-ink">
        <div className="absolute inset-x-0 top-[22%] mx-auto h-[38%] w-[62%] rounded-t-full bg-gradient-to-b from-gray-500/40 to-transparent" />
        <div className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-full bg-black/40 px-1.5 py-0.5 text-[0.55rem] font-medium text-white/80">
          <span className="h-1 w-1 rounded-full bg-brand-400" /> 0:58
        </div>
        <p className="absolute inset-x-2.5 bottom-[18%] rounded-md bg-ink/80 px-1.5 py-1 text-center text-[0.62rem] font-bold leading-tight text-white">{caption}</p>
      </div>
    </div>
  );
}

function ProductWindow() {
  return (
    <div className="overflow-hidden rounded-3xl bg-ink-800 p-1.5 shadow-[0_40px_80px_-24px_rgba(0,0,0,0.6)] ring-1 ring-white/10">
      <div className="flex items-center gap-3 px-3 py-2.5">
        <div className="flex gap-1.5">{[0, 1, 2].map((i) => <span key={i} className="h-2.5 w-2.5 rounded-full bg-white/15" />)}</div>
        <div className="mx-auto h-6 w-1/2 rounded-full bg-white/[0.06] text-center text-[0.7rem] leading-6 text-white/40">selah.studio/studio</div>
        <span className="h-6 w-6 rounded-full bg-white/10" />
      </div>
      <div className="grid grid-cols-[13rem_1fr] overflow-hidden rounded-[1.25rem] bg-canvas text-left">
        {/* sidebar */}
        <div className="hidden flex-col gap-1 p-4 md:flex">
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-white px-2.5 py-2 shadow-card ring-1 ring-gray-200">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ink text-[0.6rem] font-bold text-brand-300">GC</span>
            <span className="text-[0.75rem] font-semibold text-fg">Grace Community</span>
          </div>
          {[
            { I: Home, l: "Overview" },
            { I: Mic, l: "Sermons" },
            { I: LayoutGrid, l: "Content Studio", active: true },
            { I: CalendarDays, l: "Calendar" },
            { I: Settings, l: "Settings" },
          ].map(({ I, l, active }) => (
            <div key={l} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-[0.75rem] font-medium ${active ? "bg-white text-fg shadow-card ring-1 ring-gray-200" : "text-fg-muted"}`}>
              <I className={`h-3.5 w-3.5 ${active ? "text-brand-600" : ""}`} /> {l}
            </div>
          ))}
        </div>
        {/* main */}
        <div className="col-span-2 p-5 md:col-span-1 md:pl-1">
          <div className="rounded-2xl bg-white p-5 ring-1 ring-gray-200">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-fg-muted">Sunday · 45 min</div>
                <div className="font-wide mt-1 text-[1.15rem] font-bold leading-tight tracking-[-0.02em] text-fg" style={{ fontStretch: "115%" }}>Grace That Meets Us Where We Are</div>
              </div>
              <div className="flex gap-2">
                {[
                  { n: 6, l: "Clips" },
                  { n: 5, l: "Quotes" },
                  { n: 4, l: "Written" },
                ].map((x) => (
                  <div key={x.l} className="rounded-xl bg-gray-100 px-3 py-1.5 text-center">
                    <div className="text-[0.9rem] font-bold text-fg">{x.n}</div>
                    <div className="text-[0.6rem] text-fg-muted">{x.l}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="flex items-end justify-center rounded-xl bg-gray-100 pt-3"><PhoneClip small caption="Grace never leaves us there." /></div>
              <div className="flex aspect-square flex-col justify-center rounded-xl bg-ink p-3 text-center sm:aspect-auto">
                <Quote className="mx-auto mb-1.5 h-4 w-4 text-brand-400" />
                <p className="text-[0.72rem] font-bold leading-snug text-white">We don't earn the gift. We receive it.</p>
                <p className="mt-1.5 text-[0.55rem] text-white/50">Pastor Ade · Eph 2:8</p>
              </div>
              <div className="rounded-xl bg-gray-100 p-3">
                <div className="text-[0.55rem] font-semibold uppercase tracking-[0.12em] text-brand-700">Devotional</div>
                <div className="mt-1 text-[0.75rem] font-bold text-fg">Made Alive Together</div>
                <div className="mt-2 space-y-1">{[100, 92, 96, 70].map((w, i) => <div key={i} className="h-1.5 rounded-full bg-gray-300" style={{ width: `${w}%` }} />)}</div>
                <div className="mt-3 inline-flex rounded-full bg-brand-100 px-2 py-0.5 text-[0.55rem] font-semibold text-brand-900">Approved</div>
              </div>
              <div className="flex flex-col justify-between rounded-xl bg-gray-100 p-3">
                <div className="text-[0.55rem] font-semibold uppercase tracking-[0.12em] text-fg-muted">Podcast</div>
                <div className="flex h-10 items-end gap-[3px]">{[10, 22, 14, 30, 18, 36, 24, 12, 28, 16, 32, 14].map((h, i) => <span key={i} className="w-1 rounded-full bg-ink/70" style={{ height: h }} />)}</div>
                <div className="text-[0.62rem] font-medium text-fg">MP3 · 45:10</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Content                                                             */
/* ------------------------------------------------------------------ */

const STEPS = [
  { I: UploadCloud, t: "Upload", d: "Drop in the Sunday recording, audio or video. Leave the page while it's processed." },
  { I: Eye, t: "Review", d: "Every clip, graphic and article is linked to the exact moment it came from." },
  { I: CheckCheck, t: "Approve", d: "Edit, request changes or approve. Nothing goes out without a person's yes." },
  { I: Share2, t: "Share", d: "Plan the week on a calendar and download everything you post." },
];

const CONTENT = [
  { I: Film, t: "Sermon clips", d: "Vertical videos of complete thoughts, captioned and branded." },
  { I: ImageIcon, t: "Quote graphics", d: "The preacher's own words, word-for-word, on your templates." },
  { I: BookOpen, t: "Devotionals", d: "A reflection, an application and a prayer for the week." },
  { I: FileText, t: "Summaries & articles", d: "Write-ups for your website, newsletter or bulletin." },
  { I: MessageSquareText, t: "Social captions", d: "Written for each platform your church uses." },
  { I: Mic, t: "Podcast audio", d: "A clean, loudness-balanced MP3 of the full message." },
];

const TRUST = [
  "Quotes are kept only when they match the transcript word-for-word",
  "Scripture is checked against what was actually preached",
  "Nothing is written in the pastor's voice or put in their mouth",
  "Unclear passages are flagged for a person, never guessed",
  "Every asset keeps its source sermon and timestamp",
  "Nothing can be scheduled or published until it's approved",
];

/* ------------------------------------------------------------------ */

export default function Landing() {
  const year = new Date().getFullYear();
  return (
    <div className="min-h-screen bg-canvas">
      {/* ---------------- Hero (ink) ---------------- */}
      <div className="relative overflow-hidden bg-ink text-white">
        <Ripples className="opacity-90" size={1400} />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,transparent_40%,#0b0d0e_85%)]" aria-hidden />

        <header className="relative z-10">
          <div className="mx-auto flex h-20 max-w-[78rem] items-center justify-between px-5 md:px-8">
            <Logo light />
            <nav className="hidden items-center gap-1 rounded-full bg-white/[0.06] p-1 ring-1 ring-white/10 md:flex" aria-label="Main">
              {[
                ["#how", "How it works"],
                ["#churches", "For your church"],
                ["#trust", "Faithful by design"],
              ].map(([h, l]) => (
                <a key={h} href={h} className="rounded-full px-4 py-1.5 text-[0.88rem] text-white/75 hover:bg-white/10 hover:text-white">{l}</a>
              ))}
            </nav>
            <div className="flex items-center gap-2">
              <Link to="/signin" className="inline-flex h-10 items-center rounded-xl px-4 text-[0.9rem] font-medium text-white ring-1 ring-white/20 hover:bg-white/10">Log in</Link>
              <Link to="/signup" className="hidden h-10 items-center gap-1.5 rounded-xl bg-white/10 px-4 text-[0.9rem] font-medium text-white ring-1 ring-white/10 hover:bg-white/15 sm:inline-flex">Sign up <ArrowRight className="h-4 w-4" /></Link>
            </div>
          </div>
        </header>

        <section className="relative z-10 mx-auto max-w-[78rem] px-5 pb-10 pt-16 text-center md:px-8 md:pt-24">
          <p className="mb-7 inline-flex items-center gap-2 rounded-full bg-white/[0.07] px-4 py-1.5 text-[0.82rem] text-white/80 ring-1 ring-white/10">
            <span className="h-1.5 w-1.5 rounded-full bg-brand-400 shadow-[0_0_10px_rgb(var(--brand-400))]" /> Sermon-to-media for churches
          </p>
          <h1 className="display-xl text-[clamp(2.6rem,7.4vw,6.4rem)] text-white">
            One sermon.
            <br />
            <span className="bg-gradient-to-r from-white via-brand-200 to-brand-400 bg-clip-text text-transparent">A week of ministry.</span>
          </h1>
          <p className="mx-auto mt-8 max-w-2xl text-[1.15rem] leading-relaxed text-white/70 md:text-[1.25rem]">
            Your Sunday message deserves to reach beyond Sunday. Selah Studio turns one recording into clips, quote graphics, devotionals and articles — reviewed and approved by your team.
          </p>
          <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
            <Link to="/signup" className="inline-flex h-[3.25rem] items-center justify-center gap-2 rounded-xl bg-brand-400 px-7 text-[1rem] font-semibold text-ink shadow-glow hover:bg-brand-300">
              Upload your first sermon <ArrowRight className="h-4 w-4" />
            </Link>
            <a href="#how" className="inline-flex h-[3.25rem] items-center justify-center rounded-xl px-7 text-[1rem] font-medium text-white ring-1 ring-white/20 hover:bg-white/10">
              See how it works
            </a>
          </div>
        </section>

        <div className="relative z-10 mx-auto max-w-[68rem] translate-y-12 px-4 md:px-8">
          <ProductWindow />
        </div>
      </div>

      {/* ---------------- Statement + how it works ---------------- */}
      <section id="how" className="bg-white pb-24 pt-36">
        <div className="mx-auto max-w-[78rem] px-5 md:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="display-lg text-[clamp(2rem,4.6vw,3.6rem)] text-fg">A media team alongside yours</h2>
            <p className="mt-5 text-[1.15rem] leading-relaxed text-fg-muted">From the Sunday recording to a week of ministry content — in four calm steps, with your team in control of every one.</p>
          </div>
          <ol className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(({ I, t, d }, i) => (
              <li key={t} className="relative overflow-hidden rounded-3xl bg-canvas p-7">
                <div className="font-wide text-[3.5rem] font-bold leading-none text-gray-300/80" style={{ fontStretch: "125%" }}>0{i + 1}</div>
                <div className="mt-6 flex h-11 w-11 items-center justify-center rounded-xl bg-ink text-brand-300"><I className="h-5 w-5" /></div>
                <h3 className="font-wide mt-5 text-[1.3rem] font-bold uppercase tracking-[-0.01em] text-fg" style={{ fontStretch: "120%" }}>{t}</h3>
                <p className="mt-2 text-[0.98rem] leading-relaxed text-fg-muted">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------------- For your church ---------------- */}
      <section id="churches" className="bg-canvas py-24">
        <div className="mx-auto max-w-[78rem] px-5 md:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="display-lg text-[clamp(2rem,4.6vw,3.6rem)] text-fg">Built for your church</h2>
            <p className="mt-5 text-[1.15rem] leading-relaxed text-fg-muted">Whether you preach the message, produce it or run the week, Selah Studio fits the way your team already works.</p>
          </div>

          <div className="mt-14 grid gap-4 lg:grid-cols-3">
            {/* Pastors */}
            <article className="relative flex min-h-[30rem] flex-col overflow-hidden rounded-3xl bg-ink p-8 text-white">
              <Ripples size={700} className="opacity-60 [&>span]:!left-[80%] [&>span]:!top-[85%]" />
              <div className="relative">
                <div className="eyebrow text-brand-300">For pastors</div>
                <h3 className="font-wide mt-3 text-[1.9rem] font-bold uppercase leading-[0.98] tracking-[-0.015em] text-white" style={{ fontStretch: "122%" }}>Your words, faithfully kept</h3>
                <p className="mt-4 text-[1rem] leading-relaxed text-white/65">Quotes stay word-for-word. Scripture is checked against what you preached. You decide what goes out.</p>
              </div>
              <div className="relative mt-auto rounded-2xl bg-white/[0.06] p-5 ring-1 ring-white/10 backdrop-blur">
                <Quote className="h-5 w-5 text-brand-400" />
                <p className="mt-2 text-[1.05rem] font-semibold leading-snug text-white">Grace meets us where we are, but it never leaves us there.</p>
                <div className="mt-3 flex items-center justify-between text-[0.75rem] text-white/50">
                  <span>12:04 in the sermon</span>
                  <span className="inline-flex items-center gap-1 text-brand-300"><Check className="h-3.5 w-3.5" /> Matches transcript</span>
                </div>
              </div>
            </article>

            {/* Media teams */}
            <article className="relative flex min-h-[30rem] flex-col overflow-hidden rounded-3xl bg-brand-400 p-8 text-ink">
              <div className="eyebrow text-ink/70">For media teams</div>
              <h3 className="font-wide mt-3 text-[1.9rem] font-bold uppercase leading-[0.98] tracking-[-0.015em] text-ink" style={{ fontStretch: "122%" }}>Hours of editing, handled</h3>
              <p className="mt-4 text-[1rem] leading-relaxed text-ink/70">Clips are cut on complete thoughts, captioned and branded — ready for you to trim, tweak and approve.</p>
              <div className="mt-auto flex items-end justify-center gap-3 pt-8">
                <div className="translate-y-6 -rotate-6 opacity-90"><PhoneClip small caption="You are not too far gone." /></div>
                <PhoneClip caption="Grace never leaves us there." />
                <div className="translate-y-6 rotate-6 opacity-90"><PhoneClip small caption="Receive it. Live from it." /></div>
              </div>
            </article>

            {/* Admins */}
            <article className="relative flex min-h-[30rem] flex-col overflow-hidden rounded-3xl bg-white p-8 ring-1 ring-gray-200">
              <div className="eyebrow text-brand-700">For church administrators</div>
              <h3 className="font-wide mt-3 text-[1.9rem] font-bold uppercase leading-[0.98] tracking-[-0.015em] text-fg" style={{ fontStretch: "122%" }}>A predictable week</h3>
              <p className="mt-4 text-[1rem] leading-relaxed text-fg-muted">Approvals, roles and a weekly calendar keep everyone on the same page — and nothing slips out unreviewed.</p>
              <div className="mt-auto space-y-2 pt-6">
                {[
                  { d: "MON", t: "Devotional · WhatsApp", s: "Scheduled", c: "bg-sky-100 text-sky-900" },
                  { d: "WED", t: "Clip · Instagram", s: "Needs review", c: "bg-amber-100 text-amber-900" },
                  { d: "FRI", t: "Article · Website", s: "Approved", c: "bg-brand-100 text-brand-900" },
                ].map((r) => (
                  <div key={r.d} className="flex items-center gap-3 rounded-2xl bg-canvas px-4 py-3">
                    <span className="font-wide w-10 text-[0.8rem] font-bold text-fg" style={{ fontStretch: "120%" }}>{r.d}</span>
                    <span className="flex-1 text-[0.88rem] text-fg">{r.t}</span>
                    <span className={`rounded-full px-2.5 py-0.5 text-[0.7rem] font-semibold ${r.c}`}>{r.s}</span>
                  </div>
                ))}
              </div>
            </article>
          </div>

          {/* What you get */}
          <div className="mt-4 grid gap-4 rounded-3xl bg-white p-3 ring-1 ring-gray-200 sm:grid-cols-2 lg:grid-cols-3">
            {CONTENT.map(({ I, t, d }) => (
              <div key={t} className="flex gap-4 rounded-2xl p-5 hover:bg-canvas">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-canvas text-ink ring-1 ring-gray-200"><I className="h-5 w-5" /></div>
                <div>
                  <h3 className="text-[1.02rem] font-semibold text-fg">{t}</h3>
                  <p className="mt-1 text-[0.92rem] leading-relaxed text-fg-muted">{d}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- Faithful by design (ink) ---------------- */}
      <section id="trust" className="relative overflow-hidden bg-ink py-28 text-white">
        <Ripples size={1100} className="opacity-50 [&>span]:!left-[15%] [&>span]:!top-[50%]" />
        <div className="relative mx-auto grid max-w-[78rem] items-center gap-14 px-5 md:px-8 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <div className="eyebrow text-brand-300">Faithful by design</div>
            <h2 className="display-lg mt-4 text-[clamp(2.2rem,4.8vw,3.8rem)] text-white">Faithful to the message</h2>
            <p className="mt-6 max-w-lg text-[1.1rem] leading-relaxed text-white/65">
              Pastors need confidence that their teaching is represented accurately. Selah Studio stays close to what was actually preached — and keeps your team in control of everything that's shared.
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {TRUST.map((t) => (
              <li key={t} className="flex gap-3 rounded-2xl bg-white/[0.05] p-5 text-[0.98rem] leading-snug text-white/90 ring-1 ring-white/10">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-400 text-ink"><Check className="h-3.5 w-3.5" strokeWidth={3} /></span>
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------------- CTA ---------------- */}
      <section className="bg-white py-28">
        <div className="mx-auto max-w-[78rem] px-5 text-center md:px-8">
          <h2 className="display-xl text-[clamp(2.4rem,6vw,5rem)] text-fg">Your next sermon<br />starts here.</h2>
          <p className="mx-auto mt-6 max-w-xl text-[1.15rem] text-fg-muted">Set up your church in a couple of minutes, then upload Sunday's recording.</p>
          <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
            <Link to="/signup" className="inline-flex h-[3.25rem] items-center justify-center gap-2 rounded-xl bg-ink px-7 text-[1rem] font-semibold text-white hover:bg-ink-700">
              Create your church workspace <ArrowRight className="h-4 w-4" />
            </Link>
            <Link to="/signin" className="inline-flex h-[3.25rem] items-center justify-center rounded-xl px-7 text-[1rem] font-medium text-fg ring-1 ring-gray-300 hover:bg-gray-50">Log in</Link>
          </div>
        </div>
      </section>

      <footer className="bg-ink text-white">
        <div className="mx-auto flex max-w-[78rem] flex-col items-center justify-between gap-4 px-5 py-10 text-[0.88rem] text-white/55 sm:flex-row md:px-8">
          <Logo light />
          <p>© {year} Dove · One sermon. A week of ministry content.</p>
        </div>
      </footer>
    </div>
  );
}
