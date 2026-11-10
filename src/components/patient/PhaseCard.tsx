"use client";
/**
 * OWNED BY WP-06. One card per clinical phase: title (+ approved summary), visit date, amount,
 * the Pay in 3 range badge, status, and the payment action:
 *   due/overdue → <PayPhaseButton/> + <PayLaterMessage/> (the only payable states)
 *   scheduled/upcoming → "Se paga el día de la visita · {fecha}"
 *   processing → "Confirmando tu pago…"
 *   paid → "Pagado ✓ · recibido"
 * Pure formatting: amounts and dates come from the engine via the server view.
 */
import { useEffect, useState } from "react";
import type { Locale, Phase } from "@/contracts";
import { Ripple } from "@/components/motion";
import { PayLaterMessage } from "@/components/pay/PayLaterMessage";
import { PayPhaseButton } from "@/components/pay/PayPhaseButton";
import { useT } from "@/i18n";
import { formatIsoDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { Badge, Card, cx, STATUS_COLOR_VAR, StatusPill } from "@/lib/ui";
import { formatFit, formatTeeth } from "./format";
import { CalendarIcon, CheckCircleIcon, CheckIcon, ClockIcon, ToothIcon } from "./icons";

export interface PhaseCardProps {
  planId: string;
  phase: Phase;
  locale: Locale;
  /** Bumps on each payment of this phase → green ripple + glow. */
  pulse?: number;
  /** Briefly outline the card (e.g. Gantt "Pay this phase" menu). */
  highlighted?: boolean;
  onPaid?: (r: { phaseId: string; captureId?: string }) => void;
  onPayError?: (message: string) => void;
}

const GLOW_MS = 2_400;

/** DOM id of a phase card (Gantt "Pay this phase" scrolls to it). */
export const phaseCardDomId = (phaseId: string) => `phase-${phaseId}`;

export function PhaseCard({ planId, phase, locale, pulse = 0, highlighted, onPaid, onPayError }: PhaseCardProps) {
  const t = useT("patient");
  const status = phase.payment.status;
  const [glow, setGlow] = useState(false);

  useEffect(() => {
    if (!pulse) return;
    setGlow(true);
    const id = setTimeout(() => setGlow(false), GLOW_MS);
    return () => clearTimeout(id);
  }, [pulse]);

  const payable = status === "due" || status === "overdue";
  const fitInRange = phase.fit.band === "PAY_IN_3";

  // The outer 1×1 grid stretches whatever Ripple renders, so cards in a row keep equal heights.
  return (
    <div className="grid h-full">
    <Ripple trigger={pulse} color="var(--ppp-status-paid)">
      <Card
        id={phaseCardDomId(phase.id)}
        tabIndex={-1}
        data-testid={`phase-card-${phase.id}`}
        data-status={status}
        data-ripple={pulse}
        aria-labelledby={`phase-title-${phase.id}`}
        className={cx(
          "relative flex h-full flex-col gap-4 overflow-hidden pt-6 outline-none transition-shadow duration-700",
          glow && "shadow-[0_0_0_3px_var(--ppp-status-paid),0_8px_30px_rgba(22,163,74,0.25)]",
          highlighted && !glow && "shadow-[0_0_0_3px_var(--ppp-focus)]",
          status === "due" && "border-status-due/40",
        )}
      >
        <span aria-hidden className="absolute inset-x-0 top-0 h-1.5" style={{ background: STATUS_COLOR_VAR[status] }} />

        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted">{t("phaseN", { n: phase.n })}</p>
            <h3 id={`phase-title-${phase.id}`} className="mt-1 text-base font-semibold leading-snug text-ink">
              {phase.title[locale]}
            </h3>
          </div>
          <span className="shrink-0 whitespace-nowrap">
            <StatusPill status={status} locale={locale} />
          </span>
        </header>

        {phase.summary && (
          <p data-testid="phase-summary" className="-mt-1 text-sm leading-relaxed text-muted">
            {phase.summary[locale]}
          </p>
        )}

        <dl className="grid grid-cols-2 gap-3">
          <div>
            <dt className="text-xs text-muted">{t("visit")}</dt>
            <dd className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-ink" data-testid="phase-date">
              <CalendarIcon className="text-muted" width={14} height={14} />
              {formatIsoDate(phase.startDate, locale)}
            </dd>
          </div>
          <div className="text-right">
            <dt className="text-xs text-muted">{t("amount")}</dt>
            <dd className="mt-0.5 text-xl font-semibold tabular-nums tracking-tight text-ink" data-testid="phase-amount">
              {formatCents(phase.amountCents, locale)}
            </dd>
          </div>
        </dl>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge
            tone={fitInRange ? "primary" : "neutral"}
            data-testid="fit-badge"
            data-band={phase.fit.band}
            className="leading-snug"
            style={{ borderRadius: 10 }}
          >
            {fitInRange && <CheckIcon width={12} height={12} className="shrink-0" />}
            <FitText text={formatFit(phase.fit, locale)} />
          </Badge>
          {phase.teeth.length > 0 && (
            <Badge tone="neutral">
              <ToothIcon width={12} height={12} />
              {t("teeth", { teeth: formatTeeth(phase.teeth, locale) })}
            </Badge>
          )}
        </div>

        <footer className="mt-auto border-t border-border pt-4" data-testid="phase-action">
          {payable ? (
            <div className="flex flex-col gap-2.5">
              <p className={cx("text-xs font-medium", status === "overdue" ? "text-status-overdue" : "text-status-due")}>
                {status === "overdue"
                  ? t("overdueSince", { date: formatIsoDate(phase.payment.dueDate, locale) })
                  : t("dueToday")}
              </p>
              <PayPhaseButton
                planId={planId}
                phaseId={phase.id}
                amountCents={phase.amountCents}
                status={status}
                locale={locale}
                onPaid={onPaid}
                onError={onPayError}
              />
              <PayLaterMessage amountCents={phase.amountCents} locale={locale} />
            </div>
          ) : status === "paid" ? (
            <div className="flex flex-col gap-0.5" data-testid="phase-paid">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-status-paid">
                <CheckCircleIcon />
                {phase.delivery.status === "delivered" ? t("paidReceived") : t("paidOnly")}
              </p>
              {phase.delivery.deliveredOn && (
                <p className="pl-[22px] text-xs text-muted">{t("paidOn", { date: formatIsoDate(phase.delivery.deliveredOn, locale) })}</p>
              )}
            </div>
          ) : status === "processing" ? (
            <p className="flex items-center gap-2 text-sm font-medium text-status-processing" role="status">
              <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
              {t("processing")}
            </p>
          ) : (
            <p
              className={cx(
                "flex items-center gap-1.5 text-sm",
                status === "upcoming" ? "font-medium text-status-upcoming" : "text-muted",
              )}
              data-testid="pay-on-visit"
            >
              <ClockIcon className="shrink-0" />
              {t("payOnVisit", { date: formatIsoDate(phase.payment.dueDate, locale) })}
            </p>
          )}
        </footer>
      </Card>
    </Ripple>
    </div>
  );
}

/** Keeps the "(20 €–2.000 €)" range on one line when the badge wraps. */
function FitText({ text }: { text: string }) {
  const i = text.indexOf(" (");
  if (i < 0) return <span>{text}</span>;
  return (
    <span>
      {text.slice(0, i)} <span className="whitespace-nowrap">{text.slice(i + 1)}</span>
    </span>
  );
}
