import { useEffect, useState } from "react";
import { format, addDays, setHours, setMinutes } from "date-fns";
import { useChurch } from "../context/ChurchContext";
import { api } from "../lib/api";
import { errMessage, tsDate } from "../lib/format";
import { PLATFORMS } from "../lib/constants";
import type { Asset, Publication } from "../lib/types";
import { Button, Input, Modal, Notice, Select, Textarea, useToast } from "./ui";

function defaultCaption(a?: Asset | null, platform?: string) {
  if (!a) return "";
  if (a.type === "captions") return a.content?.platforms?.[platform || ""] || Object.values(a.content?.platforms || {})[0] || "";
  return a.content?.socialCaption || "";
}

/** Schedule an approved asset, or edit an existing scheduled publication. */
export function ScheduleModal({ open, onClose, asset, publication, initialDate }: { open: boolean; onClose: () => void; asset?: Asset | null; publication?: Publication | null; initialDate?: Date }) {
  const { churchId, assets, church } = useChurch();
  const toast = useToast();
  const approved = assets.filter((a) => ["approved", "scheduled", "published"].includes(a.status) && a.approvedVersion === a.version);
  const [assetId, setAssetId] = useState(asset?.id || "");
  const preferred = church?.content?.platforms?.[0] || "instagram";
  const [platform, setPlatform] = useState(publication?.platform || preferred);
  const start = publication ? tsDate(publication.scheduledAt)! : initialDate || setMinutes(setHours(addDays(new Date(), 1), 9), 0);
  const [date, setDate] = useState(format(start, "yyyy-MM-dd"));
  const [time, setTime] = useState(format(start, "HH:mm"));
  const chosen = asset || assets.find((a) => a.id === assetId) || null;
  const [caption, setCaption] = useState(publication?.caption ?? defaultCaption(chosen, platform));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErr(null);
    if (!publication) setCaption(defaultCaption(chosen, platform));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId, open]);

  async function submit() {
    setErr(null);
    const when = new Date(`${date}T${time}:00`);
    if (isNaN(when.getTime())) return setErr("Choose a valid date and time.");
    setBusy(true);
    try {
      if (publication) {
        await api.updatePublication({ churchId, publicationId: publication.id, scheduledAt: when.toISOString(), caption, platform });
        toast("Schedule updated");
      } else {
        const id = asset?.id || assetId;
        if (!id) throw new Error("Choose an approved asset to schedule.");
        await api.schedulePublication({ churchId, assetId: id, platform, scheduledAt: when.toISOString(), caption });
        toast(`Scheduled for ${format(when, "EEE d MMM, HH:mm")}`);
      }
      onClose();
    } catch (e) {
      setErr(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const notApproved = asset && !(asset.approvedVersion === asset.version && ["approved", "scheduled", "published", "failed"].includes(asset.status));

  return (
    <Modal open={open} onClose={onClose} title={publication ? "Edit scheduled post" : "Schedule content"} footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy} disabled={!!notApproved}>{publication ? "Save changes" : "Schedule"}</Button></>}>
      <div className="space-y-4">
        {notApproved && <Notice tone="warn" title="Approval required">{asset?.status === "draft" ? "This is a draft. Submit it for review and approve it first." : "Approve the latest version of this asset before scheduling it."}</Notice>}
        {!asset && !publication && (
          approved.length ? (
            <Select label="Approved asset" value={assetId} onChange={(e) => setAssetId(e.target.value)}>
              <option value="">Choose an asset…</option>
              {approved.map((a) => <option key={a.id} value={a.id}>{a.title} — {a.sermonTitle}</option>)}
            </Select>
          ) : (
            <Notice tone="info">Only approved content can be scheduled. Approve assets in the Content Studio first.</Notice>
          )
        )}
        <Select label="Platform" value={platform} onChange={(e) => { setPlatform(e.target.value); if (!publication) setCaption(defaultCaption(chosen, e.target.value)); }}>
          {PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input label="Time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <Textarea label="Caption" value={caption} onChange={(e) => setCaption(e.target.value)} rows={4} />
        <p className="text-xs text-gray-500">Selah Studio doesn't post directly to platforms yet. At the scheduled time, this item will show as ready for manual publication — download the asset, post it, then mark it as published.</p>
        {err && <Notice tone="error">{err}</Notice>}
      </div>
    </Modal>
  );
}

/** Record a manual publication (no direct integrations in the MVP). */
export function MarkPublishedModal({ open, onClose, asset, publication }: { open: boolean; onClose: () => void; asset?: Asset | null; publication?: Publication | null }) {
  const { churchId } = useChurch();
  const toast = useToast();
  const [platform, setPlatform] = useState(publication?.platform || "instagram");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit() {
    setBusy(true);
    setErr(null);
    try {
      await api.markPublished({ churchId, publicationId: publication?.id, assetId: publication ? undefined : asset?.id, platform, externalUrl: url.trim() || undefined });
      toast("Recorded as published");
      onClose();
    } catch (e) {
      setErr(errMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Mark as published" footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={submit} loading={busy}>Confirm published</Button></>}>
      <div className="space-y-4">
        <p className="text-sm text-fg-muted">Confirm that you've posted “{publication?.assetTitle || asset?.title}” yourself. This is recorded as a manual publication.</p>
        {!publication && (
          <Select label="Platform" value={platform} onChange={(e) => setPlatform(e.target.value)}>
            {PLATFORMS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </Select>
        )}
        <Input label="Link to the post" hint="Optional" type="url" placeholder="https://" value={url} onChange={(e) => setUrl(e.target.value)} />
        {err && <Notice tone="error">{err}</Notice>}
      </div>
    </Modal>
  );
}

export function MarkFailedModal({ open, onClose, publication }: { open: boolean; onClose: () => void; publication: Publication | null }) {
  const { churchId } = useChurch();
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  if (!publication) return null;
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Record a failed publication"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="danger"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api.markPublicationFailed({ churchId, publicationId: publication.id, error: reason.trim() || "Could not be published" });
                toast("Marked as failed");
                onClose();
              } catch (e) {
                toast(errMessage(e), "error");
              } finally {
                setBusy(false);
              }
            }}
          >
            Mark as failed
          </Button>
        </>
      }
    >
      <Textarea label="What went wrong?" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder="e.g. Instagram rejected the upload" />
      <p className="mt-2 text-xs text-gray-500">You can reschedule it or mark it as published later.</p>
    </Modal>
  );
}
