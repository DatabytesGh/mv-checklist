"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/settings/theme-toggle";
import { SettingsSection, Field } from "@/components/settings/settings-ui";
import { apiFetch } from "@/lib/fetch";
import { useToast } from "@/providers/toast-provider";
import { CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";

type WaStatus = {
  metaApi?: { configured: boolean };
  tokenCheck?: {
    valid: boolean | null;
    networkError?: boolean;
    errorMessage?: string;
  };
  hint?: string;
};

function waBannerState(
  status: WaStatus | null,
): "ready" | "invalid" | "network" | "missing" {
  if (!status?.metaApi?.configured) return "missing";
  if (status.tokenCheck?.valid === true) return "ready";
  if (status.tokenCheck?.networkError || status.tokenCheck?.valid === null) {
    return "network";
  }
  if (status.tokenCheck?.valid === false) return "invalid";
  return "ready";
}

export default function SettingsGeneralPage() {
  const toast = useToast();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [waStatus, setWaStatus] = useState<WaStatus | null>(null);
  const [testTo, setTestTo] = useState("");
  const [saved, setSaved] = useState(false);

  const loadWaStatus = useCallback(async () => {
    try {
      const r = await apiFetch("/api/whatsapp/status");
      if (r.ok) {
        setWaStatus(await r.json());
      }
    } catch {
      setWaStatus({
        metaApi: { configured: true },
        tokenCheck: {
          valid: null,
          networkError: true,
          errorMessage: "Could not load status",
        },
        hint: "Refresh the page or tap Retry.",
      });
    }
  }, []);

  useEffect(() => {
    apiFetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setSettings(d.settings ?? {}));
    void loadWaStatus();
  }, [loadWaStatus]);

  const save = async () => {
    await apiFetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const set = (key: string, value: string) =>
    setSettings((s) => ({ ...s, [key]: value }));

  const banner = waBannerState(waStatus);
  const showTest =
    waStatus?.metaApi?.configured && banner !== "missing" && banner !== "invalid";
  const ready = banner === "ready";

  return (
    <>
      <SettingsSection
        title="Appearance"
        description="Choose how the app looks. System follows your device setting."
      >
        <ThemeToggle />
      </SettingsSection>

      <SettingsSection
        title="Organization"
        description="Basic information about your property. Fallback WhatsApp is used only when no member with Receive WhatsApp notifications has a number set."
        action={
          <Button size="sm" onClick={save}>
            {saved ? "Saved" : "Save"}
          </Button>
        }
        bodyClassName="grid gap-4 sm:grid-cols-2"
      >
        <Field label="Hotel name">
          <input
            className="input-field"
            value={settings.hotel_name ?? ""}
            onChange={(e) => set("hotel_name", e.target.value)}
          />
        </Field>
        <Field label="Timezone">
          <input
            className="input-field"
            value={settings.timezone ?? "Africa/Accra"}
            onChange={(e) => set("timezone", e.target.value)}
          />
        </Field>
        <Field
          label="Fallback WhatsApp"
          hint="Optional. Prefer setting WhatsApp on members under Settings → Members."
          className="sm:col-span-2"
        >
          <input
            className="input-field"
            placeholder="0543843090 or +233543843090"
            value={settings.hotel_whatsapp ?? ""}
            onChange={(e) => set("hotel_whatsapp", e.target.value)}
          />
        </Field>
      </SettingsSection>

      <SettingsSection
        title="WhatsApp integration"
        description="Status of the Meta WhatsApp Cloud API connection."
      >
        {waStatus && (
          <div
            className={`flex flex-col gap-3 rounded-2xl border px-4 py-3.5 text-sm ${
              ready
                ? "border-accent-500/30 bg-accent-500/10"
                : "border-amber-500/40 bg-amber-500/10"
            }`}
          >
            <div className="flex items-start gap-3">
              {ready ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent-400" />
              ) : (
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
              )}
              <div className="min-w-0">
                <p
                  className={`font-medium ${ready ? "text-accent-100" : "text-amber-200"}`}
                >
                  {banner === "missing" && "Not configured"}
                  {banner === "ready" && "Connected & ready"}
                  {banner === "network" && "Could not verify connection"}
                  {banner === "invalid" && "Access token invalid"}
                </p>
                {waStatus.hint && (
                  <p className="mt-0.5 text-xs opacity-90">{waStatus.hint}</p>
                )}
                {banner === "invalid" && waStatus.tokenCheck?.errorMessage && (
                  <p className="mt-1.5 text-xs text-amber-100/90">
                    {waStatus.tokenCheck.errorMessage}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(banner === "network" || banner === "invalid") && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  icon={<RefreshCw className="h-3.5 w-3.5" />}
                  onClick={() => loadWaStatus()}
                >
                  Retry check
                </Button>
              )}
              {showTest && (
                <>
                  <input
                    className="input-field max-w-[16rem] flex-1"
                    placeholder="Test number e.g. 233555271279"
                    value={testTo}
                    onChange={(e) => setTestTo(e.target.value)}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="soft"
                    onClick={async () => {
                      if (!testTo.trim()) return;
                      try {
                        const r = await apiFetch(
                          `/api/whatsapp/test?to=${encodeURIComponent(testTo.trim())}`,
                        );
                        const d = await r.json().catch(() => ({}));
                        if (r.ok) {
                          toast.success(
                            `Test message sent (id: ${d.messageId ?? "ok"})`,
                          );
                          void loadWaStatus();
                          return;
                        }
                        const detail = d.detail ? ` — ${d.detail}` : "";
                        toast.error(`${d.error ?? "Test failed"}${detail}`);
                      } catch {
                        toast.error("Connection lost — try again");
                      }
                    }}
                  >
                    Send test
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </SettingsSection>
    </>
  );
}
