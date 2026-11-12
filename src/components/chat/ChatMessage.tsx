"use client";
/**
 * One conversation turn: the patient's bubble, or the assistant's answer with its
 * what-if summary, approved-note citation chips, the cached badge and the referral to the clinic.
 */
import { useState } from "react";
import type { ChatCitation, ChatResponse, Locale, PhaseShift } from "@/contracts";
import { formatSpan } from "@/components/patient/format";
import { useT } from "@/i18n";
import { formatIsoDate } from "@/lib/dates";
import { Badge, Button, cx, ModeBadge } from "@/lib/ui";
import { NOTE_LIBRARY } from "@data/seed/notes";
import { BadgeCheckIcon, CalendarEyeIcon, MailIcon } from "./icons";

export function UserBubble({ text }: { text: string }) {
  const t = useT("chat");
  return (
    <li data-testid="chat-message" data-role="user" className="flex flex-col items-end gap-1">
      <span className="sr-only">{t("you")}</span>
      <p className="max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-sm leading-relaxed text-primary-ink shadow-sm">
        {text}
      </p>
    </li>
  );
}

export interface AssistantTurnProps {
  itemId: number;
  response: ChatResponse;
  locale: Locale;
  ghostActive: boolean;
  onToggleGhost: (shifts: PhaseShift[]) => void;
  referralSent: boolean;
  onReferral: () => void;
}

export function AssistantTurn({ itemId, response, locale, ghostActive, onToggleGhost, referralSent, onReferral }: AssistantTurnProps) {
  const t = useT("chat");
  const { whatIf } = response;
  return (
    <li
      data-testid="chat-message"
      data-role="assistant"
      data-item-id={itemId}
      data-refused={response.refused}
      className="flex scroll-mt-2 flex-col items-start gap-2"
    >
      <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted">
        <span>{t("assistant")}</span>
        <ModeBadge mode={response.source} what={t("modeAssistant")} locale={locale} />
        {response.groundingFallback && <Badge tone="due">{t("groundingKicker")}</Badge>}
      </div>

      <div
        className={cx(
          "max-w-full rounded-2xl rounded-bl-md border px-3.5 py-2.5 text-sm leading-relaxed text-ink shadow-sm",
          response.refused ? "border-status-upcoming/40 bg-status-upcoming/5" : "border-border bg-surface-2",
        )}
      >
        {response.refused && (
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-status-upcoming">{t("refusedKicker")}</p>
        )}
        <p data-testid="chat-answer" className="whitespace-pre-wrap">
          {response.text}
        </p>
      </div>

      {whatIf && (
        <WhatIfCard whatIf={whatIf} locale={locale} ghostActive={ghostActive} onToggle={() => onToggleGhost(whatIf.shifts)} />
      )}

      {response.citations.length > 0 && <Citations citations={response.citations} locale={locale} />}

      {response.refused && (
        <Button
          size="sm"
          variant={referralSent ? "secondary" : "primary"}
          onClick={onReferral}
          disabled={referralSent}
          data-testid="chat-referral"
        >
          <MailIcon />
          {referralSent ? t("referralSent") : t("referralButton")}
        </Button>
      )}
    </li>
  );
}

function WhatIfCard({
  whatIf,
  locale,
  ghostActive,
  onToggle,
}: {
  whatIf: NonNullable<ChatResponse["whatIf"]>;
  locale: Locale;
  ghostActive: boolean;
  onToggle: () => void;
}) {
  const t = useT("chat");
  const tp = useT("patient");
  const rows = whatIf.shifts.filter((s) => s.deltaDays !== 0);
  const phaseOf = (id: string) => whatIf.plan.phases.find((p) => p.id === id);
  return (
    <div data-testid="chat-whatif" className="w-full rounded-xl border border-border bg-surface p-3 shadow-sm">
      <ul className="flex flex-col divide-y divide-border">
        {rows.map((s) => {
          const p = phaseOf(s.phaseId);
          return (
            <li key={s.phaseId} className="flex items-baseline justify-between gap-3 py-1.5 first:pt-0 last:pb-0">
              <span className="min-w-0 text-sm text-ink">
                <span className="font-semibold">{tp("phaseN", { n: p?.n ?? "" })}</span>
                {p && <span className="text-muted"> · {p.title[locale]}</span>}
              </span>
              <span className="shrink-0 text-right text-xs tabular-nums text-muted">
                <span className="line-through decoration-muted/50">{formatIsoDate(s.fromStart, locale, { year: undefined })}</span>
                <span aria-hidden> → </span>
                <span className="font-semibold text-ink">{formatIsoDate(s.toStart, locale)}</span>
                <span className="ml-1.5 rounded-full bg-status-upcoming/15 px-1.5 py-px font-medium text-status-upcoming">
                  +{formatSpan(s.deltaDays, locale)}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border pt-3">
        <Button
          size="sm"
          variant={ghostActive ? "secondary" : "primary"}
          onClick={onToggle}
          aria-pressed={ghostActive}
          data-testid="chat-ghost-toggle"
        >
          <CalendarEyeIcon />
          {ghostActive ? t("ghostHide") : t("ghostShow")}
        </Button>
        <span className="text-xs text-muted">{t("ghostHint")}</span>
      </div>
    </div>
  );
}

function Citations({ citations, locale }: { citations: ChatCitation[]; locale: Locale }) {
  const t = useT("chat");
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div data-testid="chat-citations" className="flex w-full flex-col gap-1.5">
      <p className="text-xs font-medium text-muted">{t("sourcesLabel")}</p>
      <ul className="flex flex-col gap-1.5">
        {citations.map((c) => {
          const n = phaseFromId(c.phaseId);
          const title = NOTE_LIBRARY[c.noteId]?.title[locale] ?? c.noteId;
          const isOpen = open === c.noteId;
          return (
            <li key={c.noteId} data-testid="chat-citation" data-note-id={c.noteId}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : c.noteId)}
                aria-expanded={isOpen}
                className="group flex w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
              >
                <Badge tone="primary" data-testid="chat-citation-chip">
                  <BadgeCheckIcon width={13} height={13} />
                  {n !== undefined ? t("approvedChip", { name: c.approvedBy, n }) : t("approvedChipNoPhase", { name: c.approvedBy })}
                </Badge>
                <span className="text-xs font-medium text-ink">{title}</span>
              </button>
              {isOpen && (
                <p className="mt-1 rounded-lg border-l-2 border-primary/40 bg-primary/5 px-3 py-2 text-xs leading-relaxed text-ink/85">
                  {c.citedText}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** PhaseId is "ph{n}" by contract (PhaseIdSchema), so the chip can show the phase number without the plan. */
function phaseFromId(id?: string): number | undefined {
  const m = id ? /^ph(\d+)$/.exec(id) : null;
  return m ? Number(m[1]) : undefined;
}
