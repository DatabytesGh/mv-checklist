import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, logAudit } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  changeOwnPassword,
  checkPassword,
  selectUserById,
  selectUserByUsername,
  userToSession,
} from "@/lib/user-queries";

const MIN_PASSWORD_LENGTH = 6;

/** POST /api/auth/change-password — logged-in user sets a new password. */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as {
    currentPassword?: string;
    newPassword?: string;
  };
  const currentPassword = body.currentPassword?.trim() ?? "";
  const newPassword = body.newPassword?.trim() ?? "";

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { error: "Current and new password are required" },
      { status: 400 },
    );
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      { status: 400 },
    );
  }
  if (newPassword === currentPassword) {
    return NextResponse.json(
      { error: "New password must be different from the current password" },
      { status: 400 },
    );
  }

  const db = getDb();
  // Need the password hash — selectUserById doesn't include it.
  const withHash = selectUserByUsername(db, session.username);
  if (!withHash || !withHash.active) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (!checkPassword(withHash, currentPassword)) {
    return NextResponse.json(
      { error: "Current password is incorrect" },
      { status: 401 },
    );
  }

  changeOwnPassword(db, session.id, newPassword);
  logAudit(session.id, "password_changed", "user", session.id);

  const refreshed = selectUserById(db, session.id);
  const user = refreshed ? userToSession(db, refreshed) : { ...session, must_change_password: false };

  return NextResponse.json({ ok: true, user });
}
