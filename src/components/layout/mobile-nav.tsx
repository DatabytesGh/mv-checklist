"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ClipboardList, AlertTriangle, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/checklists", label: "Checklists", icon: ClipboardList },
  { href: "/faults", label: "Faults", icon: AlertTriangle },
  { href: "/conferences", label: "Conferences", icon: Calendar },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-zinc-800 bg-zinc-950/95 pb-[max(1rem,env(safe-area-inset-bottom,0px))] backdrop-blur md:hidden">
      <div className="grid grid-cols-4">
        {tabs.map((tab) => {
          const active =
            tab.href === "/"
              ? pathname === "/"
              : pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex flex-col items-center gap-1 py-3 text-[10px] font-medium tap-target",
                active ? "text-accent-400" : "text-zinc-500",
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={1.8} />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
