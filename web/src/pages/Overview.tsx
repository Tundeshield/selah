import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { format } from "date-fns";
import clsx from "clsx";
import { ArrowRight, Check, Mic2, Upload } from "lucide-react";
import { useChurch } from "../context/ChurchContext";
import { Button, Card, EmptyState, PageHeader, PageLoading, Notice, useToast } from "../components/ui";
import { AssetThumb, SermonStatusBadge, StorageImage, TypeIcon, useAssetTypeLabel } from "../components/bits";
import { openFlagCount } from "../components/SourceReview";
import { api } from "../lib/api";
import { errMessage, fmtDuration, fmtServiceDate, greeting, tsDate } from "../lib/format";
import { platformLabel, STAGE_LABELS } from "../lib/constants";
import type { Asset, Sermon } from "../lib/types";

export default function Overview() {
  const { church, sermons, assets, publications, loading, integrations, can } = useChurch();
  const navigate = useNavigate();
  if (loading) return <PageLoading />;

  const latest: Sermon | undefined = [...sermons].filter((s) => s.status !== "uploading").sort((a, b) => (tsDate(b.createdAt)?.getTime() || 0) - (tsDate(a.createdAt)?.getTime() || 0))[0];
  const toReview = assets.filter((a) => ["needs_review", "draft"].includes(a.status));
  const approved = assets.filter((a) => a.status === "approved");
  const now = Date.now();
  const upcoming = publications
    .filter((p) => p.status === "scheduled" && (tsDate(p.scheduledAt)?.getTime() || 0) > now - 24 * 3600 * 1000)
    .sort((a, b) => (tsDate(a.scheduledAt)?.getTime() || 0) - (tsDate(b.scheduledAt)?.getTime() || 0))
    .slice(0, 5);
  const failedPubs = publications.filter((p) => p.status === "failed").length;

  const summary = toReview.length
    ? `${toReview.length} item${toReview.length === 1 ? " is" : "s are"} ready for your review.`
    : approved.length
      ? `${approved.length} approved item${approved.length === 1 ? "" : "s"} ready to schedule.`
      : "You're all caught up.";

  const header = (
    <PageHeader
      eyebrow={`${church?.name} · ${format(new Date(), "EEEE d MMMM")}`}
      title={`${greeting()}.`}
      subtitle={sermons.length ? summary : "Upload Sunday's sermon and get a week of content back."}
      actions={can("contributor") && <Button icon={<Upload className="h-4 w-4" />} onClick={() => navigate("/sermons/upload")}>Upload sermon</Button>}
    />
  );

  const setupNotice = integrations && (!integrations.transcription || !integrations.ai) && can("admin") && (
    <div className="mb-6">
      <Notice tone="warn" title="Processing needs setup">
        {!integrations.transcription && "Transcription isn't configured — you can still import transcript files. "}
        {!integrations.ai && "AI writing isn't configured, so sermons stop after transcription. "}
        See the README to add the missing keys.
      </Notice>
    </div>
  );

  if (!sermons.length) {
    return (
      <>
        {header}
        {setupNotice}
        <EmptyState icon={<Mic2 className="h-5 w-5" />} title="Your next sermon starts here." action={can("contributor") && <Button size="lg" icon={<Upload className="h-4 w-4" />} onClick={() => navigate("/sermons/upload")}>Upload sermon</Button>}>
          Each sermon becomes a weekly pack: 3 short clips, 3 quote graphics, a devotional, a summary, social captions and a podcast episode — all waiting for your approval.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      {header}
      {setupNotice}
      {failedPubs > 0 && (
        <div className="mb-6">
          <Notice tone="error" title={`${failedPubs} post${failedPubs === 1 ? "" : "s"} didn't go out`}>
            <Link className="link" to="/calendar?view=upcoming">Open the calendar</Link> to reschedule.
          </Notice>
        </div>
      )}

      {latest && <WeekCard sermon={latest} assets={assets.filter((a) => a.sermonId === latest.id)} />}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.2fr_1fr]">
        <section aria-labelledby="review-h">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="review-h" className="text-[0.9375rem] font-semibold text-fg">Waiting for you</h2>
            {toReview.length > 0 && <Link to="/studio?status=needs_review" className="text-sm font-medium text-fg-muted hover:text-fg">See all {toReview.length}</Link>}
          </div>
          {toReview.length ? (
            <Card className="divide-y divide-gray-100">
              {toReview.slice(0, 5).map((a) => <ReviewRow key={a.id} asset={a} />)}
            </Card>
          ) : (
            <Card className="p-6 text-sm text-fg-muted">Nothing waiting. New content appears here after each upload.</Card>
          )}
        </section>

        <section aria-labelledby="week-h">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 id="week-h" className="text-[0.9375rem] font-semibold text-fg">Coming up</h2>
            <Link to="/calendar" className="text-sm font-medium text-fg-muted hover:text-fg">Calendar</Link>
          </div>
          <Card className="divide-y divide-gray-100">
            {upcoming.length === 0 ? (
              <div className="p-6 text-sm text-fg-muted">
                Nothing scheduled.{" "}
                {approved.length ? <Link className="link" to="/studio?status=approved">Schedule {approved.length} approved item{approved.length === 1 ? "" : "s"}</Link> : "Approve content, then plan your week."}
              </div>
            ) : (
              upcoming.map((p) => {
                const d = tsDate(p.scheduledAt)!;
                return (
                  <Link key={p.id} to={`/studio/${p.assetId}`} className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50">
                    <div className="w-10 shrink-0 text-center">
                      <div className="text-[0.6875rem] font-semibold uppercase text-brand-700">{format(d, "EEE")}</div>
                      <div className="text-lg font-semibold leading-none text-fg">{format(d, "d")}</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-fg">{p.assetTitle}</div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-muted">
                        <TypeIcon type={p.assetType} className="h-3.5 w-3.5" />
                        {platformLabel(p.platform)} · {format(d, "HH:mm")}
                      </div>
                    </div>
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

/** The week's sermon at a glance: one progress line and one next step. */
function WeekCard({ sermon, assets }: { sermon: Sermon; assets: Asset[] }) {
  const navigate = useNavigate();
  const processing = ["processing", "queued"].includes(sermon.status);
  const total = assets.length;
  const review = assets.filter((a) => ["needs_review", "draft"].includes(a.status)).length;
  const approved = assets.filter((a) => a.status === "approved").length;
  const out = assets.filter((a) => ["scheduled", "published"].includes(a.status)).length;
  const steps = [
    { label: "Processed", done: !processing && total > 0, active: processing },
    { label: "Reviewed", done: total > 0 && review === 0, active: !processing && review > 0, note: total ? `${total - review}/${total}` : undefined },
    { label: "Scheduled", done: total > 0 && out === total, active: review === 0 && approved > 0, note: total ? `${out}/${total}` : undefined },
  ];
  const next = processing
    ? { label: "View progress", to: `/sermons/${sermon.id}` }
    : review
      ? { label: `Review ${review} item${review === 1 ? "" : "s"}`, to: `/studio?sermon=${sermon.id}&status=needs_review` }
      : approved
        ? { label: `Schedule ${approved} item${approved === 1 ? "" : "s"}`, to: `/studio?sermon=${sermon.id}&status=approved` }
        : { label: "Open sermon", to: `/sermons/${sermon.id}` };

  return (
    <Card className="overflow-hidden sm:flex">
      <div className="aspect-video bg-ink sm:aspect-auto sm:w-56 sm:shrink-0">
        <StorageImage path={sermon.thumbnailPath} alt="" className="h-full w-full object-cover" fallback={<div className="flex h-full min-h-[8rem] w-full items-center justify-center bg-[radial-gradient(circle_at_50%_55%,rgb(var(--brand-500)/0.35),transparent_62%)] text-brand-300"><Mic2 className="h-8 w-8" /></div>} />
      </div>
      <div className="flex flex-1 flex-col gap-4 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow mb-1">This week</div>
            <h3 className="line-clamp-2 text-xl font-semibold leading-tight tracking-tight text-fg">{sermon.title}</h3>
            <p className="mt-1 text-sm text-fg-muted">{[sermon.preacher, fmtServiceDate(sermon.serviceDate), fmtDuration(sermon.durationSec)].filter(Boolean).join(" · ")}</p>
          </div>
          <SermonStatusBadge status={sermon.status} />
        </div>
        {processing && <p className="text-sm text-fg-muted">{STAGE_LABELS[sermon.processing?.stage || "probe"] || "Processing"}… we'll notify you when it's ready.</p>}
        {sermon.processing?.error && ["failed", "needs_configuration"].includes(sermon.status) && <Notice tone={sermon.status === "failed" ? "error" : "warn"}>{sermon.processing.error}</Notice>}
        <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-[0.8125rem]">
          {steps.map((s, i) => (
            <li key={s.label} className="flex items-center gap-2">
              <span className={clsx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium", s.done ? "bg-brand-50 text-brand-800" : s.active ? "bg-ink text-white" : "bg-gray-100 text-fg-muted")}>
                {s.done && <Check className="h-3.5 w-3.5" />}
                {s.label}
                {s.note && <span className="tabular-nums opacity-70">{s.note}</span>}
              </span>
              {i < steps.length - 1 && <span className="h-px w-4 bg-gray-300" aria-hidden />}
            </li>
          ))}
        </ol>
        <div className="mt-auto">
          <Button onClick={() => navigate(next.to)} icon={<ArrowRight className="h-4 w-4" />}>{next.label}</Button>
        </div>
      </div>
    </Card>
  );
}

function ReviewRow({ asset }: { asset: Asset }) {
  const { churchId, can } = useChurch();
  const toast = useToast();
  const label = useAssetTypeLabel(asset);
  const [busy, setBusy] = useState(false);
  const toCheck = openFlagCount(asset);
  const quick = asset.status === "needs_review" && can("editor") && !toCheck;
  const approve = async () => {
    setBusy(true);
    try {
      const r = await api.approveAssets({ churchId, assetIds: [asset.id] });
      if (!r.approved.length) throw new Error(r.skipped[0]?.reason || "Could not approve");
      toast("Approved", "success");
    } catch (e) {
      toast(errMessage(e), "error");
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Link to={`/studio/${asset.id}`} className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gray-100 text-fg-muted" tabIndex={-1} aria-hidden>
        {asset.category === "written" ? <TypeIcon type={asset.type} className="h-5 w-5" /> : <AssetThumb asset={asset} className="h-full w-full" />}
      </Link>
      <Link to={`/studio/${asset.id}`} className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-fg">{asset.title}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-muted">
          <TypeIcon type={asset.type} className="h-3.5 w-3.5" />
          {label}
          {toCheck > 0 && <span className="text-amber-700">· {toCheck} to verify</span>}
        </div>
      </Link>
      {quick ? (
        <Button size="sm" variant="secondary" icon={<Check className="h-4 w-4" />} loading={busy} onClick={approve}>Approve</Button>
      ) : (
        <Link to={`/studio/${asset.id}`} className="inline-flex h-8 items-center rounded-full px-3 text-sm font-medium text-fg ring-1 ring-gray-200 hover:bg-gray-50">Review</Link>
      )}
    </div>
  );
}
