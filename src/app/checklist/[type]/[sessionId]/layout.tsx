import type { Metadata } from "next";
import { getDb } from "@/lib/db";

type Props = {
  params: Promise<{ type: string; sessionId: string }>;
  children: React.ReactNode;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { type, sessionId } = await params;
  if (!sessionId || sessionId === "null") {
    return { title: "Checklist" };
  }
  try {
    const db = getDb();
    const row = db
      .prepare(
        `SELECT ct.label FROM checklist_sessions cs
         JOIN checklist_types ct ON ct.slug = cs.checklist_type_slug
         WHERE cs.id = ?`,
      )
      .get(sessionId) as { label: string } | undefined;
    if (row?.label) {
      return { title: row.label };
    }
  } catch {
    /* fallback */
  }
  const slugLabel = type.replace(/_/g, " ");
  return { title: slugLabel };
}

export default function ChecklistSessionLayout({ children }: Props) {
  return children;
}
