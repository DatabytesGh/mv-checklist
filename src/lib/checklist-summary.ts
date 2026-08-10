/**
 * Format a submitted checklist into a WhatsApp-friendly plain-text summary.
 */

export type SummaryItem = {
  section: string;
  item_text: string;
  response_status: string | null;
  text_value: string | null;
  time_value: string | null;
  is_shift_leader_selector?: number | boolean;
  checked_by_name?: string | null;
  checked_by_username?: string | null;
};

export type ChecklistSummaryInput = {
  label: string;
  date: string; // YYYY-MM-DD
  submittedBy?: string | null;
  items: SummaryItem[];
};

function formatDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1].slice(2)}`;
}

function statusMark(status: string | null): string {
  switch (status) {
    case "checked":
      return "✅";
    case "faulty":
    case "not_done":
    case "pending":
    case null:
      return "❌";
    case "na":
      return "➖ N/A";
    default:
      return "❌";
  }
}

export function uniqueCheckerNames(items: SummaryItem[]): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const name = (item.checked_by_name || item.checked_by_username || "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

function isCylinderItem(item: SummaryItem): boolean {
  const section = (item.section || "").toLowerCase();
  const text = (item.item_text || "").toLowerCase();
  return section.includes("cylinder") || section.includes("gas") || text.includes("cylinder");
}

function formatItemLines(item: SummaryItem): string[] {
  const mark = statusMark(item.response_status);
  const note = item.text_value?.trim();
  const time = item.time_value?.trim();
  const out: string[] = [];

  if (isCylinderItem(item) && note) {
    // Prefer a short label + note for cylinder lines.
    const label = item.item_text.replace(/\s*status\s*/i, " ").trim();
    if (!note.includes("\n") && note.length <= 60) {
      out.push(`${label} — ${note} ${mark}`);
    } else {
      out.push(`${label} ${mark}`);
      for (const line of note.split(/\r?\n/)) {
        const t = line.trim();
        if (t) out.push(`   ${t}`);
      }
    }
  } else if (note && !note.includes("\n") && note.length <= 48) {
    out.push(`${item.item_text} — ${note} ${mark}`);
  } else if (note) {
    out.push(`${item.item_text} ${mark}`);
    for (const line of note.split(/\r?\n/)) {
      const t = line.trim();
      if (t) out.push(`   ${t}`);
    }
  } else {
    out.push(`${item.item_text} ${mark}`);
  }

  if (time) out.push(`   ⏰ ${time}`);
  return out;
}

/** Build a clean, copy-paste ready checklist report. */
export function buildChecklistWhatsAppSummary(
  input: ChecklistSummaryInput,
): string {
  const lines: string[] = [];
  lines.push(`*${input.label}*`);
  lines.push(`📅 ${formatDate(input.date)}`);
  if (input.submittedBy?.trim()) {
    lines.push(`👤 Submitted by ${input.submittedBy.trim()}`);
  }
  lines.push("");

  const sections = new Map<string, SummaryItem[]>();
  const handover: SummaryItem[] = [];

  for (const item of input.items) {
    if (item.is_shift_leader_selector) {
      handover.push(item);
      continue;
    }
    const section = (item.section || "General").trim();
    const list = sections.get(section) ?? [];
    list.push(item);
    sections.set(section, list);
  }

  for (const [section, items] of sections) {
    const heading = /gas|cylinder/i.test(section)
      ? "CYLINDER STATUS"
      : section.toUpperCase();
    lines.push(`*${heading}*`);
    for (const item of items) {
      lines.push(...formatItemLines(item));
    }
    lines.push("");
  }

  if (handover.length > 0) {
    lines.push("*HANDOVER*");
    for (const item of handover) {
      const value = item.text_value?.trim() || "—";
      lines.push(`${item.item_text}: ${value}`);
    }
    lines.push("");
  }

  const checkers = uniqueCheckerNames(input.items);
  if (checkers.length > 0) {
    lines.push(`👥 Checked by: ${checkers.join(", ")}`);
  }

  lines.push("");
  lines.push("_MV CHECKLIST_");

  return `${lines.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}
