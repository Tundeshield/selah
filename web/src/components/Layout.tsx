import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { doc, getDoc, updateDoc, writeBatch, deleteDoc, serverTimestamp } from "firebase/firestore";
import { Home, Mic2, LayoutGrid, CalendarDays, Settings, Bell, LogOut, Upload, ChevronsUpDown, Check, X, Type, Images } from "lucide-react";
import { useFlags } from "../lib/flags";
import { useAuth } from "../context/AuthContext";
import { useChurch } from "../context/ChurchContext";
import { db, usingEmulators } from "../lib/firebase";
import { Logo, StorageImage } from "./bits";
import { Button } from "./ui";
import { fmtRelative } from "../lib/format";
import { TextSizeControl } from "./TextSizeControl";

const NAV = [
  { to: "/", label: "Overview", short: "Overview", icon: Home, end: true },
  { to: "/sermons", label: "Sermons", short: "Sermons", icon: Mic2 },
  { to: "/studio", label: "Content Studio", short: "Studio", icon: LayoutGrid },
  { to: "/media", label: "Media", short: "Media", icon: Images, flag: "photoEditor" as const },
  { to: "/calendar", label: "Publishing Calendar", short: "Calendar", icon: CalendarDays },
  { to: "/settings", label: "Church Settings", short: "Settings", icon: Settings },
];

function initialsOf(s: string) {
  return (s || "?").split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
}

function ChurchMark({ size = 2.25 }: { size?: number }) {
  const { church } = useChurch();
  return (
    <div className="flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-ink text-[0.8rem] font-semibold text-brand-300" style={{ width: `${size}rem`, height: `${size}rem` }}>
      {church?.logoPath ? <StorageImage path={church.logoPath} alt="" className="h-full w-full bg-white object-contain p-1" fallback={<span>{initialsOf(church?.name || "")}</span>} /> : initialsOf(church?.name || "")}
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
        className={clsx("flex w-full items-center gap-3 rounded-2xl bg-white px-3 py-2.5 text-left shadow-card ring-1 ring-gray-200", many && "hover:ring-gray-300")}
        onClick={() => many && setOpen((o) => !o)}
        aria-haspopup={many ? "listbox" : undefined}
      >
        <ChurchMark />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[0.9rem] font-semibold text-fg">{church?.name || "Your church"}</div>
          <div className="text-[0.75rem] text-fg-muted">Church workspace</div>
        </div>
        {many && <ChevronsUpDown className="h-4 w-4 text-fg-muted" />}
      </button>
      {open && profile && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1.5 rounded-2xl bg-white p-1.5 shadow-pop ring-1 ring-gray-200" role="listbox">
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
      className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-[0.9rem] text-fg hover:bg-gray-100"
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

function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const k = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    setTimeout(() => document.addEventListener("mousedown", h), 0);
    document.addEventListener("keydown", k);
    return () => {
      document.removeEventListener("mousedown", h);
      document.removeEventListener("keydown", k);
    };
  }, [open]);
  return { open, setOpen, ref };
}

export function NotificationsButton({ placement = "side" }: { placement?: "side" | "top" }) {
  const { notifications, churchId } = useChurch();
  const pop = usePopover();
  const navigate = useNavigate();
  const unread = notifications.filter((n) => !n.read).length;

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
        onClick={() => pop.setOpen((o) => !o)}
        className="relative flex h-10 w-10 items-center justify-center rounded-full text-fg hover:bg-gray-200/70"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        aria-expanded={pop.open}
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && <span className="absolute right-1 top-1 flex h-[1.1rem] min-w-[1.1rem] items-center justify-center rounded-full bg-brand-400 px-1 text-[0.65rem] font-bold text-ink ring-2 ring-canvas">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {pop.open && (
        <div ref={pop.ref} className={clsx("fixed inset-x-3 top-16 z-50 max-h-[72vh] overflow-hidden rounded-2xl bg-white shadow-pop ring-1 ring-gray-200 md:absolute md:inset-x-auto md:w-[24rem]", placement === "side" ? "md:left-full md:top-0 md:ml-3" : "md:right-0 md:top-12")}>
          <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
            <h2 className="h-section">Notifications</h2>
            <div className="flex items-center gap-1">
              {unread > 0 && <button onClick={markAll} className="rounded-full px-2.5 py-1 text-[0.8rem] font-medium text-fg hover:bg-gray-100">Mark all as read</button>}
              <button onClick={() => pop.setOpen(false)} aria-label="Close notifications" className="rounded-full p-1.5 text-fg-muted hover:bg-gray-100"><X className="h-4 w-4" /></button>
            </div>
          </div>
          <div className="max-h-[54vh] overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-12 text-center text-[0.9rem] text-fg-muted">You're all caught up.</p>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    if (!n.read) markRead(n.id);
                    pop.setOpen(false);
                    navigate(n.link);
                  }}
                  className={clsx("flex w-full gap-3 border-b border-gray-100 px-4 py-3.5 text-left hover:bg-gray-50", !n.read && "bg-brand-50/50")}
                >
                  <span className={clsx("mt-2 h-2 w-2 shrink-0 rounded-full", n.read ? "bg-transparent" : n.type.includes("failed") ? "bg-red-500" : "bg-brand-500")} aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-[0.9rem] font-semibold text-fg">{n.title}</span>
                    <span className="mt-0.5 block text-[0.85rem] leading-snug text-fg-muted">{n.message}</span>
                    <span className="mt-1 block text-[0.72rem] text-fg-subtle">{fmtRelative(n.createdAt)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
          {notifications.some((n) => n.read) && (
            <div className="border-t border-gray-200 px-4 py-2.5 text-right">
              <button onClick={clearRead} className="text-[0.8rem] font-medium text-fg-muted hover:text-fg">Clear read notifications</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The person's own menu: text size and sign out. */
function UserMenu({ placement = "side" }: { placement?: "side" | "top" }) {
  const { user, profile, signOut } = useAuth();
  const { member } = useChurch();
  const pop = usePopover();
  const name = member?.name || profile?.name || user?.email || "";
  return (
    <div className="relative">
      {placement === "side" ? (
        <button onClick={() => pop.setOpen((o) => !o)} aria-expanded={pop.open} className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-gray-200/60">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-[0.75rem] font-semibold text-brand-300">{initialsOf(name)}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[0.9rem] font-medium text-fg">{name}</div>
            <div className="text-[0.75rem] capitalize text-fg-muted">{member?.role || ""}</div>
          </div>
          <Type className="h-4 w-4 text-fg-muted" aria-hidden />
        </button>
      ) : (
        <button onClick={() => pop.setOpen((o) => !o)} aria-expanded={pop.open} aria-label="Your account and text size" className="flex h-10 w-10 items-center justify-center rounded-full bg-ink text-[0.75rem] font-semibold text-brand-300">
          {initialsOf(name)}
        </button>
      )}
      {pop.open && (
        <div ref={pop.ref} className={clsx("absolute z-50 w-[18rem] rounded-2xl bg-white p-4 shadow-pop ring-1 ring-gray-200", placement === "side" ? "bottom-full left-0 mb-2" : "right-0 top-12")}>
          <div className="mb-1 truncate text-[0.9rem] font-semibold text-fg">{name}</div>
          <div className="mb-4 truncate text-[0.8rem] text-fg-muted">{user?.email}</div>
          <div className="eyebrow mb-2">Text size</div>
          <TextSizeControl compact />
          <p className="mt-2 text-[0.75rem] text-fg-muted">Makes everything easier to read. Saved to your account.</p>
          <button onClick={signOut} className="mt-4 flex w-full items-center gap-2 rounded-xl px-2 py-2 text-[0.9rem] text-fg hover:bg-gray-100">
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function AppLayout() {
  const flags = useFlags();
  const nav = NAV.filter((n) => !("flag" in n) || (n.flag && flags[n.flag]));
  const { church } = useChurch();
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="min-h-screen md:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[70] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2">Skip to content</a>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-[17.5rem] shrink-0 flex-col px-4 py-5 md:flex" aria-label="Primary">
        <div className="mb-6 flex items-center justify-between px-1.5">
          <Logo />
          <NotificationsButton />
        </div>
        <ChurchSwitcher />
        <nav className="mt-6 flex flex-col gap-1">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                clsx(
                  "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-[0.94rem] font-medium transition-all",
                  isActive ? "bg-white text-fg shadow-card ring-1 ring-gray-200" : "text-fg-muted hover:bg-gray-200/60 hover:text-fg",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <n.icon className={clsx("h-[1.15rem] w-[1.15rem]", isActive && "text-brand-600")} aria-hidden />
                  {n.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="mt-6">
          <Button className="w-full" icon={<Upload className="h-4 w-4" />} onClick={() => navigate("/sermons/upload")}>
            Upload sermon
          </Button>
        </div>
        {usingEmulators && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[0.75rem] text-amber-900">Development environment (emulators)</div>}
        <div className="mt-auto pt-4">
          <UserMenu />
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-gray-200 bg-canvas/95 px-4 py-2.5 backdrop-blur md:hidden">
        <div className="flex min-w-0 items-center gap-2.5">
          <ChurchMark size={2} />
          <span className="truncate text-[1rem] font-semibold text-fg">{church?.name || "Selah Studio"}</span>
        </div>
        <div className="flex items-center gap-1">
          <NotificationsButton placement="top" />
          <UserMenu placement="top" />
        </div>
      </header>

      <main id="main" className="min-w-0 flex-1 pb-28 md:py-3 md:pb-3 md:pr-3">
        <div className="min-h-[calc(100vh-1.5rem)] md:rounded-3xl md:bg-white/60 md:ring-1 md:ring-gray-200/80">
          <div className="mx-auto w-full max-w-[76rem] px-4 py-6 sm:px-6 md:px-10 md:py-10">
            <Outlet />
          </div>
        </div>
      </main>

      {/* Mobile bottom navigation */}
      <nav className="fixed inset-x-3 bottom-3 z-30 grid rounded-2xl bg-ink p-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] shadow-pop md:hidden" aria-label="Primary" style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}>
        {nav.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => clsx("flex flex-col items-center gap-1 rounded-xl py-2 text-[0.68rem] font-medium", isActive ? "bg-white/10 text-white" : "text-white/55")}>
            {({ isActive }) => (
              <>
                <n.icon className={clsx("h-5 w-5", isActive && "text-brand-300")} aria-hidden />
                {n.short}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
