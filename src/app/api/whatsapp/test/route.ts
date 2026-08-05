import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import {
  friendlyWhatsAppError,
  getWhatsAppConfigStatus,
  sendWhatsAppReliable,
  sendWhatsAppTemplate,
  validateWhatsAppToken,
  WA_TEMPLATES,
} from "@/lib/whatsapp";
import {
  FRONTDESK_WHATSAPP_DEFAULT,
  resolveNotificationPhones,
} from "@/lib/whatsapp-notify";

export const runtime = "nodejs";

/**
 * GET /api/whatsapp/test?to=0543843090&mode=checklist|hello|probe
 * Admin only. Defaults to front desk / fallback number.
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user?.permissions.manageSettings) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const mode = (searchParams.get("mode") || "checklist").toLowerCase();
  const db = getDb();
  const to =
    searchParams.get("to")?.trim() ||
    resolveNotificationPhones(db)[0] ||
    FRONTDESK_WHATSAPP_DEFAULT;

  const config = getWhatsAppConfigStatus();
  if (!config.configured) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "META_WA_TOKEN or META_WA_PHONE_ID not set in .env.local — add them and restart the server.",
        config,
      },
      { status: 503 },
    );
  }

  const tokenCheck = await validateWhatsAppToken();
  if (tokenCheck.valid === false) {
    return NextResponse.json(
      {
        ok: false,
        to,
        error: friendlyWhatsAppError(tokenCheck),
        errorCode: tokenCheck.errorCode,
        status: tokenCheck.status,
        tokenInvalid: true,
      },
      { status: 401 },
    );
  }

  if (mode === "probe") {
    const names = [
      WA_TEMPLATES.checklistStarted,
      WA_TEMPLATES.checklistSubmitted,
      WA_TEMPLATES.faultReport,
      "mmv_po_pending_approval",
      "hello_world",
    ];
    const probe = [];
    for (const name of names) {
      const result = await sendWhatsAppTemplate(to, name, [], "en_US");
      probe.push({
        name,
        ok: result.ok,
        errorCode: result.errorCode,
        errorMessage: result.errorMessage,
        messageId: result.messageId,
        // empty params may fail with 132000 if template exists — that still means it exists
        exists:
          result.ok ||
          result.errorCode === 132000 ||
          (result.errorCode !== 132001 && result.errorCode !== 132005),
      });
    }
    return NextResponse.json({
      ok: true,
      to,
      recipients: resolveNotificationPhones(db),
      probe,
      note: "132001 = template missing on WABA. Create mmv_checklist_started / mmv_checklist_submitted in Meta. Meanwhile the app falls back to text + existing templates.",
    });
  }

  if (mode === "hello") {
    const result = await sendWhatsAppTemplate(to, "hello_world", [], "en_US");
    if (!result.ok) {
      return NextResponse.json(
        {
          ok: false,
          to,
          error: friendlyWhatsAppError(result),
          errorCode: result.errorCode,
          detail: result.errorMessage,
        },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true, to, messageId: result.messageId, mode });
  }

  // Default: exercise the same reliable path used for first-item / submit alerts.
  const textBody =
    "Maya Villa Checklists test — if you receive this, notifications are working.";
  const result = await sendWhatsAppReliable(to, {
    preferredTemplates: [
      WA_TEMPLATES.checklistStarted,
      "mmv_checklist_started",
    ],
    preferredParams: ["Test checklist", new Date().toISOString().slice(0, 10), "Admin"],
    textBody,
    bridgePoParams: ["Test checklist", "Admin"],
    bridgeFaultParams: [
      "Admin",
      new Date().toISOString().slice(0, 10),
      "Test checklist",
      "in progress",
      "WhatsApp test from Settings",
    ],
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        to,
        error: friendlyWhatsAppError(result),
        errorCode: result.errorCode,
        status: result.status,
        detail: result.errorMessage,
        recipients: resolveNotificationPhones(db),
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    to,
    messageId: result.messageId,
    mode: "checklist",
    recipients: resolveNotificationPhones(db),
  });
}
