import { cn } from "@/lib/utils";

export type Contributor = { id: string; name: string };

function initials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

// Deterministic solid color per person — white initials read clearly in both
// light and dark themes.
const TINTS = [
  "bg-accent-600 text-white",
  "bg-sky-600 text-white",
  "bg-amber-600 text-white",
  "bg-violet-600 text-white",
  "bg-rose-600 text-white",
  "bg-emerald-600 text-white",
];

function tintFor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return TINTS[Math.abs(hash) % TINTS.length];
}

/** Overlapping circular avatars for the people working on something. */
export function AvatarStack({
  people,
  max = 3,
  size = "md",
  className,
}: {
  people: Contributor[];
  max?: number;
  size?: "sm" | "md";
  className?: string;
}) {
  if (!people || people.length === 0) return null;

  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  const dim = size === "sm" ? "h-6 w-6 text-[9px]" : "h-7 w-7 text-[10px]";

  return (
    <div
      className={cn("flex -space-x-2", className)}
      title={people.map((p) => p.name).join(", ")}
    >
      {shown.map((p) => (
        <span
          key={p.id}
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full font-semibold ring-2 ring-zinc-950",
            dim,
            tintFor(p.id),
          )}
          title={p.name}
        >
          {initials(p.name)}
        </span>
      ))}
      {extra > 0 && (
        <span
          className={cn(
            "flex shrink-0 items-center justify-center rounded-full bg-zinc-600 font-semibold text-white ring-2 ring-zinc-950",
            dim,
          )}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}
