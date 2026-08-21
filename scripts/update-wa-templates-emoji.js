/**
 * Update MV CHECKLIST WhatsApp templates with emoji branding.
 * - Tries POST /{template-id} edit (works for APPROVED / REJECTED / PAUSED)
 * - If still PENDING (in review), deletes + recreates with the same name
 *
 * Usage: node scripts/update-wa-templates-emoji.js
 */
const fs = require("fs");
const path = require("path");

function loadEnv() {
  const p = path.join(process.cwd(), ".env.local");
  for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!process.env[m[1].trim()]) process.env[m[1].trim()] = v;
  }
}

const TEMPLATES = [
  {
    name: "mmv_checklist_started",
    language: "en_US",
    category: "UTILITY",
    components: [
      {
        type: "BODY",
        text: "📋 *MV CHECKLIST* The {{1}} checklist is underway for {{2}}. Started by {{3}} — please stand by.",
        example: {
          body_text: [["Facility / Security", "29 Jul 2026", "Ama"]],
        },
      },
    ],
  },
  {
    name: "mmv_checklist_submitted",
    language: "en_US",
    category: "UTILITY",
    components: [
      {
        type: "BODY",
        text:
          "✅ *MV CHECKLIST*\n{{1}} is complete for {{2}} and waiting for approval.\nSubmitted by {{3}} · {{4}}/{{5}} checked · {{6}} fault(s).\n👀 Please review and approve to close today's {{1}} checklist.",
        example: {
          body_text: [
            ["Facility / Security", "29 Jul 2026", "Ama", "18", "20", "1"],
          ],
        },
      },
    ],
  },
  {
    name: "mmv_checklist_approved",
    language: "en_US",
    category: "UTILITY",
    components: [
      {
        type: "BODY",
        text: "✅ *MV CHECKLIST*\n{{1}} for {{2}} is approved.\nSigned off by {{3}}. All clear for today.",
        example: {
          body_text: [["Facility / Security", "29 Jul 2026", "Front Desk"]],
        },
      },
    ],
  },
  {
    name: "mmv_checklist_rejected",
    language: "en_US",
    category: "UTILITY",
    components: [
      {
        type: "BODY",
        text: "⚠️ *MV CHECKLIST*\n{{1}} for {{2}} was sent back.\nReviewer: {{3}}. Reason: {{4}}.\nPlease fix and resubmit.",
        example: {
          body_text: [
            [
              "Facility / Security",
              "29 Jul 2026",
              "Front Desk",
              "Incomplete generator check",
            ],
          ],
        },
      },
    ],
  },
  {
    name: "mmv_conference_created",
    language: "en_US",
    category: "UTILITY",
    components: [
      {
        type: "BODY",
        text:
          "📅 *MV CHECKLIST*\nA new conference has been scheduled: {{1}}\nDates: {{2}} · Guests: {{3}}\nCreated by {{4}}. Please open the app and begin your conference checklists so we are ready for the event.",
        example: {
          body_text: [
            ["Rotary Annual Retreat", "21 Aug 2026 – 23 Aug 2026", "80", "Ama"],
          ],
        },
      },
    ],
  },
];

async function graph(method, urlPath, body) {
  const token = process.env.META_WA_TOKEN;
  const res = await fetch(`https://graph.facebook.com/v21.0/${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

async function main() {
  loadEnv();
  const wabaId = process.env.META_WA_WABA_ID;
  if (!wabaId || !process.env.META_WA_TOKEN) {
    throw new Error("META_WA_WABA_ID and META_WA_TOKEN required in .env.local");
  }

  const listed = await graph(
    "GET",
    `${wabaId}/message_templates?limit=100&fields=id,name,status,language,category`,
  );
  if (!listed.ok) {
    console.error("List failed:", listed.json);
    process.exit(1);
  }

  const data = listed.json.data || [];

  for (const tpl of TEMPLATES) {
    const current = data.find(
      (t) => t.name === tpl.name && t.language === tpl.language,
    );
    console.log(`\n=== ${tpl.name} (${current?.status || "missing"}) ===`);

    if (current && ["APPROVED", "REJECTED", "PAUSED"].includes(current.status)) {
      const edited = await graph("POST", current.id, {
        category: tpl.category,
        components: tpl.components,
      });
      if (edited.ok) {
        console.log(`EDITED ${tpl.name} → pending re-review`);
        continue;
      }
      console.warn("Edit failed:", edited.json?.error?.message || edited.json);
    }

    // PENDING / in-review cannot be edited — delete then recreate.
    if (current) {
      const deleted = await graph(
        "DELETE",
        `${wabaId}/message_templates?hsm_id=${current.id}&name=${encodeURIComponent(tpl.name)}`,
      );
      if (!deleted.ok) {
        console.error("Delete failed:", deleted.json);
        continue;
      }
      console.log(`DELETED old ${tpl.name}`);
      // Brief pause so Meta releases the name.
      await new Promise((r) => setTimeout(r, 1500));
    }

    const created = await graph("POST", `${wabaId}/message_templates`, tpl);
    if (created.ok) {
      console.log(
        `CREATED ${tpl.name} id=${created.json.id} status=${created.json.status || "PENDING"}`,
      );
    } else {
      console.error("Create failed:", JSON.stringify(created.json, null, 2));
    }
  }

  const after = await graph(
    "GET",
    `${wabaId}/message_templates?limit=100&fields=name,status,language`,
  );
  console.log("\nChecklist templates now:");
  for (const t of (after.json.data || []).filter(
    (x) =>
      String(x.name).startsWith("mmv_checklist_") ||
      String(x.name) === "mmv_conference_created",
  )) {
    console.log(`  - ${t.name} [${t.language}] ${t.status}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
