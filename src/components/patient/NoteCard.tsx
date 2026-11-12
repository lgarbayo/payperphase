"use client";
/**
 * OWNED BY WP-06. A clinician-approved note as a card, with its "Aprobado por Dra. …" chip.
 * Used for the approved-note list, the snap-back card (illegal drag) and deadline warnings.
 * Patients only ever see notes the clinic approved for their plan (Plan.approvedNotes).
 */
import type { ReactNode } from "react";
import type { ApprovedNoteRef, ClinicalNote, Locale } from "@/contracts";
import { useT } from "@/i18n";
import { Badge, cx } from "@/lib/ui";
import { AlertIcon, CheckIcon, CloseIcon, InfoIcon } from "./icons";

export type NoteTone = "default" | "warning" | "danger";

export interface NoteCardProps {
  note: ClinicalNote;
  /** The approval record for this note (gives the "Approved by" chip). */
  approval?: ApprovedNoteRef;
  locale: Locale;
  tone?: NoteTone;
  /** Small kicker above the note title, e.g. "Este cambio no es posible". */
  kicker?: string;
  /** Extra chip, e.g. "Fase 2 · Colocación de implantes". */
  phaseLabel?: string;
  /** Extra line under the text (e.g. earliest legal date), already formatted. */
  extra?: ReactNode;
  onDismiss?: () => void;
  /** role="alert" for feedback cards that appear after an action. */
  alert?: boolean;
  className?: string;
}

const toneStyles: Record<NoteTone, { border: string; icon: string; bg: string }> = {
  default: { border: "border-border", icon: "text-primary", bg: "bg-surface" },
  warning: { border: "border-status-upcoming/35", icon: "text-status-upcoming", bg: "bg-status-upcoming/5" },
  danger: { border: "border-status-overdue/35", icon: "text-status-overdue", bg: "bg-status-overdue/5" },
};

export function NoteCard({
  note,
  approval,
  locale,
  tone = "default",
  kicker,
  phaseLabel,
  extra,
  onDismiss,
  alert,
  className,
}: NoteCardProps) {
  const t = useT("patient");
  const s = toneStyles[tone];
  const Icon = tone === "default" ? InfoIcon : AlertIcon;
  return (
    <article
      data-testid="note-card"
      data-note-id={note.id}
      role={alert ? "alert" : undefined}
      className={cx(
        "relative flex flex-col gap-2 rounded-[var(--ppp-radius)] border p-4",
        s.border,
        s.bg,
        className,
      )}
    >
      <div className="flex items-start gap-2.5 pr-6">
        <Icon className={cx("mt-0.5 shrink-0", s.icon)} />
        <div className="min-w-0">
          {kicker && <p className={cx("text-xs font-semibold uppercase tracking-wide", s.icon)}>{kicker}</p>}
          <h4 className="text-sm font-semibold leading-snug text-ink">{note.title[locale]}</h4>
        </div>
      </div>
      <p className="text-sm leading-relaxed text-ink/85">{note.text[locale]}</p>
      {extra && <div className="text-sm font-medium text-ink">{extra}</div>}
      {(approval || phaseLabel) && (
        <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
          {approval && (
            <Badge tone="primary" data-testid="approved-chip">
              <CheckIcon width={12} height={12} />
              {t("approvedBy", { name: approval.approvedBy })}
            </Badge>
          )}
          {phaseLabel && <Badge tone="neutral">{phaseLabel}</Badge>}
        </div>
      )}
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t("dismiss")}
          className="absolute right-2 top-2 rounded-full p-1 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <CloseIcon width={14} height={14} />
        </button>
      )}
    </article>
  );
}
