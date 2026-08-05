/** Normalize checklist slug from URL or legacy DB values. */
export function normalizeChecklistSlug(slug: string): string {
  const s = slug.trim().toLowerCase().replace(/_/g, "-");
  if (s === "conferenceit") return "conference-it";
  return s;
}

/** All slug spellings that may refer to the same checklist type. */
export function slugVariants(slug: string): string[] {
  const n = normalizeChecklistSlug(slug);
  const underscore = n.replace(/-/g, "_");
  return [...new Set([slug.trim().toLowerCase(), n, underscore])];
}

export function checklistHref(
  slug: string,
  sessionId: string | number,
): string {
  return `/checklist/${normalizeChecklistSlug(slug)}/${sessionId}`;
}
