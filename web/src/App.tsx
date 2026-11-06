import { lazy, ReactNode, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ChurchProvider, useChurch } from "./context/ChurchContext";
import { isConfigured, missingEnv } from "./lib/firebase";
import { AppLayout } from "./components/Layout";
import { Button, EmptyState, PageLoading, ToastProvider } from "./components/ui";
import { Logo } from "./components/bits";

const SignIn = lazy(() => import("./pages/auth/AuthPages").then((m) => ({ default: m.SignIn })));
const SignUp = lazy(() => import("./pages/auth/AuthPages").then((m) => ({ default: m.SignUp })));
const ResetPassword = lazy(() => import("./pages/auth/AuthPages").then((m) => ({ default: m.ResetPassword })));
const Onboarding = lazy(() => import("./pages/Onboarding"));
const Overview = lazy(() => import("./pages/Overview"));
const Sermons = lazy(() => import("./pages/Sermons"));
const UploadSermon = lazy(() => import("./pages/UploadSermon"));
const SermonWorkspace = lazy(() => import("./pages/SermonWorkspace"));
const ContentStudio = lazy(() => import("./pages/ContentStudio"));
const AssetReview = lazy(() => import("./pages/AssetReview"));
const Calendar = lazy(() => import("./pages/Calendar"));
const Settings = lazy(() => import("./pages/Settings"));

function SetupRequired() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="card max-w-lg p-8">
        <Logo className="mb-6" />
        <h1 className="h-page">Configuration needed</h1>
        <p className="mt-3 text-sm text-fg-muted">
          Selah Studio needs its Firebase project settings before it can run. Add these environment variables to your Netlify site (or <code className="rounded bg-gray-100 px-1">web/.env.local</code> for development), then redeploy:
        </p>
        <ul className="mt-4 space-y-1 font-mono text-[13px] text-fg">{missingEnv.map((k) => <li key={k}>{k}</li>)}</ul>
        <p className="mt-4 text-xs text-gray-500">See README.md → Setup for the full checklist.</p>
      </div>
    </div>
  );
}

function FullPageLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas">
      <PageLoading />
    </div>
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <FullPageLoading />;
  if (!user) return <Navigate to="/signin" replace state={{ from: loc.pathname + loc.search }} />;
  return <>{children}</>;
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageLoading />;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function MembershipGuard({ children }: { children: ReactNode }) {
  const { member, church, loading } = useChurch();
  const { signOut } = useAuth();
  if (loading) return <FullPageLoading />;
  if (!member || !church) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
        <EmptyState title="You no longer have access" action={<div className="flex gap-2"><Button onClick={() => (window.location.href = "/onboarding")}>Create or join a church</Button><Button variant="ghost" onClick={signOut}>Sign out</Button></div>}>
          Your access to this church workspace was removed, or the workspace no longer exists.
        </EmptyState>
      </div>
    );
  }
  return <>{children}</>;
}

function ChurchApp() {
  const { profile, loading, profileError } = useAuth();
  if (loading) return <FullPageLoading />;
  if (profileError && !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
        <EmptyState title="We couldn't load your account" action={<Button onClick={() => window.location.reload()}>Try again</Button>}>
          Check your connection and try again. If this continues, the backend may not be deployed yet.
        </EmptyState>
      </div>
    );
  }
  if (!profile?.activeChurchId) return <Navigate to="/onboarding" replace />;
  return (
    <ChurchProvider key={profile.activeChurchId} churchId={profile.activeChurchId}>
      <MembershipGuard>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<Overview />} />
            <Route path="sermons" element={<Sermons />} />
            <Route path="sermons/upload" element={<UploadSermon />} />
            <Route path="sermons/:sermonId" element={<SermonWorkspace />} />
            <Route path="studio" element={<ContentStudio />} />
            <Route path="studio/:assetId" element={<AssetReview />} />
            <Route path="calendar" element={<Calendar />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<EmptyState title="Page not found" action={<Button onClick={() => window.history.back()}>Go back</Button>}>This page doesn't exist.</EmptyState>} />
          </Route>
        </Routes>
      </MembershipGuard>
    </ChurchProvider>
  );
}

export default function App() {
  if (!isConfigured) return <SetupRequired />;
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <Suspense fallback={<FullPageLoading />}>
            <Routes>
              <Route path="/signin" element={<PublicOnly><SignIn /></PublicOnly>} />
              <Route path="/signup" element={<PublicOnly><SignUp /></PublicOnly>} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/onboarding" element={<RequireAuth><Onboarding /></RequireAuth>} />
              <Route path="/*" element={<RequireAuth><ChurchApp /></RequireAuth>} />
            </Routes>
          </Suspense>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
