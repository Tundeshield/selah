import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { doc, getDoc, updateDoc, writeBatch, deleteDoc, serverTimestamp } from "firebase/firestore";
import { Home, Mic2, LayoutGrid, CalendarDays, Settings, Bell, LogOut, Upload, ChevronsUpDown, Check, X } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useChurch } from "../context/ChurchContext";
import { db } from "../lib/firebase";
import { Logo, StorageImage } from "./bits";
import { Button } from "./ui";
import { fmtRelative } from "../lib/format";
import { usingEmulators } from "../lib/firebase";

const NAV = [
  { to: "/", label: "Overview", icon: Home, end: true },
  { to: "/sermons", label: "Sermons", icon: Mic2 },
  { to: "/studio", label: "Content Studio", icon: LayoutGrid },
  { to: "/calendar", label: "Publishing Calendar", icon: CalendarDays },
  { to: "/settings", label: "Church Settings", icon: Settings },
];

function ChurchMark({ size = 36 }: { size?: number }) {
  const { church } = useChurch();
  const initials = (church?.name || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="flex shrink-0 items-center justify-center overflow-hidden rounded-lg bg-sage-200 text-[13px] font-semibold text-forest" style={{ width: size, height: size }}>
      {church?.logoPath ? <StorageImage path={church.logoPath} alt="" className="h-full w-full object-contain p-1" fallback={<span>{initials}</span>} /> : initials}
    </div>
  );
}

function ChurchSwitcher() {
  const { profile } = useAuth();
  const { church, churchId } = useChurch();
  const [open, setOpen] = useState(false);
  const many = (profile?.churchIds?.length || 0) > 1;
  return (
    <div className="relative">
      <button
        className={clsx("flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left", many && "hover:bg-forest-600")}
        onClick={() => many && setOpen((o) => !o)}
        aria-haspopup={many ? "listbox" : undefined}
      >
        <ChurchMark />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-cream">{church?.name || "Your church"}</div>
          <div className="text-xs text-sage-300">Church workspace</div>
        </div>
        {many && <ChevronsUpDown className="h-4 w-4 text-sage-300" />}
      </button>
      {open && profile && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 rounded-xl bg-white p-1 shadow-pop" role="listbox">
          {profile.churchIds.map((id) => (
            <ChurchOption key={id} id={id} active={id === churchId} onPick={() => setOpen(false)} />
          ))}
        </div>
      )}
    </div>
  );
}

function ChurchOption({ id, active, onPick }: { id: string; active: boolean; onPick: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState(id);
  useEffect(() => {
    getDoc(doc(db, "churches", id)).then((s) => s.exists() && setName(s.get("name"))).catch(() => undefined);
  }, [id]);
  return (
    <button
      role="option"
      aria-selected={active}
      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-forest hover:bg-sage-50"
      onClick={async () => {
        onPick();
        if (!active && user) {
          await updateDoc(doc(db, "users", user.uid), { activeChurchId: id, updatedAt: serverTimestamp() });
          navigate("/");
        }
      }}
    >
      <span className="truncate">{name}</span>
      {active && <Check className="h-4 w-4" />}
    </button>
  );
}

export function NotificationsButton({ variant = "dark" }: { variant?: "dark" | "light" }) {
  const { notifications, churchId } = useChurch();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const unread = notifications.filter((n) => !n.read).length;
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => panelRef.current && !panelRef.current.contains(e.target as Node) && setOpen(false);
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    setTimeout(() => document.addEventListener("mousedown", h), 0);
    document.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", k);
    };
  }, [open]);

  const markRead = (id: string) => updateDoc(doc(db, "churches", churchId, "notifications", id), { read: true, readAt: serverTimestamp() });
  const markAll = async () => {
    const b = writeBatch(db);
    notifications.filter((n) => !n.read).forEach((n) => b.update(doc(db, "churches", churchId, "notifications", n.id), { read: true, readAt: serverTimestamp() }));
    await b.commit();
  };
  const clearRead = async () => {
    await Promise.all(notifications.filter((n) => n.read).map((n) => deleteDoc(doc(db, "churches", churchId, "notifications", n.id))));
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={clsx("relative rounded-lg p-2", variant === "dark" ? "text-sage-200 hover:bg-forest-600 hover:text-cream" : "text-forest hover:bg-sage-100")}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-bold text-forest-900">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div ref={panelRef} className="fixed inset-x-3 top-16 z-50 max-h-[70vh] overflow-hidden rounded-2xl border border-cream-300 bg-white shadow-pop md:absolute md:inset-x-auto md:bottom-auto md:left-full md:top-0 md:ml-3 md:w-[380px]">
          <div className="flex items-center justify-between border-b border-cream-200 px-4 py-3">
            <h2 className="font-serif text-lg text-forest">Notifications</h2>
            <div className="flex items-center gap-1">
              {unread > 0 && <button onClick={markAll} className="rounded px-2 py-1 text-xs font-medium text-forest hover:bg-sage-100">Mark all as read</button>}
              <button onClick={() => setOpen(false)} aria-label="Close notifications" className="rounded p-1 text-charcoal-400 hover:bg-cream-200"><X className="h-4 w-4" /></button>
            </div>
          </div>
          <div className="max-h-[52vh] overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-charcoal-400">You're all caught up.</p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    if (!n.read) markRead(n.id);
                    setOpen(false);
                    navigate(n.link);
                  }}
                  className={clsx("flex w-full gap-3 border-b border-cream-100 px-4 py-3 text-left hover:bg-cream-50", !n.read && "bg-sage-50/60")}
                >
                  <span className={clsx("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read ? "bg-transparent" : n.type.includes("failed") ? "bg-[#B5544A]" : "bg-gold")} aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-forest">{n.title}</span>
                    <span className="mt-0.5 block text-[13px] leading-snug text-charcoal-500">{n.message}</span>
                    <span className="mt-1 block text-[11px] text-charcoal-400">{fmtRelative(n.createdAt)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
          {notifications.some((n) => n.read) && (
            <div className="border-t border-cream-200 px-4 py-2 text-right">
              <button onClick={clearRead} className="text-xs font-medium text-charcoal-400 hover:text-forest">Clear read notifications</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function AppLayout() {
  const { user, profile, signOut } = useAuth();
  const { member, church } = useChurch();
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);
  const name = member?.name || profile?.name || user?.email || "";
  const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="min-h-screen md:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2">Skip to content</a>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[264px] shrink-0 flex-col bg-forest px-4 py-5 md:flex" aria-label="Primary">
        <div className="mb-6 flex items-center justify-between px-2">
          <Logo light />
          <NotificationsButton />
        </div>
        <ChurchSwitcher />
        <nav className="mt-6 flex flex-col gap-1">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[14px] font-medium transition-colors",
                  isActive ? "bg-cream text-forest" : "text-sage-200 hover:bg-forest-600 hover:text-cream",
                )
              }
            >
              <n.icon className="h-[18px] w-[18px]" aria-hidden />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-6 px-1">
          <Button variant="gold" className="w-full" icon={<Upload className="h-4 w-4" />} onClick={() => navigate("/sermons/upload")}>
            Upload sermon
          </Button>
        </div>
        {usingEmulators && <div className="mt-4 rounded-lg bg-gold/15 px-3 py-2 text-xs text-gold-100">Development environment (emulators)</div>}
        <div className="mt-auto flex items-center gap-3 rounded-xl px-2 py-2">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sage-300 text-xs font-semibold text-forest">{initials}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-cream">{name}</div>
            <div className="text-xs capitalize text-sage-300">{member?.role || ""}</div>
          </div>
          <button onClick={signOut} className="rounded-lg p-2 text-sage-300 hover:bg-forest-600 hover:text-cream" aria-label="Sign out" title="Sign out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-cream-300/70 bg-cream/95 px-4 py-3 backdrop-blur md:hidden">
        <div className="flex min-w-0 items-center gap-2.5">
          <ChurchMark size={32} />
          <span className="truncate font-serif text-lg text-forest">{church?.name || "Selah Studio"}</span>
        </div>
        <div className="flex items-center gap-1">
          <NotificationsButton variant="light" />
          <button onClick={signOut} className="rounded-lg p-2 text-forest hover:bg-sage-100" aria-label="Sign out"><LogOut className="h-5 w-5" /></button>
        </div>
      </header>

      <main id="main" className="min-w-0 flex-1 pb-24 md:pb-0">
        <div className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 md:px-10 md:py-10">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-cream-300 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label="Primary">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => clsx("flex flex-col items-center gap-1 py-2.5 text-[10.5px] font-medium", isActive ? "text-forest" : "text-charcoal-400")}>
            {({ isActive }) => (
              <>
                <span className={clsx("rounded-full px-3 py-1", isActive && "bg-sage-200")}><n.icon className="h-5 w-5" aria-hidden /></span>
                {n.label.split(" ")[n.label.startsWith("Publishing") ? 1 : 0].replace("Church", "Settings")}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
