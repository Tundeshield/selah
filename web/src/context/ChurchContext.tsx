import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from "react";
import { collection, orderBy, query, where, limit } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useDocData, useQueryData } from "../lib/hooks";
import { useAuth } from "./AuthContext";
import { api } from "../lib/api";
import type { AppNotification, Asset, Church, Member, Publication, Role, Sermon } from "../lib/types";
import { ROLE_RANK } from "../lib/types";

interface Integrations {
  transcription: boolean;
  ai: boolean;
  rendering: boolean;
  directPublishing: boolean;
}

interface ChurchState {
  churchId: string;
  church: Church | null;
  member: Member | null;
  role: Role;
  can: (min: Role) => boolean;
  canPublish: boolean;
  sermons: Sermon[];
  assets: Asset[];
  publications: Publication[];
  notifications: AppNotification[];
  loading: boolean;
  integrations: Integrations | null;
}

export const ChurchCtx = createContext<ChurchState | null>(null);
const Ctx = ChurchCtx;

export function ChurchProvider({ churchId, children }: { churchId: string; children: ReactNode }) {
  const { user } = useAuth();
  const church = useDocData<Church>(`churches/${churchId}`);
  const member = useDocData<Member>(user ? `churches/${churchId}/members/${user.uid}` : null);
  const base = `churches/${churchId}`;
  const sermons = useQueryData<Sermon>(query(collection(db, base, "sermons"), orderBy("serviceDate", "desc")), `${base}/sermons`);
  const assets = useQueryData<Asset>(query(collection(db, base, "assets"), orderBy("updatedAt", "desc")), `${base}/assets`);
  const publications = useQueryData<Publication>(query(collection(db, base, "publications"), orderBy("scheduledAt", "asc")), `${base}/publications`);
  const notifications = useQueryData<AppNotification>(
    user ? query(collection(db, base, "notifications"), where("userId", "==", user.uid), orderBy("createdAt", "desc"), limit(60)) : null,
    `${base}/notifications/${user?.uid}`,
  );
  const [integrations, setIntegrations] = useState<Integrations | null>(null);
  useEffect(() => {
    api.integrationStatus({}).then(setIntegrations).catch(() => setIntegrations(null));
  }, []);

  const value = useMemo<ChurchState>(() => {
    const role = (member.data?.role || "contributor") as Role;
    const can = (min: Role) => !!member.data && ROLE_RANK[role] >= ROLE_RANK[min];
    const pubRole = church.data?.approval?.publishingRole || "editor";
    return {
      churchId,
      church: church.data,
      member: member.data,
      role,
      can,
      canPublish: can(pubRole),
      sermons: sermons.data,
      assets: assets.data,
      publications: publications.data,
      notifications: notifications.data,
      loading: church.loading || member.loading || sermons.loading || assets.loading,
      integrations,
    };
  }, [churchId, church, member, sermons, assets, publications, notifications, integrations]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useChurch() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useChurch outside ChurchProvider");
  return c;
}
