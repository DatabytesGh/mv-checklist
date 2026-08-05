"use client";

import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Users,
  ShieldCheck,
  Wrench,
  ClipboardList,
  SlidersHorizontal,
  IdCard,
} from "lucide-react";

const links = [
  {
    href: "/settings/users",
    label: "Members",
    description: "People & access",
    icon: Users,
  },
  {
    href: "/settings/staff",
    label: "Staff",
    description: "Shift leader names",
    icon: IdCard,
  },
  {
    href: "/settings/roles",
    label: "Roles & Permissions",
    description: "What each role can do",
    icon: ShieldCheck,
  },
  {
    href: "/settings/vendors",
    label: "Vendors",
    description: "Contractors & suppliers",
    icon: Wrench,
  },
  {
    href: "/settings/templates",
    label: "Checklists",
    description: "Types & template items",
    icon: ClipboardList,
  },
  {
    href: "/settings/general",
    label: "General",
    description: "Appearance & integrations",
    icon: SlidersHorizontal,
  },
];

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Manage your workspace, people, and integrations"
      />

      <div className="md:grid md:grid-cols-[15rem_1fr] md:gap-8">
        {/* Desktop side nav */}
        <nav className="hidden md:block">
          <div className="sticky top-6 space-y-1">
            {links.map((l) => {
              const active = pathname === l.href;
              const Icon = l.icon;
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  className={cn(
                    "flex items-start gap-3 rounded-2xl border px-3 py-2.5 transition-colors",
                    active
                      ? "border-accent-500/40 bg-accent-500/10"
                      : "border-transparent hover:bg-zinc-900/60",
                  )}
                >
                  <Icon
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0",
                      active ? "text-accent-300" : "text-zinc-500",
                    )}
                    strokeWidth={1.8}
                  />
                  <div className="min-w-0">
                    <p
                      className={cn(
                        "text-sm font-medium",
                        active ? "text-accent-200" : "text-zinc-200",
                      )}
                    >
                      {l.label}
                    </p>
                    <p className="text-[11px] text-zinc-500">{l.description}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </nav>

        {/* Mobile pill nav */}
        <nav className="-mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1 md:hidden">
          {links.map((l) => {
            const active = pathname === l.href;
            const Icon = l.icon;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium",
                  active
                    ? "border-accent-500/50 bg-accent-500/15 text-accent-300"
                    : "border-zinc-700 text-zinc-400",
                )}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={1.8} />
                {l.label}
              </Link>
            );
          })}
        </nav>

        <div className="min-w-0 space-y-5">{children}</div>
      </div>
    </div>
  );
}
