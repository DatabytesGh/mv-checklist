"use client";

import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/card";
import { statusColor } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { ReportsSkeleton } from "@/components/loading/page-skeletons";

function BarChart({
  items,
  max,
  color = "bg-accent-500",
}: {
  items: Array<{ label: string; value: number; sub?: string }>;
  max: number;
  color?: string;
}) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex justify-between text-sm">
            <span className="truncate pr-2">{item.label}</span>
            <span className="shrink-0 text-zinc-400">
              {item.value}
              {item.sub ? ` · ${item.sub}` : ""}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-zinc-800">
            <div
              className={cn("h-full rounded-full transition-all", color)}
              style={{ width: `${max ? Math.max(4, (item.value / max) * 100) : 0}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ReportsPage() {
  const [data, setData] = useState<{
    date: string;
    completion: Array<{ label: string; status: string | null }>;
    faultSummary: Array<{ severity: string; status: string; count: number }>;
    staffPerf: Array<{ display_name: string; submissions: number }>;
    openFaults: number;
  } | null>(null);

  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch("/api/reports")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setData(d);
        setReady(true);
      });
  }, []);

  if (!ready) return <ReportsSkeleton />;
  if (!data) return <p className="text-zinc-400">Unable to load reports.</p>;

  const statusCounts = data.completion.reduce(
    (acc, c) => {
      const s = c.status ?? "not_started";
      acc[s] = (acc[s] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const statusChart = Object.entries(statusCounts).map(([label, value]) => ({
    label: label.replace("_", " "),
    value,
  }));

  const faultBySeverity = data.faultSummary.reduce(
    (acc, f) => {
      acc[f.severity] = (acc[f.severity] ?? 0) + f.count;
      return acc;
    },
    {} as Record<string, number>,
  );

  const severityChart = Object.entries(faultBySeverity).map(([label, value]) => ({
    label,
    value,
  }));

  const maxStaff = Math.max(...data.staffPerf.map((s) => s.submissions), 1);
  const maxStatus = Math.max(...statusChart.map((s) => s.value), 1);
  const maxSeverity = Math.max(...severityChart.map((s) => s.value), 1);

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" />
      <p className="text-sm text-zinc-500">Today: {data.date}</p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily checklist status</CardTitle>
        </CardHeader>
        <CardContent>
          <BarChart items={statusChart} max={maxStatus} color="bg-accent-500" />
          <div className="mt-4 space-y-2 border-t border-zinc-800 pt-4">
            {data.completion.map((c, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span>{c.label}</span>
                <Badge className={cn("border", statusColor(c.status ?? "not_started"))}>
                  {c.status ?? "not started"}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Open faults: {data.openFaults}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <BarChart
            items={severityChart}
            max={maxSeverity}
            color="bg-amber-500"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Staff submissions (7 days)</CardTitle>
        </CardHeader>
        <CardContent>
          <BarChart
            items={data.staffPerf.map((s) => ({
              label: s.display_name,
              value: s.submissions,
            }))}
            max={maxStaff}
            color="bg-sky-500"
          />
        </CardContent>
      </Card>
    </div>
  );
}
