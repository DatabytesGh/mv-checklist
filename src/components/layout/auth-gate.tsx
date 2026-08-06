"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/providers/auth-provider";
import { useMounted } from "@/hooks/use-mounted";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const mounted = useMounted();
  const isLogin = pathname === "/login";
  const isChangePassword = pathname === "/change-password";

  useEffect(() => {
    if (!mounted || loading) return;

    if (!user && !isLogin) {
      router.replace("/login");
      return;
    }

    if (user?.must_change_password) {
      if (!isChangePassword) router.replace("/change-password");
      return;
    }

    if (user && (isLogin || isChangePassword)) {
      router.replace("/");
    }
  }, [user, loading, isLogin, isChangePassword, router, mounted]);

  return <>{children}</>;
}
