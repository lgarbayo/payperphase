"use client";
/**
 * Gantt lab (/gantt-lab): the golden plan with knobs (simulated today, mode, ghost
 * preview, locale, paid phase 1) and the full drag loop wired like the patient page: commit →
 * (simulated) persist via engine.reschedule → new plan prop. Also the Gate A Bryntum smoke page.
 *
 * URL knobs for screenshots: ?today=YYYY-MM-DD&mode=patient|clinic|readonly&paid=1&ghost=1&lang=en
 *                            &scenario=delay|late
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { PlanGantt } from "@/components/gantt/PlanGantt";
import type { ClinicalNote, MoveRequest, NoteId, PhaseShift, Plan } from "@/contracts";
import { GOLDEN_DELAY_MOVE, GOLDEN_START_DATE, goldenPlan } from "@/contracts/fixtures/implantCase";
import { reschedule } from "@/engine";
import { useLocale } from "@/i18n";
import { addDays, formatIsoDate, isIsoDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { Badge, Button, Card, SimClockBadge } from "@/lib/ui";
import { cx } from "@/lib/ui/cx";
import { NOTE_LIBRARY } from "@data/seed/notes";

type Mode = "patient" | "clinic" | "readonly";
type Rejection = { phaseId: string; noteId?: NoteId; earliestStartDate?: string };
type LogEntry = { id: number; tone: "primary" | "overdue" | "paid" | "upcoming"; text: string };

const PERSIST_LATENCY_MS = 350;
const LATE_MOVE: MoveRequest = { phaseId: "ph2", newStartDate: "2027-06-01" };

function withPaidPhase(plan: Plan, phaseId: string, on: string): Plan {
  return {
    ...plan,
    phases: plan.phases.map((p) =>
      p.id === phaseId
        ? {
            ...p,
            payment: { ...p.payment, status: "paid", instrument: "order", paidCents: p.amountCents, paidAt: `${on}T10:00:00.000Z` },
            delivery: { status: "delivered", deliveredOn: on },
          }
        : p,
    ),
  };
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-[var(--ppp-radius-sm)] border border-border bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          data-testid={`lab-${label.toLowerCase()}-${o.value}`}
          onClick={() => onChange(o.value)}
          className={cx(
            "rounded-[6px] px-3 py-1 text-sm font-medium",
            value === o.value ? "bg-primary text-primary-ink" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Knob({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-semibold tracking-wide text-muted uppercase">{label}</span>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export default function GanttLab() {
  const { locale, setLocale } = useLocale();
  const [today, setToday] = useState(GOLDEN_START_DATE);
  const [mode, setMode] = useState<Mode>("patient");
  const [paidPh1, setPaidPh1] = useState(false);
  const [ghost, setGhost] = useState<MoveRequest | null>(null);
  const [plan, setPlan] = useState<Plan>(() => goldenPlan());
  const [rejection, setRejection] = useState<Rejection | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [saving, setSaving] = useState(false);

  const push = useCallback((tone: LogEntry["tone"], text: string) => {
    setLog((l) => [{ id: Date.now() + Math.random(), tone, text }, ...l].slice(0, 6));
  }, []);

  // URL knobs, read once on the client (keeps this page free of Suspense/useSearchParams).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const t = q.get("today");
    if (t && isIsoDate(t)) setToday(t);
    const m = q.get("mode");
    if (m === "patient" || m === "clinic" || m === "readonly") setMode(m);
    if (q.get("paid") === "1") setPaidPh1(true);
    if (q.get("ghost") === "1") setGhost({ phaseId: "ph2", newStartDate: addDays("2027-01-12", 91) });
    const scenario = q.get("scenario");
    const base = goldenPlan();
    const at = t && isIsoDate(t) ? t : GOLDEN_START_DATE;
    try {
      if (scenario === "delay") setPlan(reschedule(base, GOLDEN_DELAY_MOVE, at).plan);
      if (scenario === "late") setPlan(reschedule(base, LATE_MOVE, at).plan);
    } catch {
      /* scenario not valid at that simulated date: keep the golden plan */
    }
  }, []);

  const shownPlan = useMemo(() => (paidPh1 ? withPaidPhase(plan, "ph1", GOLDEN_START_DATE) : plan), [plan, paidPh1]);

  const notes = useMemo(() => {
    const out: Partial<Record<NoteId, ClinicalNote>> = {};
    for (const ref of shownPlan.approvedNotes) {
      const note = NOTE_LIBRARY[ref.noteId];
      if (note) out[ref.noteId] = note;
    }
    return out;
  }, [shownPlan.approvedNotes]);

  const ghostShifts: PhaseShift[] | undefined = useMemo(() => {
    if (!ghost) return undefined;
    try {
      return reschedule(shownPlan, ghost, today).shifts;
    } catch {
      return undefined; // e.g. the preview date fell into the simulated past
    }
  }, [ghost, shownPlan, today]);

  const phaseTitle = (phaseId: string) => {
    const p = shownPlan.phases.find((x) => x.id === phaseId);
    return p ? `${p.n}. ${p.title[locale]}` : phaseId;
  };

  const onMoveCommitted = useCallback(
    (move: MoveRequest) => {
      setRejection(null);
      setSaving(true);
      push("primary", `whatif ${move.phaseId} → ${move.newStartDate}`);
      // Simulated POST /api/plans/:id/whatif: the "server" runs the engine and returns the new plan.
      setTimeout(() => {
        setPlan((p) => {
          try {
            return reschedule(p, move, today).plan;
          } catch {
            return p; // the "server" re-validates and refuses: keep the persisted plan
          }
        });
        setSaving(false);
      }, PERSIST_LATENCY_MS);
    },
    [push, today],
  );

  const onMoveRejected = useCallback(
    (info: Rejection) => {
      setRejection(info);
      push("overdue", `snap-back ${info.phaseId}${info.noteId ? ` · ${info.noteId}` : ""}`);
    },
    [push],
  );

  const onPayPhase = useCallback(
    (phaseId: string) => {
      push("paid", `pay ${phaseId}`);
      setPlan((p) => withPaidPhase(p, phaseId, today));
    },
    [push, today],
  );

  const onAskDelay = useCallback(
    (phaseId: string) => {
      const phase = shownPlan.phases.find((p) => p.id === phaseId);
      if (!phase) return;
      push("upcoming", `ask delay ${phaseId} (+8 sem preview)`);
      setGhost({ phaseId, newStartDate: addDays(phase.startDate, 56) });
    },
    [push, shownPlan],
  );

  const reset = () => {
    setPlan(goldenPlan());
    setToday(GOLDEN_START_DATE);
    setPaidPh1(false);
    setGhost(null);
    setRejection(null);
    setLog([]);
  };

  const rejectionNote = rejection?.noteId ? notes[rejection.noteId] : undefined;
  const total = shownPlan.phases.reduce((a, p) => a + p.amountCents, 0);

  return (
    <main className="mx-auto flex max-w-[1400px] flex-col gap-5 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">Dev · Gantt lab</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {shownPlan.clinic.name} · {shownPlan.patient.alias}
          </h1>
          <p className="text-sm text-muted">
            {shownPlan.phases.length} {locale === "es" ? "fases" : "phases"} · {formatCents(total, locale)} · v{shownPlan.version}
            {saving ? (locale === "es" ? " · guardando…" : " · saving…") : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SimClockBadge today={today} locale={locale} />
          <Badge tone="primary">Bryntum Gantt 7.3.8</Badge>
        </div>
      </header>

      <Card className="flex flex-wrap items-end gap-x-8 gap-y-4 p-4">
        <Knob label="Today">
          <Button size="sm" variant="secondary" onClick={() => setToday((d) => addDays(d, -7))}>
            −1 wk
          </Button>
          <input
            type="date"
            aria-label="Simulated today"
            value={today}
            onChange={(e) => isIsoDate(e.target.value) && setToday(e.target.value)}
            className="h-8 rounded-[var(--ppp-radius-sm)] border border-border bg-surface px-2 font-mono text-sm"
          />
          <Button size="sm" variant="secondary" onClick={() => setToday((d) => addDays(d, 7))}>
            +1 wk
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setToday((d) => addDays(d, 49))}>
            +7 wk
          </Button>
        </Knob>
        <Knob label="Mode">
          <Segmented
            label="Mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: "patient", label: "patient" },
              { value: "clinic", label: "clinic" },
              { value: "readonly", label: "readonly" },
            ]}
          />
        </Knob>
        <Knob label="Locale">
          <Segmented
            label="Locale"
            value={locale}
            onChange={setLocale}
            options={[
              { value: "es", label: "ES" },
              { value: "en", label: "EN" },
            ]}
          />
        </Knob>
        <Knob label="Plan">
          <Button size="sm" variant={paidPh1 ? "primary" : "secondary"} aria-pressed={paidPh1} onClick={() => setPaidPh1((v) => !v)}>
            {paidPh1 ? "✓ " : ""}ph1 paid
          </Button>
          <Button
            size="sm"
            variant={ghost ? "primary" : "secondary"}
            aria-pressed={Boolean(ghost)}
            onClick={() => setGhost((g) => (g ? null : { phaseId: "ph2", newStartDate: addDays("2027-01-12", 91) }))}
          >
            Ghost preview
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onMoveCommitted(GOLDEN_DELAY_MOVE)}>
            Delay ph2 +6 wk
          </Button>
          <Button size="sm" variant="secondary" onClick={() => onMoveCommitted(LATE_MOVE)}>
            ph2 past 6 months
          </Button>
          <Button size="sm" variant="ghost" onClick={reset}>
            Reset
          </Button>
        </Knob>
      </Card>

      <PlanGantt
        plan={shownPlan}
        today={today}
        locale={locale}
        mode={mode}
        notes={notes}
        ghostShifts={ghostShifts}
        onMoveCommitted={onMoveCommitted}
        onMoveRejected={onMoveRejected}
        onPayPhase={onPayPhase}
        onAskDelay={onAskDelay}
        height={540}
      />

      <section className="grid gap-4 md:grid-cols-[2fr_1fr]">
        <Card className="min-h-[132px]" data-testid="lab-rejection">
          {rejection ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Badge tone="overdue">{locale === "es" ? "Movimiento no permitido" : "Move not allowed"}</Badge>
                <span className="text-sm text-muted">{phaseTitle(rejection.phaseId)}</span>
              </div>
              <p className="font-semibold">{rejectionNote?.title[locale] ?? rejection.noteId ?? "—"}</p>
              {rejectionNote && <p className="text-sm">{rejectionNote.text[locale]}</p>}
              <p className="text-xs text-muted">
                {shownPlan.approvedBy ? `${locale === "es" ? "Aprobado por" : "Approved by"} ${shownPlan.approvedBy}` : ""}
                {rejection.earliestStartDate
                  ? ` · ${locale === "es" ? "Primera fecha posible" : "Earliest date"}: ${formatIsoDate(rejection.earliestStartDate, locale)}`
                  : ""}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted">
              {locale === "es"
                ? "Arrastra la fase 2 a la izquierda, antes de la cicatrización mínima: vuelve a su sitio y aquí aparece la nota de la dentista."
                : "Drag phase 2 left, before the minimum healing time: it snaps back and the dentist's note appears here."}
            </p>
          )}
        </Card>
        <Card className="p-4">
          <p className="mb-2 text-[11px] font-semibold tracking-wide text-muted uppercase">Events</p>
          {log.length === 0 ? (
            <p className="text-sm text-muted">—</p>
          ) : (
            <ul className="flex flex-col gap-1.5" data-testid="lab-log">
              {log.map((e) => (
                <li key={e.id}>
                  <Badge tone={e.tone} className="font-mono">
                    {e.text}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>
    </main>
  );
}
