import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { collection, getDocs } from "firebase/firestore";
import { Search, Upload, Mic2, Film } from "lucide-react";
import { useChurch } from "../context/ChurchContext";
import { db } from "../lib/firebase";
import { Button, EmptyState, PageHeader, PageLoading, Select, Tabs } from "../components/ui";
import { SermonStatusBadge, StorageImage } from "../components/bits";
import { fmtDuration, fmtServiceDate } from "../lib/format";
import type { Sermon } from "../lib/types";

type Filter = "all" | "processing" | "ready" | "published" | "failed";

export default function Sermons() {
  const { sermons, assets, loading, churchId } = useChurch();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<"newest" | "oldest" | "title">("newest");
  const [q, setQ] = useState("");
  const [transcripts, setTranscripts] = useState<Record<string, string> | null>(null);

  // Load transcripts for full-text search on first real query.
  useEffect(() => {
    if (q.trim().length < 3 || transcripts) return;
    getDocs(collection(db, "churches", churchId, "transcripts"))
      .then((snap) => {
        const m: Record<string, string> = {};
        snap.forEach((d) => (m[d.id] = String(d.get("searchText") || "")));
        setTranscripts(m);
      })
      .catch(() => setTranscripts({}));
  }, [q, transcripts, churchId]);

  const groups: Record<Filter, (s: Sermon) => boolean> = {
    all: () => true,
    processing: (s) => ["processing", "queued", "uploading"].includes(s.status),
    ready: (s) => s.status === "ready",
    published: (s) => s.status === "published",
    failed: (s) => ["failed", "needs_configuration"].includes(s.status),
  };

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    let l = sermons.filter(groups[filter]);
    if (term) {
      l = l
        .map((s) => {
          const meta = [s.title, s.preacher, s.scripture, ...(s.scriptureIndex || [])].join(" ").toLowerCase();
          const inMeta = meta.includes(term);
          const tx = transcripts?.[s.id] || "";
          const at = tx.indexOf(term);
          const snippet = at >= 0 ? `…${tx.slice(Math.max(0, at - 60), at + term.length + 80)}…` : null;
          return { s, inMeta, snippet };
        })
        .filter((x) => x.inMeta || x.snippet)
        .map((x) => ({ ...x.s, _snippet: x.inMeta ? null : x.snippet }) as Sermon & { _snippet?: string | null });
    }
    return [...l].sort((a, b) =>
      sort === "title" ? a.title.localeCompare(b.title) : sort === "oldest" ? a.serviceDate.localeCompare(b.serviceDate) : b.serviceDate.localeCompare(a.serviceDate),
    ) as (Sermon & { _snippet?: string | null })[];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sermons, filter, sort, q, transcripts]);

  if (loading) return <PageLoading />;

  return (
    <>
      <PageHeader
        title="Sermons"
        subtitle="Every recording your church has uploaded, with its transcript and the content created from it."
        actions={<Button icon={<Upload className="h-4 w-4" />} onClick={() => navigate("/sermons/upload")}>Upload sermon</Button>}
      />
      {sermons.length === 0 ? (
        <EmptyState icon={<Mic2 className="h-5 w-5" />} title="No sermons yet" action={<Button onClick={() => navigate("/sermons/upload")} icon={<Upload className="h-4 w-4" />}>Upload sermon</Button>}>
          Upload your first recording to build your sermon archive.
        </EmptyState>
      ) : (
        <>
          <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <Tabs
              value={filter}
              onChange={setFilter}
              tabs={(["all", "processing", "ready", "published", "failed"] as Filter[]).map((f) => ({
                id: f,
                label: f === "all" ? "All sermons" : f[0].toUpperCase() + f.slice(1),
                count: sermons.filter(groups[f]).length,
              }))}
            />
            <div className="flex gap-2">
              <div className="relative flex-1 lg:w-72">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-charcoal-400" aria-hidden />
                <input
                  className="field pl-9"
                  placeholder="Search title, preacher, scripture, transcript"
                  aria-label="Search sermons"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </div>
              <Select aria-label="Sort sermons" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="title">Title</option>
              </Select>
            </div>
          </div>

          {list.length === 0 ? (
            <p className="rounded-xl bg-cream-50 px-5 py-10 text-center text-sm text-charcoal-500">No sermons match{q ? ` “${q}”` : " this filter"}.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {list.map((s) => {
                const n = assets.filter((a) => a.sermonId === s.id).length;
                return (
                  <Link key={s.id} to={`/sermons/${s.id}`} className="card group overflow-hidden transition-colors hover:border-sage-300">
                    <div className="relative aspect-video bg-forest">
                      <StorageImage
                        path={s.thumbnailPath}
                        alt=""
                        className="h-full w-full object-cover opacity-95 transition-opacity group-hover:opacity-100"
                        fallback={
                          <div className="flex h-full w-full items-center justify-center bg-forest">
                            {s.media?.kind === "video" ? <Film className="h-8 w-8 text-gold/80" /> : <Mic2 className="h-8 w-8 text-gold/80" />}
                          </div>
                        }
                      />
                      <div className="absolute left-3 top-3"><SermonStatusBadge status={s.status} className="ring-1 ring-cream/60" /></div>
                      {s.durationSec ? <span className="absolute bottom-2 right-2 rounded bg-forest-900/80 px-1.5 py-0.5 text-[11px] font-medium text-cream">{fmtDuration(s.durationSec)}</span> : null}
                    </div>
                    <div className="p-4">
                      <h3 className="line-clamp-2 font-serif text-lg leading-snug text-forest">{s.title}</h3>
                      <p className="mt-1 text-[13px] text-charcoal-500">{s.preacher || "—"} · {fmtServiceDate(s.serviceDate)}</p>
                      {s._snippet && <p className="mt-2 line-clamp-2 rounded bg-gold-50 px-2 py-1 text-xs italic text-charcoal-500">{s._snippet}</p>}
                      <p className="mt-3 text-xs text-charcoal-400">{n ? `${n} generated asset${n === 1 ? "" : "s"}` : s.scripture || "No content yet"}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}
    </>
  );
}
