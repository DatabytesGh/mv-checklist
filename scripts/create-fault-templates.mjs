// One-off: creates the WhatsApp templates used for fault reports.
// Usage: node scripts/create-fault-templates.mjs
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);

const TOKEN = env.META_WA_TOKEN;
const WABA_ID = "771204562113545";
const APP_ID = "2331569774011431";

// Image-header templates need a sample image uploaded via the Resumable Upload API.
async function uploadSampleImage(filePath) {
  const data = readFileSync(filePath);
  const startRes = await fetch(
    `https://graph.facebook.com/v25.0/${APP_ID}/uploads?file_length=${data.length}&file_type=image/jpeg`,
    { method: "POST", headers: { Authorization: `Bearer ${TOKEN}` } },
  );
  const start = await startRes.json();
  if (!start.id) {
    console.log("Upload session failed:", JSON.stringify(start));
    return null;
  }
  const upRes = await fetch(`https://graph.facebook.com/v25.0/${start.id}`, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${TOKEN}`,
      file_offset: "0",
    },
    body: data,
  });
  const up = await upRes.json();
  if (!up.h) {
    console.log("Upload failed:", JSON.stringify(up));
    return null;
  }
  return up.h;
}

async function createTemplate(payload) {
  const res = await fetch(
    `https://graph.facebook.com/v25.0/${WABA_ID}/message_templates`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
  );
  const body = await res.text();
  console.log(`${payload.name}: HTTP ${res.status}`);
  console.log(body);
}

await createTemplate({
  name: "mmv_fault_report",
  language: "en_US",
  category: "UTILITY",
  components: [
    { type: "HEADER", format: "TEXT", text: "Fault Report" },
    {
      type: "BODY",
      text: "A new fault has been reported at Maya Villa Hotel and assigned to you for attention.\n\nReported by: {{1}}\nLocation: {{2}}\nFault: {{3}}\nSeverity: {{4}}\nDetails: {{5}}\n\nPlease attend to this issue as soon as possible and reply to this message with any questions or updates.\n\nMaya Villa Hotel Maintenance",
      example: {
        body_text: [
          [
            "Front Desk",
            "Executive Suite",
            "AC not cooling",
            "high",
            "The AC unit in room 12 is blowing warm air",
          ],
        ],
      },
    },
  ],
});

const sampleImage =
  "public/uploads/faults/sess-1781862285399-b9960c1e/1781871819296-0.jpg";
const handle = await uploadSampleImage(sampleImage);
if (!handle) process.exit(1);

await createTemplate({
  name: "mmv_fault_report_photo",
  language: "en_US",
  category: "UTILITY",
  components: [
    {
      type: "HEADER",
      format: "IMAGE",
      example: { header_handle: [handle] },
    },
    {
      type: "BODY",
      text: "Fault reported by {{1}}\n\nLocation: {{2}}\nFault: {{3}}\nSeverity: {{4}}\nDetails: {{5}}\n\nPhoto of the fault attached above.\n\nMaya Villa Hotel",
      example: {
        body_text: [
          [
            "Front Desk",
            "Executive Suite",
            "AC not cooling",
            "high",
            "The AC unit in room 12 is blowing warm air",
          ],
        ],
      },
    },
  ],
});
