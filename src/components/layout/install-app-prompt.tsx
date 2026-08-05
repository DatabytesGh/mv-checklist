"use client";

import { useEffect, useState } from "react";
import { X, Share, PlusSquare } from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallAppPrompt() {
  const [dismissed, setDismissed] = useState(true);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);
    if (standalone) return;

    const ua = navigator.userAgent;
    const ios = /iPhone|iPad|iPod/i.test(ua);
    setIsIos(ios);

    const wasDismissed = sessionStorage.getItem("mv-install-dismissed") === "1";
    if (!wasDismissed) setDismissed(false);

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      if (!wasDismissed) setDismissed(false);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  if (dismissed || isStandalone) return null;

  const close = () => {
    sessionStorage.setItem("mv-install-dismissed", "1");
    setDismissed(true);
  };

  const installAndroid = async () => {
    if (!deferred) return;
    await deferred.prompt();
    close();
  };

  return (
    <div className="fixed left-3 right-3 top-[calc(3.5rem+env(safe-area-inset-top,0px))] z-[60] mx-auto max-w-md md:left-auto md:right-6 md:top-4">
      <div className="rounded-2xl border border-zinc-700 bg-zinc-950/95 p-4 shadow-xl backdrop-blur-md">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium text-zinc-100">Install MV Checklists</p>
          <button
            type="button"
            onClick={close}
            className="rounded-lg p-1 text-zinc-500 hover:bg-zinc-800"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {deferred && !isIos ? (
          <button
            type="button"
            onClick={installAndroid}
            className="mt-3 w-full rounded-xl bg-accent-500 py-2.5 text-sm font-medium text-zinc-950"
          >
            Add to Home Screen
          </button>
        ) : (
          <ol className="mt-2 space-y-2 text-xs text-zinc-400">
            {isIos ? (
              <>
                <li className="flex items-center gap-2">
                  <Share className="h-4 w-4 shrink-0 text-accent-400" />
                  Tap Share in Safari
                </li>
                <li className="flex items-center gap-2">
                  <PlusSquare className="h-4 w-4 shrink-0 text-accent-400" />
                  Choose &quot;Add to Home Screen&quot;
                </li>
              </>
            ) : (
              <li>Open browser menu → Install app / Add to Home screen</li>
            )}
          </ol>
        )}
      </div>
    </div>
  );
}
