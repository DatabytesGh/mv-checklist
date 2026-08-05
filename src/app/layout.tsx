import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/providers/auth-provider";
import { RealtimeProvider } from "@/providers/realtime-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import { ToastProvider } from "@/providers/toast-provider";
import { AuthGate } from "@/components/layout/auth-gate";
import { AppShell } from "@/components/layout/app-shell";

const themeInitScript = `(function(){try{var t=localStorage.getItem('mv-theme')||'system';var sys=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';var r=t==='system'?sys:t;var e=document.documentElement;e.classList.remove('light','dark');e.classList.add(r);e.style.colorScheme=r;}catch(e){}})();`;

export const metadata: Metadata = {
  title: {
    default: "Maya Villa Checklists",
    template: "%s · Maya Villa",
  },
  description: "Hotel daily and conference checklist system",
  applicationName: "Maya Villa Checklists",
  appleWebApp: {
    capable: true,
    title: "MV Checklists",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#050509",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className="min-h-screen bg-background font-sans text-foreground antialiased"
        suppressHydrationWarning
      >
        <ThemeProvider>
          <ToastProvider>
            <AuthProvider>
              <RealtimeProvider>
                <AuthGate>
                  <AppShell>{children}</AppShell>
                </AuthGate>
              </RealtimeProvider>
            </AuthProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
