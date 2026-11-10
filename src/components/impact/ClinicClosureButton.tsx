"use client";
/**
 * OWNED BY WP-12. "What if the clinic closes today?" — linked loan vs PayPerPhase counters,
 * labelled illustrative, citing dsca.gob.es. Numbers come from engine.closureStressTest() (props);
 * nothing here computes money.
 *
 * The button opens a modal dialog (role="dialog", aria-modal, focus moves in and is trapped,
 * Esc / backdrop / close button close it, focus returns to the button).
 */
import { motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { DSCA_SOURCE_URL, type ClosureStressTest, type LocalizedText, type Locale } from "@/contracts";
import { CountUp, Reveal } from "@/components/motion";
import { formatIsoDate } from "@/lib/dates";
import { Badge, cx } from "@/lib/ui";
import { AlertIcon, ArrowRightIcon, CheckIcon, ClinicClosedIcon, CloseIcon, ExternalIcon, InfoIcon } from "./icons";
import { impactT, money, phaseNumber, toneFor, type Tone } from "./shared";

/** Phase id → title (already localized, or {es,en}). Missing ids render as "Fase n". */
export type PhaseTitles = Readonly<Record<string, string | LocalizedText | undefined>>;

export interface ClinicClosureButtonProps {
  stress: ClosureStressTest;
  locale: Locale;
  /** Optional titles for the undelivered-phase list (e.g. from plan.phases). */
  phaseTitles?: PhaseTitles;
  /** Open on mount (Director Mode beat B6). */
  defaultOpen?: boolean;
}

const COUNTER_MS = 1000;

export function ClinicClosureButton({ stress, locale, phaseTitles, defaultOpen = false }: ClinicClosureButtonProps) {
  const t = impactT(locale);
  const [open, setOpen] = useState(defaultOpen);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const panelId = useId();

  useEffect(() => setMounted(true), []);

  // Return focus to the trigger when the dialog closes.
  useEffect(() => {
    if (wasOpen.current && !open) triggerRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-testid="closure-button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen(true)}
        className={cx(
          "group inline-flex w-full items-center gap-4 rounded-[var(--ppp-radius)] border border-border bg-surface px-5 py-4 text-left",
          "shadow-[var(--ppp-shadow)] transition-colors hover:border-status-overdue/40 hover:bg-surface-2 sm:w-auto",
        )}
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-status-overdue/10 text-status-overdue">
          <ClinicClosedIcon className="h-5 w-5" />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="text-base font-semibold text-ink">{t("closureButton")}</span>
          <span className="text-xs text-muted">{t("closureButtonHint")}</span>
        </span>
        <ArrowRightIcon className="ml-auto h-4 w-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" />
      </button>
      {open && mounted
        ? createPortal(
            <ClosurePanel id={panelId} stress={stress} locale={locale} phaseTitles={phaseTitles} onClose={close} />,
            document.body,
          )
        : null}
    </>
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function ClosurePanel({
  id,
  stress,
  locale,
  phaseTitles,
  onClose,
}: {
  id: string;
  stress: ClosureStressTest;
  locale: Locale;
  phaseTitles?: PhaseTitles;
  onClose: () => void;
}) {
  const t = impactT(locale);
  const reduce = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();

  // Move focus into the dialog, lock page scroll, close on Esc from anywhere.
  useEffect(() => {
    dialogRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // Keep Tab inside the dialog.
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab" || !dialogRef.current) return;
    const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0]!;
    const last = items[items.length - 1]!;
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === dialogRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const { linkedLoan, payPerPhase } = stress;
  const undelivered = stress.undeliveredPhaseIds.map((phaseId, i) => {
    const n = phaseNumber(phaseId, i + 1);
    const raw = phaseTitles?.[phaseId];
    const title = typeof raw === "string" ? raw : raw?.[locale];
    return { phaseId, label: title ? t("closurePhaseWithTitle", { n, title }) : t("closurePhase", { n }) };
  });

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm"
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        ref={dialogRef}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        data-testid="closure-panel"
        onKeyDown={onKeyDown}
        initial={reduce ? false : { opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.24, ease: "easeOut" }}
        // The container only receives programmatic focus (so screen readers announce the title);
        // it is not a control, so no focus ring on camera.
        style={{ outline: "none" }}
        className="relative max-h-[calc(100vh-2rem)] w-full max-w-5xl overflow-y-auto rounded-[var(--ppp-radius)] bg-surface p-6 shadow-2xl sm:p-8"
      >
        <button
          type="button"
          data-testid="closure-close"
          onClick={onClose}
          aria-label={t("closureClose")}
          className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <CloseIcon className="h-5 w-5" />
        </button>

        <header>
          <div className="flex flex-wrap items-center gap-2 pr-10">
            <Badge tone="upcoming" data-testid="closure-illustrative" className="uppercase tracking-wide">
              <InfoIcon className="h-3.5 w-3.5" />
              {t("closureIllustrativeBadge")}
            </Badge>
            <Badge tone="neutral" className="font-mono">
              {t("closureAsOf", { date: formatIsoDate(stress.asOf, locale) })}
            </Badge>
          </div>
          <h2 id={titleId} className="mt-4 pr-10 text-3xl font-semibold tracking-tight text-ink">
            {t("closureTitle")}
          </h2>
          <div id={descId} className="mt-3 space-y-1 text-base leading-relaxed text-muted">
            <p>{t("closureLine1")}</p>
            <p>{t("closureLine2")}</p>
          </div>
        </header>

        <div role="group" aria-label={t("closureCompareLabel")} className="mt-6 grid gap-4 md:grid-cols-2">
          <Counter
            testId="closure-loan"
            label={t("closureLoanLabel")}
            lead={t("closureLoanLead")}
            tail={t("closureLoanTail")}
            cents={linkedLoan.owedForUndeliveredCents}
            locale={locale}
            detail={t("closureLoanDetail", {
              financed: money(linkedLoan.financedCents, locale),
              months: linkedLoan.months,
              monthly: money(linkedLoan.monthlyCents, locale),
            })}
          />
          <Counter
            testId="closure-ppp"
            label={t("closurePppLabel")}
            lead={t("closurePppLead")}
            tail={t("closurePppTail")}
            cents={payPerPhase.owedForUndeliveredCents}
            locale={locale}
            detail={t("closurePppDetail", {
              paid: money(payPerPhase.paidCents, locale),
              delivered: money(payPerPhase.deliveredCents, locale),
            })}
          />
        </div>

        <Reveal delayMs={reduce ? 0 : 600}>
          <section className="mt-6" aria-labelledby={`${titleId}-phases`}>
            <h3 id={`${titleId}-phases`} className="text-sm font-medium text-ink">
              {t("closureUndeliveredTitle")}
            </h3>
            {undelivered.length > 0 ? (
              <ul data-testid="closure-undelivered" className="mt-2 flex flex-wrap gap-2">
                {undelivered.map((p) => (
                  <li
                    key={p.phaseId}
                    data-phase={p.phaseId}
                    className="inline-flex items-center gap-2 rounded-full border border-dashed border-status-scheduled bg-surface-2 px-3 py-1 text-sm text-ink"
                  >
                    <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full border-2 border-status-scheduled" />
                    {p.label}
                  </li>
                ))}
              </ul>
            ) : (
              <p data-testid="closure-undelivered-empty" className="mt-2 text-sm text-muted">
                {t("closureNoUndelivered")}
              </p>
            )}
          </section>

          <footer className="mt-6 space-y-1 border-t border-border pt-4 text-sm text-muted">
            <p data-testid="closure-note">{t("closureNote", { months: linkedLoan.months })}</p>
            <p>
              {t("closureSourcePrefix")}{" "}
              <a
                href={DSCA_SOURCE_URL}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="closure-source"
                className="inline-flex items-center gap-1 font-medium text-primary-strong underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
              >
                {t("closureSource")}
                <ExternalIcon className="h-3.5 w-3.5" />
                <span className="sr-only">{t("closureSourceNewTab")}</span>
              </a>
            </p>
          </footer>
        </Reveal>
      </motion.div>
    </motion.div>
  );
}

function Counter({
  testId,
  label,
  lead,
  tail,
  detail,
  cents,
  locale,
}: {
  testId: string;
  label: string;
  lead: string;
  tail: string;
  detail: string;
  cents: number;
  locale: Locale;
}) {
  const tone: Tone = toneFor(cents);
  const format = useCallback((v: number) => money(Math.round(v), locale), [locale]);
  return (
    <section
      data-testid={testId}
      data-tone={tone}
      className={cx(
        "flex flex-col rounded-[var(--ppp-radius)] border p-6",
        tone === "alert" ? "border-status-overdue/30 bg-status-overdue/5" : "border-status-paid/30 bg-status-paid/5",
      )}
    >
      <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink">
        <span
          className={cx(
            "flex h-6 w-6 items-center justify-center rounded-full text-white",
            tone === "alert" ? "bg-status-overdue" : "bg-status-paid",
          )}
        >
          {tone === "alert" ? <AlertIcon className="h-3.5 w-3.5" /> : <CheckIcon className="h-3.5 w-3.5" />}
        </span>
        {label}
      </h3>
      <p className="mt-5 text-lg text-ink">{lead}</p>
      <p
        data-testid={`${testId}-owed`}
        data-cents={cents}
        className={cx(
          "mt-1 text-5xl font-semibold leading-none tracking-tight tabular-nums lg:text-6xl",
          tone === "alert" ? "text-status-overdue" : "text-status-paid",
        )}
      >
        <span aria-hidden="true">
          <CountUp value={cents} format={format} durationMs={COUNTER_MS} />
        </span>
        <span className="sr-only">{money(cents, locale)}</span>
      </p>
      <p className="mt-3 text-lg text-ink">{tail}</p>
      <div className="mt-auto pt-5">
        <p className="border-t border-border/70 pt-3 text-sm text-muted">{detail}</p>
      </div>
    </section>
  );
}
