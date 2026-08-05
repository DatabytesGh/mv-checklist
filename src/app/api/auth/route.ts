import { NextRequest, NextResponse } from "next/server";
import {
  authenticateUser,
  createSession,
  destroySession,
  getSessionUser,
  logAudit,
} from "@/lib/auth";

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({ user });
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { username?: string; password?: string };
    const username = body.username?.trim();
    const password = body.password?.trim();
    if (!username || !password) {
      return NextResponse.json({ error: "Credentials required" }, { status: 400 });
    }

    const user = authenticateUser(username, password);
    if (!user) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    await createSession(user.id);
    logAudit(user.id, "login", "user", user.id);

    return NextResponse.json({ user });
  } catch (e) {
    console.error("[auth POST]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Login failed" },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  const user = await getSessionUser();
  if (user) logAudit(user.id, "logout", "user", user.id);
  await destroySession();
  return NextResponse.json({ ok: true });
}
