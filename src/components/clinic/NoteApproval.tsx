"use client";
/**
 * OWNED BY WP-07. Clinician note approval. The patient only ever sees notes ticked here, so
 * "Aprobar y enviar al paciente" stays disabled until every note on the plan is approved.
 */
import type { ClinicalNote, Locale, NoteId, Phase, Plan } from "@/contracts";
import { cx } from "@/lib/ui";
import { Icon, type ClinicT } from "./shared";

/** Kinds shown once, under "Notas generales", instead of under every phase. */
const GENERAL_KINDS = new Set<ClinicalNote["kind"]>(["PAYMENT", "REFERRAL"]);
/** Always offered so the patient chat can refer questions back to the clinic. */
const ALWAYS_GENERAL: NoteId[] = ["REFERRAL_ASK_CLINIC"];

export interface NoteGroups {
  byPhase: Record<string, ClinicalNote[]>;
  general: ClinicalNote[];
  /** Every note id to approve, in display order (phases first, then general). */
  allIds: NoteId[];
}

function phaseNoteIds(p: Phase): NoteId[] {
  const ids: NoteId[] = [...p.noteIds];
  for (const d of p.dependsOn) {
    ids.push(d.riskNoteId);
    if (d.deadlineNoteId) ids.push(d.deadlineNoteId);
  }
  return ids;
}

/** Splits a plan's notes into per-phase clinical notes and de-duplicated general notes. */
export function groupPlanNotes(plan: Plan, library: Partial<Record<NoteId, ClinicalNote>>): NoteGroups {
  const seen = new Set<NoteId>();
  const byPhase: Record<string, ClinicalNote[]> = {};
  const generalIds: NoteId[] = [];
  for (const p of plan.phases) {
    byPhase[p.id] = [];
    for (const id of phaseNoteIds(p)) {
      const note = library[id];
      if (!note || seen.has(id)) continue;
      seen.add(id);
      if (GENERAL_KINDS.has(note.kind)) generalIds.push(id);
      else byPhase[p.id]!.push(note);
    }
  }
  for (const id of ALWAYS_GENERAL) {
    if (!seen.has(id) && library[id]) {
      seen.add(id);
      generalIds.push(id);
    }
  }
  const general = generalIds.map((id) => library[id]!).filter(Boolean);
  const allIds = [...plan.phases.flatMap((p) => byPhase[p.id]!.map((n) => n.id)), ...general.map((n) => n.id)];
  return { byPhase, general, allIds };
}

export interface NoteApprovalProps {
  notes: ClinicalNote[];
  ticked: ReadonlySet<NoteId>;
  onToggle: (id: NoteId) => void;
  locale: Locale;
  t: ClinicT;
  readOnly?: boolean;
  approvedBy?: string;
  title?: string;
}

/** Checklist of notes (one checkbox per note, with its patient-facing text). */
export function NoteApproval({ notes, ticked, onToggle, locale, t, readOnly, approvedBy, title }: NoteApprovalProps) {
  if (notes.length === 0) return null;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{title ?? t("notesTitle")}</legend>
      {notes.map((note) => {
        const checked = ticked.has(note.id);
        return (
          <label
            key={note.id}
            data-testid={`note-${note.id}`}
            className={cx(
              "flex cursor-pointer items-start gap-3 rounded-[var(--ppp-radius-sm)] border px-3 py-2.5 transition-colors",
              checked ? "border-primary/30 bg-primary/5" : "border-border bg-surface hover:bg-surface-2/60",
              readOnly && "cursor-default",
            )}
          >
            <input
              type="checkbox"
              data-note-id={note.id}
              checked={checked}
              disabled={readOnly}
              onChange={() => onToggle(note.id)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--ppp-primary)]"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-ink">{note.title[locale]}</span>
              <span className="block text-sm leading-snug text-muted">{note.text[locale]}</span>
              {readOnly && checked && approvedBy && (
                <span className="mt-1 inline-flex items-center gap-1 text-xs text-status-paid">
                  <Icon.Check width={12} height={12} />
                  {t("noteApprovedBy", { name: approvedBy })}
                </span>
              )}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}

export interface NoteApprovalBarProps {
  total: number;
  done: number;
  onToggleAll: (approve: boolean) => void;
  t: ClinicT;
  readOnly?: boolean;
}

/** Master "Aprobar notas" checkbox with progress. */
export function NoteApprovalBar({ total, done, onToggleAll, t, readOnly }: NoteApprovalBarProps) {
  const all = total > 0 && done === total;
  const some = done > 0 && !all;
  return (
    <div
      data-testid="note-approval-bar"
      className={cx(
        "flex flex-col gap-2 rounded-[var(--ppp-radius)] border px-4 py-3 md:flex-row md:items-center md:justify-between",
        all ? "border-status-paid/30 bg-status-paid/5" : "border-status-upcoming/30 bg-status-upcoming/5",
      )}
    >
      <label className={cx("flex items-center gap-3", readOnly ? "cursor-default" : "cursor-pointer")}>
        <input
          type="checkbox"
          data-testid="approve-all-notes"
          checked={all}
          disabled={readOnly || total === 0}
          ref={(el) => {
            if (el) el.indeterminate = some;
          }}
          onChange={() => onToggleAll(!all)}
          className="h-4 w-4 accent-[var(--ppp-primary)]"
        />
        <span className="text-sm font-semibold text-ink">{t("approveAllNotes")}</span>
        <span className="text-sm tabular-nums text-muted">{t("notesProgress", { done, total })}</span>
      </label>
      <p className={cx("text-sm", all ? "text-status-paid" : "text-status-upcoming")}>
        {all ? t("notesReady") : t("notesRequired")}
      </p>
    </div>
  );
}
