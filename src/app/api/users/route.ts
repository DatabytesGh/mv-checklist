import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, logAudit } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { saveRolePermissions } from "@/lib/seed";
import type { ChecklistRole } from "@/lib/types";
import { insertUser, listAllUsers, updateUser } from "@/lib/user-queries";

export async function GET() {
  const user = await getSessionUser();
  if (!user?.permissions.manageUsers) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getDb();
  const users = listAllUsers(db);

  const roles = db.prepare(`SELECT role, permissions_json FROM role_permissions`).all();

  return NextResponse.json({ users, roles });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.permissions.manageUsers) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const db = getDb();
  const id = `user-${Date.now()}`;

  insertUser(db, {
    id,
    username: body.username,
    password: body.password,
    role: body.role,
    display_name: body.display_name ?? body.username,
    checklist_only: !!body.checklist_only,
    phone: body.phone,
  });

  logAudit(user.id, "user_created", "user", id);
  return NextResponse.json({ id });
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.permissions.manageUsers) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const db = getDb();

  if (body.rolePermissions) {
    saveRolePermissions(db, body.role as ChecklistRole, body.rolePermissions);
    logAudit(user.id, "settings_changed", "role_permissions", body.role);
    return NextResponse.json({ ok: true });
  }

  updateUser(db, {
    id: body.id,
    username: body.username,
    password: body.password,
    role: body.role,
    display_name: body.display_name ?? body.username,
    phone: body.phone,
    active: !!body.active,
    checklist_only: !!body.checklist_only,
    must_change_password:
      typeof body.must_change_password === "boolean"
        ? body.must_change_password
        : undefined,
  });

  const details = body.password?.trim()
    ? "password reset — must change on next login"
    : body.must_change_password === true
      ? "force password change on next login"
      : undefined;
  logAudit(user.id, "user_updated", "user", String(body.id), details);
  return NextResponse.json({ ok: true });
}
