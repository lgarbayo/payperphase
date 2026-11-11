"use client";
/**
 * OWNED BY WP-06. Patient plan page body (/p/[planId]):
 *   header (clinic · patient alias (ficticio) · SimClockBadge · ModeBadges · live)
 *   → Gantt (#gantt, what-if drag, chat ghost preview, snap-back note card)
 *   → phase cards (pay only when due) → ledger + impact strip (#closure) → approved notes
 *   + the chat as a docked side panel (xl) or a drawer (tablet and below).
 * Live over SSE via usePlanLive. Money and dates are only formatted here, never computed.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  ApprovedNoteRef,
  ClinicalNote,
  DeadlineWarning,
  DomainEvent,
  Locale,
  MoveRejectReason,
  MoveRequest,
  NoteId,
  Phase,
  PlanViewResponse,
  WhatIfResponse,
} from "@/contracts";
import { PlanChat } from "@/components/chat/PlanChat";
import { PlanGantt } from "@/components/gantt/PlanGantt";
import { ClinicClosureButton } from "@/components/impact/ClinicClosureButton";
import { ExposureMeter } from "@/components/impact/ExposureMeter";
import { Reveal } from "@/components/motion";
import { useLocale, useT } from "@/i18n";
import { formatIsoDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { Button, Card, cx, ModeBadge, SimClockBadge } from "@/lib/ui";
import { useToast } from "@/lib/ui/Toast";
import { ApprovedNotes } from "./ApprovedNotes";
import { describeShifts, formatPatientAlias } from "./format";
import { AlertIcon, ChatIcon, CloseIcon, InfoIcon, ShieldIcon, SparkIcon, ToothIcon } from "./icons";
import { Ledger } from "./Ledger";
import { NoteCard } from "./NoteCard";
import { PhaseCard, phaseCardDomId } from "./PhaseCard";
import { usePlanLive } from "./usePlanLive";

export interface PatientPlanViewProps {
  initial: PlanViewResponse;
  /** The id or alias from the URL (e.g. "demo"); refetches use it so resets keep working. */
  planRef?: string;
}

type Feedback =
  | {
      kind: "rejected";
      phaseId: string;
      noteId?: NoteId;
      earliestStartDate?: string;
      reason?: MoveRejectReason;
    }
  | { kind: "deadline"; warning: DeadlineWarning };

const GANTT_HEIGHT = 560;

function isWhatIfResponse(x: unknown): x is WhatIfResponse {
  if (!x || typeof x !== "object") return false;
  const o = x as { ok?: unknown; result?: { plan?: { phases?: unknown }; shifts?: unknown }; validation?: unknown };
  if (o.ok === true) return !!o.result && Array.isArray(o.result.shifts) && Array.isArray(o.result.plan?.phases);
  if (o.ok === false) return !!o.validation && typeof o.validation === "object";
  return false;
}

export function PatientPlanView({ initial, planRef }: PatientPlanViewProps) {
  const { locale } = useLocale();
  const t = useT("patient");
  const toast = useToast();

  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [saving, setSaving] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const localeRef = useRef<Locale>(locale);
  localeRef.current = locale;

  const live = usePlanLive(planRef ?? initial.plan.id, initial, {
    onEvent: (e: DomainEvent, { pulsed }) => {
      if (e.type === "PAYMENT_CAPTURED" && pulsed) {
        const n = live.view.plan.phases.find((p) => p.id === e.phaseId)?.n ?? "";
        toast(t("paymentReceived", { n, amount: formatCents(e.amountCents, localeRef.current) }), "success");
      }
      if (e.type === "DEMO_RESET") setFeedback(null);
    },
  });
  const { plan, clock, exposure, stress, notes, modes } = live.view;

  const noteMap = useMemo(
    () => Object.fromEntries(notes.map((n) => [n.id, n])) as Partial<Record<NoteId, ClinicalNote>>,
    [notes],
  );
  const approvals = useMemo(() => new Map(plan.approvedNotes.map((a) => [a.noteId, a] as const)), [plan.approvedNotes]);
  const phaseById = useMemo(() => new Map(plan.phases.map((p) => [p.id, p] as const)), [plan.phases]);

  // Deep-link: /p/demo?chat=1 opens the chat panel.
  useEffect(() => {
    try {
      if (new URLSearchParams(window.location.search).get("chat") === "1") setChatOpen(true);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!chatOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setChatOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chatOpen]);

  useEffect(() => {
    if (!highlight) return;
    const id = setTimeout(() => setHighlight(null), 2_000);
    return () => clearTimeout(id);
  }, [highlight]);

  const handlePaid = useCallback(
    (r: { phaseId: string; captureId?: string }) => {
      if (live.pulse(r.phaseId)) {
        const phase = live.view.plan.phases.find((p) => p.id === r.phaseId);
        if (phase) {
          toast(t("paymentReceived", { n: phase.n, amount: formatCents(phase.amountCents, localeRef.current) }), "success");
        }
      }
      void live.refetch();
    },
    [live, toast, t],
  );

  const handlePayError = useCallback(
    (message: string) => {
      toast(t("paymentFailed", { message }), "error");
      void live.refetch();
    },
    [live, toast, t],
  );

  const onMoveCommitted = useCallback(
    async (move: MoveRequest) => {
      setFeedback(null);
      setSaving(true);
      try {
        const res = await fetch(`/api/plans/${encodeURIComponent(live.view.plan.id)}/whatif`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ phaseId: move.phaseId, newStartDate: move.newStartDate, persist: true }),
        });
        const body: unknown = await res.json().catch(() => null);
        if (!isWhatIfResponse(body)) throw new Error(`HTTP ${res.status}`);
        if (body.ok) {
          const { result } = body;
          live.setPlan(result.plan);
          toast(describeShifts(result.shifts, move.phaseId, result.plan.phases, localeRef.current), "info");
          const warning = result.warnings[0];
          if (warning) setFeedback({ kind: "deadline", warning });
        } else {
          const v = body.validation;
          setFeedback(
            v.ok
              ? { kind: "rejected", phaseId: move.phaseId }
              : {
                  kind: "rejected",
                  phaseId: move.phaseId,
                  noteId: v.noteId,
                  earliestStartDate: v.earliestStartDate,
                  reason: v.reason,
                },
          );
          void live.refetch(); // restore the server schedule (snap back)
        }
      } catch {
        toast(t("whatIfError"), "error");
        void live.refetch();
      } finally {
        setSaving(false);
      }
    },
    [live, toast, t],
  );

  const onMoveRejected = useCallback(
    (info: { phaseId: string; noteId?: NoteId; earliestStartDate?: string }) => {
      setFeedback({ kind: "rejected", ...info });
    },
    [],
  );

  const onPayPhase = useCallback((phaseId: string) => {
    const el = document.getElementById(phaseCardDomId(phaseId));
    el?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    el?.focus?.({ preventScroll: true });
    setHighlight(phaseId);
  }, []);

  const onAskDelay = useCallback(() => setChatOpen(true), []);
  const onGhostPreview = live.setGhostShifts;

  const phaseLabel = (p: Phase | undefined) => (p ? `${t("phaseN", { n: p.n })} · ${p.title[locale]}` : undefined);
  const ganttMode = plan.status === "approved" ? "patient" : "readonly";

  return (
    <div
      className={cx(
        "mx-auto grid w-full max-w-[1600px] items-start gap-6 px-4 py-6 sm:px-6 lg:px-8",
        chatOpen && "xl:grid-cols-[minmax(0,1fr)_400px]",
      )}
    >
      <main className="@container flex min-w-0 flex-col gap-6" data-testid="patient-plan" data-plan-id={plan.id}>
        {/* Header */}
        <header className="flex flex-col gap-4 @5xl:flex-row @5xl:items-end @5xl:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium text-primary-strong">
              <ToothIcon />
              <span data-testid="clinic-name">{plan.clinic.name}</span>
              <span aria-hidden className="text-muted">
                ·
              </span>
              <span className="text-muted">{plan.clinic.city}</span>
            </p>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-ink @5xl:text-[28px]">{t("title")}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
              <span data-testid="patient-alias" className="font-medium text-ink">
                {formatPatientAlias(plan.patient.alias, locale)}
              </span>
              {plan.approvedBy && <MetaItem>{t("approvedByLine", { name: plan.approvedBy })}</MetaItem>}
              <MetaItem>{t("phasesCount", { count: plan.phases.length })}</MetaItem>
              <MetaItem className="tabular-nums">{t("planTotal", { total: formatCents(plan.totalCents, locale) })}</MetaItem>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <LiveIndicator refreshing={live.refreshing} lastEventAt={live.lastEventAt} label={live.refreshing ? t("updating") : t("live")} />
            <SimClockBadge today={clock.today} locale={locale} />
            <ModeBadge mode={modes.paypal} what="PayPal" locale={locale} />
            <ModeBadge mode={modes.anthropic} what={t("modeAssistant")} locale={locale} />
            <Button
              size="sm"
              variant={chatOpen ? "secondary" : "primary"}
              onClick={() => setChatOpen((o) => !o)}
              aria-expanded={chatOpen}
              aria-controls="chat"
              data-testid="chat-toggle"
            >
              <ChatIcon />
              {t("chatOpen")}
            </Button>
          </div>
        </header>

        {/* Status + error banners */}
        {plan.status !== "approved" && (
          <Banner tone={plan.status === "completed" ? "success" : plan.status === "cancelled" ? "warning" : "info"}>
            {plan.status === "completed" ? t("statusCompleted") : plan.status === "cancelled" ? t("statusCancelled") : t("statusDraft")}
          </Banner>
        )}
        {live.error && (
          <Banner tone="warning" action={<Button size="sm" variant="secondary" onClick={() => void live.refetch()}>{t("retry")}</Button>}>
            {t("refreshError")}
          </Banner>
        )}

        {/* Gantt */}
        <section id="gantt" aria-labelledby="gantt-title" className="flex scroll-mt-6 flex-col gap-3">
          <div className="overflow-hidden rounded-[var(--ppp-radius)] border border-border bg-surface shadow-[var(--ppp-shadow)]">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-5 py-3.5">
              <div className="min-w-0">
                <h2 id="gantt-title" className="text-lg font-semibold tracking-tight text-ink">
                  {t("ganttTitle")}
                </h2>
                <p className="text-sm text-muted">{t("ganttHint")}</p>
              </div>
              {saving && (
                <span role="status" className="inline-flex items-center gap-2 text-xs font-medium text-muted">
                  <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  {t("saving")}
                </span>
              )}
            </div>
            <div className="p-1">
              <PlanGantt
                plan={plan}
                today={clock.today}
                locale={locale}
                mode={ganttMode}
                notes={noteMap}
                ghostShifts={live.ghostShifts}
                onMoveCommitted={(m) => void onMoveCommitted(m)}
                onMoveRejected={onMoveRejected}
                onPayPhase={onPayPhase}
                onAskDelay={onAskDelay}
                height={GANTT_HEIGHT}
              />
            </div>
          </div>

          {live.ghostShifts && (
            <Reveal>
            <div
              data-testid="ghost-banner"
              className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--ppp-radius)] border border-dashed border-primary/40 bg-primary/5 px-4 py-3"
            >
              <p className="flex items-start gap-2.5 text-sm text-ink">
                <SparkIcon className="mt-0.5 shrink-0 text-primary" />
                <span>
                  <span className="font-semibold">{t("ghostTitle")}.</span> {t("ghostBody")}{" "}
                  <span className="text-muted">{describeShifts(live.ghostShifts, "", plan.phases, locale)}</span>
                </span>
              </p>
              <Button size="sm" variant="ghost" onClick={() => live.setGhostShifts(null)}>
                {t("ghostClear")}
              </Button>
            </div>
            </Reveal>
          )}

          {feedback && (
            <Reveal>
              <MoveFeedback
              feedback={feedback}
              locale={locale}
              noteMap={noteMap}
              approvals={approvals}
              phaseLabel={(id) => phaseLabel(phaseById.get(id))}
              phaseN={(id) => phaseById.get(id)?.n}
              onDismiss={() => setFeedback(null)}
              />
            </Reveal>
          )}
        </section>

        {/* Phase cards */}
        <section id="phases" aria-labelledby="phases-title" className="scroll-mt-6">
          <header className="mb-4">
            <h2 id="phases-title" className="text-lg font-semibold tracking-tight text-ink">
              {t("phasesTitle")}
            </h2>
            <p className="mt-1 text-sm text-muted">{t("phasesSubtitle")}</p>
          </header>
          {plan.phases.length === 0 ? (
            <p className="rounded-[var(--ppp-radius)] border border-dashed border-border bg-surface px-4 py-8 text-center text-sm text-muted">
              {t("phasesEmpty")}
            </p>
          ) : (
            <div className="grid gap-4 @2xl:grid-cols-2 @5xl:grid-cols-4">
              {plan.phases.map((p) => (
                <PhaseCard
                  key={p.id}
                  planId={plan.id}
                  phase={p}
                  locale={locale}
                  pulse={live.pulses[p.id] ?? 0}
                  highlighted={highlight === p.id}
                  onPaid={handlePaid}
                  onPayError={handlePayError}
                />
              ))}
            </div>
          )}
        </section>

        {/* Ledger + impact strip */}
        <div className="grid items-stretch gap-6 @4xl:grid-cols-2">
          <Ledger plan={plan} exposure={exposure} locale={locale} />
          <section id="closure" aria-labelledby="closure-title" className="scroll-mt-6" data-testid="impact-strip">
            <Card className="flex h-full flex-col gap-4">
              <header className="flex items-start gap-3">
                <span aria-hidden className="rounded-full bg-primary/10 p-2 text-primary">
                  <ShieldIcon width={18} height={18} />
                </span>
                <div>
                  <h2 id="closure-title" className="text-lg font-semibold tracking-tight text-ink">
                    {t("impactTitle")}
                  </h2>
                  <p className="mt-1 text-sm text-muted">{t("impactSubtitle")}</p>
                </div>
              </header>
              <div className="flex flex-1 flex-col gap-4">
                <ExposureMeter report={exposure} locale={locale} />
                <ClinicClosureButton stress={stress} locale={locale} />
              </div>
            </Card>
          </section>
        </div>

        {/* Approved notes */}
        <ApprovedNotes plan={plan} notes={notes} locale={locale} />
      </main>

      {/* Chat: docked side panel on xl, drawer below. Kept mounted so the conversation survives closing. */}
      {chatOpen && (
        <div aria-hidden className="fixed inset-0 z-30 bg-ink/30 xl:hidden" onClick={() => setChatOpen(false)} />
      )}
      <aside
        id="chat"
        aria-label={t("chatTitle")}
        data-testid="chat-panel"
        data-open={chatOpen}
        className={cx(
          "fixed inset-y-0 right-0 z-40 w-full max-w-[420px] flex-col border-l border-border bg-surface shadow-2xl",
          "xl:sticky xl:inset-auto xl:top-6 xl:z-auto xl:h-[calc(100vh-3rem)] xl:max-w-none xl:self-start xl:rounded-[var(--ppp-radius)] xl:border xl:shadow-[var(--ppp-shadow)]",
          chatOpen ? "flex" : "hidden",
        )}
      >
        <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 font-semibold text-ink">
              <ChatIcon className="text-primary" />
              {t("chatTitle")}
            </h2>
            <p className="mt-0.5 text-xs text-muted">{t("chatSubtitle")}</p>
          </div>
          <button
            type="button"
            onClick={() => setChatOpen(false)}
            aria-label={t("chatClose")}
            className="rounded-full p-1.5 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <CloseIcon />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <PlanChat planId={plan.id} locale={locale} onGhostPreview={onGhostPreview} />
        </div>
      </aside>
    </div>
  );
}

/** A header meta item that carries its own leading separator, so wrapped lines never start with "·". */
function MetaItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cx("whitespace-nowrap", className)}>
      <span aria-hidden className="mr-2">
        ·
      </span>
      {children}
    </span>
  );
}

function LiveIndicator({ refreshing, lastEventAt, label }: { refreshing: boolean; lastEventAt: number | null; label: string }) {
  return (
    <span
      data-testid="live-indicator"
      className="inline-flex items-center gap-1.5 rounded-full bg-status-paid/10 px-2.5 py-0.5 text-xs font-medium text-status-paid"
    >
      <span className="relative flex h-2 w-2">
        {(refreshing || lastEventAt) && (
          <span
            key={lastEventAt ?? 0}
            aria-hidden
            className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-paid opacity-60"
            style={{ animationIterationCount: refreshing ? "infinite" : 3 }}
          />
        )}
        <span aria-hidden className="relative inline-flex h-2 w-2 rounded-full bg-status-paid" />
      </span>
      {label}
    </span>
  );
}

function Banner({
  tone,
  children,
  action,
}: {
  tone: "info" | "warning" | "success";
  children: ReactNode;
  action?: ReactNode;
}) {
  const Icon = tone === "warning" ? AlertIcon : InfoIcon;
  return (
    <div
      role={tone === "warning" ? "alert" : "status"}
      className={cx(
        "flex flex-wrap items-center justify-between gap-3 rounded-[var(--ppp-radius)] border px-4 py-3 text-sm",
        tone === "info" && "border-status-due/30 bg-status-due/5 text-ink",
        tone === "warning" && "border-status-upcoming/40 bg-status-upcoming/5 text-ink",
        tone === "success" && "border-status-paid/30 bg-status-paid/5 text-ink",
      )}
    >
      <p className="flex items-start gap-2.5">
        <Icon
          className={cx(
            "mt-0.5 shrink-0",
            tone === "info" && "text-status-due",
            tone === "warning" && "text-status-upcoming",
            tone === "success" && "text-status-paid",
          )}
        />
        {children}
      </p>
      {action}
    </div>
  );
}

function MoveFeedback({
  feedback,
  locale,
  noteMap,
  approvals,
  phaseLabel,
  phaseN,
  onDismiss,
}: {
  feedback: Feedback;
  locale: Locale;
  noteMap: Partial<Record<NoteId, ClinicalNote>>;
  approvals: Map<NoteId, ApprovedNoteRef>;
  phaseLabel: (phaseId: string) => string | undefined;
  phaseN: (phaseId: string) => number | undefined;
  onDismiss: () => void;
}) {
  const t = useT("patient");

  if (feedback.kind === "deadline") {
    const w = feedback.warning;
    const note = noteMap[w.noteId];
    const body = t("deadlineBody", {
      n: phaseN(w.phaseId) ?? "",
      days: w.exceededByDays,
      date: formatIsoDate(w.deadlineDate, locale),
    });
    return note ? (
      <NoteCard
        alert
        tone="warning"
        kicker={t("deadlineTitle")}
        note={note}
        approval={approvals.get(note.id)}
        locale={locale}
        phaseLabel={phaseLabel(w.phaseId)}
        extra={body}
        onDismiss={onDismiss}
      />
    ) : (
      <PlainAlert title={t("deadlineTitle")} body={body} onDismiss={onDismiss} tone="warning" />
    );
  }

  const note = feedback.noteId ? noteMap[feedback.noteId] : undefined;
  const earliest = feedback.earliestStartDate
    ? t("moveEarliest", { date: formatIsoDate(feedback.earliestStartDate, locale) })
    : undefined;
  if (note) {
    return (
      <NoteCard
        alert
        tone="danger"
        kicker={t("moveRejectedTitle")}
        note={note}
        approval={approvals.get(note.id)}
        locale={locale}
        phaseLabel={phaseLabel(feedback.phaseId)}
        extra={earliest}
        onDismiss={onDismiss}
      />
    );
  }
  const reasonText =
    feedback.reason === "PHASE_PAID"
      ? t("moveRejectedPaid")
      : feedback.reason === "PHASE_DELIVERED"
        ? t("moveRejectedDelivered")
        : feedback.reason === "IN_THE_PAST"
          ? t("moveRejectedPast")
          : t("moveRejectedGeneric");
  return (
    <PlainAlert
      title={t("moveRejectedTitle")}
      body={earliest ? `${reasonText} ${earliest}` : reasonText}
      onDismiss={onDismiss}
      tone="danger"
    />
  );
}

function PlainAlert({
  title,
  body,
  tone,
  onDismiss,
}: {
  title: string;
  body: string;
  tone: "warning" | "danger";
  onDismiss: () => void;
}) {
  const t = useT("patient");
  return (
    <div
      role="alert"
      data-testid="move-alert"
      className={cx(
        "relative flex items-start gap-2.5 rounded-[var(--ppp-radius)] border border-l-4 border-border p-4 pr-10 shadow-[var(--ppp-shadow)]",
        tone === "danger" ? "border-l-status-overdue bg-status-overdue/5" : "border-l-status-upcoming bg-status-upcoming/5",
      )}
    >
      <AlertIcon className={cx("mt-0.5 shrink-0", tone === "danger" ? "text-status-overdue" : "text-status-upcoming")} />
      <div>
        <p className={cx("text-xs font-semibold uppercase tracking-wide", tone === "danger" ? "text-status-overdue" : "text-status-upcoming")}>
          {title}
        </p>
        <p className="mt-1 text-sm text-ink">{body}</p>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t("dismiss")}
        className="absolute right-2 top-2 rounded-full p-1 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
      >
        <CloseIcon width={14} height={14} />
      </button>
    </div>
  );
}
