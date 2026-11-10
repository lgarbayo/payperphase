"use client";
/**
 * OWNED BY WP-06. "Pagado {x} · recibido {y}" per phase and in total.
 * Totals are the engine's ExposureReport (paidCents / deliveredCents); per-phase rows use the
 * report's paid/delivered flags with the phase amount. Nothing is summed here.
 */
import type { ExposureReport, Locale, Plan } from "@/contracts";
import { useT } from "@/i18n";
import { formatCents } from "@/lib/money";
import { Card, cx, STATUS_COLOR_VAR } from "@/lib/ui";

export interface LedgerProps {
  plan: Plan;
  exposure: ExposureReport;
  locale: Locale;
  className?: string;
}

function PaidReceived({
  paidCents,
  receivedCents,
  locale,
  testId,
  strong,
}: {
  paidCents: number;
  receivedCents: number;
  locale: Locale;
  testId: string;
  strong?: boolean;
}) {
  const t = useT("patient");
  return (
    <span data-testid={testId} className={cx("tabular-nums", strong ? "text-base text-ink" : "text-sm text-ink/90")}>
      {t("paid")}{" "}
      <span data-testid={`${testId}-paid`} className={cx(strong ? "font-semibold" : "font-medium")}>
        {formatCents(paidCents, locale)}
      </span>
      <span className="whitespace-pre text-muted">{" · "}</span>
      {t("received")}{" "}
      <span data-testid={`${testId}-received`} className={cx(strong ? "font-semibold" : "font-medium")}>
        {formatCents(receivedCents, locale)}
      </span>
    </span>
  );
}

export function Ledger({ plan, exposure, locale, className }: LedgerProps) {
  const t = useT("patient");
  const rows = plan.phases.map((phase) => {
    const r = exposure.byPhase.find((b) => b.phaseId === phase.id);
    const paid = r?.paid ? (phase.payment.paidCents ?? r.amountCents) : 0;
    const received = r?.delivered ? r.amountCents : 0;
    return { phase, paid, received, status: r?.status ?? phase.payment.status };
  });
  const total = exposure.totalCents;

  return (
    <Card data-testid="ledger" className={cx("flex flex-col gap-4", className)}>
      <header>
        <h2 className="text-lg font-semibold tracking-tight text-ink">{t("ledgerTitle")}</h2>
        <p className="mt-1 text-sm text-muted">{t("ledgerSubtitle")}</p>
      </header>

      {total > 0 && (
        <div
          role="img"
          aria-label={t("ledgerBarLabel")}
          className="flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-surface-2"
        >
          {rows.map(({ phase, status }) => (
            <span
              key={phase.id}
              className="h-full transition-[background-color] duration-500 first:rounded-l-full last:rounded-r-full"
              style={{
                width: `${(phase.amountCents / total) * 100}%`,
                background: status === "paid" ? STATUS_COLOR_VAR.paid : "var(--ppp-border)",
              }}
            />
          ))}
        </div>
      )}

      <ul className="divide-y divide-border">
        {rows.map(({ phase, paid, received, status }) => (
          <li key={phase.id} data-testid={`ledger-row-${phase.id}`} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
            <span className="flex min-w-0 items-center gap-2 text-sm text-ink">
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: STATUS_COLOR_VAR[status] }} />
              <span className="font-medium tabular-nums text-muted">{phase.n}.</span>
              <span className="truncate">{phase.title[locale]}</span>
            </span>
            <PaidReceived paidCents={paid} receivedCents={received} locale={locale} testId={`ledger-line-${phase.id}`} />
          </li>
        ))}
      </ul>

      <footer className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-[var(--ppp-radius-sm)] bg-surface-2 px-3 py-3">
        <span className="text-sm font-semibold text-ink">
          {t("ledgerTotal")} <span className="font-normal text-muted">{t("ledgerOfTotal", { total: formatCents(total, locale) })}</span>
        </span>
        <PaidReceived
          paidCents={exposure.paidCents}
          receivedCents={exposure.deliveredCents}
          locale={locale}
          testId="ledger-total"
          strong
        />
      </footer>
    </Card>
  );
}
