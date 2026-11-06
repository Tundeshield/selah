import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { addDays, addMonths, addWeeks, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday, startOfMonth, startOfWeek } from "date-fns";
import clsx from "clsx";
import { CalendarPlus, ChevronLeft, ChevronRight, MoreHorizontal, ExternalLink } from "lucide-react";
import { useChurch } from "../context/ChurchContext";
import { api } from "../lib/api";
import { errMessage, tsDate } from "../lib/format";
import { ASSET_TYPE, platformLabel } from "../lib/constants";
import type { Publication } from "../lib/types";
import { Badge, Button, Card, Modal, PageHeader, PageLoading, Tabs, useToast } from "../components/ui";
import { TypeIcon } from "../components/bits";
import { MarkFailedModal, MarkPublishedModal, ScheduleModal } from "../components/PublishModals";

type View = "week" | "month" | "upcoming";

function pubTone(p: Publication, held: boolean) {
  if (p.status === "published") return "forest" as const;
  if (p.status === "failed") return "bad" as const;
  if (held) return "warn" as const;
  return "gold" as const;
}

export default function Calendar() {
  const { publications, assets, loading, canPublish } = useChurch();
  const [params, setParams] = useSearchParams();
  const view = (params.get("view") as View) || "week";
  const [cursor, setCursor] = useState(new Date());
  const [scheduleOpen, setScheduleOpen] = useState<{ date?: Date } | null>(null);
  const [active, setActive] = useState<Publication | null>(null);

  const weekStart = startOfWeek(cursor, { weekStartsOn: 1 });
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);
  const monthDays = useMemo(() => {
    const s = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const e = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
    const out: Date[] = [];
    for (let d = s; d <= e; d = addDays(d, 1)) out.push(d);
    return out;
  }, [cursor]);

  if (loading) return <PageLoading />;

  const assetById = new Map(assets.map((a) => [a.id, a]));
  const isHeld = (p: Publication) => {
    const a = assetById.get(p.assetId);
    return p.status === "scheduled" && !!a && a.approvedVersion !== a.version;
  };
  const on = (d: Date) => publications.filter((p) => isSameDay(tsDate(p.scheduledAt)!, d));
  const upcoming = publications.filter((p) => p.status === "failed" || (p.status === "scheduled") || (p.status === "published" && (tsDate(p.publishedAt || p.scheduledAt)?.getTime() || 0) > Date.now() - 7 * 86400000));

  const label =
    view === "week" ? `${format(days[0], "d MMM")} – ${format(days[6], "d MMM yyyy")}` : view === "month" ? format(cursor, "MMMM yyyy") : "Upcoming & recent";

  const step = (dir: 1 | -1) => setCursor((c) => (view === "month" ? addMonths(c, dir) : addWeeks(c, dir)));

  const Entry = ({ p, compact }: { p: Publication; compact?: boolean }) => {
    const held = isHeld(p);
    const due = p.status === "scheduled" && (tsDate(p.scheduledAt)?.getTime() || 0) <= Date.now();
    return (
      <button
        onClick={() => setActive(p)}
        className={clsx(
          "w-full rounded-lg border text-left transition-colors hover:border-gray-300",
          p.status === "failed" ? "border-red-200 bg-red-50" : p.status === "published" ? "border-gray-300 bg-gray-50" : "border-brand-500/40 bg-brand-50/60",
          compact ? "px-1.5 py-1" : "px-2.5 py-2",
        )}
      >
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-fg-muted">
          <TypeIcon type={p.assetType} className="h-3 w-3" />
          {format(tsDate(p.scheduledAt)!, "HH:mm")}
          {!compact && <span className="truncate">· {platformLabel(p.platform)}</span>}
        </div>
        <div className={clsx("font-medium leading-snug text-fg", compact ? "truncate text-[11px]" : "line-clamp-3 text-[13px]")}>{p.assetTitle}</div>
        {!compact && (
          <div className="mt-1">
            <Badge tone={pubTone(p, held)} className="!px-1.5 !text-[10px]">
              {p.status === "published" ? "Published" : p.status === "failed" ? "Failed" : held ? "Needs re-approval" : due ? "Due · publish manually" : "Scheduled"}
            </Badge>
          </div>
        )}
      </button>
    );
  };

  return (
    <>
      <PageHeader
        title="Publishing Calendar"
        subtitle="Plan the week's content. Selah Studio tracks what's scheduled and what's been posted — publishing itself is manual for now."
        actions={canPublish && <Button icon={<CalendarPlus className="h-4 w-4" />} onClick={() => setScheduleOpen({})}>Schedule content</Button>}
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={view} onChange={(v) => setParams({ view: v }, { replace: true })} tabs={[{ id: "week", label: "Week" }, { id: "month", label: "Month" }, { id: "upcoming", label: "Upcoming" }]} />
        {view !== "upcoming" && (
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setCursor(new Date())}>Today</Button>
            <button className="rounded-lg p-1.5 hover:bg-gray-100" onClick={() => step(-1)} aria-label="Previous"><ChevronLeft className="h-5 w-5" /></button>
            <span className="min-w-[180px] text-center text-sm font-medium text-fg">{label}</span>
            <button className="rounded-lg p-1.5 hover:bg-gray-100" onClick={() => step(1)} aria-label="Next"><ChevronRight className="h-5 w-5" /></button>
          </div>
        )}
      </div>

      {view === "week" && (
        <div className="grid gap-3 md:grid-cols-7">
          {days.map((d) => {
            const items = on(d);
            return (
              <div key={d.toISOString()} className={clsx("card flex min-h-[120px] flex-col p-3 md:min-h-[280px]", isToday(d) && "ring-2 ring-brand-500/60")}>
                <div className="mb-2 flex items-baseline justify-between">
                  <div>
                    <span className="text-[11px] font-medium uppercase tracking-wider text-gray-500">{format(d, "EEE")}</span>
                    <span className="ml-1.5 font-semibold tracking-tight text-xl text-fg">{format(d, "d")}</span>
                  </div>
                  {canPublish && <button className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-fg" onClick={() => setScheduleOpen({ date: new Date(new Date(d).setHours(9, 0, 0, 0)) })} aria-label={`Schedule on ${format(d, "EEEE d MMMM")}`}><CalendarPlus className="h-4 w-4" /></button>}
                </div>
                <div className="flex flex-col gap-2">{items.map((p) => <Entry key={p.id} p={p} />)}</div>
                {!items.length && <span className="text-xs text-gray-500/70">—</span>}
              </div>
            );
          })}
        </div>
      )}

      {view === "month" && (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-7 border-b border-gray-200 bg-gray-50 text-center text-[11px] font-medium uppercase tracking-wider text-gray-500">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="py-2">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {monthDays.map((d) => {
              const items = on(d);
              return (
                <div key={d.toISOString()} className={clsx("min-h-[92px] border-b border-r border-gray-100 p-1.5", !isSameMonth(d, cursor) && "bg-gray-50/70")}>
                  <div className={clsx("mb-1 text-xs", isToday(d) ? "inline-flex h-5 w-5 items-center justify-center rounded-full bg-brand-500 text-white" : isSameMonth(d, cursor) ? "text-fg" : "text-gray-500/60")}>{format(d, "d")}</div>
                  <div className="space-y-1">
                    {items.slice(0, 3).map((p) => <Entry key={p.id} p={p} compact />)}
                    {items.length > 3 && <button onClick={() => { setCursor(d); setParams({ view: "week" }); }} className="text-[11px] text-fg-muted hover:underline">+{items.length - 3} more</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {view === "upcoming" && (
        <Card className="divide-y divide-gray-200">
          {upcoming.length === 0 ? (
            <p className="p-6 text-sm text-fg-muted">Nothing scheduled. Approve content in the <Link className="link" to="/studio">Content Studio</Link> and schedule it here.</p>
          ) : (
            upcoming.map((p) => {
              const d = tsDate(p.scheduledAt)!;
              const held = isHeld(p);
              return (
                <button key={p.id} onClick={() => setActive(p)} className="flex w-full items-center gap-4 px-5 py-3.5 text-left hover:bg-gray-50">
                  <div className="w-14 shrink-0 text-center">
                    <div className="text-[11px] font-medium uppercase text-brand-700">{format(d, "EEE")}</div>
                    <div className="font-semibold tracking-tight text-xl leading-none text-fg">{format(d, "d")}</div>
                    <div className="text-[10px] text-gray-500">{format(d, "MMM")}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-fg">{p.assetTitle}</div>
                    <div className="text-xs text-fg-muted">{ASSET_TYPE[p.assetType]?.label} · {platformLabel(p.platform)} · {format(d, "HH:mm")}</div>
                    {p.error && <div className="text-xs text-red-600">{p.error}</div>}
                  </div>
                  <Badge tone={pubTone(p, held)}>{p.status === "published" ? "Published" : p.status === "failed" ? "Failed" : held ? "Needs re-approval" : "Scheduled"}</Badge>
                  <MoreHorizontal className="h-4 w-4 text-gray-500" />
                </button>
              );
            })
          )}
        </Card>
      )}

      {scheduleOpen && <ScheduleModal open onClose={() => setScheduleOpen(null)} initialDate={scheduleOpen.date} />}
      {active && <PublicationModal publication={publications.find((p) => p.id === active.id) || active} held={isHeld(active)} onClose={() => setActive(null)} />}
    </>
  );
}

function PublicationModal({ publication: p, held, onClose }: { publication: Publication; held: boolean; onClose: () => void }) {
  const { churchId, canPublish } = useChurch();
  const toast = useToast();
  const [mode, setMode] = useState<"view" | "edit" | "publish" | "fail">("view");
  const [busy, setBusy] = useState(false);
  const d = tsDate(p.scheduledAt)!;

  if (mode === "edit") return <ScheduleModal open onClose={onClose} publication={p} />;
  if (mode === "publish") return <MarkPublishedModal open onClose={onClose} publication={p} />;
  if (mode === "fail") return <MarkFailedModal open onClose={onClose} publication={p} />;

  return (
    <Modal open onClose={onClose} title={p.assetTitle}>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
        <div><dt className="text-xs text-gray-500">Content type</dt><dd className="font-medium text-fg">{ASSET_TYPE[p.assetType]?.label}</dd></div>
        <div><dt className="text-xs text-gray-500">Platform</dt><dd className="font-medium text-fg">{platformLabel(p.platform)}</dd></div>
        <div><dt className="text-xs text-gray-500">Date</dt><dd className="font-medium text-fg">{format(d, "EEEE d MMMM yyyy")}</dd></div>
        <div><dt className="text-xs text-gray-500">Time</dt><dd className="font-medium text-fg">{format(d, "HH:mm")}</dd></div>
        <div className="col-span-2"><dt className="text-xs text-gray-500">Status</dt>
          <dd className="font-medium text-fg">
            {p.status === "published" ? `Published${p.method === "manual" ? " manually" : ""}${p.publishedByName ? ` by ${p.publishedByName}` : ""}` : p.status === "failed" ? `Failed — ${p.error}` : held ? "On hold — the asset changed and needs approval again" : "Scheduled · ready for manual publication at this time"}
            {p.externalUrl && <a href={p.externalUrl} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 text-xs underline"><ExternalLink className="h-3 w-3" />View post</a>}
          </dd>
        </div>
        {p.caption && <div className="col-span-2"><dt className="text-xs text-gray-500">Caption</dt><dd className="mt-1 whitespace-pre-wrap rounded-lg bg-gray-50 p-3 text-gray-800">{p.caption}</dd></div>}
      </dl>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link to={`/studio/${p.assetId}`} className="inline-flex h-8 items-center rounded-lg border border-gray-200 bg-white px-3 text-[13px] font-medium text-fg hover:bg-gray-50">Open asset</Link>
        {canPublish && p.status !== "published" && (
          <>
            <Button size="sm" variant="secondary" onClick={() => setMode("edit")}>{p.status === "failed" ? "Reschedule" : "Change date, time or caption"}</Button>
            {!held && <Button size="sm" onClick={() => setMode("publish")}>Mark as published</Button>}
            {p.status === "scheduled" && <Button size="sm" variant="ghost" onClick={() => setMode("fail")}>Mark as failed</Button>}
            <Button
              size="sm"
              variant="ghost"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await api.cancelPublication({ churchId, publicationId: p.id });
                  toast("Removed from the calendar");
                  onClose();
                } catch (e) {
                  toast(errMessage(e), "error");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Remove
            </Button>
          </>
        )}
      </div>
    </Modal>
  );
}
