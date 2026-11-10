"use client";
/**
 * OWNED BY WP-07. Plain-language diff after a dentist edit:
 *   "Fase 2: 1.500,00 € → 1.950,00 € · sigue dentro del rango de Paga en 3 · fases 3–4 se mueven 4 semanas"
 * plus `explanation.rendered` and a per-phase before/after table. Amounts and dates are the
 * engine's (PlanDiff); the UI only formats them.
 */
import type { EditPlanResponse, FitBand, Locale, PhaseDiff } from "@/contracts";
import { Reveal } from "@/components/motion";
import { daysBetween, formatIsoDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { Badge, cx, ModeBadge } from "@/lib/ui";
import { FIT_LABEL, FIT_TONE, Icon, spanText, type ClinicT } from "./shared";

export interface DiffPanelProps {
  result: EditPlanResponse;
  locale: Locale;
  t: ClinicT;
  onDismiss?: () => void;
}

/** "+450,00 €" / "−450,00 €" / "0,00 €". */
export function signedCents(delta: number, locale: Locale): string {
  if (delta > 0) return `+${formatCents(delta, locale)}`;
  if (delta < 0) return `−${formatCents(-delta, locale)}`;
  return formatCents(0, locale);
}

function fitText(before: FitBand, after: FitBand, t: ClinicT): string {
  if (after === "PAY_IN_3") return before === "PAY_IN_3" ? t("diffFitStill") : t("diffFitNow");
  return t("diffFitOut", { band: t(FIT_LABEL[after]) });
}

/** "3–4" for consecutive phase numbers, "2, 4" otherwise. */
function phaseList(ns: number[]): string {
  const sorted = [...ns].sort((a, b) => a - b);
  const consecutive = sorted.every((n, i) => i === 0 || n === sorted[i - 1]! + 1);
  return consecutive && sorted.length > 1 ? `${sorted[0]}–${sorted[sorted.length - 1]}` : sorted.join(", ");
}

/** Group date-only changes by shift so "fases 3–4 se mueven 4 semanas" reads as one clause. */
function movedClauses(phases: PhaseDiff[], t: ClinicT): string[] {
  const groups = new Map<number, number[]>();
  for (const p of phases) {
    if (p.startBefore === p.startAfter) continue;
    const d = daysBetween(p.startBefore, p.startAfter);
    groups.set(d, [...(groups.get(d) ?? []), p.n]);
  }
  return [...groups.entries()].map(([days, ns]) => {
    const many = ns.length > 1;
    const subject = many ? t("diffSubjectMany", { list: phaseList(ns) }) : t("diffSubjectOne", { n: ns[0]! });
    const shift = spanText(days, t);
    const verb =
      days > 0
        ? many
          ? t("diffMoveLaterMany", { shift })
          : t("diffMoveLaterOne", { shift })
        : many
          ? t("diffMoveEarlierMany", { shift })
          : t("diffMoveEarlierOne", { shift });
    return `${subject} ${verb}`;
  });
}

export function diffHeadline(result: EditPlanResponse, locale: Locale, t: ClinicT): string {
  const { diff } = result;
  const parts: string[] = [];
  for (const p of diff.phases) {
    if (p.deltaCents === 0 && p.fitBefore === p.fitAfter) continue;
    parts.push(
      `${t("diffPhaseLine", { n: p.n, from: formatCents(p.amountBeforeCents, locale), to: formatCents(p.amountAfterCents, locale) })} · ${fitText(p.fitBefore, p.fitAfter, t)}`,
    );
  }
  const moved = movedClauses(
    diff.phases.filter((p) => p.deltaCents === 0),
    t,
  );
  parts.push(...moved);
  if (parts.length === 0) parts.push(t("diffNoDateChange"));
  return parts.join(" · ");
}

export function DiffPanel({ result, locale, t, onDismiss }: DiffPanelProps) {
  const { diff, explanation } = result;
  const added = diff.phases.flatMap((p) => p.addedLines.map((l) => ({ n: p.n, l })));
  const removed = diff.phases.flatMap((p) => p.removedLines.map((l) => ({ n: p.n, l })));
  return (
    <Reveal>
      <section
        data-testid="diff-panel"
        aria-label={t("diffTitle")}
        className="flex flex-col gap-4 rounded-[var(--ppp-radius)] border border-primary/25 bg-surface p-5 shadow-[var(--ppp-shadow)]"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-ink">{t("diffTitle")}</h3>
            <Badge tone={diff.totalDeltaCents === 0 ? "neutral" : "primary"} data-testid="diff-total-delta" className="tabular-nums">
              {signedCents(diff.totalDeltaCents, locale)}
            </Badge>
            <span data-testid="diff-total" className="text-xs tabular-nums text-muted">
              {t("diffTotalLine", { from: formatCents(diff.totalBeforeCents, locale), to: formatCents(diff.totalAfterCents, locale) })} · v
              {diff.fromVersion} → v{diff.toVersion}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {explanation && (
              <ModeBadge mode={explanation.source === "live" ? "live" : "cached"} what={t("diffExplanationWhat")} locale={locale} />
            )}
            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                aria-label={t("diffDismiss")}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-ink"
              >
                <Icon.X width={14} height={14} />
              </button>
            )}
          </div>
        </div>

        <p data-testid="diff-headline" className="text-[15px] font-medium leading-snug text-ink">
          {diffHeadline(result, locale, t)}
        </p>
        {explanation && (
          <p data-testid="diff-explanation" className="rounded-[var(--ppp-radius-sm)] bg-surface-2/70 px-3 py-2 text-sm leading-snug text-ink">
            {explanation.rendered[locale]}
          </p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="text-left text-[11px] font-medium uppercase tracking-wide text-muted">
                <th scope="col" className="py-1.5 pr-3 font-medium">{t("diffColPhase")}</th>
                <th scope="col" className="py-1.5 pr-3 font-medium">{t("diffColAmount")}</th>
                <th scope="col" className="py-1.5 pr-3 font-medium">{t("diffColFit")}</th>
                <th scope="col" className="py-1.5 font-medium">{t("diffColVisit")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {diff.phases.map((p) => {
                const moved = p.startBefore !== p.startAfter;
                return (
                  <tr key={p.phaseId} data-testid={`diff-row-${p.phaseId}`} className="align-top">
                    <td className="py-2 pr-3 font-medium text-ink">{t("phaseLabel", { n: p.n })}</td>
                    <td className="py-2 pr-3 tabular-nums">
                      {p.deltaCents === 0 ? (
                        <span className="text-muted">{formatCents(p.amountAfterCents, locale)}</span>
                      ) : (
                        <span className="flex flex-wrap items-center gap-x-2">
                          <span className="text-muted line-through decoration-muted/60">{formatCents(p.amountBeforeCents, locale)}</span>
                          <Icon.Arrow width={12} height={12} className="text-muted" />
                          <span className="font-semibold text-ink">{formatCents(p.amountAfterCents, locale)}</span>
                          <span className={cx("text-xs font-medium", p.deltaCents > 0 ? "text-primary-strong" : "text-status-overdue")}>
                            {signedCents(p.deltaCents, locale)}
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-3">
                      <span className="flex flex-wrap items-center gap-1">
                        {p.fitBefore !== p.fitAfter && (
                          <>
                            <Badge tone="neutral">{t(FIT_LABEL[p.fitBefore])}</Badge>
                            <Icon.Arrow width={12} height={12} className="text-muted" />
                          </>
                        )}
                        <Badge tone={FIT_TONE[p.fitAfter]}>{t(FIT_LABEL[p.fitAfter])}</Badge>
                      </span>
                    </td>
                    <td className="py-2 tabular-nums">
                      {moved ? (
                        <span className="flex flex-wrap items-center gap-x-2">
                          <span className="text-muted line-through decoration-muted/60">{formatIsoDate(p.startBefore, locale)}</span>
                          <Icon.Arrow width={12} height={12} className="text-muted" />
                          <span className="font-medium text-ink">{formatIsoDate(p.startAfter, locale)}</span>
                        </span>
                      ) : (
                        <span className="text-muted">{formatIsoDate(p.startAfter, locale)}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {(added.length > 0 || removed.length > 0) && (
          <ul className="flex flex-col gap-1 text-sm">
            {added.map(({ n, l }) => (
              <li key={`a-${l.id}`} className="flex items-start gap-2 text-ink">
                <Icon.Plus width={14} height={14} className="mt-0.5 text-primary-strong" />
                <span>
                  {t("diffAdded", { line: l.description })} <span className="text-muted">· {t("phaseLabel", { n })} · {formatCents(l.totalCents, locale)}</span>
                </span>
              </li>
            ))}
            {removed.map(({ n, l }) => (
              <li key={`r-${l.id}`} className="flex items-start gap-2 text-ink">
                <Icon.Trash width={14} height={14} className="mt-0.5 text-status-overdue" />
                <span>
                  {t("diffRemoved", { line: l.description })} <span className="text-muted">· {t("phaseLabel", { n })} · {formatCents(l.totalCents, locale)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}

        <p className="flex items-start gap-2 border-t border-border pt-3 text-xs text-muted">
          <Icon.Spark width={14} height={14} className="mt-px shrink-0 text-primary-strong" />
          {t("diffAgentNote")}
        </p>
      </section>
    </Reveal>
  );
}
