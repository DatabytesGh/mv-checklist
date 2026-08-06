"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { MobileNav } from "./mobile-nav";
import { MobileAccountMenu } from "./mobile-account-menu";
import { GlobalPendingApproval } from "./global-pending-approval";
import { InstallAppPrompt } from "./install-app-prompt";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const bare =
    pathname === "/login" || pathname === "/change-password";

  if (bare) return <>{children}</>;

  return (
    <div className="min-h-screen">
      <InstallAppPrompt />
      <Sidebar />
      <MobileAccountMenu />
      <main className="page-main min-h-screen md:ml-56">
        <div className="mx-auto max-w-3xl lg:max-w-4xl">{children}</div>
      </main>
      <GlobalPendingApproval />
      <MobileNav />
    </div>
  );
}
