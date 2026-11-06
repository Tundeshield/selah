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
    <div className="flex shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-brand-50 text-[13px] font-semibold text-brand-800" style={{ width: size, height: size }}>
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
        className={clsx("flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-2.5 py-2 text-left shadow-card", many && "hover:bg-gray-50")}
        onClick={() => many && setOpen((o) => !o)}
        aria-haspopup={many ? "listbox" : undefined}
      >
        <ChurchMark />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-fg">{church?.name || "Your church"}</div>
          <div className="text-xs text-gray-500">Church workspace</div>
        </div>
        {many && <ChevronsUpDown className="h-4 w-4 text-gray-500" />}
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
      className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-fg hover:bg-gray-50"
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
        className={clsx("relative rounded-lg p-2", variant === "dark" ? "text-fg-muted hover:bg-gray-100 hover:text-fg" : "text-fg hover:bg-gray-100")}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-semibold text-white">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div ref={panelRef} className="fixed inset-x-3 top-16 z-50 max-h-[70vh] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-pop md:absolute md:inset-x-auto md:bottom-auto md:left-full md:top-0 md:ml-3 md:w-[380px]">
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <h2 className="font-semibold tracking-tight text-lg text-fg">Notifications</h2>
            <div className="flex items-center gap-1">
              {unread > 0 && <button onClick={markAll} className="rounded px-2 py-1 text-xs font-medium text-fg hover:bg-gray-100">Mark all as read</button>}
              <button onClick={() => setOpen(false)} aria-label="Close notifications" className="rounded p-1 text-gray-500 hover:bg-gray-100"><X className="h-4 w-4" /></button>
            </div>
          </div>
          <div className="max-h-[52vh] overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-gray-500">You're all caught up.</p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    if (!n.read) markRead(n.id);
                    setOpen(false);
                    navigate(n.link);
                  }}
                  className={clsx("flex w-full gap-3 border-b border-gray-100 px-4 py-3 text-left hover:bg-gray-50", !n.read && "bg-gray-50/60")}
                >
                  <span className={clsx("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read ? "bg-transparent" : n.type.includes("failed") ? "bg-red-500" : "bg-brand-500")} aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-fg">{n.title}</span>
                    <span className="mt-0.5 block text-[13px] leading-snug text-fg-muted">{n.message}</span>
                    <span className="mt-1 block text-[11px] text-gray-500">{fmtRelative(n.createdAt)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
          {notifications.some((n) => n.read) && (
            <div className="border-t border-gray-200 px-4 py-2 text-right">
              <button onClick={clearRead} className="text-xs font-medium text-gray-500 hover:text-fg">Clear read notifications</button>
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
      <aside className="sticky top-0 hidden h-screen w-[260px] shrink-0 flex-col border-r border-gray-200 bg-white px-4 py-5 md:flex" aria-label="Primary">
        <div className="mb-6 flex items-center justify-between px-2">
          <Logo />
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
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-[14.5px] font-medium transition-colors",
                  isActive ? "bg-gray-100 text-fg" : "text-fg-muted hover:bg-gray-50 hover:text-fg",
                )
              }
            >
              <n.icon className="h-[18px] w-[18px]" aria-hidden />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-6 px-1">
          <Button className="w-full" icon={<Upload className="h-4 w-4" />} onClick={() => navigate("/sermons/upload")}>
            Upload sermon
          </Button>
        </div>
        {usingEmulators && <div className="mt-4 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800">Development environment (emulators)</div>}
        <div className="mt-auto flex items-center gap-3 border-t border-gray-200 px-1 pt-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-800">{initials}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-fg">{name}</div>
            <div className="text-xs capitalize text-gray-500">{member?.role || ""}</div>
          </div>
          <button onClick={signOut} className="rounded-lg p-2 text-fg-muted hover:bg-gray-100 hover:text-fg" aria-label="Sign out" title="Sign out">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-gray-200/70 bg-canvas px-4 py-3 backdrop-blur md:hidden">
        <div className="flex min-w-0 items-center gap-2.5">
          <ChurchMark size={32} />
          <span className="truncate font-semibold tracking-tight text-lg text-fg">{church?.name || "Selah Studio"}</span>
        </div>
        <div className="flex items-center gap-1">
          <NotificationsButton variant="light" />
          <button onClick={signOut} className="rounded-lg p-2 text-fg hover:bg-gray-100" aria-label="Sign out"><LogOut className="h-5 w-5" /></button>
        </div>
      </header>

      <main id="main" className="min-w-0 flex-1 pb-24 md:pb-0">
        <div className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 md:px-10 md:py-10">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-gray-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" aria-label="Primary">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => clsx("flex flex-col items-center gap-1 py-2.5 text-[10.5px] font-medium", isActive ? "text-brand-700" : "text-gray-500")}>
            {({ isActive }) => (
              <>
                <span className={clsx("rounded px-3 py-1", isActive && "bg-brand-50 text-brand-700")}><n.icon className="h-5 w-5" aria-hidden /></span>
                {n.label.split(" ")[n.label.startsWith("Publishing") ? 1 : 0].replace("Church", "Settings")}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
