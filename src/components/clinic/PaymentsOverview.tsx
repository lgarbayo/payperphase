"use client";
/**
 * OWNED BY WP-07. Payments overview: every plan (GET /api/plans) with its collected total and the
 * next due payment. Refetches whenever `refreshSignal` changes (the console bumps it on SSE events).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Locale, PlanSummary } from "@/contracts";
import { useT } from "@/i18n";
import { formatIsoDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { Badge, Button, cx, StatusPill } from "@/lib/ui";
import { clinicApi } from "./api";
import { CASE_LABEL, Icon, PLAN_STATUS_LABEL, type ClinicT } from "./shared";

export interface PaymentsOverviewProps {
  locale: Locale;
  t: ClinicT;
  /** Any change refetches the list (SSE-driven live refresh). */
  refreshSignal?: number;
  currentPlanId?: string | null;
  onManage?: (planId: string) => void;
}

type State = { status: "loading" } | { status: "error" } | { status: "ready"; plans: PlanSummary[] };

export function PaymentsOverview({ locale, t, refreshSignal = 0, currentPlanId, onManage }: PaymentsOverviewProps) {
  const tc = useT("common");
  const [state, setState] = useState<State>({ status: "loading" });
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const { plans } = await clinicApi.listPlans();
      if (mine === seq.current) setState({ status: "ready", plans });
    } catch {
      if (mine === seq.current) setState((s) => (s.status === "ready" ? s : { status: "error" }));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshSignal]);

  return (
    <div
      data-testid="payments-overview"
      className="overflow-hidden rounded-[var(--ppp-radius)] border border-border bg-surface shadow-[var(--ppp-shadow)]"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-ink">{t("paymentsTitle")}</h3>
        {state.status === "ready" && <span className="text-xs tabular-nums text-muted">{state.plans.length}</span>}
      </div>

      {state.status === "loading" && (
        <div role="status" className="flex flex-col gap-3 p-4">
          {[0, 1].map((i) => (
            <div key={i} aria-hidden className="h-10 animate-pulse rounded-[var(--ppp-radius-sm)] bg-surface-2" />
          ))}
        </div>
      )}

      {state.status === "error" && (
        <div role="alert" className="flex items-center justify-between gap-3 p-4 text-sm">
          <span className="flex items-center gap-2 text-status-overdue">
            <Icon.Alert />
            {t("paymentsError")}
          </span>
          <Button size="sm" variant="secondary" onClick={() => void load()}>
            {tc("retry")}
          </Button>
        </div>
      )}

      {state.status === "ready" && state.plans.length === 0 && (
        <p className="p-6 text-center text-sm text-muted">{t("paymentsEmpty")}</p>
      )}

      {state.status === "ready" && state.plans.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="bg-surface-2/60 text-left text-[11px] font-medium uppercase tracking-wide text-muted">
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("colPatient")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("colPlan")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("colCollected")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("colNextDue")}
                </th>
                <th scope="col" className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {state.plans.map((p) => {
                const current = p.id === currentPlanId;
                const pct = p.totalCents > 0 ? Math.min(100, Math.round((p.paidCents / p.totalCents) * 100)) : 0;
                return (
                  <tr key={p.id} data-testid={`payments-row-${p.id}`} className={cx(current && "bg-primary/5")}>
                    <td className="px-4 py-3">
                      <span className="block font-medium text-ink">{p.patientAlias}</span>
                      <span className="block text-xs text-muted">
                        {t(CASE_LABEL[p.caseKind])} · <span className="font-mono">{p.id}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <Badge tone={p.status === "approved" ? "primary" : "neutral"}>
                        {t(PLAN_STATUS_LABEL[p.status])}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <span data-testid={`payments-paid-${p.id}`} className="block tabular-nums text-ink">
                        {t("paidOf", {
                          paid: formatCents(p.paidCents, locale),
                          total: formatCents(p.totalCents, locale),
                        })}
                      </span>
                      <span aria-hidden className="mt-1.5 block h-1.5 w-32 overflow-hidden rounded-full bg-surface-2">
                        <span
                          className="block h-full rounded-full bg-status-paid transition-[width] duration-700"
                          style={{ width: `${pct}%` }}
                        />
                      </span>
                    </td>
                    <td className="px-4 py-3" data-testid={`payments-next-${p.id}`}>
                      {p.nextDue ? (
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="tabular-nums text-ink">{formatIsoDate(p.nextDue.dueDate, locale)}</span>
                          <StatusPill status={p.nextDue.status} locale={locale} />
                        </span>
                      ) : (
                        <Badge tone="paid">{t("noNextDue")}</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center justify-end gap-2">
                        {current ? (
                          <Badge tone="neutral">{t("current")}</Badge>
                        ) : (
                          onManage && (
                            <Button
                              size="sm"
                              variant="secondary"
                              data-testid={`manage-${p.id}`}
                              onClick={() => onManage(p.id)}
                            >
                              {t("manage")}
                            </Button>
                          )
                        )}
                        <a
                          href={`/p/${p.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-8 items-center gap-1 rounded-[var(--ppp-radius-sm)] px-2 text-sm font-medium text-primary-strong hover:bg-primary/5"
                        >
                          {t("openPlan")}
                          <Icon.External width={13} height={13} />
                        </a>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
