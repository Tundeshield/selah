import { FormEvent, useEffect, useState } from "react";
import { collection, query, where } from "firebase/firestore";
import { ImagePlus, Trash2, UserPlus, Copy } from "lucide-react";
import { useChurch } from "../context/ChurchContext";
import { useAuth } from "../context/AuthContext";
import { db } from "../lib/firebase";
import { useQueryData, useUnsavedWarning } from "../lib/hooks";
import { api } from "../lib/api";
import { updateChurch, uploadChurchLogo } from "../lib/church";
import { errMessage } from "../lib/format";
import { BIBLE_TRANSLATIONS, CONTENT_TYPE_OPTIONS, LANGUAGES, PLATFORMS, TONES } from "../lib/constants";
import { TEMPLATES } from "../lib/graphic";
import type { Church, Invite, Member } from "../lib/types";
import { Button, Card, Checkbox, Input, Modal, Notice, PageHeader, PageLoading, Select, Tabs, useToast } from "../components/ui";
import { StorageImage } from "../components/bits";
import { TextSizeControl } from "../components/TextSizeControl";

type Tab = "profile" | "identity" | "content" | "approval" | "team" | "personal";

export default function Settings() {
  const { church, can, loading } = useChurch();
  const [tab, setTab] = useState<Tab>("profile");
  if (loading || !church) return <PageLoading />;
  const admin = can("admin");
  return (
    <>
      <PageHeader title="Church Settings" subtitle="Your church's identity, preferences and team." />
      {!admin && tab !== "personal" && <div className="mb-5"><Notice tone="info">Only administrators can change church settings. You can view them here.</Notice></div>}
      <Tabs
        className="mb-6"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "profile", label: "Church profile" },
          { id: "identity", label: "Visual identity" },
          { id: "content", label: "Content preferences" },
          { id: "approval", label: "Approvals" },
          { id: "team", label: "Team" },
          { id: "personal", label: "Your preferences" },
        ]}
      />
      <div className="max-w-3xl">
        {tab === "profile" && <ProfileTab church={church} disabled={!admin} />}
        {tab === "identity" && <IdentityTab church={church} disabled={!admin} />}
        {tab === "content" && <ContentTab church={church} disabled={!admin} />}
        {tab === "approval" && <ApprovalTab church={church} disabled={!admin} />}
        {tab === "team" && <TeamTab disabled={!admin} />}
        {tab === "personal" && (
          <Card className="space-y-4 p-6">
            <div>
              <h2 className="h-section">Text size</h2>
              <p className="mt-1 text-[0.94rem] text-fg-muted">Choose what's comfortable to read — Small is the default. This changes text and controls throughout Selah Studio and is saved to your account, so it follows you to other devices.</p>
            </div>
            <TextSizeControl />
            <p className="text-[0.8rem] text-fg-muted">You can also change it any time from your name at the bottom of the sidebar.</p>
          </Card>
        )}
      </div>
    </>
  );
}

function useForm<T>(initial: T) {
  const [v, setV] = useState<T>(initial);
  const [saved, setSaved] = useState<T>(initial);
  const dirty = JSON.stringify(v) !== JSON.stringify(saved);
  useUnsavedWarning(dirty);
  return { v, setV, dirty, markSaved: () => setSaved(v), reset: () => setV(saved) };
}

function SaveBar({ dirty, busy, onSave, onReset, disabled }: { dirty: boolean; busy: boolean; onSave: () => void; onReset: () => void; disabled: boolean }) {
  if (disabled) return null;
  return (
    <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-4">
      {dirty && <Button variant="ghost" onClick={onReset}>Discard</Button>}
      <Button onClick={onSave} disabled={!dirty} loading={busy}>Save changes</Button>
    </div>
  );
}

function useSaver() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const save = async (fn: () => Promise<unknown>, after?: () => void) => {
    setBusy(true);
    try {
      await fn();
      after?.();
      toast("Settings saved");
    } catch (e) {
      toast(errMessage(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return { busy, save };
}

function ProfileTab({ church, disabled }: { church: Church; disabled: boolean }) {
  const { churchId } = useChurch();
  const f = useForm({ name: church.name || "", pastor: church.pastor || "", website: church.website || "", country: church.country || "", email: church.contact?.email || "", phone: church.contact?.phone || "" });
  const { busy, save } = useSaver();
  const [logoBusy, setLogoBusy] = useState(false);
  const toast = useToast();
  const [err, setErr] = useState<string | null>(null);
  const submit = () => {
    if (!f.v.name.trim()) return setErr("Church name is required.");
    if (f.v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.v.email)) return setErr("Enter a valid contact email.");
    setErr(null);
    save(() => updateChurch(churchId, { name: f.v.name.trim(), pastor: f.v.pastor, website: f.v.website, country: f.v.country, contact: { email: f.v.email, phone: f.v.phone } }), f.markSaved);
  };
  return (
    <Card className="space-y-5 p-6">
      <div className="flex items-center gap-5">
        <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-gray-50">
          {church.logoPath ? <StorageImage path={church.logoPath} alt="Church logo" className="h-full w-full object-contain p-2" /> : <ImagePlus className="h-6 w-6 text-gray-500" />}
        </div>
        {!disabled && (
          <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-fg hover:bg-gray-50">
            {logoBusy ? "Uploading…" : church.logoPath ? "Replace logo" : "Upload logo"}
            <input
              type="file"
              className="sr-only"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setLogoBusy(true);
                try {
                  await uploadChurchLogo(churchId, file);
                  toast("Logo updated");
                } catch (er) {
                  toast(errMessage(er), "error");
                } finally {
                  setLogoBusy(false);
                }
              }}
            />
          </label>
        )}
      </div>
      <p className="-mt-2 text-xs text-gray-500">PNG with a transparent background works best. SVG logos appear on graphics but not on rendered videos.</p>
      {err && <Notice tone="error">{err}</Notice>}
      <fieldset disabled={disabled} className="space-y-4">
        <Input label="Church name" value={f.v.name} onChange={(e) => f.setV({ ...f.v, name: e.target.value })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Pastor" value={f.v.pastor} onChange={(e) => f.setV({ ...f.v, pastor: e.target.value })} />
          <Input label="Country" value={f.v.country} onChange={(e) => f.setV({ ...f.v, country: e.target.value })} />
        </div>
        <Input label="Website" value={f.v.website} onChange={(e) => f.setV({ ...f.v, website: e.target.value })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Contact email" type="email" value={f.v.email} onChange={(e) => f.setV({ ...f.v, email: e.target.value })} />
          <Input label="Contact phone" value={f.v.phone} onChange={(e) => f.setV({ ...f.v, phone: e.target.value })} />
        </div>
      </fieldset>
      <SaveBar dirty={f.dirty} busy={busy} onSave={submit} onReset={f.reset} disabled={disabled} />
    </Card>
  );
}

const HEX = /^#[0-9a-f]{6}$/i;
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex items-center gap-2">
        <input type="color" value={HEX.test(value) ? value : "#0B0D0E"} onChange={(e) => onChange(e.target.value)} className="h-10 w-12 cursor-pointer rounded-lg border border-gray-200 bg-white p-1" aria-label={`${label} picker`} />
        <input className="field font-mono" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} />
      </div>
    </div>
  );
}

function IdentityTab({ church, disabled }: { church: Church; disabled: boolean }) {
  const { churchId } = useChurch();
  const b = church.brand || {};
  const f = useForm({
    primary: b.primary || "#0B0D0E",
    secondary: b.secondary || "#F4F4F1",
    accent: b.accent || "#2ECBBE",
    font: b.font || "Archivo",
    logoPlacement: b.logoPlacement || "top-right",
    captionStyle: b.captionStyle || "clean",
    graphicTemplate: b.graphicTemplate || "cream",
  });
  const { busy, save } = useSaver();
  const [err, setErr] = useState<string | null>(null);
  return (
    <Card className="space-y-5 p-6">
      <fieldset disabled={disabled} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <ColorField label="Primary colour" value={f.v.primary} onChange={(v) => f.setV({ ...f.v, primary: v })} />
          <ColorField label="Secondary colour" value={f.v.secondary} onChange={(v) => f.setV({ ...f.v, secondary: v })} />
          <ColorField label="Accent colour" value={f.v.accent} onChange={(v) => f.setV({ ...f.v, accent: v })} />
        </div>
        <p className="-mt-2 text-xs text-gray-500">The primary colour is the background for audio-only video clips; the accent highlights graphics and waveforms.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Heading font" value={f.v.font} onChange={(e) => f.setV({ ...f.v, font: e.target.value })} hint="Used on quote graphics.">
            <option>Archivo</option>
            <option>Inter</option>
          </Select>
          <Select label="Default caption style" value={f.v.captionStyle} onChange={(e) => f.setV({ ...f.v, captionStyle: e.target.value })}>
            <option value="clean">Clean</option>
            <option value="bold">Bold</option>
            <option value="boxed">Boxed</option>
            <option value="none">No captions</option>
          </Select>
          <Select label="Logo placement on videos" value={f.v.logoPlacement} onChange={(e) => f.setV({ ...f.v, logoPlacement: e.target.value })}>
            <option value="top-right">Top right</option>
            <option value="top-left">Top left</option>
            <option value="bottom-right">Bottom right</option>
            <option value="bottom-left">Bottom left</option>
            <option value="none">Hidden</option>
          </Select>
          <Select label="Default graphic template" value={f.v.graphicTemplate} onChange={(e) => f.setV({ ...f.v, graphicTemplate: e.target.value })}>
            {Object.entries(TEMPLATES).filter(([, t]) => t.group !== "photo").map(([id, t]) => <option key={id} value={id}>{t.label}{t.art ? " (artwork)" : ""}</option>)}
          </Select>
        </div>
      </fieldset>
      {err && <Notice tone="error">{err}</Notice>}
      <p className="text-xs text-gray-500">New defaults apply to content generated from now on.</p>
      <SaveBar
        dirty={f.dirty}
        busy={busy}
        onReset={f.reset}
        disabled={disabled}
        onSave={() => {
          if (![f.v.primary, f.v.secondary, f.v.accent].every((c) => HEX.test(c))) return setErr("Colours must be hex values like #2ECBBE.");
          setErr(null);
          save(() => updateChurch(churchId, { brand: f.v }), f.markSaved);
        }}
      />
    </Card>
  );
}

function ContentTab({ church, disabled }: { church: Church; disabled: boolean }) {
  const { churchId } = useChurch();
  const c = church.content || {};
  const f = useForm({
    tone: c.tone || "warm and pastoral",
    language: c.language || "en",
    bibleTranslation: c.bibleTranslation || "NIV",
    scriptureFormat: c.scriptureFormat || "Book Chapter:Verse (Translation)",
    clipMin: c.clipMin || 30,
    clipMax: c.clipMax || 90,
    contentTypes: c.contentTypes || CONTENT_TYPE_OPTIONS.map((x) => x.id),
    platforms: c.platforms || ["instagram", "facebook", "whatsapp"],
  });
  const { busy, save } = useSaver();
  const [err, setErr] = useState<string | null>(null);
  const toggle = (k: "contentTypes" | "platforms", id: string) => f.setV({ ...f.v, [k]: f.v[k].includes(id) ? f.v[k].filter((x) => x !== id) : [...f.v[k], id] });
  return (
    <Card className="space-y-5 p-6">
      <fieldset disabled={disabled} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Preferred tone" value={f.v.tone} onChange={(e) => f.setV({ ...f.v, tone: e.target.value })}>
            {TONES.map((t) => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
          </Select>
          <Select label="Content language" value={f.v.language} onChange={(e) => f.setV({ ...f.v, language: e.target.value })}>
            {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </Select>
          <Select label="Bible translation" value={f.v.bibleTranslation} onChange={(e) => f.setV({ ...f.v, bibleTranslation: e.target.value })}>
            {BIBLE_TRANSLATIONS.map((b) => <option key={b}>{b}</option>)}
          </Select>
          <Input label="Scripture formatting" value={f.v.scriptureFormat} onChange={(e) => f.setV({ ...f.v, scriptureFormat: e.target.value })} />
        </div>
        <div>
          <span className="label">Preferred clip duration</span>
          <div className="flex items-center gap-3">
            <Input aria-label="Minimum seconds" type="number" min={10} max={170} value={f.v.clipMin} onChange={(e) => f.setV({ ...f.v, clipMin: Number(e.target.value) })} className="w-28" />
            <span className="text-sm text-fg-muted">to</span>
            <Input aria-label="Maximum seconds" type="number" min={20} max={180} value={f.v.clipMax} onChange={(e) => f.setV({ ...f.v, clipMax: Number(e.target.value) })} className="w-28" />
            <span className="text-sm text-fg-muted">seconds</span>
          </div>
        </div>
        <fieldset>
          <legend className="label">Content to generate</legend>
          <div className="grid gap-2.5 sm:grid-cols-2">{CONTENT_TYPE_OPTIONS.map((o) => <Checkbox key={o.id} checked={f.v.contentTypes.includes(o.id)} onChange={() => toggle("contentTypes", o.id)} label={o.label} />)}</div>
        </fieldset>
        <fieldset>
          <legend className="label">Publishing platforms</legend>
          <div className="grid gap-2.5 sm:grid-cols-3">{PLATFORMS.filter((p) => p.id !== "other").map((o) => <Checkbox key={o.id} checked={f.v.platforms.includes(o.id)} onChange={() => toggle("platforms", o.id)} label={o.label} />)}</div>
          <p className="hint">Social captions are written for these platforms.</p>
        </fieldset>
      </fieldset>
      {err && <Notice tone="error">{err}</Notice>}
      <SaveBar
        dirty={f.dirty}
        busy={busy}
        onReset={f.reset}
        disabled={disabled}
        onSave={() => {
          if (!(f.v.clipMin >= 10 && f.v.clipMax <= 180 && f.v.clipMin < f.v.clipMax)) return setErr("Clip duration must be between 10 and 180 seconds, with the minimum below the maximum.");
          if (!f.v.contentTypes.length) return setErr("Choose at least one content type.");
          setErr(null);
          save(() => updateChurch(churchId, { content: f.v }), f.markSaved);
        }}
      />
    </Card>
  );
}

function ApprovalTab({ church, disabled }: { church: Church; disabled: boolean }) {
  const { churchId } = useChurch();
  const members = useQueryData<Member>(collection(db, "churches", churchId, "members") as never, `m/${churchId}`);
  const a = church.approval || {};
  const f = useForm({ requireReapproval: a.requireReapproval !== false, defaultReviewerId: a.defaultReviewerId || "", publishingRole: a.publishingRole || "editor" });
  const { busy, save } = useSaver();
  return (
    <Card className="space-y-5 p-6">
      <Notice tone="info">Every asset must be approved by a person before it can be scheduled or published. Nothing is ever approved automatically.</Notice>
      <fieldset disabled={disabled} className="space-y-5">
        <Checkbox
          checked={f.v.requireReapproval}
          onChange={(v) => f.setV({ ...f.v, requireReapproval: v })}
          label={<><span className="font-medium text-fg">Require approval again after any edit</span><span className="block text-xs text-fg-muted">When off, small edits to titles and social captions keep their approval. Changes to quotes, clip timing, captions or written content always need approval again.</span></>}
        />
        <Select label="Default reviewer" value={f.v.defaultReviewerId} onChange={(e) => f.setV({ ...f.v, defaultReviewerId: e.target.value })} hint="Shown as the person responsible for reviewing new content.">
          <option value="">No default reviewer</option>
          {members.data.filter((m) => m.role !== "contributor").map((m) => <option key={m.id} value={m.id}>{m.name} ({m.role})</option>)}
        </Select>
        <Select label="Who can schedule and publish" value={f.v.publishingRole} onChange={(e) => f.setV({ ...f.v, publishingRole: e.target.value as "admin" | "editor" })}>
          <option value="editor">Administrators and media editors</option>
          <option value="admin">Administrators only</option>
        </Select>
      </fieldset>
      <SaveBar dirty={f.dirty} busy={busy} onReset={f.reset} disabled={disabled} onSave={() => save(() => updateChurch(churchId, { approval: { ...f.v, defaultReviewerId: f.v.defaultReviewerId || null } }), f.markSaved)} />
    </Card>
  );
}

const ROLE_LABEL: Record<string, string> = { admin: "Administrator", editor: "Media editor", contributor: "Contributor" };
const ROLE_DESC: Record<string, string> = {
  admin: "Everything, including settings and team",
  editor: "Review, approve, schedule and publish",
  contributor: "Upload sermons, edit and request changes",
};

function TeamTab({ disabled }: { disabled: boolean }) {
  const { churchId } = useChurch();
  const { user } = useAuth();
  const toast = useToast();
  const members = useQueryData<Member>(collection(db, "churches", churchId, "members") as never, `m/${churchId}`);
  const invites = useQueryData<Invite>(disabled ? null : query(collection(db, "churches", churchId, "invites"), where("status", "==", "pending")), `i/${churchId}/${disabled}`);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("contributor");
  const [busy, setBusy] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setErr(null);
  }, [email]);

  async function invite(e: FormEvent) {
    e.preventDefault();
    setBusy("invite");
    try {
      await api.inviteMember({ churchId, email: email.trim(), role });
      toast(`Invitation created for ${email.trim()}`);
      setEmail("");
    } catch (er) {
      setErr(errMessage(er));
    } finally {
      setBusy(null);
    }
  }
  const act = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try {
      await fn();
      toast(ok);
    } catch (e) {
      toast(errMessage(e), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      {!disabled && (
        <Card className="p-6">
          <h2 className="h-section mb-1">Invite a team member</h2>
          <p className="mb-4 text-sm text-fg-muted">They'll join this workspace when they sign up or sign in with this email. Share the app link with them.</p>
          <form onSubmit={invite} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Input className="flex-1" label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={err} />
            <Select label="Role" value={role} onChange={(e) => setRole(e.target.value)}>
              {Object.entries(ROLE_LABEL).map(([id, l]) => <option key={id} value={id}>{l}</option>)}
            </Select>
            <Button type="submit" icon={<UserPlus className="h-4 w-4" />} loading={busy === "invite"} disabled={!email}>Invite</Button>
          </form>
          <button type="button" className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-fg hover:underline" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/signup`).then(() => toast("Sign-up link copied"))}>
            <Copy className="h-3.5 w-3.5" /> Copy sign-up link
          </button>
          {invites.data.length > 0 && (
            <div className="mt-5 border-t border-gray-200 pt-4">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-[0.06em] text-gray-500">Pending invitations</h3>
              <ul className="space-y-2">
                {invites.data.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate text-fg">{i.email} <span className="text-gray-500">· {ROLE_LABEL[i.role]}</span></span>
                    <Button size="sm" variant="ghost" loading={busy === i.id} onClick={() => act(i.id, () => api.revokeInvite({ churchId, inviteId: i.id }), "Invitation revoked")}>Revoke</Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      <Card className="divide-y divide-gray-200">
        {members.data.map((m) => (
          <div key={m.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-fg">{(m.name || m.email || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-fg">{m.name}{m.id === user?.uid && <span className="text-gray-500"> (you)</span>}</div>
                <div className="truncate text-xs text-fg-muted">{m.email}</div>
              </div>
            </div>
            {disabled ? (
              <span className="text-sm text-fg-muted">{ROLE_LABEL[m.role]}</span>
            ) : (
              <div className="flex items-center gap-2">
                <select
                  className="field w-auto py-1.5"
                  aria-label={`Role for ${m.name}`}
                  value={m.role}
                  onChange={(e) => act(`role-${m.id}`, () => api.updateMemberRole({ churchId, uid: m.id, role: e.target.value }), "Role updated")}
                  title={ROLE_DESC[m.role]}
                >
                  {Object.entries(ROLE_LABEL).map(([id, l]) => <option key={id} value={id}>{l}</option>)}
                </select>
                {m.id !== user?.uid && (
                  <button className="rounded-lg p-2 text-gray-500 hover:bg-red-50 hover:text-red-700" onClick={() => setRemoving(m)} aria-label={`Remove ${m.name}`}><Trash2 className="h-4 w-4" /></button>
                )}
              </div>
            )}
          </div>
        ))}
      </Card>
      <div className="grid gap-3 text-xs text-fg-muted sm:grid-cols-3">
        {Object.entries(ROLE_DESC).map(([r, d]) => <div key={r}><span className="font-semibold text-fg">{ROLE_LABEL[r]}</span> — {d}</div>)}
      </div>

      <Modal
        open={!!removing}
        onClose={() => setRemoving(null)}
        title="Remove team member?"
        footer={<><Button variant="ghost" onClick={() => setRemoving(null)}>Cancel</Button><Button variant="danger" loading={busy === "remove"} onClick={() => removing && act("remove", () => api.removeMember({ churchId, uid: removing.id }).then(() => setRemoving(null)), "Member removed")}>Remove</Button></>}
      >
        <p className="text-sm text-gray-800">{removing?.name} will lose access to this church workspace. Content they created stays.</p>
      </Modal>
    </div>
  );
}
