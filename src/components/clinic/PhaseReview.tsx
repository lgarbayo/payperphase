"use client";
/**
 * OWNED BY WP-07. Phase review cards: amount, Pay-in-3 fit badge, visit date, lines, the
 * approved-note checklist and (optional, cut-able) wording drafts. Everything is engine output.
 */
import type { ClinicalNote, Locale, NoteId, Phase, Plan, PhaseWordingDraft, QuoteLine } from "@/contracts";
import { Stagger } from "@/components/motion";
import { formatIsoDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { Badge, Card, ModeBadge, StatusPill } from "@/lib/ui";
import { NoteApproval, type NoteGroups } from "./NoteApproval";
import { FIT_LABEL, FIT_TONE, Icon, spanText, ToothChip, type ClinicT } from "./shared";

export type DraftsState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; source: "live" | "cached"; byPhase: Record<string, PhaseWordingDraft> };

export interface PhaseReviewProps {
  plan: Plan;
  groups: NoteGroups;
  ticked: ReadonlySet<NoteId>;
  onToggleNote: (id: NoteId) => void;
  drafts: DraftsState;
  usedDrafts: ReadonlySet<string>;
  onToggleDraft: (phaseId: string) => void;
  locale: Locale;
  t: ClinicT;
  /** Approved plans are shown read-only (ticks reflect `plan.approvedNotes`). */
  readOnly: boolean;
}

export function PhaseReview(props: PhaseReviewProps) {
  const { plan, groups, ticked, onToggleNote, locale, t, readOnly } = props;
  const lineById = new Map(plan.lines.map((l) => [l.id, l]));
  return (
    <div className="flex flex-col gap-4">
      <div
        data-testid="phase-review"
        className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[repeat(2,minmax(0,1fr))]"
      >
        <Stagger stepMs={90}>
          {plan.phases.map((phase) => (
            <PhaseCard
              key={phase.id}
              {...props}
              phase={phase}
              lines={phase.lineIds.map((id) => lineById.get(id)).filter((l): l is QuoteLine => !!l)}
              notes={groups.byPhase[phase.id] ?? []}
            />
          ))}
        </Stagger>
      </div>
      {groups.general.length > 0 && (
        <Card className="p-4">
          <NoteApproval
            notes={groups.general}
            ticked={ticked}
            onToggle={onToggleNote}
            locale={locale}
            t={t}
            readOnly={readOnly}
            approvedBy={plan.approvedBy}
            title={t("generalNotes")}
          />
        </Card>
      )}
    </div>
  );
}

function PhaseCard({
  plan,
  phase,
  lines,
  notes,
  ticked,
  onToggleNote,
  drafts,
  usedDrafts,
  onToggleDraft,
  locale,
  t,
  readOnly,
}: PhaseReviewProps & { phase: Phase; lines: QuoteLine[]; notes: ClinicalNote[] }) {
  const dep = phase.dependsOn[0];
  const predecessor = dep ? plan.phases.find((p) => p.id === dep.phaseId) : undefined;
  const draft = drafts.status === "ready" ? drafts.byPhase[phase.id] : undefined;
  const approvedSummary = readOnly ? phase.summary?.[locale] : undefined;
  return (
    <Card data-testid={`phase-review-${phase.id}`} className="flex min-w-0 flex-col gap-4 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary-strong">
            {t("phaseLabel", { n: phase.n })}
          </p>
          <h3 className="mt-0.5 font-semibold leading-snug text-ink">{phase.title[locale]}</h3>
        </div>
        <p data-testid={`phase-amount-${phase.id}`} className="shrink-0 text-xl font-semibold tabular-nums text-ink">
          {formatCents(phase.amountCents, locale)}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={FIT_TONE[phase.fit.band]} data-fit={phase.fit.band}>
          {phase.fit.band === "PAY_IN_3" && <Icon.Check width={12} height={12} />}
          {t(FIT_LABEL[phase.fit.band])}
        </Badge>
        <Badge tone="neutral">{t("visitDate", { date: formatIsoDate(phase.payment.dueDate, locale) })}</Badge>
        {plan.status !== "draft" && <StatusPill status={phase.payment.status} locale={locale} />}
      </div>

      {dep && predecessor && (
        <p className="flex items-center gap-2 text-xs text-muted">
          <span
            aria-hidden
            className="inline-block h-2 w-5 rounded-sm bg-[repeating-linear-gradient(135deg,var(--ppp-healing)_0_3px,transparent_3px_6px)]"
          />
          {t("afterPhase", { n: predecessor.n, min: spanText(dep.minLagDays, t) })}
        </p>
      )}

      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">{t("linesInPhase")}</p>
        <ul className="flex flex-col divide-y divide-border rounded-[var(--ppp-radius-sm)] border border-border">
          {lines.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate text-ink" title={l.description}>
                  {l.description}
                </span>
                {l.teeth.length > 0 && (
                  <span className="mt-1 flex flex-wrap gap-1">
                    {l.teeth.map((tooth) => (
                      <ToothChip key={tooth} tooth={tooth} category={l.category} />
                    ))}
                  </span>
                )}
              </span>
              <span className="shrink-0 tabular-nums text-muted">{formatCents(l.totalCents, locale)}</span>
            </li>
          ))}
        </ul>
      </div>

      <NoteApproval
        notes={notes}
        ticked={ticked}
        onToggle={onToggleNote}
        locale={locale}
        t={t}
        readOnly={readOnly}
        approvedBy={plan.approvedBy}
      />

      {approvedSummary ? (
        <blockquote className="rounded-[var(--ppp-radius-sm)] border-l-2 border-primary bg-primary/5 px-3 py-2 text-sm text-ink">
          {approvedSummary}
        </blockquote>
      ) : (
        !readOnly && (
          <WordingDraft
            phaseId={phase.id}
            draft={draft}
            drafts={drafts}
            used={usedDrafts.has(phase.id)}
            onToggle={onToggleDraft}
            locale={locale}
            t={t}
          />
        )
      )}
    </Card>
  );
}

function WordingDraft({
  phaseId,
  draft,
  drafts,
  used,
  onToggle,
  locale,
  t,
}: {
  phaseId: string;
  draft: PhaseWordingDraft | undefined;
  drafts: DraftsState;
  used: boolean;
  onToggle: (phaseId: string) => void;
  locale: Locale;
  t: ClinicT;
}) {
  if (drafts.status === "idle") return null;
  return (
    <div className="flex flex-col gap-2 rounded-[var(--ppp-radius-sm)] border border-dashed border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          {t("wordingTitle")} <span className="font-normal normal-case">· {t("wordingOptional")}</span>
        </p>
        {drafts.status === "ready" && (
          <ModeBadge mode={drafts.source === "live" ? "live" : "cached"} what={t("wordingWhat")} locale={locale} />
        )}
      </div>
      {drafts.status === "loading" && (
        <div role="status" className="flex flex-col gap-1.5">
          <span className="sr-only">{t("wordingLoading")}</span>
          <div aria-hidden className="h-3 w-11/12 animate-pulse rounded-full bg-surface-2" />
          <div aria-hidden className="h-3 w-2/3 animate-pulse rounded-full bg-surface-2" />
        </div>
      )}
      {drafts.status === "error" && <p className="text-xs text-muted">{t("wordingError")}</p>}
      {draft && (
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            data-testid={`use-draft-${phaseId}`}
            checked={used}
            onChange={() => onToggle(phaseId)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--ppp-primary)]"
          />
          <span className="min-w-0">
            <span className="block text-sm leading-snug text-ink">{draft.rendered[locale]}</span>
            <span className="text-xs text-muted">{t("wordingUse")}</span>
          </span>
        </label>
      )}
    </div>
  );
}
