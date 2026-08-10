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
  const completedPct = total > 0 ? (completed / total) * 100 : 0;
  const naPct = total > 0 ? (na / total) * 100 : 0;
  const displayPct = Math.round(completedPct);
  const fullyComplete = total > 0 && completed === total;

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px] text-zinc-500">
        <span>
          {fullyComplete
            ? "100% complete"
            : `${completed} / ${total} done`}
          {!fullyComplete && notDone > 0 ? ` · ${notDone} not done` : ""}
          {!fullyComplete && na > 0 ? ` · ${na} N/A` : ""}
        </span>
        <span
          className={
            fullyComplete
              ? "font-medium text-accent-700 dark:text-accent-300"
              : undefined
          }
        >
          {fullyComplete ? "100%" : `${displayPct}%`}
        </span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full bg-accent-500 transition-all"
          style={{ width: `${completedPct}%` }}
        />
        {naPct > 0 && (
          <div
            className="h-full bg-amber-500 transition-all dark:bg-amber-400"
            style={{ width: `${naPct}%` }}
            title={`${na} not applicable`}
          />
        )}
      </div>
    </div>
  );
}
