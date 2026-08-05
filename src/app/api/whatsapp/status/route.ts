import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  getWhatsAppConfigStatus,
  validateWhatsAppToken,
  WA_TEMPLATES,
} from "@/lib/whatsapp";

export const runtime = "nodejs";

/** GET /api/whatsapp/status — config + DB numbers (no message sent). */
export async function GET() {
  const user = await getSessionUser();
  if (!user?.permissions.manageSettings) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const wa = getWhatsAppConfigStatus();
  const tokenCheck = wa.configured ? await validateWhatsAppToken() : null;
  const db = getDb();

  const settings = db
    .prepare("SELECT key, value FROM settings WHERE key LIKE '%whatsapp%'")
    .all() as Array<{ key: string; value: string }>;

  const vendorsWithWa = db
    .prepare(
      `SELECT COUNT(*) as c FROM vendors WHERE is_active = 1 AND COALESCE(whatsapp_number, phone, '') != ''`,
    )
    .get() as { c: number };

  return NextResponse.json({
    metaApi: wa,
    tokenCheck,
    hotelWhatsapp:
      settings.find((s) => s.key === "hotel_whatsapp")?.value?.trim() || null,
    activeVendorsWithPhone: vendorsWithWa.c,
    templatesExpected: [
      WA_TEMPLATES.faultReport,
      WA_TEMPLATES.checklistStarted,
      WA_TEMPLATES.checklistSubmitted,
    ],
    hint: !wa.configured
      ? "Add META_WA_TOKEN and META_WA_PHONE_ID to .env.local, then restart the server."
      : tokenCheck?.networkError
        ? "Could not reach Meta to verify the token (temporary network). Use Send test — if that works, WhatsApp is fine."
        : tokenCheck?.valid === false
          ? "Permanent tokens can still be revoked — create a new System User token in Business Manager, update META_WA_TOKEN, restart."
          : "Send test uses the same delivery path as checklist alerts. Prefer mode=checklist. Missing mmv_checklist_* templates fall back to text / existing templates.",
  });
}
