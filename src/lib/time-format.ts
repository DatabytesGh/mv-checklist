/** 12-hour display like `10:00AM` (matches hotel handover notes). */

export type TimeParts = {
  hour12: number; // 1–12
  minute: number; // 0–59
  period: "AM" | "PM";
};

export function formatTimeParts(parts: TimeParts): string {
  const h = Math.min(12, Math.max(1, parts.hour12));
  const m = Math.min(59, Math.max(0, Math.round(parts.minute)));
  return `${h}:${String(m).padStart(2, "0")}${parts.period}`;
}

export function formatNow(date = new Date()): string {
  return formatTimeParts(partsFromDate(date));
}

export function partsFromDate(date: Date): TimeParts {
  const h24 = date.getHours();
  const minute = date.getMinutes();
  const period: "AM" | "PM" = h24 >= 12 ? "PM" : "AM";
  const hour12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return { hour12, minute, period };
}

/** Parse `10:00AM`, `10:00 AM`, `10:00`, `22:00`, etc. */
export function parseTime(value: string | null | undefined): TimeParts | null {
  if (!value?.trim()) return null;
  const s = value.trim().toUpperCase().replace(/\s+/g, "");

  let m = /^(\d{1,2}):(\d{2})(AM|PM)$/.exec(s);
  if (m) {
    let hour12 = Number(m[1]);
    const minute = Number(m[2]);
    const period = m[3] as "AM" | "PM";
    if (hour12 < 1 || hour12 > 12 || minute > 59) return null;
    return { hour12, minute, period };
  }

  m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (m) {
    const h24 = Number(m[1]);
    const minute = Number(m[2]);
    if (h24 > 23 || minute > 59) return null;
    const period: "AM" | "PM" = h24 >= 12 ? "PM" : "AM";
    const hour12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return { hour12, minute, period };
  }

  return null;
}
