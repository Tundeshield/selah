import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { sendEmailVerification } from "firebase/auth";
import clsx from "clsx";
import { Check, ImagePlus, UserPlus, Upload } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { db } from "../lib/firebase";
import { uploadChurchLogo, updateChurch } from "../lib/church";
import { errMessage } from "../lib/format";
import { BIBLE_TRANSLATIONS, CONTENT_TYPE_OPTIONS, LANGUAGES, PLATFORMS } from "../lib/constants";
import { Button, Checkbox, Input, Notice, Select } from "../components/ui";
import { Logo } from "../components/bits";

const STEPS = ["Church profile", "Logo", "Content preferences", "Invite team", "First sermon"];

export default function Onboarding() {
  const { profile, invites, user, refreshInvites, signOut } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [churchId, setChurchId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Resume onboarding if a church was just created
  useEffect(() => {
    if (!churchId && profile?.activeChurchId) {
      getDoc(doc(db, "churches", profile.activeChurchId)).then((s) => {
        if (s.exists() && !s.get("onboarding")?.completed && s.get("createdBy") === user?.uid) {
          setChurchId(s.id);
          setStep((x) => (x === 0 ? 1 : x));
        } else if (s.exists()) {
          navigate("/", { replace: true });
        }
      }).catch(() => undefined);
    }
  }, [profile?.activeChurchId, churchId, user?.uid, navigate]);

  // Step 1
  const [p, setP] = useState({ name: "", pastor: "", website: "", country: "", language: "en", bibleTranslation: "NIV" });
  async function createChurch(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!p.name.trim()) return setError("Please enter your church's name.");
    if (p.website && !/^https?:\/\/|^[\w-]+\./i.test(p.website)) return setError("Enter a valid website, e.g. https://yourchurch.org");
    setBusy(true);
    try {
      const r = await api.createChurch({ ...p, website: p.website && !/^https?:\/\//.test(p.website) ? `https://${p.website}` : p.website });
      setChurchId(r.churchId);
      setStep(1);
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // Step 2
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  async function onLogo(file?: File | null) {
    if (!file || !churchId) return;
    setError(null);
    setBusy(true);
    try {
      const r = await uploadChurchLogo(churchId, file);
      setLogoPreview(r.url);
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // Step 3
  const [types, setTypes] = useState<string[]>(CONTENT_TYPE_OPTIONS.map((c) => c.id));
  const [platforms, setPlatforms] = useState<string[]>(["instagram", "facebook", "whatsapp"]);
  async function savePrefs() {
    if (!churchId) return;
    setBusy(true);
    try {
      await updateChurch(churchId, { "content.contentTypes": types, "content.platforms": platforms });
      setStep(3);
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  // Step 4
  const [invEmail, setInvEmail] = useState("");
  const [invRole, setInvRole] = useState("editor");
  const [invited, setInvited] = useState<string[]>([]);
  async function invite(e: FormEvent) {
    e.preventDefault();
    if (!churchId || !invEmail) return;
    setError(null);
    setBusy(true);
    try {
      await api.inviteMember({ churchId, email: invEmail.trim(), role: invRole });
      setInvited((x) => [...x, invEmail.trim()]);
      setInvEmail("");
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function finish(toUpload: boolean) {
    if (churchId) await updateChurch(churchId, { "onboarding.completed": true }).catch(() => undefined);
    navigate(toUpload ? "/sermons/upload" : "/", { replace: true });
  }

  async function join(inviteId: string) {
    setBusy(true);
    setError(null);
    try {
      // Refresh the token so a just-completed email verification is recognised.
      await user?.reload();
      await user?.getIdToken(true);
      await api.acceptInvite({ inviteId });
      await refreshInvites();
      navigate("/", { replace: true });
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const toggle = (arr: string[], v: string, set: (x: string[]) => void) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <div className="min-h-screen bg-cream">
      <div className="mx-auto max-w-2xl px-5 py-10">
        <div className="mb-10 flex items-center justify-between">
          <Logo />
          <button onClick={signOut} className="text-sm text-charcoal-400 hover:text-forest">Sign out</button>
        </div>

        {!churchId && invites.length > 0 && (
          <div className="card mb-8 p-6">
            <h2 className="h-section">You've been invited</h2>
            <p className="mt-1 text-sm text-charcoal-500">Join your church's existing workspace.</p>
            {user && !user.emailVerified && (
              <div className="mt-3">
                <Notice tone="info">
                  We sent a verification link to {user.email}. Verify your email, then choose Join.{" "}
                  <button className="font-medium underline" onClick={() => sendEmailVerification(user).then(() => setError(null)).catch(() => undefined)}>Resend link</button>
                </Notice>
              </div>
            )}
            <div className="mt-4 space-y-2">
              {invites.map((i) => (
                <div key={i.id} className="flex items-center justify-between gap-3 rounded-lg border border-cream-300 px-4 py-3">
                  <div>
                    <div className="font-medium text-forest">{i.churchName}</div>
                    <div className="text-xs capitalize text-charcoal-400">as {i.role}</div>
                  </div>
                  <Button size="sm" onClick={() => join(i.id)} loading={busy}>Join workspace</Button>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-charcoal-400">Or create a new church workspace below.</p>
          </div>
        )}

        <ol className="mb-8 flex gap-2" aria-label="Onboarding progress">
          {STEPS.map((s, i) => (
            <li key={s} className="flex-1">
              <div className={clsx("h-1 rounded-full", i <= step ? "bg-forest" : "bg-cream-300")} />
              <div className={clsx("mt-2 hidden text-xs sm:block", i === step ? "font-medium text-forest" : "text-charcoal-400")}>{s}</div>
            </li>
          ))}
        </ol>

        {error && <div className="mb-5"><Notice tone="error">{error}</Notice></div>}

        <div className="card p-6 sm:p-8">
          {step === 0 && (
            <form onSubmit={createChurch} className="space-y-5" noValidate>
              <div>
                <h1 className="h-page">Tell us about your church</h1>
                <p className="mt-2 text-sm text-charcoal-500">Just the essentials — you can change everything later in Church Settings.</p>
              </div>
              <Input label="Church name" required value={p.name} onChange={(e) => setP({ ...p, name: e.target.value })} placeholder="e.g. Grace Community Church" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Input label="Pastor or primary contact" value={p.pastor} onChange={(e) => setP({ ...p, pastor: e.target.value })} />
                <Input label="Country" value={p.country} onChange={(e) => setP({ ...p, country: e.target.value })} />
              </div>
              <Input label="Church website" hint="Optional" value={p.website} onChange={(e) => setP({ ...p, website: e.target.value })} placeholder="https://" />
              <div className="grid gap-4 sm:grid-cols-2">
                <Select label="Preferred content language" value={p.language} onChange={(e) => setP({ ...p, language: e.target.value })}>
                  {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                </Select>
                <Select label="Preferred Bible translation" value={p.bibleTranslation} onChange={(e) => setP({ ...p, bibleTranslation: e.target.value })}>
                  {BIBLE_TRANSLATIONS.map((b) => <option key={b}>{b}</option>)}
                </Select>
              </div>
              <div className="flex justify-end pt-2">
                <Button type="submit" size="lg" loading={busy}>Create workspace</Button>
              </div>
            </form>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h1 className="h-page">Add your church logo</h1>
                <p className="mt-2 text-sm text-charcoal-500">Used on quote graphics and video clips. PNG with a transparent background works best.</p>
              </div>
              <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-cream-300 bg-cream-50 px-6 py-10 text-center hover:border-sage-300">
                {logoPreview ? <img src={logoPreview} alt="Church logo" className="h-24 object-contain" /> : <ImagePlus className="h-8 w-8 text-sage-500" />}
                <span className="text-sm font-medium text-forest">{logoPreview ? "Choose a different image" : "Choose a logo image"}</span>
                <span className="text-xs text-charcoal-400">PNG, JPG, WEBP or SVG · up to 5 MB</span>
                <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" onChange={(e) => onLogo(e.target.files?.[0])} />
              </label>
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep(2)}>Skip for now</Button>
                <Button onClick={() => setStep(2)} loading={busy}>Continue</Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div>
                <h1 className="h-page">What should we prepare?</h1>
                <p className="mt-2 text-sm text-charcoal-500">Choose the content Selah Studio generates from each sermon.</p>
              </div>
              <fieldset>
                <legend className="label">Content types</legend>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {CONTENT_TYPE_OPTIONS.map((c) => <Checkbox key={c.id} checked={types.includes(c.id)} onChange={() => toggle(types, c.id, setTypes)} label={c.label} />)}
                </div>
              </fieldset>
              <fieldset>
                <legend className="label">Where do you share content?</legend>
                <div className="grid gap-2.5 sm:grid-cols-3">
                  {PLATFORMS.filter((x) => !["other", "podcast"].includes(x.id)).map((pl) => <Checkbox key={pl.id} checked={platforms.includes(pl.id)} onChange={() => toggle(platforms, pl.id, setPlatforms)} label={pl.label} />)}
                </div>
              </fieldset>
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep(3)}>Skip</Button>
                <Button onClick={savePrefs} loading={busy} disabled={!types.length}>Continue</Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <div>
                <h1 className="h-page">Invite your team</h1>
                <p className="mt-2 text-sm text-charcoal-500">Optional. Invited people join when they sign up with the same email.</p>
              </div>
              <form onSubmit={invite} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <Input className="flex-1" label="Email" type="email" value={invEmail} onChange={(e) => setInvEmail(e.target.value)} />
                <Select label="Role" value={invRole} onChange={(e) => setInvRole(e.target.value)}>
                  <option value="admin">Administrator</option>
                  <option value="editor">Media editor</option>
                  <option value="contributor">Contributor</option>
                </Select>
                <Button type="submit" variant="secondary" icon={<UserPlus className="h-4 w-4" />} loading={busy} disabled={!invEmail}>Invite</Button>
              </form>
              {invited.length > 0 && (
                <ul className="space-y-1.5">
                  {invited.map((e) => <li key={e} className="flex items-center gap-2 text-sm text-forest"><Check className="h-4 w-4 text-sage-500" />{e}</li>)}
                </ul>
              )}
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setStep(4)}>Skip</Button>
                <Button onClick={() => setStep(4)}>Continue</Button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-5 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sage-100 text-forest"><Upload className="h-6 w-6" /></div>
              <h1 className="h-page">Your next sermon starts here.</h1>
              <p className="mx-auto max-w-md text-sm text-charcoal-500">Upload a sermon recording and Selah Studio will help turn it into videos, graphics and content for your church.</p>
              <div className="flex flex-col justify-center gap-2 pt-2 sm:flex-row">
                <Button size="lg" onClick={() => finish(true)} icon={<Upload className="h-4 w-4" />}>Upload sermon</Button>
                <Button size="lg" variant="ghost" onClick={() => finish(false)}>Go to Overview</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
