"use client";
/** Public "Reset demo" button (judges): POST /api/demo/reset, confirms with a toast. */
import { useState } from "react";
import { apiFetch } from "@/contracts";
import { useT } from "@/i18n";
import { Button } from "@/lib/ui";
import { useToast } from "@/lib/ui/Toast";

export function ResetDemoButton() {
  const t = useT("landing");
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function reset() {
    setBusy(true);
    try {
      await apiFetch("/api/demo/reset", { method: "POST", json: {} });
      toast(t("toastReset"), "success");
    } catch (e) {
      toast(t("toastError", { message: e instanceof Error ? e.message : String(e) }), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button data-testid="reset-demo" size="lg" onClick={reset} disabled={busy}>
      {busy ? t("hubResetting") : t("hubResetButton")}
    </Button>
  );
}
