"use client";
/**
 * OWNED BY WP-06. Patient plan page body: Gantt + phase cards + pay buttons + ledger + risk-note
 * cards + live SSE status + ES/EN toggle + simulated-clock badge.
 * SCAFFOLD STUB: composes every cross-WP stub so the whole tree compiles.
 */
import type { PlanViewResponse } from "@/contracts";
import { PlanChat } from "@/components/chat/PlanChat";
import { PlanGantt } from "@/components/gantt/PlanGantt";
import { ClinicClosureButton } from "@/components/impact/ClinicClosureButton";
import { ExposureMeter } from "@/components/impact/ExposureMeter";
import { PayLaterMessage } from "@/components/pay/PayLaterMessage";
import { PayPhaseButton } from "@/components/pay/PayPhaseButton";
import { useLocale } from "@/i18n";
import { formatIsoDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { Card, SimClockBadge, StatusPill } from "@/lib/ui";

export function PatientPlanView({ initial }: { initial: PlanViewResponse }) {
  const { locale } = useLocale();
  const { plan, clock, exposure, stress, notes } = initial;
  const noteMap = Object.fromEntries(notes.map((n) => [n.id, n]));
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {plan.clinic.name} · {plan.patient.alias}
        </h1>
        <SimClockBadge today={clock.today} locale={locale} />
      </header>
      <PlanGantt plan={plan} today={clock.today} locale={locale} mode="patient" notes={noteMap} />
      <section className="grid gap-4 md:grid-cols-2">
        {plan.phases.map((p) => (
          <Card key={p.id} data-testid={`phase-card-${p.id}`}>
            <div className="flex items-center justify-between">
              <h2 className="font-medium">
                {p.n}. {p.title[locale]}
              </h2>
              <StatusPill status={p.payment.status} locale={locale} />
            </div>
            <p className="text-sm text-muted">
              {formatIsoDate(p.startDate, locale)} · {formatCents(p.amountCents, locale)}
            </p>
            <PayPhaseButton planId={plan.id} phaseId={p.id} amountCents={p.amountCents} status={p.payment.status} locale={locale} />
            <PayLaterMessage amountCents={p.amountCents} locale={locale} />
          </Card>
        ))}
      </section>
      <ExposureMeter report={exposure} locale={locale} />
      <ClinicClosureButton stress={stress} locale={locale} />
      <PlanChat planId={plan.id} locale={locale} />
    </main>
  );
}
