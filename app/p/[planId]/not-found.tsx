"use client";
/**
 * Unknown plan id (or an old id after a demo reset).
 * Every judge shares one demo, so /p/demo itself can be missing (e.g. after someone opens beat 1).
 * The button opens the demo plan, and resets the demo first when there is no demo plan to open,
 * so a judge never lands in a not-found loop.
 */
import { useState } from "react";
import { apiFetch, HERO_PLAN_ALIAS } from "@/contracts";
import { useT } from "@/i18n";
import { Button, Card } from "@/lib/ui";

export default function PlanNotFound() {
  const t = useT("patient");
  const [busy, setBusy] = useState(false);

  async function openDemo() {
    setBusy(true);
    try {
      const res = await fetch(`/api/plans/${HERO_PLAN_ALIAS}`, { cache: "no-store" });
      if (!res.ok) await apiFetch("/api/demo/reset", { method: "POST", json: {} });
      // A full load: a client navigation to the same URL keeps showing this not-found boundary.
      window.location.assign(`/p/${HERO_PLAN_ALIAS}`);
    } catch {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex max-w-xl flex-col items-center px-4 py-20">
      <Card className="flex w-full flex-col items-center gap-3 px-8 py-10 text-center" data-testid="plan-not-found">
        <h1 className="text-xl font-semibold tracking-tight text-ink">{t("notFoundTitle")}</h1>
        <p className="text-sm text-muted">{t("notFoundBody")}</p>
        <Button data-testid="plan-not-found-open" className="mt-2" onClick={openDemo} disabled={busy}>
          {busy ? t("notFoundOpening") : t("notFoundCta")}
        </Button>
      </Card>
    </main>
  );
}
