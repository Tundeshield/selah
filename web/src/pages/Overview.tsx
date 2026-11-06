import { Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { Upload, ArrowRight, Film, Image as ImageIcon, FileText, Mic, Mic2 } from "lucide-react";
import { useChurch } from "../context/ChurchContext";
import { Button, Card, EmptyState, PageHeader, PageLoading, Notice } from "../components/ui";
import { AssetStatusBadge, SermonStatusBadge, Stat, StorageImage, TypeIcon } from "../components/bits";
import { fmtDuration, fmtServiceDate, greeting, tsDate } from "../lib/format";
import { ASSET_TYPE, platformLabel, STAGE_LABELS } from "../lib/constants";
import type { Sermon } from "../lib/types";

export default function Overview() {
  const { church, sermons, assets, publications, loading, integrations, can } = useChurch();
  const navigate = useNavigate();
  if (loading) return <PageLoading />;

  const latest: Sermon | undefined = [...sermons].filter((s) => s.status !== "uploading").sort((a, b) => (tsDate(b.createdAt)?.getTime() || 0) - (tsDate(a.createdAt)?.getTime() || 0))[0];
  const latestAssets = latest ? assets.filter((a) => a.sermonId === latest.id) : [];
  const reviewed = latestAssets.filter((a) => !["processing", "needs_review", "changes_requested", "draft"].includes(a.status)).length;

  const needsReview = assets.filter((a) => a.status === "needs_review");
  const byCat = (c: string) => needsReview.filter((a) => a.category === c).length;
  const count = (st: string) => assets.filter((a) => a.status === st).length;
  const failedPubs = publications.filter((p) => p.status === "failed").length;
  const now = Date.now();
  const upcoming = publications
    .filter((p) => p.status === "scheduled" && (tsDate(p.scheduledAt)?.getTime() || 0) > now - 24 * 3600 * 1000)
    .slice(0, 6);

  const header = (
    <PageHeader
      eyebrow={`${church?.name} · ${format(new Date(), "EEEE d MMMM")}`}
      title={`${greeting()}, Media Team.`}
      subtitle="Your sermons are ready to become this week's content."
      actions={<Button icon={<Upload className="h-4 w-4" />} onClick={() => navigate("/sermons/upload")}>Upload sermon</Button>}
    />
  );

  const setupNotice = integrations && (!integrations.transcription || !integrations.ai) && can("admin") && (
    <div className="mb-6">
      <Notice tone="warn" title="Processing integrations need setup">
        {!integrations.transcription && "Transcription (Deepgram) is not configured — you can still import transcript files. "}
        {!integrations.ai && "AI content generation (Anthropic) is not configured, so sermons will stop after transcription. "}
        Add the missing API keys as Cloud Functions secrets; see the README.
      </Notice>
    </div>
  );

  if (!sermons.length) {
    return (
      <>
        {header}
        {setupNotice}
        <EmptyState
          icon={<Mic2 className="h-5 w-5" />}
          title="Your next sermon starts here."
          action={<Button size="lg" icon={<Upload className="h-4 w-4" />} onClick={() => navigate("/sermons/upload")}>Upload sermon</Button>}
        >
          Upload a sermon recording and Selah Studio will help turn it into videos, graphics and content for your church.
        </EmptyState>
      </>
    );
  }

  const action =
    latest && ["processing", "queued"].includes(latest.status)
      ? { label: "View processing status", to: `/sermons/${latest.id}` }
      : latest?.status === "published"
        ? { label: "View sermon", to: `/sermons/${latest.id}` }
        : latest?.status === "ready"
          ? { label: "Review content", to: `/studio?sermon=${latest.id}&status=needs_review` }
          : latest
            ? { label: "Open sermon", to: `/sermons/${latest.id}` }
            : null;

  return (
    <>
      {header}
      {setupNotice}

      {latest && (
        <section aria-labelledby="latest-h" className="mb-10">
          <h2 id="latest-h" className="mb-3 text-xs font-medium uppercase tracking-[0.14em] text-charcoal-400">Latest sermon</h2>
          <Card className="overflow-hidden md:flex">
            <div className="aspect-video bg-forest md:aspect-auto md:w-[300px] md:shrink-0">
              <StorageImage
                path={latest.thumbnailPath}
                alt=""
                className="h-full w-full object-cover"
                fallback={<div className="flex h-full min-h-[160px] w-full items-center justify-center text-gold"><Mic2 className="h-10 w-10" /></div>}
              />
            </div>
            <div className="flex flex-1 flex-col gap-4 p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-serif text-2xl leading-tight text-forest">{latest.title}</h3>
                  <p className="mt-1 text-sm text-charcoal-500">
                    {latest.preacher || "—"} · {fmtServiceDate(latest.serviceDate)} · {fmtDuration(latest.durationSec)}
                  </p>
                </div>
                <SermonStatusBadge status={latest.status} />
              </div>
              {["processing", "queued"].includes(latest.status) && (
                <p className="text-sm text-charcoal-500">{STAGE_LABELS[latest.processing?.stage || "probe"] || "Processing"}… You can leave this page — we'll notify you when content is ready.</p>
              )}
              {latest.processing?.error && ["failed", "needs_configuration"].includes(latest.status) && <Notice tone={latest.status === "failed" ? "error" : "warn"}>{latest.processing.error}</Notice>}
              {latestAssets.length > 0 && (
                <div className="grid grid-cols-2 gap-4 sm:max-w-md">
                  <div>
                    <div className="text-2xl font-semibold text-forest">{latestAssets.length}</div>
                    <div className="text-[13px] text-charcoal-500">Generated assets</div>
                  </div>
                  <div>
                    <div className="text-2xl font-semibold text-forest">{reviewed}<span className="text-base font-normal text-charcoal-400"> / {latestAssets.length}</span></div>
                    <div className="text-[13px] text-charcoal-500">Reviewed</div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-cream-200"><div className="h-full rounded-full bg-sage-500" style={{ width: `${(reviewed / Math.max(1, latestAssets.length)) * 100}%` }} /></div>
                  </div>
                </div>
              )}
              {action && (
                <div className="mt-auto">
                  <Button onClick={() => navigate(action.to)} icon={<ArrowRight className="h-4 w-4" />}>{action.label}</Button>
                </div>
              )}
            </div>
          </Card>
        </section>
      )}

      <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr]">
        <section aria-labelledby="review-h">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="review-h" className="text-xs font-medium uppercase tracking-[0.14em] text-charcoal-400">Awaiting review</h2>
            <Link to="/studio?status=needs_review" className="text-sm font-medium text-forest hover:underline">Open review queue</Link>
          </div>
          <Card className="p-5">
            <div className="flex items-baseline gap-2">
              <span className="font-serif text-4xl text-forest">{needsReview.length}</span>
              <span className="text-sm text-charcoal-500">asset{needsReview.length === 1 ? "" : "s"} need{needsReview.length === 1 ? "s" : ""} review</span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { k: "video", l: "Video clips", I: Film },
                { k: "graphic", l: "Graphics", I: ImageIcon },
                { k: "written", l: "Written", I: FileText },
                { k: "audio", l: "Audio", I: Mic },
              ].map(({ k, l, I }) => (
                <Link key={k} to={`/studio?status=needs_review&type=${k}`} className="rounded-lg bg-cream-50 px-3 py-2.5 hover:bg-sage-50">
                  <I className="mb-1.5 h-4 w-4 text-sage-500" aria-hidden />
                  <div className="text-lg font-semibold text-forest">{byCat(k)}</div>
                  <div className="text-xs text-charcoal-500">{l}</div>
                </Link>
              ))}
            </div>
          </Card>

          <h2 className="mb-3 mt-8 text-xs font-medium uppercase tracking-[0.14em] text-charcoal-400">Content</h2>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Approved" value={count("approved")} href="/studio?status=approved" />
            <Stat label="Scheduled" value={count("scheduled")} href="/studio?status=scheduled" />
            <Stat label="Published" value={count("published")} href="/studio?status=published" />
            <Stat label="Failed publications" value={failedPubs} tone="bad" href="/calendar?view=upcoming" />
          </div>
        </section>

        <section aria-labelledby="week-h">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="week-h" className="text-xs font-medium uppercase tracking-[0.14em] text-charcoal-400">Coming up</h2>
            <Link to="/calendar" className="text-sm font-medium text-forest hover:underline">Open calendar</Link>
          </div>
          <Card className="divide-y divide-cream-200">
            {upcoming.length === 0 ? (
              <div className="p-6 text-sm text-charcoal-500">
                Nothing is scheduled yet. Approve content in the <Link className="link" to="/studio">Content Studio</Link>, then schedule it for the week.
              </div>
            ) : (
              upcoming.map((p) => {
                const d = tsDate(p.scheduledAt)!;
                const asset = assets.find((a) => a.id === p.assetId);
                return (
                  <Link key={p.id} to={`/studio/${p.assetId}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-cream-50">
                    <div className="w-12 shrink-0 text-center">
                      <div className="text-[11px] font-medium uppercase text-gold-700">{format(d, "EEE")}</div>
                      <div className="font-serif text-xl leading-none text-forest">{format(d, "d")}</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-forest">{p.assetTitle}</div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-charcoal-500">
                        <TypeIcon type={p.assetType} className="h-3.5 w-3.5" />
                        {ASSET_TYPE[p.assetType]?.label} · {platformLabel(p.platform)} · {format(d, "HH:mm")}
                      </div>
                    </div>
                    {asset && <AssetStatusBadge asset={asset} />}
                  </Link>
                );
              })
            )}
          </Card>
        </section>
      </div>
    </>
  );
}
