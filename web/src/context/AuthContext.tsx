import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { onAuthStateChanged, signOut as fbSignOut, User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { api } from "../lib/api";
import type { UserProfile } from "../lib/types";
import { applyTextSize, getTextSize, isTextSize } from "../lib/textSize";

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  invites: { id: string; churchId: string; churchName: string; role: string }[];
  loading: boolean;
  profileError: string | null;
  refreshInvites: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const AuthCtx = createContext<AuthState | null>(null);
const Ctx = AuthCtx;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [invites, setInvites] = useState<AuthState["invites"]>([]);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  useEffect(() => onAuthStateChanged(auth, (u) => {
    setUser(u);
    setAuthLoading(false);
    if (!u) {
      setProfile(null);
      setInvites([]);
    }
  }), []);

  const refreshInvites = useCallback(async () => {
    try {
      const r = await api.ensureUserProfile({ name: auth.currentUser?.displayName || undefined });
      setInvites(r.invites);
      setProfileError(null);
    } catch (e) {
      setProfileError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    setProfileLoading(true);
    let unsub = () => {};
    let cancelled = false;
    refreshInvites().finally(() => {
      if (cancelled) return;
      unsub = onSnapshot(
        doc(db, "users", user.uid),
        (snap) => {
          setProfile(snap.exists() ? ({ uid: snap.id, ...snap.data() } as UserProfile) : null);
          // Follow the person's saved text size across devices.
          const ts = snap.get("textSize");
          if (isTextSize(ts) && ts !== getTextSize()) applyTextSize(ts);
          setProfileLoading(false);
        },
        (e) => {
          setProfileError(e.message);
          setProfileLoading(false);
        },
      );
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [user, refreshInvites]);

  const value: AuthState = {
    user,
    profile,
    invites,
    loading: authLoading || (!!user && profileLoading),
    profileError,
    refreshInvites,
    signOut: () => fbSignOut(auth),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}
