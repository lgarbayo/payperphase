"use client";
/**
 * OWNED BY WP-07. Staggered extraction reveal: lines appear ~120 ms apart while the matching teeth
 * pulse on the odontogram (`highlight`) and gain marks (`marksFromLines`). The check bar lands when
 * every line is on screen. Amounts and checks are WP-03's; this component only displays them.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ExtractionResult, FdiTooth, Locale, QuoteLine } from "@/contracts";
import { Reveal } from "@/components/motion";
import { Odontogram, marksFromLines } from "@/components/odontogram/Odontogram";
import { formatIsoDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { Badge, cx, ModeBadge } from "@/lib/ui";
import { CheckBar } from "./CheckBar";
import { ISSUE_LABEL, prefersReducedMotion, ToothChip, type ClinicT } from "./shared";

export const REVEAL_STEP_MS = 120;
const PULSE_HOLD_MS = 650;

export interface ExtractionRevealProps {
  extraction: ExtractionResult;
  locale: Locale;
  t: ClinicT;
  /** Delay between lines. 0 (or reduced motion) shows everything at once. */
  stepMs?: number;
  onRevealComplete?: () => void;
  /** Rendered under the check bar once the reveal finishes (e.g. "Crear plan"). */
  footer?: ReactNode;
}

export function ExtractionReveal({
  extraction,
  locale,
  t,
  stepMs = REVEAL_STEP_MS,
  onRevealComplete,
  footer,
}: ExtractionRevealProps) {
  const lines = extraction.lines;
  const total = lines.length;
  const instant = stepMs <= 0 || prefersReducedMotion();
  const [count, setCount] = useState(() => (instant ? total : Math.min(1, total)));
  const [pulse, setPulse] = useState<FdiTooth[]>([]);
  const [hoverTeeth, setHoverTeeth] = useState<FdiTooth[] | null>(null);
  const [flash, setFlash] = useState(false);
  const doneRef = useRef(false);
  const completeRef = useRef(onRevealComplete);
  completeRef.current = onRevealComplete;

  // Drive the stagger: one more line every `stepMs`.
  useEffect(() => {
    doneRef.current = false;
    if (instant) {
      setCount(total);
      return;
    }
    let i = Math.min(1, total);
    setCount(i);
    const id = setInterval(() => {
      i += 1;
      setCount(Math.min(i, total));
      if (i >= total) clearInterval(id);
    }, stepMs);
    return () => clearInterval(id);
  }, [extraction, instant, stepMs, total]);

  // Pulse the teeth of the line that just appeared; let the last pulse fade out.
  useEffect(() => {
    if (instant || count === 0) return;
    setPulse(lines[count - 1]?.teeth ?? []);
    const id = setTimeout(() => setPulse([]), count >= total ? PULSE_HOLD_MS : stepMs + PULSE_HOLD_MS);
    return () => clearTimeout(id);
  }, [count, instant, lines, stepMs, total]);

  const revealed = count >= total;
  useEffect(() => {
    if (revealed && !doneRef.current) {
      doneRef.current = true;
      completeRef.current?.();
    }
  }, [revealed]);

  const visible = useMemo(() => lines.slice(0, count), [lines, count]);
  const marks = useMemo(() => marksFromLines(visible), [visible]);

  const invalidByLine = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const { lineId, tooth } of extraction.checks.invalidTeeth) m.set(lineId, [...(m.get(lineId) ?? []), tooth]);
    return m;
  }, [extraction.checks.invalidTeeth]);
  const reviewIds = useMemo(() => new Set(extraction.checks.toReviewLineIds), [extraction.checks.toReviewLineIds]);
  const isFlagged = useCallback(
    (l: QuoteLine) => reviewIds.has(l.id) || l.issues.length > 0 || invalidByLine.has(l.id),
    [invalidByLine, reviewIds],
  );

  const scrollToFlagged = useCallback(() => {
    const first = lines.find(isFlagged);
    setFlash(true);
    setTimeout(() => setFlash(false), 1800);
    if (!first) return;
    const go = () => {
      if (typeof document === "undefined") return;
      document.getElementById(`quote-line-${first.id}`)?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    };
    if (revealed) go();
    else {
      setCount(total);
      setTimeout(go, 0);
    }
  }, [isFlagged, lines, revealed, total]);

  return (
    <div data-testid="extraction-reveal" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <span className="font-medium text-ink">{t("quoteRef", { ref: extraction.quoteRef })}</span>
            {extraction.quoteDate && <span>· {t("quoteDate", { date: formatIsoDate(extraction.quoteDate, locale) })}</span>}
          </p>
          <p className="truncate text-sm text-muted">
            {extraction.clinicName} · {extraction.dentistName} · {t("patientLabel")}: {extraction.patientName}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {extraction.source === "live" && extraction.model && (
            <Badge tone="primary">{t("modelLabel", { model: extraction.model })}</Badge>
          )}
          {extraction.source !== "live" && <ModeBadge mode="cached" what={t("extractionWhat")} locale={locale} />}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <div className="overflow-hidden rounded-[var(--ppp-radius)] border border-border bg-surface shadow-[var(--ppp-shadow)]">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <h3 className="text-sm font-semibold text-ink">{t("linesTitle")}</h3>
            <span className="text-xs tabular-nums text-muted" aria-live="polite">
              {t("linesProgress", { done: count, total })}
            </span>
          </div>
          <div
            aria-hidden
            className="hidden grid-cols-[2rem_minmax(0,1fr)_7.5rem_3rem_6rem_6.5rem] gap-3 border-b border-border bg-surface-2/60 px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-muted md:grid"
          >
            <span>{t("colLine")}</span>
            <span>{t("colDescription")}</span>
            <span>{t("colTeeth")}</span>
            <span className="text-right">{t("colQty")}</span>
            <span className="text-right">{t("colUnit")}</span>
            <span className="text-right">{t("colTotal")}</span>
          </div>
          <ul role="list" data-testid="quote-lines" className="divide-y divide-border">
            {visible.map((line) => (
              <li key={line.id}>
                <Reveal>
                  <LineRow
                    line={line}
                    locale={locale}
                    t={t}
                    invalidTeeth={invalidByLine.get(line.id) ?? []}
                    flagged={isFlagged(line)}
                    flash={flash}
                    onHover={setHoverTeeth}
                  />
                </Reveal>
              </li>
            ))}
            {!revealed &&
              Array.from({ length: Math.min(3, total - count) }, (_, i) => (
                <li key={`ghost-${i}`} aria-hidden className="px-4 py-3.5">
                  <div className="h-3 animate-pulse rounded-full bg-surface-2" style={{ width: `${80 - i * 18}%` }} />
                </li>
              ))}
          </ul>
        </div>

        <aside className="flex flex-col gap-2 rounded-[var(--ppp-radius)] border border-border bg-surface p-4 shadow-[var(--ppp-shadow)] lg:sticky lg:top-4 lg:self-start">
          <h3 className="text-sm font-semibold text-ink">{t("odontogramTitle")}</h3>
          <p className="text-xs text-muted">{t("odontogramHint")}</p>
          <div className="mt-2">
            <Odontogram marks={marks} highlight={hoverTeeth ?? pulse} revealStaggerMs={0} locale={locale} size="md" />
          </div>
        </aside>
      </div>

      {revealed ? (
        <Reveal>
          <div className="flex flex-col gap-3">
            <CheckBar checks={extraction.checks} locale={locale} t={t} onReviewClick={scrollToFlagged} />
            {footer}
          </div>
        </Reveal>
      ) : (
        <div
          role="status"
          className="flex items-center gap-2 rounded-[var(--ppp-radius)] border border-dashed border-border px-4 py-3 text-sm text-muted"
        >
          <span aria-hidden className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" />
          {t("checkRunning")}
        </div>
      )}
    </div>
  );
}

function ConfidenceDot({ value, t }: { value: number; t: ClinicT }) {
  const pct = Math.round(value * 100);
  const color =
    value >= 0.85 ? "var(--ppp-status-paid)" : value >= 0.6 ? "var(--ppp-status-upcoming)" : "var(--ppp-status-overdue)";
  const label = t("confidence", { pct });
  return (
    <span
      data-testid="confidence-dot"
      data-confidence={pct}
      role="img"
      aria-label={label}
      title={label}
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-surface"
      style={{ backgroundColor: color }}
    />
  );
}

function LineRow({
  line,
  locale,
  t,
  invalidTeeth,
  flagged,
  flash,
  onHover,
}: {
  line: QuoteLine;
  locale: Locale;
  t: ClinicT;
  invalidTeeth: number[];
  flagged: boolean;
  flash: boolean;
  onHover: (teeth: FdiTooth[] | null) => void;
}) {
  const issues = line.issues.filter((i) => i !== "INVALID_TOOTH" || invalidTeeth.length === 0);
  return (
    <div
      id={`quote-line-${line.id}`}
      data-testid="quote-line"
      data-line-id={line.id}
      data-flagged={flagged ? "true" : "false"}
      onMouseEnter={() => line.teeth.length > 0 && onHover(line.teeth)}
      onMouseLeave={() => onHover(null)}
      className={cx(
        "grid scroll-mt-24 grid-cols-[2rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 px-4 py-3 transition-colors md:grid-cols-[2rem_minmax(0,1fr)_7.5rem_3rem_6rem_6.5rem] md:items-center",
        flagged && "bg-status-upcoming/5",
        flagged && flash && "bg-status-upcoming/15 ring-2 ring-inset ring-status-upcoming/60",
        !flagged && "hover:bg-surface-2/50",
      )}
    >
      <span className="text-xs font-medium tabular-nums text-muted">{line.lineNo}</span>

      <div className="min-w-0">
        <div className="flex items-start gap-2">
          <ConfidenceDot value={line.confidence} t={t} />
          <p className="-mt-1 text-sm leading-snug text-ink">{line.description}</p>
        </div>
        {(issues.length > 0 || invalidTeeth.length > 0) && (
          <div className="mt-1.5 flex flex-wrap gap-1.5 pl-[18px]">
            {invalidTeeth.length > 0 && (
              <Badge tone="overdue" data-issue="INVALID_TOOTH">
                {t("issueInvalidTooth")}
              </Badge>
            )}
            {issues.map((issue) => (
              <Badge key={issue} tone={issue === "LOW_CONFIDENCE" ? "upcoming" : "overdue"} data-issue={issue}>
                {t(ISSUE_LABEL[issue])}
              </Badge>
            ))}
          </div>
        )}
      </div>

      <div className="col-start-2 flex flex-wrap gap-1 md:col-start-auto">
        {line.teeth.map((tooth) => (
          <ToothChip key={tooth} tooth={tooth} category={line.category} />
        ))}
        {invalidTeeth.map((tooth) => (
          <ToothChip key={`x${tooth}`} tooth={tooth} invalid title={t("invalidTooth", { tooth })} />
        ))}
        {line.teeth.length === 0 && invalidTeeth.length === 0 && <span className="text-xs text-muted md:hidden">—</span>}
      </div>

      <div className="col-start-2 flex items-baseline justify-between gap-3 text-sm tabular-nums md:contents">
        <span className="text-muted md:text-right">× {line.qty}</span>
        <span className="text-muted md:text-right">{formatCents(line.unitPriceCents, locale)}</span>
        <span className="font-medium text-ink md:text-right">{formatCents(line.totalCents, locale)}</span>
      </div>
    </div>
  );
}
