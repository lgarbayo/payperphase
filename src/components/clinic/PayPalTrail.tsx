"use client";
/**
 * PayPal trail of one plan: per phase, order → capture → webhook → invoice → agent steps, as a mono
 * timeline with the real sandbox ids. Mounted only while the toggle in PaymentsOverview is open, so it
 * polls every 3 s only while visible. Ids and statuses only (the API never sends emails or payloads).
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  apiFetch,
  type InvoiceStatus,
  type InvoiceToolName,
  type Locale,
  type PaymentStatus,
} from "@/contracts";
import { formatIsoDate } from "@/lib/dates";
import { Button, cx, StatusPill } from "@/lib/ui";
import { Icon, INVOICE_STATUS_LABEL, type ClinicT } from "./shared";

export const TRAIL_POLL_MS = 3_000;

export interface TrailWebhook {
  eventType: string;
  verified: boolean;
  applied: boolean;
  receivedAt: string;
  resourceId: string | null;
}
export interface TrailAgentStep {
  tool: InvoiceToolName;
  ok: boolean;
  at: string;
}
export interface TrailPhase {
  phaseId: string;
  n: number;
  /** The visit day (the phase's invoice is issued on it). */
  dueDate?: string;
  payment: {
    instrument: "order" | "invoice" | null;
    orderId: string | null;
    orderAttempt: number;
    captureId: string | null;
    paidAt: string | null;
    status: PaymentStatus;
  };
  invoice: { invoiceNumber: string; status: InvoiceStatus; payerViewUrl: string | null } | null;
  webhooks: TrailWebhook[];
  agentSteps: TrailAgentStep[];
}
export interface PayPalTrailResponse {
  planId: string;
  modes: { paypal: "live" | "mock"; paypalWebhooks: "live" | "mock" };
  phases: TrailPhase[];
}

type State = { status: "loading" } | { status: "error" } | { status: "ready"; data: PayPalTrailResponse };

export interface PayPalTrailProps {
  planId: string;
  locale: Locale;
  t: ClinicT;
  /** Test hook: poll interval override. */
  pollMs?: number;
}

function clock(iso: string, locale: Locale): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString(locale === "es" ? "es-ES" : "en-GB", { hour12: false });
}

function Row({ tone = "ok", at, testId, children }: { tone?: "ok" | "warn" | "muted"; at?: string; testId?: string; children: ReactNode }) {
  return (
    <li data-testid={testId} className="relative flex items-start gap-3 pb-2.5 pl-5 last:pb-0">
      <span
        aria-hidden
        className={cx(
          "absolute -left-[4.5px] top-[7px] h-2 w-2 rounded-full",
          tone === "ok" && "bg-status-paid",
          tone === "warn" && "bg-status-due",
          tone === "muted" && "bg-border",
        )}
      />
      <span className="min-w-0 flex-1 break-words font-mono text-[12.5px] leading-5 text-ink">{children}</span>
      {at ? <span className="shrink-0 font-mono text-[11px] leading-5 text-muted tabular-nums">{at}</span> : null}
    </li>
  );
}

const Id = ({ children }: { children: ReactNode }) => (
  <span className="rounded bg-surface-2 px-1.5 py-px font-semibold text-ink">{children}</span>
);

function PhaseTrail({ ph, mockWebhooks, locale, t }: { ph: TrailPhase; mockWebhooks: boolean; locale: Locale; t: ClinicT }) {
  const { payment: pay, invoice } = ph;
  const empty = !pay.orderId && !pay.captureId && !invoice && ph.webhooks.length === 0 && ph.agentSteps.length === 0;
  // A future phase has no invoice yet by design: it is issued on its visit day.
  const visitDay =
    !invoice && ph.dueDate && (pay.status === "scheduled" || pay.status === "upcoming")
      ? t("invOnVisitDay", { date: formatIsoDate(ph.dueDate, locale) })
      : null;
  return (
    <section
      data-testid={`paypal-trail-phase-${ph.phaseId}`}
      aria-label={t("trailPhase", { n: ph.n })}
      className="rounded-[var(--ppp-radius-sm)] border border-border bg-surface p-3"
    >
      <header className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">{t("trailPhase", { n: ph.n })}</span>
        <StatusPill status={pay.status} locale={locale} />
      </header>
      {empty ? (
        <p className="font-mono text-[12.5px] text-muted" {...(visitDay ? { "data-testid": `trail-visit-day-${ph.phaseId}` } : {})}>
          {visitDay ?? t("trailNothing")}
        </p>
      ) : (
        <ol className="relative border-l border-border pl-0">
          {pay.orderId && (
            <Row testId={`trail-order-${ph.phaseId}`}>
              {t("trailOrder")} <Id>{pay.orderId}</Id> · {t("trailAttempt", { n: Math.max(1, pay.orderAttempt) })}
            </Row>
          )}
          {pay.captureId && (
            <Row at={pay.paidAt ? clock(pay.paidAt, locale) : undefined} testId={`trail-capture-${ph.phaseId}`}>
              {t("trailCapture")} <Id>{pay.captureId}</Id> <span className="text-status-paid">COMPLETED</span>
            </Row>
          )}
          {ph.webhooks.map((w, i) => (
            <Row
              key={`${w.eventType}-${w.receivedAt}-${i}`}
              tone={w.verified ? "ok" : "warn"}
              at={clock(w.receivedAt, locale)}
              testId={`trail-webhook-${ph.phaseId}`}
            >
              {t("trailWebhook")} <Id>{w.eventType}</Id>{" "}
              <span className={w.verified ? "text-status-paid" : "text-status-due"}>
                {w.verified ? "✓" : "✗"} {w.verified ? t("trailSigVerified") : t("trailSigUnverified")}
              </span>{" "}
              · <span data-applied={w.applied}>{w.applied ? t("trailApplied") : t("trailDeduped")}</span>
            </Row>
          ))}
          {ph.webhooks.length === 0 && (
            <Row tone="muted" testId={`trail-webhook-none-${ph.phaseId}`}>
              <span className="text-muted">{mockWebhooks ? t("trailWebhooksMock") : t("trailWebhooksNone")}</span>
            </Row>
          )}
          {visitDay && (
            <Row tone="muted" testId={`trail-visit-day-${ph.phaseId}`}>
              <span className="text-muted">{visitDay}</span>
            </Row>
          )}
          {invoice && (
            <Row testId={`trail-invoice-${ph.phaseId}`}>
              {t("trailInvoice")} <Id>{invoice.invoiceNumber}</Id> · {t(INVOICE_STATUS_LABEL[invoice.status])}
              {invoice.payerViewUrl && (
                <>
                  {" "}
                  <a
                    href={invoice.payerViewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 font-sans text-xs font-medium text-primary-strong hover:underline"
                  >
                    {t("trailInvoiceLink")}
                    <Icon.External width={11} height={11} />
                  </a>
                </>
              )}
            </Row>
          )}
          {ph.agentSteps.map((s, i) => (
            <Row key={`${s.tool}-${s.at}-${i}`} tone={s.ok ? "ok" : "warn"} at={clock(s.at, locale)} testId={`trail-agent-${ph.phaseId}`}>
              <span className="text-muted">{t("trailAgent")}</span> {s.tool}{" "}
              <span className={s.ok ? "text-status-paid" : "text-status-due"}>{s.ok ? "✓" : "✗"}</span>
            </Row>
          ))}
        </ol>
      )}
    </section>
  );
}

export function PayPalTrail({ planId, locale, t, pollMs = TRAIL_POLL_MS }: PayPalTrailProps) {
  const [state, setState] = useState<State>({ status: "loading" });
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const data = await apiFetch<PayPalTrailResponse>(`/api/plans/${encodeURIComponent(planId)}/paypal-trail`);
      if (mine === seq.current) setState({ status: "ready", data });
    } catch {
      // Keep the last good trail on screen when a poll fails.
      if (mine === seq.current) setState((s) => (s.status === "ready" ? s : { status: "error" }));
    }
  }, [planId]);

  useEffect(() => {
    setState({ status: "loading" });
    void load();
    const timer = setInterval(() => void load(), pollMs);
    return () => {
      clearInterval(timer);
      seq.current++;
    };
  }, [load, pollMs]);

  return (
    <div data-testid="paypal-trail" className="flex flex-col gap-3">
      <p className="text-xs text-muted">{t("trailHint")}</p>

      {state.status === "loading" && (
        <div role="status" aria-label={t("trailLoading")} className="grid gap-3 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} aria-hidden className="h-24 animate-pulse rounded-[var(--ppp-radius-sm)] bg-surface-2" />
          ))}
        </div>
      )}

      {state.status === "error" && (
        <div role="alert" className="flex items-center justify-between gap-3 text-sm">
          <span className="flex items-center gap-2 text-status-overdue">
            <Icon.Alert />
            {t("trailError")}
          </span>
          <Button size="sm" variant="secondary" onClick={() => void load()}>
            {t("trailRetry")}
          </Button>
        </div>
      )}

      {state.status === "ready" && (
        <>
          <p data-testid="paypal-trail-mode" className="font-mono text-[11px] text-muted">
            {state.data.modes.paypal === "mock" ? t("trailMockMode") : t("trailLiveMode")}
          </p>
          <div className="grid gap-3 lg:grid-cols-2">
            {state.data.phases.map((ph) => (
              <PhaseTrail
                key={ph.phaseId}
                ph={ph}
                mockWebhooks={state.data.modes.paypalWebhooks === "mock"}
                locale={locale}
                t={t}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
