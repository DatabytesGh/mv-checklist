import { cookies } from "next/headers";
import { getDb } from "./db";
import type { ChecklistPermissions, SessionUser } from "./types";
import {
  checkPassword,
  selectUserById,
  selectUserByUsername,
  userToSession,
} from "./user-queries";

const COOKIE_NAME = "mv-checklist-session";
const SESSION_HOURS = 12;

export function logAudit(
  userId: string | null,
  action: string,
  entityType?: string,
  entityId?: string | null,
  details?: string,
  ip?: string,
) {
  const db = getDb();
  const idCol = db.prepare("PRAGMA table_info(audit_logs)").all() as Array<{
    name: string;
    type: string;
  }>;
  const idType = idCol.find((c) => c.name === "id")?.type?.toUpperCase() ?? "TEXT";
  const params = [
    userId ?? "system",
    action,
    entityType ?? null,
    entityId ?? null,
    details ?? null,
    ip ?? null,
  ];

  if (idType.includes("INT")) {
    db.prepare(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address, created_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).run(...params);
  } else {
    const id = `audit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    db.prepare(
      `INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, details, ip_address, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    ).run(id, ...params);
  }
}

export async function createSession(userId: string): Promise<void> {
  const cookieStore = await cookies();
  const payload = JSON.stringify({
    userId,
    exp: Date.now() + SESSION_HOURS * 60 * 60 * 1000,
  });
  cookieStore.set(COOKIE_NAME, payload, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_HOURS * 60 * 60,
  });
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(COOKIE_NAME)?.value;
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as { userId: string; exp: number };
    if (parsed.exp < Date.now()) return null;

    const db = getDb();
    const user = selectUserById(db, parsed.userId);
    if (!user || !user.active) return null;

    return userToSession(db, user);
  } catch {
    return null;
  }
}

export function authenticateUser(
  username: string,
  password: string,
): SessionUser | null {
  const db = getDb();
  const user = selectUserByUsername(db, username);
  if (!user || !user.active || !checkPassword(user, password)) return null;
  return userToSession(db, user);
}

export function requirePermission(
  user: SessionUser,
  key: keyof ChecklistPermissions,
): boolean {
  if (user.role === "admin") return true;
  return user.permissions[key];
}
