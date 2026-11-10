"use client";
/**
 * OWNED BY WP-07. Clinic console: PDF dropzone → extraction reveal (+ odontogram + check bar) →
 * phase review & note approval → approve & send (link, QR, invoices) → plan editor with diff →
 * agent feed → payments overview. Works from an empty store (Director beat B1) and from the hero
 * plan (B2–B6). Every amount and date shown comes from an API response, never from this file.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  HERO_PLAN_ALIAS,
  eventPlanId,
  type CaseKind,
  type ClinicalNote,
  type DomainEvent,
  type DomainEventType,
  type EditPlanResponse,
  type ExtractionResult,
  type NoteId,
  type Plan,
  type PlanEdit,
} from "@/contracts";
import { AgentFeed } from "@/components/agent/AgentFeed";
import { TrustStrip } from "@/components/brand/TrustStrip";
import { PlanGantt } from "@/components/gantt/PlanGantt";
import { Reveal } from "@/components/motion";
import { useLocale, useT } from "@/i18n";
import { formatCents } from "@/lib/money";
import { useDomainEvents } from "@/lib/sse/useDomainEvents";
import { Badge, Button, SimClockBadge } from "@/lib/ui";
import { useToast } from "@/lib/ui/Toast";
import { SAMPLE_PDFS, type SamplePdf } from "@data/seed";
import { clinicApi, inferCaseKind } from "./api";
import { DiffPanel } from "./DiffPanel";
import { ExtractionReveal, REVEAL_STEP_MS } from "./ExtractionReveal";
import { groupPlanNotes, NoteApprovalBar } from "./NoteApproval";
import { PaymentsOverview } from "./PaymentsOverview";
import { PhaseReview, type DraftsState } from "./PhaseReview";
import { PlanEditor, type EditorBusy } from "./PlanEditor";
import { QuoteDropzone, type DropzoneRequest } from "./QuoteDropzone";
import { SendToPatient } from "./SendToPatient";
import { Icon, Spinner, StepHeader, type ClinicT } from "./shared";

export interface ClinicConsoleProps {
  /** Hero plan (alias "demo") as server-rendered, or null on an empty store (beat B1). */
  plan: Plan | null;
  /** Simulated today. */
  today: string;
  /** Clinician note library (clinic view: the whole library). */
  notes?: ClinicalNote[];
  /** "Probar con un ejemplo" samples. */
  samples?: SamplePdf[];
  /** Extraction reveal stagger (ms per line). */
  revealStepMs?: number;
}

/** Events about the plan on screen that change what the console shows. */
const PLAN_REFRESH_EVENTS = new Set<DomainEventType>([
  "PLAN_APPROVED",
  "PLAN_EDITED",
  "PLAN_RESCHEDULED",
  "PHASE_STATUS_CHANGED",
  "PAYMENT_CAPTURED",
  "PHASE_DELIVERED",
  "INVOICE_UPDATED",
]);
/** Events that change the payments overview. */
const LIST_REFRESH_EVENTS = new Set<DomainEventType>([
  ...PLAN_REFRESH_EVENTS,
  "PLAN_CREATED",
  "CLOCK_ADVANCED",
  "DEMO_RESET",
]);

const toLibrary = (notes: ClinicalNote[]) =>
  Object.fromEntries(notes.map((n) => [n.id, n])) as Partial<Record<NoteId, ClinicalNote>>;

function errText(prefix: string, e: unknown): string {
  return e instanceof Error && e.message ? `${prefix} (${e.message})` : prefix;
}

function scrollToId(id: string) {
  setTimeout(() => {
    if (typeof document === "undefined") return;
    document.getElementById(id)?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, 60);
}

export function ClinicConsole({
  plan: initialPlan,
  today: initialToday,
  notes: initialNotes = [],
  samples = SAMPLE_PDFS,
  revealStepMs = REVEAL_STEP_MS,
}: ClinicConsoleProps) {
  const { locale } = useLocale();
  const t = useT("clinic");
  const toast = useToast();

  const [plan, setPlan] = useState<Plan | null>(initialPlan);
  const [today, setToday] = useState(initialToday);
  const [library, setLibrary] = useState(() => toLibrary(initialNotes));

  const [extraction, setExtraction] = useState<ExtractionResult | null>(null);
  const [extract, setExtract] = useState<{ status: "idle" | "loading" | "error"; label?: string; error?: string }>({
    status: "idle",
  });
  const [caseKind, setCaseKind] = useState<CaseKind>("implant");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [ticked, setTicked] = useState<Set<NoteId>>(() => new Set());
  const [drafts, setDrafts] = useState<DraftsState>({ status: "idle" });
  const [usedDrafts, setUsedDrafts] = useState<Set<string>>(() => new Set());
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  const [busy, setBusy] = useState<EditorBusy>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editResult, setEditResult] = useState<EditPlanResponse | null>(null);
  const [refreshSignal, setRefreshSignal] = useState(0);

  const planIdRef = useRef<string | null>(initialPlan?.id ?? null);
  planIdRef.current = plan?.id ?? null;

  /** Put a (different) plan on screen and reset the per-plan review state. */
  const adoptPlan = useCallback((next: Plan | null) => {
    setPlan(next);
    setTicked(new Set());
    setUsedDrafts(new Set());
    setDrafts({ status: "idle" });
    setApproveError(null);
    setEditResult(null);
    setEditError(null);
  }, []);

  // ---------- live refresh (SSE) ----------
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refetchPlan = useCallback(async () => {
    const id = planIdRef.current;
    if (!id) return;
    try {
      const view = await clinicApi.getClinicView(id);
      if (planIdRef.current !== view.plan.id) return;
      setPlan(view.plan);
      setToday(view.clock.today);
      if (view.notes.length > 0) setLibrary(toLibrary(view.notes));
    } catch {
      /* keep what is on screen; the next event retries */
    }
  }, []);

  const reloadHero = useCallback(async () => {
    setExtraction(null);
    setExtract({ status: "idle" });
    try {
      const view = await clinicApi.getClinicView(HERO_PLAN_ALIAS);
      adoptPlan(view.plan);
      setToday(view.clock.today);
    } catch {
      adoptPlan(null);
    }
  }, [adoptPlan]);

  const onEvent = useCallback(
    (e: DomainEvent) => {
      if (LIST_REFRESH_EVENTS.has(e.type)) {
        if (listTimer.current) clearTimeout(listTimer.current);
        listTimer.current = setTimeout(() => setRefreshSignal((s) => s + 1), 250);
      }
      if (e.type === "CLOCK_ADVANCED") setToday(e.to);
      if (e.type === "DEMO_RESET") {
        void reloadHero();
        return;
      }
      const pid = eventPlanId(e);
      const mine = pid !== undefined && pid === planIdRef.current;
      if ((mine && PLAN_REFRESH_EVENTS.has(e.type)) || (e.type === "CLOCK_ADVANCED" && planIdRef.current)) {
        if (refetchTimer.current) clearTimeout(refetchTimer.current);
        refetchTimer.current = setTimeout(() => void refetchPlan(), 250);
      }
    },
    [refetchPlan, reloadHero],
  );
  useDomainEvents(null, onEvent);

  useEffect(
    () => () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      if (listTimer.current) clearTimeout(listTimer.current);
    },
    [],
  );

  // ---------- 1 · quote ----------
  const runExtraction = useCallback(
    async (req: DropzoneRequest) => {
      setExtract({ status: "loading", label: req.kind === "file" ? req.file.name : req.sample.label[locale] });
      setExtraction(null);
      setCreateError(null);
      try {
        const res = req.kind === "file" ? await clinicApi.extractFile(req.file) : await clinicApi.extractSample(req.sample.id);
        setCaseKind(req.kind === "sample" ? req.sample.caseKind : inferCaseKind(res.extraction.lines.map((l) => l.code)));
        adoptPlan(null);
        setExtraction(res.extraction);
        setExtract({ status: "idle" });
      } catch (e) {
        setExtract({ status: "error", error: errText(t("extractError"), e) });
      }
    },
    [adoptPlan, locale, t],
  );

  // ---------- 2 · plan ----------
  const loadDrafts = useCallback(async (planId: string) => {
    setDrafts({ status: "loading" });
    try {
      const { drafts: set } = await clinicApi.wording(planId);
      if (planIdRef.current !== planId) return;
      setDrafts({
        status: "ready",
        source: set.source,
        byPhase: Object.fromEntries(set.phases.map((p) => [p.phaseId, p])),
      });
    } catch {
      if (planIdRef.current === planId) setDrafts({ status: "error" });
    }
  }, []);

  const createPlan = useCallback(async () => {
    if (!extraction) return;
    setCreating(true);
    setCreateError(null);
    try {
      const { plan: created } = await clinicApi.createPlan(extraction.quoteId, caseKind);
      adoptPlan(created);
      planIdRef.current = created.id;
      setRefreshSignal((s) => s + 1);
      void loadDrafts(created.id);
      scrollToId("plan-review");
    } catch (e) {
      setCreateError(errText(t("createError"), e));
    } finally {
      setCreating(false);
    }
  }, [adoptPlan, caseKind, extraction, loadDrafts, t]);

  const readOnly = !plan || plan.status !== "draft";
  const groups = useMemo(() => (plan ? groupPlanNotes(plan, library) : null), [plan, library]);
  const approvedIds = useMemo(() => new Set(plan?.approvedNotes.map((n) => n.noteId) ?? []), [plan]);
  const shownTicks = readOnly ? approvedIds : ticked;
  const totalNotes = groups?.allIds.length ?? 0;
  const doneNotes = groups ? groups.allIds.filter((id) => shownTicks.has(id)).length : 0;
  const notesApproved = doneNotes === totalNotes;

  const toggleNote = useCallback((id: NoteId) => {
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const toggleAllNotes = useCallback(
    (approve: boolean) => setTicked(approve && groups ? new Set(groups.allIds) : new Set()),
    [groups],
  );
  const toggleDraft = useCallback((phaseId: string) => {
    setUsedDrafts((prev) => {
      const next = new Set(prev);
      if (next.has(phaseId)) next.delete(phaseId);
      else next.add(phaseId);
      return next;
    });
  }, []);

  // ---------- 3 · approve & send ----------
  const approve = useCallback(async () => {
    if (!plan || !groups || !notesApproved) return;
    setApproving(true);
    setApproveError(null);
    try {
      const noteIds = groups.allIds.filter((id) => ticked.has(id));
      const summaries =
        drafts.status === "ready"
          ? plan.phases.flatMap((p) => {
              const d = drafts.byPhase[p.id];
              return d && usedDrafts.has(p.id) ? [{ phaseId: p.id, text: d.rendered }] : [];
            })
          : [];
      const res = await clinicApi.approve(plan.id, { approvedBy: plan.clinic.dentistName, noteIds, summaries });
      setPlan(res.plan);
      setRefreshSignal((s) => s + 1);
      toast(t("approvedBy", { name: res.plan.approvedBy ?? plan.clinic.dentistName }), "success");
      scrollToId("send-to-patient");
    } catch (e) {
      setApproveError(errText(t("approveError"), e));
    } finally {
      setApproving(false);
    }
  }, [drafts, groups, notesApproved, plan, t, ticked, toast, usedDrafts]);

  // ---------- 4 · edit ----------
  const runEdit = useCallback(
    async (edit: PlanEdit, key: string) => {
      if (!plan || busy) return;
      setBusy({ kind: "edit", key });
      setEditError(null);
      try {
        const res = await clinicApi.edit(plan.id, edit, plan.clinic.dentistName);
        setPlan(res.plan);
        setEditResult(res);
        setRefreshSignal((s) => s + 1);
        toast(t("editDone", { v: res.plan.version }), "success");
      } catch (e) {
        setEditError(errText(t("editError"), e));
      } finally {
        setBusy(null);
      }
    },
    [busy, plan, t, toast],
  );

  const deliver = useCallback(
    async (phaseId: string) => {
      if (!plan || busy) return;
      setBusy({ kind: "deliver", key: phaseId });
      setEditError(null);
      try {
        const res = await clinicApi.deliver(plan.id, phaseId);
        setPlan(res.plan);
        setRefreshSignal((s) => s + 1);
        const n = res.plan.phases.find((p) => p.id === phaseId)?.n ?? "";
        toast(t("deliverDone", { n }), "success");
      } catch (e) {
        setEditError(errText(t("deliverError"), e));
      } finally {
        setBusy(null);
      }
    },
    [busy, plan, t, toast],
  );

  // ---------- payments → manage another plan ----------
  const manage = useCallback(
    async (planId: string) => {
      try {
        const view = await clinicApi.getClinicView(planId);
        setExtraction(null);
        setExtract({ status: "idle" });
        adoptPlan(view.plan);
        setToday(view.clock.today);
        if (view.notes.length > 0) setLibrary(toLibrary(view.notes));
        scrollToId("plan-review");
      } catch (e) {
        toast(errText(t("paymentsError"), e), "error");
      }
    },
    [adoptPlan, t, toast],
  );

  const clinicName = plan?.clinic.name ?? extraction?.clinicName ?? null;
  const city = plan?.clinic.city;
  const dentist = plan?.clinic.dentistName ?? extraction?.dentistName ?? null;

  return (
    <main data-testid="clinic-console" className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 py-8 md:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {clinicName && (
            <p className="text-sm font-medium text-primary-strong">
              {clinicName}
              {city ? ` · ${city}` : ""}
            </p>
          )}
          <h1 className="text-3xl font-semibold tracking-tight text-ink">{t("title")}</h1>
          <p className="mt-1 text-muted">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {dentist && (
            <Badge tone="neutral" title={t("dentistLabel")}>
              {dentist}
            </Badge>
          )}
          <Badge tone="paid">
            <span aria-hidden className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
            {t("liveUpdates")}
          </Badge>
          <SimClockBadge today={today} locale={locale} />
        </div>
      </header>

      {/* 1 · Quote */}
      <section id="quote" className="flex scroll-mt-6 flex-col gap-4">
        <StepHeader n={1} title={t("stepQuote")} hint={t("stepQuoteHint")} />
        <QuoteDropzone
          samples={samples}
          locale={locale}
          t={t}
          busy={extract.status === "loading"}
          busyLabel={extract.label}
          compact={!!plan || !!extraction}
          error={extract.status === "error" ? extract.error : null}
          onRequest={(req) => void runExtraction(req)}
        />
        {extraction && (
          <ExtractionReveal
            key={`${extraction.quoteId}:${extraction.extractedAt}`}
            extraction={extraction}
            locale={locale}
            t={t}
            stepMs={revealStepMs}
            footer={
              <CreatePlanBar
                t={t}
                created={!!plan}
                creating={creating}
                error={createError}
                onCreate={() => void createPlan()}
              />
            }
          />
        )}
      </section>

      {/* 2 · Phased plan */}
      <section id="plan-review" className="flex scroll-mt-6 flex-col gap-4">
        <StepHeader
          n={2}
          title={t("stepPlan")}
          hint={t("stepPlanHint")}
          aside={
            plan && (
              <>
                <Badge tone={plan.status === "draft" ? "upcoming" : "primary"} data-testid="plan-status">
                  {plan.status === "draft" ? t("planDraft") : t("planApproved")}
                </Badge>
                <Badge tone="neutral" className="tabular-nums">
                  {t("planTotal", { amount: formatCents(plan.totalCents, locale) })}
                </Badge>
                <Badge tone="neutral">{t("planVersion", { v: plan.version })}</Badge>
              </>
            )
          }
        />
        {plan && groups ? (
          <>
            <Reveal>
              <div className="overflow-hidden rounded-[var(--ppp-radius)] border border-border bg-surface p-2 shadow-[var(--ppp-shadow)]">
                <PlanGantt plan={plan} today={today} locale={locale} mode="clinic" notes={library} height={380} />
              </div>
            </Reveal>
            <TrustStrip locale={locale} />
            {!readOnly && (
              <NoteApprovalBar total={totalNotes} done={doneNotes} onToggleAll={toggleAllNotes} t={t} />
            )}
            <PhaseReview
              plan={plan}
              groups={groups}
              ticked={shownTicks}
              onToggleNote={toggleNote}
              drafts={drafts}
              usedDrafts={usedDrafts}
              onToggleDraft={toggleDraft}
              locale={locale}
              t={t}
              readOnly={readOnly}
            />
          </>
        ) : (
          <EmptyPlan t={t} />
        )}
      </section>

      {/* 3 · Approve & send */}
      <section id="send-to-patient" className="flex scroll-mt-6 flex-col gap-4">
        <StepHeader n={3} title={t("stepSend")} hint={t("stepSendHint")} />
        {plan ? (
          <SendToPatient
            plan={plan}
            locale={locale}
            t={t}
            notesApproved={notesApproved}
            approving={approving}
            error={approveError}
            onApprove={() => void approve()}
          />
        ) : (
          <EmptyCard text={t("sendEmpty")} />
        )}
      </section>

      {/* 4 · Edit plan + agent feed (Director deep links: #plan-editor, #agent-feed) */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section id="plan-editor" className="flex min-w-0 scroll-mt-6 flex-col gap-4">
          <StepHeader
            n={4}
            title={t("editorTitle")}
            hint={t("editorHint")}
            aside={
              busy && (
                <span role="status" className="inline-flex items-center gap-2 text-sm text-muted">
                  <Spinner />
                  {t("editing")}
                </span>
              )
            }
          />
          {plan && plan.status !== "draft" ? (
            <>
              {editResult && (
                <DiffPanel result={editResult} locale={locale} t={t} onDismiss={() => setEditResult(null)} />
              )}
              <PlanEditor
                plan={plan}
                locale={locale}
                t={t}
                busy={busy}
                error={editError}
                onEdit={(edit, key) => void runEdit(edit, key)}
                onDeliver={(phaseId) => void deliver(phaseId)}
              />
            </>
          ) : (
            <EmptyCard text={t("editorEmpty")} />
          )}
        </section>

        <section id="agent-feed" className="flex min-w-0 scroll-mt-6 flex-col gap-4 xl:sticky xl:top-4 xl:self-start">
          <StepHeader title={t("agentTitle")} hint={t("agentHint")} />
          {plan ? (
            <div className="rounded-[var(--ppp-radius)] border border-border bg-surface p-4 shadow-[var(--ppp-shadow)]">
              <AgentFeed planId={plan.id} locale={locale} />
            </div>
          ) : (
            <EmptyCard text={t("editorEmpty")} />
          )}
        </section>
      </div>

      {/* 5 · Payments */}
      <section id="payments" className="flex scroll-mt-6 flex-col gap-4">
        <StepHeader n={5} title={t("stepPayments")} hint={t("stepPaymentsHint")} />
        <PaymentsOverview
          locale={locale}
          t={t}
          refreshSignal={refreshSignal}
          currentPlanId={plan?.id ?? null}
          onManage={(id) => void manage(id)}
        />
      </section>
    </main>
  );
}

/** Rendered by ExtractionReveal only once every line is on screen and the checks have landed. */
function CreatePlanBar({
  t,
  created,
  creating,
  error,
  onCreate,
}: {
  t: ClinicT;
  created: boolean;
  creating: boolean;
  error: string | null;
  onCreate: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[var(--ppp-radius)] border border-primary/20 bg-primary/5 p-4 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-sm font-medium text-ink">{t("createPlanReady")}</p>
        <p className="text-sm text-muted">{t("stepPlanHint")}</p>
        {error && (
          <p role="alert" className="mt-1 flex items-center gap-2 text-sm text-status-overdue">
            <Icon.Alert />
            {error}
          </p>
        )}
      </div>
      {created ? (
        <Button variant="secondary" onClick={() => scrollToId("plan-review")}>
          {t("stepPlan")}
          <Icon.Arrow width={14} height={14} />
        </Button>
      ) : (
        <Button size="lg" data-testid="create-plan" disabled={creating} onClick={onCreate}>
          {creating ? <Spinner /> : <Icon.Spark />}
          {creating ? t("creatingPlan") : t("createPlan")}
        </Button>
      )}
    </div>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div className="rounded-[var(--ppp-radius)] border border-dashed border-border bg-surface/60 px-5 py-8 text-center text-sm text-muted">
      {text}
    </div>
  );
}

function EmptyPlan({ t }: { t: ClinicT }) {
  return (
    <div
      data-testid="plan-empty"
      className="flex flex-col items-center gap-5 rounded-[var(--ppp-radius)] border border-dashed border-border bg-surface/60 px-5 py-10"
    >
      <div aria-hidden className="flex w-full max-w-md flex-col gap-2.5">
        {[
          ["8%", "18%"],
          ["30%", "14%"],
          ["58%", "12%"],
          ["74%", "18%"],
        ].map(([left, width], i) => (
          <div key={i} className="relative h-3 rounded-full bg-surface-2">
            <span className="absolute inset-y-0 rounded-full bg-primary/20" style={{ left, width }} />
          </div>
        ))}
      </div>
      <p className="text-center text-sm text-muted">{t("planEmpty")}</p>
    </div>
  );
}
