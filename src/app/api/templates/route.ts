import { NextRequest, NextResponse } from "next/server";
import { getSessionUser, logAudit } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { isAdmin } from "@/lib/permissions";

/**
 * The shared inventory DB stores checklist_types/checklist_templates with
 * non-auto TEXT primary keys, so we must generate ids on insert (matching the
 * inventory app's `<ms>-<random>` convention). Omitting the id stores NULL,
 * which breaks later updates/deletes that match on id.
 */
function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const slug = req.nextUrl.searchParams.get("slug");
  const db = getDb();

  if (slug) {
    const items = db
      .prepare(
        `SELECT * FROM checklist_templates WHERE checklist_type_slug = ? ORDER BY section, item_order`,
      )
      .all(slug);
    return NextResponse.json({ items });
  }

  const types = db
    .prepare(`SELECT * FROM checklist_types ORDER BY display_order`)
    .all();
  return NextResponse.json({ types });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.permissions.manageSettings) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const db = getDb();

  if (body.type === "checklist_type") {
    const slug = body.slug ?? body.label.toLowerCase().replace(/\s+/g, "-");
    db.prepare(
      `INSERT INTO checklist_types (id, slug, label, icon, department_tag, frequency, completer_role, approver_role, is_system, display_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 99)`,
    ).run(
      genId(),
      slug,
      body.label,
      body.icon ?? "clipboard",
      body.department_tag ?? "",
      body.frequency ?? "daily",
      body.completer_role,
      body.approver_role,
    );
    return NextResponse.json({ slug });
  }

  if (body.type === "template_item") {
    const maxOrder = (
      db
        .prepare(
          `SELECT COALESCE(MAX(item_order), 0) as m FROM checklist_templates WHERE checklist_type_slug = ?`,
        )
        .get(body.checklist_type_slug) as { m: number }
    ).m;

    const id = genId();
    db.prepare(
      `INSERT INTO checklist_templates (id, checklist_type_slug, section, item_order, item_text, requires_time_entry, requires_text_entry, is_shift_leader_selector)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      body.checklist_type_slug,
      body.section ?? "General",
      maxOrder + 1,
      body.item_text,
      body.requires_time_entry ? 1 : 0,
      body.requires_text_entry ? 1 : 0,
      body.is_shift_leader_selector ? 1 : 0,
    );
    return NextResponse.json({ id });
  }

  return NextResponse.json({ error: "Unknown type" }, { status: 400 });
}

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser();
  if (!user?.permissions.manageSettings) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const db = getDb();

  const existing = db
    .prepare(`SELECT * FROM checklist_templates WHERE id = ?`)
    .get(body.id) as
    | {
        id: string | number;
        checklist_type_slug: string;
        section: string;
        item_text: string;
        item_order: number;
        requires_time_entry: number;
        requires_text_entry: number;
        is_shift_leader_selector: number;
        is_active: number;
      }
    | undefined;

  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const nextSlug =
    typeof body.checklist_type_slug === "string" && body.checklist_type_slug.trim()
      ? body.checklist_type_slug.trim()
      : existing.checklist_type_slug;

  if (nextSlug !== existing.checklist_type_slug) {
    const typeOk = db
      .prepare(`SELECT slug FROM checklist_types WHERE slug = ?`)
      .get(nextSlug);
    if (!typeOk) {
      return NextResponse.json(
        { error: "Checklist type not found" },
        { status: 400 },
      );
    }
  }

  let nextOrder = existing.item_order;
  if (nextSlug !== existing.checklist_type_slug) {
    nextOrder =
      (
        db
          .prepare(
            `SELECT COALESCE(MAX(item_order), 0) as m FROM checklist_templates WHERE checklist_type_slug = ?`,
          )
          .get(nextSlug) as { m: number }
      ).m + 1;
  }

  db.prepare(
    `UPDATE checklist_templates
     SET checklist_type_slug = ?,
         section = ?,
         item_text = ?,
         item_order = ?,
         requires_time_entry = ?,
         requires_text_entry = ?,
         is_shift_leader_selector = ?,
         is_active = ?
     WHERE id = ?`,
  ).run(
    nextSlug,
    body.section ?? existing.section,
    body.item_text ?? existing.item_text,
    nextOrder,
    body.requires_time_entry ? 1 : 0,
    body.requires_text_entry ? 1 : 0,
    body.is_shift_leader_selector ? 1 : 0,
    body.is_active == null
      ? existing.is_active
      : body.is_active
        ? 1
        : 0,
    body.id,
  );

  logAudit(user.id, "checklist_item_updated", "checklist_template", String(body.id));
  return NextResponse.json({ ok: true, checklist_type_slug: nextSlug });
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Deleting checklist items is admin-only by default (RBAC: deleteChecklistItem).
  if (!isAdmin(user.role) && !user.permissions.deleteChecklistItem) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const db = getDb();
  const item = db
    .prepare("SELECT id FROM checklist_templates WHERE id = ?")
    .get(id) as { id: number } | undefined;
  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  db.prepare("DELETE FROM checklist_templates WHERE id = ?").run(id);
  logAudit(user.id, "checklist_item_deleted", "checklist_template", String(id));

  return NextResponse.json({ ok: true });
}
