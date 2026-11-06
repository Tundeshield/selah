import { FormEvent, ReactNode, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, updateProfile, GoogleAuthProvider, signInWithPopup } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { authError } from "../../lib/format";
import { Button, Input, Notice } from "../../components/ui";
import { Logo } from "../../components/bits";

function AuthRipples() {
  const rings = [0.3, 0.45, 0.6, 0.76, 0.93, 1.1];
  const size = 1000;
  return (
    <div className="ripples [&>span]:!left-[50%] [&>span]:!top-[62%]" aria-hidden>
      <span className="glow" style={{ width: size * 0.7, height: size * 0.7 }} />
      {rings.map((r, i) => <span key={r} style={{ width: size * r, height: size * r, opacity: 1 - i * 0.13 }} />)}
      <span className="pulse" style={{ width: size * 0.5, height: size * 0.5, borderColor: "rgb(var(--brand-300) / 0.5)" }} />
    </div>
  );
}

function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer: ReactNode }) {
  return (
    <div className="grid min-h-screen bg-canvas lg:grid-cols-[1.05fr_1fr]">
      <div className="relative hidden overflow-hidden bg-ink p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <AuthRipples />
        <div className="relative"><Link to="/" aria-label="Selah Studio home"><Logo light /></Link></div>
        <div className="relative max-w-xl">
          <h1 className="display-xl text-[clamp(3rem,5vw,4.6rem)] text-white">
            One sermon.
            <br />
            <span className="bg-gradient-to-r from-white via-brand-200 to-brand-400 bg-clip-text text-transparent">A week of ministry.</span>
          </h1>
          <p className="mt-7 max-w-md text-[1.1rem] leading-relaxed text-white/65">
            Upload a recording, review what Selah Studio prepares, and share what you approve throughout the week.
          </p>
        </div>
        <p className="relative text-[0.85rem] text-white/45">© {new Date().getFullYear()} Dove</p>
      </div>
      <div className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-[26rem]">
          <Link to="/" aria-label="Selah Studio home" className="mb-10 block lg:hidden"><Logo /></Link>
          <h2 className="h-page">{title}</h2>
          <p className="mt-2 text-[1rem] text-fg-muted">{subtitle}</p>
          <div className="mt-8">{children}</div>
          <div className="mt-8 text-center text-[0.94rem] text-fg-muted">{footer}</div>
        </div>
      </div>
    </div>
  );
}

function GoogleButton({ onError }: { onError: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      className="w-full"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await signInWithPopup(auth, new GoogleAuthProvider());
        } catch (e) {
          const code = (e as { code?: string }).code;
          if (code !== "auth/popup-closed-by-user" && code !== "auth/cancelled-popup-request") onError(authError(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.9-3c-1 .7-2.4 1.2-4 1.2-3.1 0-5.7-2.1-6.6-4.9H1.4v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.4 14.4a7.2 7.2 0 0 1 0-4.7V6.6h-4a12 12 0 0 0 0 10.8l4-3z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.4 6.6l4 3.1C6.3 6.9 8.9 4.8 12 4.8z"/></svg>
      Continue with Google
    </Button>
  );
}

export function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password);
      navigate(loc.state?.from || "/", { replace: true });
    } catch (err) {
      setError(authError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to your church's media workspace." footer={<>New to Selah Studio? <Link className="link" to="/signup">Create an account</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Notice tone="error">{error}</Notice>}
        <Input label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <div className="flex justify-end">
          <Link to="/reset-password" className="text-sm text-fg underline-offset-4 hover:underline">Forgot password?</Link>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!email || !password}>Sign in</Button>
        <div className="flex items-center gap-3 py-1 text-[0.85rem] text-fg-subtle"><span className="h-px flex-1 bg-gray-300" />or<span className="h-px flex-1 bg-gray-300" /></div>
        <GoogleButton onError={setError} />
      </form>
    </AuthShell>
  );
}

export function SignUp() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Please enter your name.");
    if (password.length < 8) return setError("Use a password of at least 8 characters.");
    setBusy(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(cred.user, { displayName: name.trim() });
      await sendEmailVerification(cred.user).catch(() => undefined);
      navigate("/onboarding", { replace: true });
    } catch (err) {
      setError(authError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Create your account" subtitle="Set up a workspace for your church in a couple of minutes." footer={<>Already have an account? <Link className="link" to="/signin">Sign in</Link></>}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && <Notice tone="error">{error}</Notice>}
        <Input label="Your name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} hint="If you were invited, use the email address the invitation was sent to." />
        <Input label="Password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} hint="At least 8 characters." />
        <Button type="submit" size="lg" className="w-full" loading={busy}>Create account</Button>
        <div className="flex items-center gap-3 py-1 text-[0.85rem] text-fg-subtle"><span className="h-px flex-1 bg-gray-300" />or<span className="h-px flex-1 bg-gray-300" /></div>
        <GoogleButton onError={setError} />
      </form>
    </AuthShell>
  );
}

export function ResetPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      setSent(true);
    } catch (err) {
      const code = (err as { code?: string }).code;
      // Don't reveal whether an account exists.
      if (code === "auth/user-not-found") setSent(true);
      else setError(authError(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthShell title="Reset your password" subtitle="We'll email you a link to choose a new password." footer={<Link className="link" to="/signin">Back to sign in</Link>}>
      {sent ? (
        <Notice tone="success" title="Check your inbox">If an account exists for {email}, a reset link is on its way.</Notice>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && <Notice tone="error">{error}</Notice>}
          <Input label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!email}>Send reset link</Button>
        </form>
      )}
    </AuthShell>
  );
}
