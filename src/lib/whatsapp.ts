/**
 * Server-only — Meta WhatsApp Cloud API helper.
 * Requires META_WA_TOKEN and META_WA_PHONE_ID in environment variables.
 */

export type SendAttemptResult = {
  ok: boolean;
  status?: number;
  errorCode?: number;
  errorMessage?: string;
  messageId?: string;
};

// Message templates live at the WhatsApp Business Account level and are shared by
// every app on the same number. A per-app prefix keeps names from colliding with
// other apps (e.g. mv-inventory). Each app must set a unique META_WA_TEMPLATE_PREFIX.
export const WA_TEMPLATE_PREFIX =
  process.env.META_WA_TEMPLATE_PREFIX?.trim() || "mmv_";

export function waTemplate(suffix: string): string {
  return `${WA_TEMPLATE_PREFIX}${suffix}`;
}

export const WA_TEMPLATES = {
  faultReport: waTemplate("fault_report"),
  faultReportPhoto: waTemplate("fault_report_photo"),
  checklistSubmitted: waTemplate("checklist_submitted"),
  checklistStarted: waTemplate("checklist_started"),
} as const;

/** Template body parameters may not contain newlines, tabs, or 4+ consecutive spaces. */
export function sanitizeTemplateParam(value: string): string {
  return value.replace(/\s+/g, " ").trim() || "-";
}

/** Whether Meta Cloud API env vars are present (does not call Meta). */
export function getWhatsAppConfigStatus(): {
  configured: boolean;
  phoneIdSet: boolean;
  tokenSet: boolean;
  templateLangs: string[];
} {
  const token = Boolean(process.env.META_WA_TOKEN?.trim());
  const phoneId = Boolean(process.env.META_WA_PHONE_ID?.trim());
  return {
    configured: token && phoneId,
    tokenSet: token,
    phoneIdSet: phoneId,
    templateLangs: getTemplateLanguageCandidates(),
  };
}

function isNetworkErrorMessage(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m === "fetch failed" ||
    m === "failed to fetch" ||
    m.includes("econnreset") ||
    m.includes("etimedout") ||
    m.includes("network")
  );
}

/** Calls Meta to verify the access token (no message sent). */
export async function validateWhatsAppToken(): Promise<{
  valid: boolean | null;
  status?: number;
  errorCode?: number;
  errorSubcode?: number;
  errorMessage?: string;
  networkError?: boolean;
}> {
  const cfg = getConfig();
  if (!cfg) {
    return { valid: false, errorMessage: "META_WA_TOKEN or META_WA_PHONE_ID missing" };
  }

  const attempt = async () => {
    const res = await fetch(
      `https://graph.facebook.com/v20.0/${cfg.phoneId}`,
      { headers: { Authorization: `Bearer ${cfg.token}` } },
    );
    if (res.ok) return { valid: true as const, status: res.status };
    const errText = await res.text();
    let errorCode: number | undefined;
    let errorSubcode: number | undefined;
    let errorMessage = errText;
    try {
      const parsed = JSON.parse(errText) as {
        error?: { code?: number; message?: string; error_subcode?: number };
      };
      errorCode = parsed.error?.code;
      errorSubcode = parsed.error?.error_subcode;
      errorMessage = parsed.error?.message ?? errText;
    } catch {
      /* raw */
    }
    return {
      valid: false as const,
      status: res.status,
      errorCode,
      errorSubcode,
      errorMessage,
    };
  };

  try {
    try {
      return await attempt();
    } catch (first) {
      const msg = first instanceof Error ? first.message : String(first);
      if (!isNetworkErrorMessage(msg)) throw first;
      await new Promise((r) => setTimeout(r, 400));
      return await attempt();
    }
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    if (isNetworkErrorMessage(errorMessage)) {
      return { valid: null, networkError: true, errorMessage };
    }
    return { valid: false, errorMessage };
  }
}

export function friendlyWhatsAppError(
  result: Pick<
    SendAttemptResult,
    "errorCode" | "errorMessage" | "status"
  > & { errorSubcode?: number },
): string {
  const msg = (result.errorMessage ?? "").toLowerCase();
  if (result.errorCode === 190 && (msg.includes("invalidated") || msg.includes("password"))) {
    return "Meta invalidated this access token (even permanent System User tokens are revoked after a Facebook password change, security reset, or manual revoke). In Business Manager → System users → your user → Generate new token (whatsapp_business_messaging + whatsapp_business_management), replace META_WA_TOKEN in .env.local, restart the server.";
  }
  if (result.errorCode === 190) {
    return "WhatsApp access token rejected by Meta — generate a new System User token in Business Manager, update META_WA_TOKEN in .env.local, and restart the server.";
  }
  if (result.errorCode === 131047) {
    return "Outside the 24-hour window — use an approved template or ask the recipient to message your business number first.";
  }
  if (result.errorCode === 131026) {
    return "Recipient number is not on your WhatsApp allowed list (add it in Meta → API Setup → test numbers).";
  }
  if (isRateLimited({ ok: false, ...result })) {
    return "Sending too fast — the shared number's throughput limit was reached. It was retried automatically; please try again in a moment.";
  }
  return result.errorMessage ?? "WhatsApp send failed";
}

function getConfig() {
  const token = process.env.META_WA_TOKEN;
  const phoneId = process.env.META_WA_PHONE_ID;
  if (!token || !phoneId) return null;
  return { token, phoneId };
}

/**
 * Normalize to WhatsApp Cloud API digits (no +).
 * Ghana local numbers like 0543843090 → 233543843090.
 */
export function normalizePhone(to: string): string {
  let digits = to.replace(/[^\d]/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  // Ghana national format: 0XXXXXXXXX (10 digits)
  if (digits.length === 10 && digits.startsWith("0")) {
    digits = `233${digits.slice(1)}`;
  }
  return digits;
}

function isOutside24hWindow(result: SendAttemptResult): boolean {
  if (result.ok) return false;
  if (result.errorCode === 131047) return true;
  const msg = (result.errorMessage ?? "").toLowerCase();
  return msg.includes("24 hour") || msg.includes("outside");
}

// Meta error codes that indicate the (shared) number's throughput/rate limit was
// hit. Sending from one number across several apps makes these more likely.
const RATE_LIMIT_CODES = new Set([130429, 131048, 131056, 80007, 4, 613]);

/** True when a failed send should be retried (rate limit or transient server/network error). */
function isRetryable(result: SendAttemptResult): boolean {
  if (result.ok) return false;
  if (result.errorCode != null && RATE_LIMIT_CODES.has(result.errorCode))
    return true;
  if (result.status === 429) return true;
  if (result.status != null && result.status >= 500 && result.status < 600)
    return true;
  if (result.errorMessage && isNetworkErrorMessage(result.errorMessage))
    return true;
  return false;
}

function isRateLimited(result: SendAttemptResult): boolean {
  if (result.ok) return false;
  if (result.errorCode != null && RATE_LIMIT_CODES.has(result.errorCode))
    return true;
  return result.status === 429;
}

async function postWhatsAppOnce(
  cfg: { token: string; phoneId: string },
  normalised: string,
  payload: Record<string, unknown>,
): Promise<SendAttemptResult> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v20.0/${cfg.phoneId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: normalised,
          ...payload,
        }),
      },
    );

    if (res.ok) {
      let messageId: string | undefined;
      try {
        const data = (await res.json()) as { messages?: Array<{ id?: string }> };
        messageId = data.messages?.[0]?.id;
      } catch {
        /* ignore */
      }
      return { ok: true, status: res.status, messageId };
    }

    const errText = await res.text();
    let errorCode: number | undefined;
    let errorMessage = errText;
    try {
      const parsed = JSON.parse(errText) as {
        error?: { code?: number; message?: string };
      };
      errorCode = parsed.error?.code;
      errorMessage = parsed.error?.message ?? errText;
    } catch {
      /* raw */
    }
    return { ok: false, status: res.status, errorCode, errorMessage };
  } catch (e) {
    return {
      ok: false,
      errorMessage: e instanceof Error ? e.message : String(e),
    };
  }
}

async function postWhatsApp(
  to: string,
  payload: Record<string, unknown>,
): Promise<SendAttemptResult> {
  const cfg = getConfig();
  if (!cfg)
    return { ok: false, errorMessage: "META_WA_TOKEN or META_WA_PHONE_ID missing" };
  const normalised = normalizePhone(to);
  if (!normalised) return { ok: false, errorMessage: "Invalid phone number" };

  // Bounded retry with exponential backoff + jitter for rate-limit and transient
  // server/network errors. Non-retryable errors (190 token, 131047 window,
  // 131026 allowlist, etc.) return immediately.
  const backoffMs = [400, 1000, 2000];
  let result = await postWhatsAppOnce(cfg, normalised, payload);
  for (let attempt = 0; attempt < backoffMs.length; attempt++) {
    if (!isRetryable(result)) return result;
    const jitter = Math.floor(Math.random() * 250);
    await new Promise((r) => setTimeout(r, backoffMs[attempt] + jitter));
    result = await postWhatsAppOnce(cfg, normalised, payload);
  }
  return result;
}

export async function sendWhatsApp(
  to: string,
  body: string,
): Promise<SendAttemptResult> {
  return postWhatsApp(to, { type: "text", text: { body } });
}

/** Detects the actual image mime type from magic bytes (uploads are saved with a .jpg extension regardless of format). */
export function detectImageMime(buffer: Buffer): string {
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    return "image/jpeg";
  }
  return "image/jpeg";
}

/** Uploads an image to Meta's media endpoint so it can be attached to a message. */
export async function uploadWhatsAppMedia(
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<{ ok: boolean; mediaId?: string; errorMessage?: string }> {
  const cfg = getConfig();
  if (!cfg) {
    return { ok: false, errorMessage: "META_WA_TOKEN or META_WA_PHONE_ID missing" };
  }
  try {
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", mimeType);
    form.append(
      "file",
      new Blob([new Uint8Array(buffer)], { type: mimeType }),
      filename,
    );
    const res = await fetch(
      `https://graph.facebook.com/v20.0/${cfg.phoneId}/media`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.token}` },
        body: form,
      },
    );
    if (res.ok) {
      const data = (await res.json()) as { id?: string };
      if (data.id) return { ok: true, mediaId: data.id };
      return { ok: false, errorMessage: "Media upload returned no id" };
    }
    const errText = await res.text();
    let errorMessage = errText;
    try {
      const parsed = JSON.parse(errText) as { error?: { message?: string } };
      errorMessage = parsed.error?.message ?? errText;
    } catch {
      /* raw */
    }
    return { ok: false, errorMessage };
  } catch (e) {
    return {
      ok: false,
      errorMessage: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Sends an image message using a previously uploaded media id, optionally with a caption. */
export async function sendWhatsAppImage(
  to: string,
  mediaId: string,
  caption?: string,
): Promise<SendAttemptResult> {
  return postWhatsApp(to, {
    type: "image",
    image: {
      id: mediaId,
      ...(caption ? { caption: caption.slice(0, 1024) } : {}),
    },
  });
}

export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  bodyParams: string[] = [],
  languageCode = "en_US",
  headerImageMediaId?: string,
): Promise<SendAttemptResult> {
  const components: Array<Record<string, unknown>> = [];
  if (headerImageMediaId) {
    components.push({
      type: "header",
      parameters: [{ type: "image", image: { id: headerImageMediaId } }],
    });
  }
  if (bodyParams.length > 0) {
    components.push({
      type: "body",
      parameters: bodyParams.map((p) => ({
        type: "text",
        text: sanitizeTemplateParam(p),
      })),
    });
  }

  return postWhatsApp(to, {
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components.length > 0 ? { components } : {}),
    },
  });
}

function getTemplateLanguageCandidates(): string[] {
  const raw = process.env.META_WA_TEMPLATE_LANGS?.trim();
  if (!raw) return ["en_US", "en_GB", "en"];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Template-first send: templates are the only messages guaranteed to be
 * delivered outside the 24h customer-service window (free-form sends are
 * accepted with a 200 but silently dropped by Meta). Tries each template
 * candidate in each configured language, optionally with an image header,
 * then falls back to free-form text if provided.
 */
export async function sendWhatsAppTemplateFirst(
  to: string,
  templateCandidates: string[],
  bodyParams: string[] = [],
  headerImageMediaId?: string,
  textFallbackBody?: string,
): Promise<SendAttemptResult> {
  let last: SendAttemptResult = {
    ok: false,
    errorMessage: "No template candidates",
  };
  for (const name of templateCandidates) {
    let nameMissing = false;
    for (const lang of getTemplateLanguageCandidates()) {
      const result = await sendWhatsAppTemplate(
        to,
        name,
        bodyParams,
        lang,
        headerImageMediaId,
      );
      if (result.ok) return result;
      last = result;
      // 132001 = template name/language not found — skip remaining langs for this name.
      if (result.errorCode === 132001) {
        nameMissing = true;
        break;
      }
    }
    if (nameMissing) continue;
  }
  if (textFallbackBody) {
    const textResult = await sendWhatsApp(to, textFallbackBody);
    if (textResult.ok) return textResult;
    last = textResult;
  }
  return last;
}

/**
 * Reliable outbound notify for checklist events.
 * Preferred templates may not exist yet on the WABA (132001). Falls back to:
 * 1) free-form text (works inside 24h window)
 * 2) known approved bridge templates that already exist on this number
 *    (`mmv_po_pending_approval`, `mmv_fault_report`, `hello_world`).
 */
export async function sendWhatsAppReliable(
  to: string,
  opts: {
    preferredTemplates: string[];
    preferredParams: string[];
    textBody: string;
    /** Params for mmv_po_pending_approval (2 body vars). */
    bridgePoParams?: [string, string];
    /** Params for mmv_fault_report (5 body vars). */
    bridgeFaultParams?: [string, string, string, string, string];
  },
): Promise<SendAttemptResult> {
  const preferred = await sendWhatsAppTemplateFirst(
    to,
    opts.preferredTemplates,
    opts.preferredParams,
    undefined,
    opts.textBody,
  );
  if (preferred.ok) return preferred;

  if (opts.bridgeFaultParams) {
    const fault = await sendWhatsAppTemplateFirst(
      to,
      [WA_TEMPLATES.faultReport, "mmv_fault_report"],
      [...opts.bridgeFaultParams],
    );
    if (fault.ok) return fault;
  }

  if (opts.bridgePoParams) {
    const po = await sendWhatsAppTemplateFirst(
      to,
      ["mmv_po_pending_approval"],
      [...opts.bridgePoParams],
    );
    if (po.ok) return po;
  }

  // Last resort so the phone still gets *something* outside the 24h window.
  const hello = await sendWhatsAppTemplate(to, "hello_world", [], "en_US");
  if (hello.ok) return hello;

  return preferred;
}

export async function sendWhatsAppWithTemplateFallback(
  to: string,
  textBody: string,
  templateCandidates: string[],
  templateBodyParams: string[] = [],
): Promise<SendAttemptResult> {
  const textResult = await sendWhatsApp(to, textBody);
  if (textResult.ok) return textResult;
  if (!isOutside24hWindow(textResult)) return textResult;

  let lastResult = textResult;
  const languages = getTemplateLanguageCandidates();
  for (const name of templateCandidates) {
    for (const lang of languages) {
      const templateResult = await sendWhatsAppTemplate(
        to,
        name,
        templateBodyParams,
        lang,
      );
      if (templateResult.ok) return templateResult;
      lastResult = templateResult;
    }
  }
  return lastResult;
}
