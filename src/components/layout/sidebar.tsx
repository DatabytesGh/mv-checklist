"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  AlertTriangle,
  Calendar,
  BarChart3,
  Shield,
  Settings,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/providers/auth-provider";
import { useMounted } from "@/hooks/use-mounted";
import { ThemeQuickToggle } from "@/components/settings/theme-toggle";
import { cn } from "@/lib/utils";

const mainLinks = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/checklists", label: "Checklists", icon: ClipboardList },
  { href: "/faults", label: "Faults", icon: AlertTriangle },
  { href: "/conferences", label: "Conferences", icon: Calendar },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const mounted = useMounted();

  if (pathname === "/login") return null;

  const settingsLinks = [];
  if (mounted && user?.permissions.viewReports)
    settingsLinks.push({ href: "/reports", label: "Reports", icon: BarChart3 });
  if (mounted && user?.permissions.viewAuditLog)
    settingsLinks.push({ href: "/audit", label: "Audit Log", icon: Shield });
  if (mounted && (user?.permissions.manageUsers || user?.permissions.manageSettings))
    settingsLinks.push({ href: "/settings/users", label: "Settings", icon: Settings });

  return (
    <aside className="fixed left-0 top-0 z-30 hidden h-screen w-56 flex-col border-r border-zinc-800 bg-zinc-950/95 md:flex">
      <div className="shrink-0 border-b border-zinc-800 px-4 py-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-accent-400">
          Maya Villa
        </p>
        <p className="text-sm font-medium text-zinc-100">Checklists</p>
        {mounted && user ? (
          <p className="mt-1 text-[11px] text-zinc-500">
            {user.display_name ?? user.username}
          </p>
        ) : null}
      </div>
      <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3">
        {mainLinks.map((link) => {
          const active =
            link.href === "/"
              ? pathname === "/"
              : pathname.startsWith(link.href);
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm transition-colors",
                active
                  ? "bg-accent-500/15 text-accent-300"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100",
              )}
            >
              <Icon className="h-4 w-4" strokeWidth={1.8} />
              {link.label}
            </Link>
          );
        })}
        {settingsLinks.length > 0 && (
          <>
            <div className="my-2 border-t border-zinc-800" />
            {settingsLinks.map((link) => {
              const Icon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "flex items-center gap-2 rounded-2xl px-3 py-2.5 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100",
                    pathname.startsWith("/settings") &&
                      link.href.startsWith("/settings") &&
                      "bg-zinc-900 text-zinc-100",
                  )}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.8} />
                  {link.label}
                </Link>
              );
            })}
          </>
        )}
      </nav>
      <div className="mt-auto shrink-0 border-t border-zinc-800 p-3">
        <ThemeQuickToggle className="w-full" />
        <button
          type="button"
          onClick={() => logout()}
          className="flex w-full items-center gap-2 rounded-2xl px-3 py-2.5 text-sm text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
