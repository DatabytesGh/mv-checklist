import { NextRequest, NextResponse } from "next/server";
import { writeFileSync, mkdirSync, existsSync, unlinkSync } from "fs";
import path from "path";
import { publishChecklistItemUpdate } from "@/lib/activity";
import { getSessionUser, logAudit } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { canCompleteChecklist } from "@/lib/permissions";
import { newPhotoId } from "@/lib/sessions-db";

const MAX_PHOTOS_PER_REQUEST = 5;

function loadSession(sessionId: string) {
  const db = getDb();
  return db
    .prepare("SELECT id, checklist_type_slug, status FROM checklist_sessions WHERE id = ?")
    .get(sessionId) as
    | { id: string; checklist_type_slug: string; status: string }
    | undefined;
}

/** Attach one or more photos to a checklist item. Files are stored locally. */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const sessionId = String(form.get("sessionId") ?? "").trim();
  const templateItemId = String(form.get("templateItemId") ?? "").trim();

  if (!sessionId || sessionId === "null" || !templateItemId) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const db = getDb();
  const session = loadSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }
  if (session.status === "approved") {
    return NextResponse.json(
      { error: "This checklist is approved and locked" },
      { status: 403 },
    );
  }
  if (!canCompleteChecklist(db, session.checklist_type_slug, user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const uploadDir = path.join(
    process.cwd(),
    "public",
    "uploads",
    "checklist",
    sessionId,
    templateItemId,
  );
  mkdirSync(uploadDir, { recursive: true });

  const insert = db.prepare(
    `INSERT INTO checklist_item_photos (id, session_id, template_item_id, file_path, uploaded_by_user_id, uploaded_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`,
  );

  const saved: string[] = [];
  for (let i = 0; i < MAX_PHOTOS_PER_REQUEST; i++) {
    const file = form.get(`photo${i}`) as File | null;
    if (!file || file.size === 0) continue;
    const buf = Buffer.from(await file.arrayBuffer());
    const ext = file.type === "image/png" ? "png" : "jpg";
    const filename = `${Date.now()}-${i}.${ext}`;
    const rel = `/uploads/checklist/${sessionId}/${templateItemId}/${filename}`;
    writeFileSync(path.join(uploadDir, filename), buf);
    insert.run(newPhotoId(), sessionId, templateItemId, rel, user.id);
    saved.push(rel);
  }

  if (saved.length === 0) {
    return NextResponse.json({ error: "No photos uploaded" }, { status: 400 });
  }

  logAudit(user.id, "checklist_item_photo_added", "session", sessionId, templateItemId);
  publishChecklistItemUpdate({
    sessionId,
    actorUserId: user.id,
    actorName: user.display_name ?? user.username,
    itemStatus: "photo",
  });

  return NextResponse.json({ ok: true, photos: saved });
}

/** Remove a single checklist item photo (DB row + local file). */
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { photoId } = (await req.json()) as { photoId?: string };
  if (!photoId) {
    return NextResponse.json({ error: "Missing photoId" }, { status: 400 });
  }

  const db = getDb();
  const photo = db
    .prepare(
      "SELECT id, session_id, file_path FROM checklist_item_photos WHERE id = ?",
    )
    .get(photoId) as
    | { id: string; session_id: string; file_path: string }
    | undefined;
  if (!photo) {
    return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  }

  const session = loadSession(photo.session_id);
  if (session && session.status === "approved") {
    return NextResponse.json(
      { error: "This checklist is approved and locked" },
      { status: 403 },
    );
  }
  if (
    session &&
    !canCompleteChecklist(db, session.checklist_type_slug, user)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  db.prepare("DELETE FROM checklist_item_photos WHERE id = ?").run(photoId);

  try {
    const abs = path.join(process.cwd(), "public", photo.file_path);
    if (existsSync(abs)) unlinkSync(abs);
  } catch {
    /* file may already be gone — DB row removal is what matters */
  }

  publishChecklistItemUpdate({
    sessionId: photo.session_id,
    actorUserId: user.id,
    actorName: user.display_name ?? user.username,
    itemStatus: "photo",
  });

  return NextResponse.json({ ok: true });
}
