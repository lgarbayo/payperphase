"use client";
/**
 * OWNED BY WP-06. Approved-note cards grouped by phase. Only notes in `plan.approvedNotes` are shown
 * (and only those the server sent for the patient view). Each card carries "Aprobado por Dra. …".
 * Payment and referral notes, and approved notes no phase references, go in a general group.
 */
import type { ApprovedNoteRef, ClinicalNote, Locale, NoteId, Phase, Plan } from "@/contracts";
import { useT } from "@/i18n";
import { NoteCard } from "./NoteCard";

const GENERAL_KINDS = new Set<ClinicalNote["kind"]>(["PAYMENT", "REFERRAL"]);

export interface NoteGroups {
  byPhase: { phase: Phase; notes: ClinicalNote[] }[];
  general: ClinicalNote[];
  approvals: Map<NoteId, ApprovedNoteRef>;
}

/** Pure grouping (exported for tests). Each note appears once. */
export function groupApprovedNotes(plan: Plan, notes: readonly ClinicalNote[]): NoteGroups {
  const approvals = new Map(plan.approvedNotes.map((a) => [a.noteId, a] as const));
  const byId = new Map(notes.map((n) => [n.id, n] as const));
  const seen = new Set<NoteId>();
  const take = (id: NoteId): ClinicalNote | null => {
    const note = byId.get(id);
    if (!note || !approvals.has(id) || seen.has(id)) return null;
    seen.add(id);
    return note;
  };

  const byPhase = plan.phases
    .map((phase) => ({
      phase,
      notes: phase.noteIds
        .filter((id) => {
          const n = byId.get(id);
          return n !== undefined && !GENERAL_KINDS.has(n.kind);
        })
        .map(take)
        .filter((n): n is ClinicalNote => n !== null),
    }))
    .filter((g) => g.notes.length > 0);

  const general = plan.approvedNotes.map((a) => take(a.noteId)).filter((n): n is ClinicalNote => n !== null);
  return { byPhase, general, approvals };
}

export function ApprovedNotes({ plan, notes, locale }: { plan: Plan; notes: readonly ClinicalNote[]; locale: Locale }) {
  const t = useT("patient");
  const { byPhase, general, approvals } = groupApprovedNotes(plan, notes);
  const empty = byPhase.length === 0 && general.length === 0;

  return (
    <section id="notes" aria-labelledby="notes-title" className="scroll-mt-6" data-testid="approved-notes">
      <header className="mb-4">
        <h2 id="notes-title" className="text-lg font-semibold tracking-tight text-ink">
          {t("notesTitle")}
        </h2>
        <p className="mt-1 text-sm text-muted">{t("notesSubtitle")}</p>
      </header>

      {empty ? (
        <p className="rounded-[var(--ppp-radius)] border border-dashed border-border bg-surface px-4 py-6 text-center text-sm text-muted">
          {t("notesEmpty")}
        </p>
      ) : (
        <div className="flex flex-col gap-6">
          {byPhase.length > 0 && (
            <div className="grid gap-4 @2xl:grid-cols-2 @5xl:grid-cols-4">
              {byPhase.map(({ phase, notes: list }) => (
                <div key={phase.id} className="flex flex-col gap-3" data-testid={`notes-${phase.id}`}>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
                    {t("phaseN", { n: phase.n })} · <span className="normal-case tracking-normal">{phase.title[locale]}</span>
                  </h3>
                  {list.map((note) => (
                    <NoteCard key={note.id} note={note} approval={approvals.get(note.id)} locale={locale} />
                  ))}
                </div>
              ))}
            </div>
          )}
          {general.length > 0 && (
            <div className="flex flex-col gap-3" data-testid="notes-general">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">{t("notesGeneral")}</h3>
              <div className="grid gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3">
                {general.map((note) => (
                  <NoteCard key={note.id} note={note} approval={approvals.get(note.id)} locale={locale} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
