"use client";

import Link from "next/link";
import { Card, CardContent, Badge } from "@/components/ui/card";
import { ProgressBar } from "@/components/checklist/progress-bar";
import { statusColor } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import { checklistHref } from "@/lib/checklist-slugs";
import { AvatarStack, type Contributor } from "@/components/ui/avatar-stack";

interface Props {
  slug: string;
  label: string;
  status: string;
  sessionId: string | number | null;
  canComplete: boolean;
  progress: {
    total: number;
    completed: number;
    faulty: number;
    na?: number;
  } | null;
  contributors?: Contributor[];
  conferenceName?: string | null;
  onStart: () => void;
}

export function ChecklistStatusCard({
  slug,
  label,
  status,
  sessionId,
  canComplete,
  progress,
  contributors = [],
  conferenceName,
  onStart,
}: Props) {
  const validSessionId =
    sessionId != null &&
    sessionId !== "null" &&
    String(sessionId).trim() !== "";
  const href = validSessionId
    ? checklistHref(slug, sessionId)
    : undefined;

  const wrapperClass = "block w-full";

  const content = (
    <Card className="transition-colors hover:border-zinc-700">
      <CardContent className="flex items-center gap-3 py-5">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium text-zinc-100">{label}</h3>
            {conferenceName && (
              <span className="inline-flex items-center rounded-full border border-accent-500/30 bg-accent-500/10 px-2 py-0.5 text-[10px] font-medium text-accent-700 dark:text-accent-300">
                For: {conferenceName}
              </span>
            )}
          </div>
          {progress && progress.total > 0 && (
            <ProgressBar
              completed={progress.completed}
              total={progress.total}
              na={progress.na}
            />
          )}
          {progress && progress.faulty > 0 && (
            <p className="text-[11px] text-amber-400">{progress.faulty} fault(s)</p>
          )}
        </div>
        {contributors.length > 0 && (
          <AvatarStack people={contributors} max={3} />
        )}
        <div className="flex shrink-0 flex-col items-end gap-2">
          <Badge className={cn("border whitespace-nowrap", statusColor(status))}>
            {status.replace("_", " ")}
          </Badge>
          <ChevronRight className="h-5 w-5 text-zinc-600" />
        </div>
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className={wrapperClass}>
        {content}
      </Link>
    );
  }

  if (canComplete) {
    return (
      <button
        type="button"
        className={cn(wrapperClass, "text-left")}
        onClick={onStart}
      >
        {content}
      </button>
    );
  }

  return <div className={wrapperClass}>{content}</div>;
}
