"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { useMounted } from "@/hooks/use-mounted";
import { ThemeQuickToggle } from "@/components/settings/theme-toggle";
import { roleLabel } from "@/lib/utils";
import { BarChart3, Shield, Settings, LogOut } from "lucide-react";

export function MobileAccountMenu() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const mounted = useMounted();
  const [open, setOpen] = useState(false);

  if (pathname === "/login" || !mounted || !user) return null;

  const name = user.display_name ?? user.username;
  const initials =
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?";

  const links: { href: string; label: string; icon: typeof Settings }[] = [];
  if (user.permissions.viewReports)
    links.push({ href: "/reports", label: "Reports", icon: BarChart3 });
  if (user.permissions.viewAuditLog)
    links.push({ href: "/audit", label: "Audit log", icon: Shield });
  if (user.permissions.manageUsers || user.permissions.manageSettings)
    links.push({ href: "/settings/users", label: "Settings", icon: Settings });

  return (
    <div className="md:hidden">
      {/* Account button, aligned with the fixed mobile title bar */}
      <div
        className="fixed right-0 top-0 z-30"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      >
        <div className="flex h-[4.25rem] items-center pr-3">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="Account menu"
            aria-expanded={open}
            className="tap-target flex h-9 w-9 items-center justify-center rounded-full bg-accent-500/15 text-xs font-semibold text-accent-300 ring-1 ring-inset ring-accent-500/30 active:scale-95"
          >
            {initials}
          </button>
        </div>
      </div>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div
            className="fixed right-3 z-50 w-64 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950/95 shadow-2xl backdrop-blur"
            style={{ top: "calc(env(safe-area-inset-top, 0px) + 3.6rem)" }}
          >
            <div className="flex items-center gap-3 border-b border-zinc-800/70 px-4 py-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-500/15 text-sm font-semibold text-accent-300">
                {initials}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-zinc-100">
                  {name}
                </p>
                <p className="truncate text-[11px] text-zinc-500">
                  {roleLabel(user.role)}
                </p>
              </div>
            </div>

            {links.length > 0 && (
              <div className="border-b border-zinc-800/70 p-1.5">
                {links.map((link) => {
                  const Icon = link.icon;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-zinc-300 transition-colors hover:bg-zinc-900 active:bg-zinc-900"
                    >
                      <Icon className="h-4 w-4 text-zinc-500" strokeWidth={1.8} />
                      {link.label}
                    </Link>
                  );
                })}
              </div>
            )}

            <div className="p-1.5">
              <ThemeQuickToggle className="w-full justify-start" />
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  logout();
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-red-400 transition-colors hover:bg-red-500/10 active:bg-red-500/10"
              >
                <LogOut className="h-4 w-4" strokeWidth={1.8} />
                Sign out
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
