export function ProgressBar({
  completed,
  total,
  na = 0,
  notDone = 0,
}: {
  /** Done + faulty items (excludes N/A and not done). */
  completed: number;
  total: number;
  na?: number;
  notDone?: number;
}) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px] text-zinc-500">
        <span>
          {completed} / {total} done
          {notDone > 0 ? ` · ${notDone} not done` : ""}
          {na > 0 ? ` · ${na} N/A` : ""}
        </span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full rounded-full bg-accent-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
