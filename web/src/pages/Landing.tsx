import { Link } from "react-router-dom";
import { ArrowRight, Check, Film, Image as ImageIcon, FileText, Mic, BookOpen, MessageSquareText, CalendarDays, ShieldCheck, Quote, Clock, UploadCloud, Eye, CheckCheck, Share2 } from "lucide-react";
import { Logo } from "../components/bits";

const NAV_LINK = "text-[15px] text-fg-muted hover:text-fg";

function MockSermonCard() {
  return (
    <div className="card w-[320px] p-5 shadow-pop">
      <div className="mb-3 flex items-center justify-between">
        <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">Ready</span>
        <span className="text-xs text-fg-muted">45:10</span>
      </div>
      <div className="text-lg font-semibold leading-snug tracking-tight text-fg">Grace That Meets Us Where We Are</div>
      <div className="mt-1 text-sm text-fg-muted">Pastor Ade · Sunday service</div>
      <div className="mt-4 grid grid-cols-4 gap-2 text-center">
        {[
          { n: 6, l: "Clips", I: Film },
          { n: 5, l: "Quotes", I: ImageIcon },
          { n: 4, l: "Written", I: FileText },
          { n: 1, l: "Audio", I: Mic },
        ].map(({ n, l, I }) => (
          <div key={l} className="rounded-lg bg-gray-50 py-2">
            <I className="mx-auto mb-1 h-3.5 w-3.5 text-gray-500" />
            <div className="text-sm font-semibold text-fg">{n}</div>
            <div className="text-[10px] text-fg-muted">{l}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 h-9 rounded-lg bg-brand-500 text-center text-sm font-medium leading-9 text-white">Review content</div>
    </div>
  );
}

function MockQuoteCard() {
  return (
    <div className="card w-[260px] overflow-hidden shadow-pop">
      <div className="flex aspect-square flex-col justify-center bg-brand-100 p-6 text-center">
        <Quote className="mx-auto mb-3 h-6 w-6 text-brand-500" />
        <p className="text-[19px] font-semibold leading-snug tracking-tight text-brand-800">Grace meets us where we are, but it never leaves us there.</p>
        <div className="mx-auto mt-4 h-0.5 w-8 bg-brand-500" />
        <p className="mt-2 text-xs font-medium text-brand-800">Pastor Ade · Ephesians 2:8</p>
      </div>
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-xs text-fg-muted">Quote graphic · 12:04</span>
        <span className="rounded bg-orange-100 px-2 py-0.5 text-[11px] font-medium text-orange-800">Needs review</span>
      </div>
    </div>
  );
}

function MockDevotionalCard() {
  return (
    <div className="card w-[280px] p-5 shadow-pop">
      <div className="eyebrow mb-1.5 text-brand-700">Devotional</div>
      <div className="text-base font-semibold tracking-tight text-fg">Made Alive Together</div>
      <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">Before grace, we were not merely struggling — we were lost. Grace is not a helping hand to a swimmer, but life to the drowned…</p>
      <div className="mt-4 flex items-center gap-2">
        <span className="flex h-8 flex-1 items-center justify-center rounded-lg bg-brand-500 text-xs font-medium text-white"><Check className="mr-1 h-3.5 w-3.5" />Approve</span>
        <span className="flex h-8 flex-1 items-center justify-center rounded-lg border border-gray-200 text-xs font-medium text-fg">Request changes</span>
      </div>
    </div>
  );
}

const CONTENT = [
  { I: Film, t: "Short sermon clips", d: "Vertical videos of complete thoughts, with captions and your logo burned in." },
  { I: ImageIcon, t: "Quote graphics", d: "Memorable lines from the sermon, word-for-word, on your church's templates." },
  { I: BookOpen, t: "Devotionals", d: "A reflection, practical application and prayer drawn from the message." },
  { I: FileText, t: "Summaries & articles", d: "Readable write-ups for your website, newsletter or bulletin." },
  { I: MessageSquareText, t: "Social captions", d: "Captions written for each platform your church uses." },
  { I: Mic, t: "Podcast-ready audio", d: "A clean, loudness-normalised MP3 of the full sermon." },
];

const STEPS = [
  { I: UploadCloud, t: "Upload a sermon", d: "Drop in the audio or video recording. You can leave while it's processed." },
  { I: Eye, t: "Review the content", d: "Every clip, graphic and article links back to the exact moment in the sermon." },
  { I: CheckCheck, t: "Approve what matters", d: "Edit, request changes or approve. Nothing goes out without a person's yes." },
  { I: Share2, t: "Share it all week", d: "Schedule approved content on a weekly calendar and download what you post." },
];

const TRUST = [
  "Quotes are kept only when they match the transcript word-for-word",
  "Scripture references are checked against what was actually preached",
  "Nothing is written in the pastor's voice or attributed to them",
  "Unclear passages are flagged for review instead of guessed",
  "Every asset keeps its source sermon and timestamp",
  "Content can't be scheduled or published until it's approved",
];

export default function Landing() {
  const year = new Date().getFullYear();
  return (
    <div className="min-h-screen bg-canvas">
      {/* Nav */}
      <header className="sticky top-0 z-30 border-b border-gray-200/70 bg-canvas/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-5 md:px-8">
          <Logo />
          <nav className="hidden items-center gap-8 md:flex" aria-label="Main">
            <a href="#how" className={NAV_LINK}>How it works</a>
            <a href="#content" className={NAV_LINK}>What you get</a>
            <a href="#trust" className={NAV_LINK}>Faithful by design</a>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/signin" className="inline-flex h-9 items-center rounded-lg border border-gray-200 bg-white px-3.5 text-sm font-medium text-fg hover:bg-gray-50">Sign in</Link>
            <Link to="/signup" className="hidden h-9 items-center rounded-lg bg-brand-500 px-3.5 text-sm font-medium text-white hover:bg-brand-600 sm:inline-flex">Get started</Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto grid max-w-[1200px] items-center gap-12 px-5 pb-20 pt-14 md:px-8 lg:grid-cols-[1.05fr_1fr] lg:pt-20">
        <div>
          <div className="mb-6 inline-flex items-center rounded-lg border border-gray-200 bg-gray-100 px-3 py-1.5 text-sm text-gray-800">
            Sermon-to-media for churches
          </div>
          <h1 className="text-[2.75rem] font-bold leading-[1.04] tracking-tightest text-fg sm:text-[3.5rem] xl:text-[4rem]">
            One sermon.
            <br />
            <span className="highlight mt-2 inline-block">A week of content</span>
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-relaxed text-fg-muted sm:text-xl">
            Your Sunday message deserves to reach beyond Sunday. Selah Studio turns sermon recordings into short videos, quote graphics, devotionals and articles your team can review and share all week.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link to="/signup" className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-brand-500 px-6 text-base font-medium text-white shadow-sm hover:bg-brand-600">
              Upload your first sermon <ArrowRight className="h-4 w-4" />
            </Link>
            <a href="#how" className="inline-flex h-12 items-center justify-center rounded-lg border border-gray-200 bg-white px-6 text-base font-medium text-fg hover:bg-gray-50">
              See how it works
            </a>
          </div>
          <p className="mt-5 flex items-center gap-2 text-sm text-fg-muted"><Clock className="h-4 w-4" /> Set up your church in a couple of minutes.</p>
        </div>

        {/* Product preview */}
        <div className="relative hidden h-[560px] lg:block" aria-hidden>
          <div className="absolute right-0 top-0 z-0 rotate-3"><MockQuoteCard /></div>
          <div className="absolute left-0 top-16 z-10 -rotate-2"><MockSermonCard /></div>
          <div className="absolute bottom-0 right-6 z-20 rotate-1"><MockDevotionalCard /></div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-y border-gray-200 bg-white py-20">
        <div className="mx-auto max-w-[1200px] px-5 md:px-8">
          <div className="max-w-2xl">
            <div className="eyebrow mb-3 text-brand-700">How it works</div>
            <h2 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">From Sunday recording to a week of ministry</h2>
            <p className="mt-4 text-lg text-fg-muted">Like a small media department working alongside your church — without building a bigger team.</p>
          </div>
          <ol className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(({ I, t, d }, i) => (
              <li key={t} className="rounded-xl border border-gray-200 bg-canvas p-6">
                <div className="mb-5 flex items-center justify-between">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100 text-brand-700"><I className="h-5 w-5" /></div>
                  <span className="text-sm font-medium text-gray-400">0{i + 1}</span>
                </div>
                <h3 className="text-lg font-semibold tracking-tight text-fg">{t}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-fg-muted">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* What you get */}
      <section id="content" className="py-20">
        <div className="mx-auto max-w-[1200px] px-5 md:px-8">
          <div className="max-w-2xl">
            <div className="eyebrow mb-3 text-brand-700">What you get</div>
            <h2 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Everything your church shares, from one message</h2>
          </div>
          <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-gray-200 bg-gray-200 sm:grid-cols-2 lg:grid-cols-3">
            {CONTENT.map(({ I, t, d }) => (
              <div key={t} className="bg-white p-7">
                <I className="mb-4 h-6 w-6 text-brand-500" />
                <h3 className="text-lg font-semibold tracking-tight text-fg">{t}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-fg-muted">{d}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-5">
            <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" />
            <p className="text-[15px] text-fg-muted"><span className="font-medium text-fg">Plus a weekly publishing calendar.</span> Schedule approved content, track what's been posted, and keep every version of every asset.</p>
          </div>
        </div>
      </section>

      {/* Trust */}
      <section id="trust" className="border-y border-gray-200 bg-white py-20">
        <div className="mx-auto grid max-w-[1200px] gap-12 px-5 md:px-8 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-100 text-brand-700"><ShieldCheck className="h-6 w-6" /></div>
            <h2 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">Faithful to the message</h2>
            <p className="mt-4 text-lg leading-relaxed text-fg-muted">
              Pastors need confidence that their teaching is represented accurately. Selah Studio is built to stay close to what was actually preached — and to keep your team in control of everything that's shared.
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {TRUST.map((t) => (
              <li key={t} className="flex gap-3 rounded-xl border border-gray-200 bg-canvas p-4 text-[15px] leading-snug text-fg">
                <Check className="mt-0.5 h-5 w-5 shrink-0 text-brand-500" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20">
        <div className="mx-auto max-w-[1200px] px-5 md:px-8">
          <div className="rounded-2xl bg-gray-950 px-6 py-14 text-center sm:px-12">
            <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Your next sermon starts here.</h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-gray-400">Upload a recording and let Selah Studio help turn it into content for your church — reviewed and approved by you.</p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link to="/signup" className="inline-flex h-12 items-center justify-center gap-2 rounded-lg bg-brand-500 px-6 text-base font-medium text-white hover:bg-brand-600">
                Get started <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/signin" className="inline-flex h-12 items-center justify-center rounded-lg border border-gray-700 px-6 text-base font-medium text-white hover:bg-gray-900">Sign in</Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-gray-200">
        <div className="mx-auto flex max-w-[1200px] flex-col items-center justify-between gap-4 px-5 py-8 text-sm text-fg-muted sm:flex-row md:px-8">
          <Logo />
          <p>© {year} Dove. One sermon. A week of ministry content.</p>
        </div>
      </footer>
    </div>
  );
}
