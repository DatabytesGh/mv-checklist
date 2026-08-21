/**
 * Domain helpers for outbound WhatsApp notifications.
 * Sends are fire-and-forget — callers should not block primary writes on failure.
 */

import { readFileSync, existsSync } from "fs";
import path from "path";
import type Database from "better-sqlite3";
import { getRolePermissions } from "./seed";
import type { ChecklistPermissions, ChecklistRole } from "./types";
import { usersTableColumns, usesInventoryUserSchema } from "./users-db";
import {
  detectImageMime,
  getWhatsAppConfigStatus,
  normalizePhone,
  sendWhatsAppImage,
  sendWhatsAppReliable,
  sendWhatsAppTemplateFirst,
  uploadWhatsAppMedia,
  WA_TEMPLATES,
  type SendAttemptResult,
} from "./whatsapp";

/** Default front-desk recipient (Ghana national format; normalized at send time). */
export const FRONTDESK_WHATSAPP_DEFAULT = "0543843090";

function settingValue(db: Database.Database, key: string): string | null {
  const row = db
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string } | undefined;
  const v = row?.value?.trim();
  return v || null;
}

/**
 * Fallback hotel/front-desk number (settings), used when no RBAC user has a phone.
 */
export function resolveApproverWhatsApp(
  db: Database.Database,
  _checklistSlug?: string | null,
): string {
  return (
    settingValue(db, "hotel_whatsapp") ?? FRONTDESK_WHATSAPP_DEFAULT
  );
}

/** Ensure hotel WhatsApp defaults to front desk when empty. */
export function ensureFrontdeskWhatsAppSettings(db: Database.Database): void {
  const upsert = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value
     WHERE trim(COALESCE(settings.value, '')) = ''`,
  );

  upsert.run("hotel_whatsapp", FRONTDESK_WHATSAPP_DEFAULT);
}

function canReceiveWhatsApp(
  permissions: ChecklistPermissions,
  phone: string | null | undefined,
): boolean {
  if (!phone?.trim()) return false;
  return permissions.receiveNotifications === true;
}

type ActiveUserRow = {
  id: string;
  username: string;
  role: ChecklistRole;
  display_name: string;
  phone: string | null;
};

function listActiveUsers(db: Database.Database): ActiveUserRow[] {
  const inv = usesInventoryUserSchema(db);
  const cols = usersTableColumns(db);
  const hasPhone = cols.has("phone");

  if (inv) {
    if (hasPhone) {
      return db
        .prepare(
          `SELECT id, username, role, full_name AS display_name, phone
           FROM users WHERE is_active = 1`,
        )
        .all() as ActiveUserRow[];
    }
    return (
      db
        .prepare(
          `SELECT id, username, role, full_name AS display_name
           FROM users WHERE is_active = 1`,
        )
        .all() as Array<Omit<ActiveUserRow, "phone">>
    ).map((u) => ({ ...u, phone: null }));
  }

  return db
    .prepare(
      `SELECT id, username, role, display_name, phone
       FROM users WHERE active = 1`,
    )
    .all() as ActiveUserRow[];
}

/**
 * Phones that should get checklist WhatsApp alerts, driven by RBAC
 * (`receiveNotifications`). Defaults: Front Desk (+ admin) only.
 * Always includes hotel/fallback WhatsApp when set, so ops still get alerts
 * even if member phones are missing.
 */
export function resolveNotificationPhones(
  db: Database.Database,
  checklistSlug?: string | null,
): string[] {
  const phones = new Set<string>();

  for (const u of listActiveUsers(db)) {
    const permissions = getRolePermissions(db, u.role) as ChecklistPermissions;
    if (!canReceiveWhatsApp(permissions, u.phone)) continue;
    const normalised = normalizePhone(u.phone!);
    if (normalised) phones.add(normalised);
  }

  const fallback = resolveApproverWhatsApp(db, checklistSlug);
  const fallbackNorm = normalizePhone(fallback);
  if (fallbackNorm) phones.add(fallbackNorm);

  return [...phones];
}

async function sendReliableToMany(
  phones: string[],
  opts: Parameters<typeof sendWhatsAppReliable>[1],
): Promise<SendAttemptResult[]> {
  return Promise.all(phones.map((to) => sendWhatsAppReliable(to, opts)));
}

export type ChecklistSubmittedNotifyInput = {
  to: string;
  checklistLabel: string;
  date: string;
  submitterName: string;
  checked: number;
  total: number;
  faulty: number;
};

export function buildChecklistSubmittedText(
  input: ChecklistSubmittedNotifyInput,
): string {
  return `✅ *MV CHECKLIST*\n${input.checklistLabel} is complete for ${input.date} and waiting for approval.\nSubmitted by ${input.submitterName} · ${input.checked}/${input.total} checked · ${input.faulty} fault(s).\n👀 Please review and approve to close today's ${input.checklistLabel} checklist.`;
}

/**
 * Template-first notify for checklist submission (business-initiated safe).
 * Returns a settled result; does not throw.
 */
export async function notifyChecklistSubmitted(
  input: ChecklistSubmittedNotifyInput,
): Promise<SendAttemptResult> {
  if (!getWhatsAppConfigStatus().configured) {
    return {
      ok: false,
      errorMessage: "META_WA_TOKEN or META_WA_PHONE_ID missing",
    };
  }

  const text = buildChecklistSubmittedText(input);
  return sendWhatsAppReliable(input.to, {
    preferredTemplates: [
      WA_TEMPLATES.checklistSubmitted,
      "mmv_checklist_submitted",
    ],
    preferredParams: [
      input.checklistLabel,
      input.date,
      input.submitterName,
      String(input.checked),
      String(input.total),
      String(input.faulty),
    ],
    textBody: text,
    bridgePoParams: [input.checklistLabel, input.submitterName],
    bridgeFaultParams: [
      input.submitterName,
      input.date,
      input.checklistLabel,
      "submitted",
      `${input.checked}/${input.total} checked, ${input.faulty} faults`,
    ],
  });
}

/** Fire-and-forget wrapper that logs failures without affecting callers. */
export function voidNotifyChecklistSubmitted(
  input: ChecklistSubmittedNotifyInput,
): void {
  void notifyChecklistSubmitted(input).then((result) => {
    if (!result.ok) {
      console.warn(
        "[whatsapp] checklist submitted notify failed:",
        result.errorCode ?? "",
        result.errorMessage ?? "unknown",
      );
    }
  });
}

export type ChecklistStartedNotifyInput = {
  checklistLabel: string;
  date: string;
  starterName: string;
};

export function buildChecklistStartedText(
  input: ChecklistStartedNotifyInput,
): string {
  return `📋 *MV CHECKLIST* The ${input.checklistLabel} checklist is underway for ${input.date}. Started by ${input.starterName} — please stand by.`;
}

/** Notify all RBAC WhatsApp recipients that a checklist was started. */
export async function notifyChecklistStartedToRecipients(
  db: Database.Database,
  input: ChecklistStartedNotifyInput & { checklistSlug?: string | null },
): Promise<SendAttemptResult[]> {
  if (!getWhatsAppConfigStatus().configured) {
    return [
      {
        ok: false,
        errorMessage: "META_WA_TOKEN or META_WA_PHONE_ID missing",
      },
    ];
  }

  const phones = resolveNotificationPhones(db, input.checklistSlug);
  if (phones.length === 0) {
    return [{ ok: false, errorMessage: "No notification recipients" }];
  }

  const text = buildChecklistStartedText(input);
  return sendReliableToMany(phones, {
    preferredTemplates: [
      WA_TEMPLATES.checklistStarted,
      "mmv_checklist_started",
      WA_TEMPLATES.checklistSubmitted,
    ],
    preferredParams: [input.checklistLabel, input.date, input.starterName],
    textBody: text,
    bridgePoParams: [input.checklistLabel, input.starterName],
    bridgeFaultParams: [
      input.starterName,
      input.date,
      input.checklistLabel,
      "in progress",
      "First checklist item checked",
    ],
  });
}

export function voidNotifyChecklistStarted(
  db: Database.Database,
  input: ChecklistStartedNotifyInput & { checklistSlug?: string | null },
): void {
  void notifyChecklistStartedToRecipients(db, input).then((results) => {
    for (const result of results) {
      if (!result.ok) {
        console.warn(
          "[whatsapp] checklist started notify failed:",
          result.errorCode ?? "",
          result.errorMessage ?? "unknown",
        );
      }
    }
  });
}

/** Notify all RBAC recipients that a checklist was submitted. */
export async function notifyChecklistSubmittedToRecipients(
  db: Database.Database,
  input: Omit<ChecklistSubmittedNotifyInput, "to"> & {
    checklistSlug?: string | null;
  },
): Promise<SendAttemptResult[]> {
  if (!getWhatsAppConfigStatus().configured) {
    return [
      {
        ok: false,
        errorMessage: "META_WA_TOKEN or META_WA_PHONE_ID missing",
      },
    ];
  }

  const phones = resolveNotificationPhones(db, input.checklistSlug);
  if (phones.length === 0) {
    return [{ ok: false, errorMessage: "No notification recipients" }];
  }

  const text = buildChecklistSubmittedText({ ...input, to: phones[0] });
  return sendReliableToMany(phones, {
    preferredTemplates: [
      WA_TEMPLATES.checklistSubmitted,
      "mmv_checklist_submitted",
    ],
    preferredParams: [
      input.checklistLabel,
      input.date,
      input.submitterName,
      String(input.checked),
      String(input.total),
      String(input.faulty),
    ],
    textBody: text,
    bridgePoParams: [input.checklistLabel, input.submitterName],
    bridgeFaultParams: [
      input.submitterName,
      input.date,
      input.checklistLabel,
      "submitted",
      `${input.checked}/${input.total} checked, ${input.faulty} faults`,
    ],
  });
}

export function voidNotifyChecklistSubmittedToRecipients(
  db: Database.Database,
  input: Omit<ChecklistSubmittedNotifyInput, "to"> & {
    checklistSlug?: string | null;
  },
): void {
  void notifyChecklistSubmittedToRecipients(db, input).then((results) => {
    for (const result of results) {
      if (!result.ok) {
        console.warn(
          "[whatsapp] checklist submitted notify failed:",
          result.errorCode ?? "",
          result.errorMessage ?? "unknown",
        );
      }
    }
  });
}

/**
 * Phones for every active team member with a WhatsApp number, plus the
 * hotel/fallback number. Used for conference-created alerts so kitchen, IT,
 * housekeeping, etc. all hear about new work — not only notification roles.
 */
export function resolveTeamMemberPhones(db: Database.Database): string[] {
  const phones = new Set<string>();

  for (const u of listActiveUsers(db)) {
    if (!u.phone?.trim()) continue;
    const normalised = normalizePhone(u.phone);
    if (normalised) phones.add(normalised);
  }

  const fallback = resolveApproverWhatsApp(db);
  const fallbackNorm = normalizePhone(fallback);
  if (fallbackNorm) phones.add(fallbackNorm);

  return [...phones];
}

export type ConferenceCreatedNotifyInput = {
  conferenceName: string;
  startDate: string;
  endDate: string;
  guestCount?: number | null;
  creatorName: string;
  checklistLabels?: string[];
};

export function formatConferenceDateRange(
  start: string,
  end: string,
): string {
  const fmt = (iso: string) => {
    const d = new Date(`${iso}T00:00:00`);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };
  if (start === end) return fmt(start);
  return `${fmt(start)} – ${fmt(end)}`;
}

export function buildConferenceCreatedText(
  input: ConferenceCreatedNotifyInput,
): string {
  const dates = formatConferenceDateRange(input.startDate, input.endDate);
  const guests =
    input.guestCount != null && input.guestCount > 0
      ? String(input.guestCount)
      : "TBC";
  const lines = [
    `📅 *MV CHECKLIST*`,
    `A new conference has been scheduled: ${input.conferenceName}`,
    `Dates: ${dates} · Guests: ${guests}`,
    `Created by ${input.creatorName}. Please open the app and begin your conference checklists so we are ready for the event.`,
  ];
  if (input.checklistLabels && input.checklistLabels.length > 0) {
    lines.push("", "Checklists:", ...input.checklistLabels.map((l) => `• ${l}`));
  }
  return lines.join("\n");
}

/** Notify every team member with a phone that a conference was just created. */
export async function notifyConferenceCreatedToRecipients(
  db: Database.Database,
  input: ConferenceCreatedNotifyInput,
): Promise<SendAttemptResult[]> {
  if (!getWhatsAppConfigStatus().configured) {
    return [
      {
        ok: false,
        errorMessage: "META_WA_TOKEN or META_WA_PHONE_ID missing",
      },
    ];
  }

  const phones = resolveTeamMemberPhones(db);
  if (phones.length === 0) {
    return [{ ok: false, errorMessage: "No notification recipients" }];
  }

  const dates = formatConferenceDateRange(input.startDate, input.endDate);
  const guests =
    input.guestCount != null && input.guestCount > 0
      ? String(input.guestCount)
      : "TBC";
  const text = buildConferenceCreatedText(input);
  const conferenceParams = [
    input.conferenceName,
    dates,
    guests,
    input.creatorName,
  ];

  // Dedicated template may still be PENDING on Meta. Try it first, then the
  // already-approved checklist_started template, then free-form / bridge.
  return Promise.all(
    phones.map(async (to) => {
      const dedicated = await sendWhatsAppTemplateFirst(
        to,
        [WA_TEMPLATES.conferenceCreated, "mmv_conference_created"],
        conferenceParams,
        undefined,
        text,
      );
      if (dedicated.ok) return dedicated;
      return sendWhatsAppReliable(to, {
        preferredTemplates: [
          WA_TEMPLATES.checklistStarted,
          "mmv_checklist_started",
        ],
        preferredParams: [input.conferenceName, dates, input.creatorName],
        textBody: text,
        bridgePoParams: [input.conferenceName, input.creatorName],
        bridgeFaultParams: [
          input.creatorName,
          dates,
          input.conferenceName,
          "scheduled",
          "Begin your conference checklists",
        ],
      });
    }),
  );
}

export function voidNotifyConferenceCreated(
  db: Database.Database,
  input: ConferenceCreatedNotifyInput,
): void {
  void notifyConferenceCreatedToRecipients(db, input).then((results) => {
    for (const result of results) {
      if (!result.ok) {
        console.warn(
          "[whatsapp] conference created notify failed:",
          result.errorCode ?? "",
          result.errorMessage ?? "unknown",
        );
      } else {
        console.info("[whatsapp] conference created notify ok:", result.messageId);
      }
    }
  });
}

export type FaultVendorNotifyInput = {
  to: string;
  staffName: string;
  location: string;
  itemName: string;
  severity: string;
  description: string;
  /** Public paths like `/uploads/faults/...` */
  photoPaths?: string[];
};

export function buildFaultVendorText(input: FaultVendorNotifyInput): string {
  const lines = [
    `Fault report — ${input.itemName}`,
    "",
    input.description,
    "",
    input.location ? `Location: ${input.location}` : null,
    `Severity: ${input.severity}`,
    input.staffName ? `Reported by: ${input.staffName}` : null,
  ].filter(Boolean);
  return lines.join("\n");
}

function resolvePublicUploadPath(filePath: string): string | null {
  if (!filePath.startsWith("/uploads/")) return null;
  const abs = path.join(process.cwd(), "public", filePath.replace(/^\//, ""));
  return existsSync(abs) ? abs : null;
}

async function uploadFirstFaultPhoto(
  photoPaths: string[],
): Promise<string | undefined> {
  for (const rel of photoPaths) {
    const abs = resolvePublicUploadPath(rel);
    if (!abs) continue;
    try {
      const buf = readFileSync(abs);
      const mime = detectImageMime(buf);
      const uploaded = await uploadWhatsAppMedia(
        buf,
        mime,
        path.basename(abs),
      );
      if (uploaded.ok && uploaded.mediaId) return uploaded.mediaId;
    } catch (e) {
      console.warn("[whatsapp] fault photo upload failed:", e);
    }
  }
  return undefined;
}

/**
 * Template-first vendor notify for a fault report.
 * Optionally attaches the first photo as a template header; remaining photos
 * are sent as follow-up image messages when the primary send succeeds.
 */
export async function notifyFaultToVendor(
  input: FaultVendorNotifyInput,
): Promise<SendAttemptResult> {
  if (!getWhatsAppConfigStatus().configured) {
    return {
      ok: false,
      errorMessage: "META_WA_TOKEN or META_WA_PHONE_ID missing",
    };
  }

  const params = [
    input.staffName,
    input.location || "-",
    input.itemName,
    input.severity,
    input.description,
  ];
  const text = buildFaultVendorText(input);
  const photoPaths = input.photoPaths ?? [];
  const headerMediaId =
    photoPaths.length > 0
      ? await uploadFirstFaultPhoto(photoPaths)
      : undefined;

  const templateCandidates = headerMediaId
    ? [
        WA_TEMPLATES.faultReportPhoto,
        WA_TEMPLATES.faultReport,
        "mmv_fault_report",
      ]
    : [WA_TEMPLATES.faultReport, "mmv_fault_report"];

  const result = await sendWhatsAppTemplateFirst(
    input.to,
    templateCandidates,
    params,
    headerMediaId,
    text,
  );

  if (result.ok && photoPaths.length > (headerMediaId ? 1 : 0)) {
    const start = headerMediaId ? 1 : 0;
    for (let i = start; i < photoPaths.length; i++) {
      const abs = resolvePublicUploadPath(photoPaths[i]);
      if (!abs) continue;
      try {
        const buf = readFileSync(abs);
        const mime = detectImageMime(buf);
        const uploaded = await uploadWhatsAppMedia(
          buf,
          mime,
          path.basename(abs),
        );
        if (uploaded.ok && uploaded.mediaId) {
          await sendWhatsAppImage(input.to, uploaded.mediaId);
        }
      } catch (e) {
        console.warn("[whatsapp] extra fault photo send failed:", e);
      }
    }
  }

  return result;
}
