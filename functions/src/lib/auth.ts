import { HttpsError, CallableRequest } from "firebase-functions/v2/https";
import { churchRef } from "./admin";
import { Role, ROLE_RANK } from "./types";

export interface MemberContext {
  uid: string;
  email: string | null;
  name: string;
  role: Role;
  churchId: string;
}

export function requireAuth(req: CallableRequest<unknown>): { uid: string; email: string | null; name: string } {
  if (!req.auth) throw new HttpsError("unauthenticated", "Please sign in to continue.");
  const token = req.auth.token;
  return {
    uid: req.auth.uid,
    email: (token.email as string | undefined)?.toLowerCase() ?? null,
    name: (token.name as string | undefined) || (token.email as string | undefined) || "Team member",
  };
}

/** Server-side permission check. Every callable that touches church data goes through this. */
export async function requireMember(
  req: CallableRequest<unknown>,
  churchId: unknown,
  minRole: Role = "contributor",
): Promise<MemberContext> {
  const user = requireAuth(req);
  if (typeof churchId !== "string" || !churchId) {
    throw new HttpsError("invalid-argument", "A church workspace is required.");
  }
  const snap = await churchRef(churchId).collection("members").doc(user.uid).get();
  if (!snap.exists) throw new HttpsError("permission-denied", "You don't have access to this church workspace.");
  const role = snap.get("role") as Role;
  if (!ROLE_RANK[role] || ROLE_RANK[role] < ROLE_RANK[minRole]) {
    throw new HttpsError("permission-denied", `This action needs the ${minRole} role or higher.`);
  }
  return { ...user, name: snap.get("name") || user.name, role, churchId };
}

export function str(v: unknown, field: string, max = 5000, optional = false): string {
  if (v === undefined || v === null || v === "") {
    if (optional) return "";
    throw new HttpsError("invalid-argument", `${field} is required.`);
  }
  if (typeof v !== "string") throw new HttpsError("invalid-argument", `${field} must be text.`);
  const t = v.trim();
  if (t.length > max) throw new HttpsError("invalid-argument", `${field} is too long.`);
  return t;
}
