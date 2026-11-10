"use client";
/**
 * OWNED BY WP-07. Clinic console: PDF dropzone → extraction reveal (+ odontogram + check bar) →
 * phase review & note approval → send link/QR → plan editor with diff → agent feed → payments.
 * SCAFFOLD STUB.
 */
import { AgentFeed } from "@/components/agent/AgentFeed";
import { TrustStrip } from "@/components/brand/TrustStrip";
import { PlanGantt } from "@/components/gantt/PlanGantt";
import { Odontogram } from "@/components/odontogram/Odontogram";
import type { Plan } from "@/contracts";
import { useLocale } from "@/i18n";

export function ClinicConsole({ plan, today }: { plan: Plan | null; today: string }) {
  const { locale } = useLocale();
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">{locale === "es" ? "Consola de la clínica" : "Clinic console"}</h1>
      <Odontogram marks={[]} locale={locale} />
      {plan && <PlanGantt plan={plan} today={today} locale={locale} mode="clinic" notes={{}} />}
      <TrustStrip locale={locale} />
      {plan && <AgentFeed planId={plan.id} locale={locale} />}
    </main>
  );
}
