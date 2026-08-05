import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function AuthShellSkeleton() {
  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-56 shrink-0 border-r border-zinc-800 bg-zinc-950/80 p-4 md:block">
        <Skeleton className="mb-6 h-10 w-32" />
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </aside>
      <main className="flex-1 p-6">
        <Skeleton className="mb-4 h-8 w-48" />
        <Skeleton className="mb-2 h-4 w-64" />
        <div className="mt-6 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </main>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <header className="mobile-title-bar border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur-md md:hidden">
        <div className="flex min-h-[3.25rem] flex-col items-center justify-center px-12 py-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="mt-1 h-3 w-40" />
        </div>
      </header>
      <div
        className="mobile-title-spacer mobile-title-spacer--with-desc md:hidden"
        aria-hidden
      />
      <Skeleton className="h-10 w-full rounded-2xl md:hidden" />
      <div className="hidden md:block">
        <Skeleton className="mb-2 h-8 w-40" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
      <ChecklistCardsSkeleton count={5} />
    </div>
  );
}

export function ChecklistCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-4 w-36" />
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardContent className="space-y-3 py-5">
            <div className="flex items-center gap-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-5 w-16" />
            </div>
            <Skeleton className="h-2 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function ChecklistSessionSkeleton({ items = 6 }: { items?: number }) {
  return (
    <div className="space-y-4 pb-8">
      <header className="mobile-title-bar border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur-md md:hidden">
        <div className="relative mx-auto flex min-h-[3.25rem] items-center justify-center px-12 py-2">
          <Skeleton className="absolute left-4 h-5 w-5 rounded-full" />
          <Skeleton className="h-6 w-44" />
        </div>
      </header>
      <div className="mobile-title-spacer mobile-title-spacer--with-children md:hidden" aria-hidden />
      <div className="hidden space-y-2 md:block">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-5 w-24" />
      </div>
      <div className="space-y-1">
        <div className="flex justify-between">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-8" />
        </div>
        <Skeleton className="h-2 w-full" />
      </div>
      <div className="flex flex-col gap-4">
        {Array.from({ length: items }).map((_, i) => (
          <Card key={i}>
            <CardContent className="space-y-3 py-5">
              <Skeleton className="h-4 w-full max-w-md" />
              <Skeleton className="h-11 w-full" />
              <div className="flex gap-2">
                <Skeleton className="h-11 flex-1" />
                <Skeleton className="h-11 w-12" />
                <Skeleton className="h-11 w-12" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

export function ListRowsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <CardContent className="space-y-2 py-4">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function ReportsSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-4 w-40" />
      {Array.from({ length: 3 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="space-y-3 py-4">
            <Skeleton className="h-5 w-36" />
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="flex justify-between">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function PageHeaderSkeleton() {
  return (
    <>
      <header className="mobile-title-bar border-b border-zinc-800/80 bg-zinc-950/95 backdrop-blur-md md:hidden">
        <div className="flex min-h-[3.25rem] items-center justify-center px-12 py-2">
          <Skeleton className="h-6 w-36" />
        </div>
      </header>
      <div className="mobile-title-spacer md:hidden" aria-hidden />
      <div className="mb-6 hidden md:block">
        <Skeleton className="mb-2 h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
    </>
  );
}
