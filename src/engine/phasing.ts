/**
 * Quote → clinical phases. Lines are grouped by catalog stage, a stage over the Pay-in-3 max is split
 * into "(1/2)", "(2/2)" visits by whole units (never by moving money between phases), visits are
 * chained with healing lags and scheduled ASAP on clinic days from the start date.
 */
import {
  CURRENCY,
  PAY_IN_3,
  type BuildPlanInput,
  type CaseKind,
  type FdiTooth,
  type LocalizedText,
  type NoteId,
  type Phase,
  type PhaseDependency,
  type PhaseFit,
  type PhaseKind,
  type Plan,
  type ProcedureCode,
  type QuoteLine,
} from "@/contracts";
import { addDays, nextClinicDay } from "@/lib/dates";
import { CATALOG, STAGE_ORDER, lagRule, partTitle, stageFor, stageTitle } from "./catalog";
import { EngineError } from "./errors";
import { fitFor, fitNoteId } from "./fit";
import { paymentStatusAt } from "./payments";

/** The smallest billable piece of a line: one unit of a divisible line, or a whole indivisible line. */
export interface Unit {
  line: QuoteLine;
  cents: number;
  teeth: FdiTooth[];
}

/** A line's units. Lines whose total is not qty × unit price are never split (money stays exact). */
export function lineUnits(line: QuoteLine): Unit[] {
  const divisible =
    CATALOG[line.code].divisible && line.qty > 1 && line.totalCents === line.qty * line.unitPriceCents;
  if (!divisible) return [{ line, cents: line.totalCents, teeth: [...line.teeth] }];
  const perTooth = line.teeth.length === line.qty;
  return Array.from({ length: line.qty }, (_, i) => ({
    line,
    cents: line.unitPriceCents,
    teeth: perTooth ? [line.teeth[i]!] : [...line.teeth],
  }));
}

interface StageGroup {
  kind: PhaseKind;
  units: Unit[];
  /** Codes of every line in the stage (for lag rules and titles). */
  codes: Set<ProcedureCode>;
  title: LocalizedText;
}

function qtyByCode(units: readonly Unit[]): Map<ProcedureCode, number> {
  const seen = new Set<string>();
  const out = new Map<ProcedureCode, number>();
  for (const u of units) {
    if (seen.has(u.line.id)) continue;
    seen.add(u.line.id);
    out.set(u.line.code, (out.get(u.line.code) ?? 0) + u.line.qty);
  }
  return out;
}

function group(kind: PhaseKind, units: Unit[], batchNo?: number): StageGroup {
  const title = stageTitle({ kind, qtyByCode: qtyByCode(units), batchNo });
  return { kind, units, codes: new Set(units.map((u) => u.line.code)), title };
}

/** Lines → ordered, non-empty stage groups for the case kind. */
function stageGroups(lines: readonly QuoteLine[], caseKind: CaseKind): StageGroup[] {
  const ordered = [...lines].sort((a, b) => a.lineNo - b.lineNo);
  const byStage = new Map<PhaseKind, Unit[]>();
  for (const line of ordered) {
    const stage = stageFor(line.code, caseKind);
    byStage.set(stage, [...(byStage.get(stage) ?? []), ...lineUnits(line)]);
  }
  const groups: StageGroup[] = [];
  for (const kind of STAGE_ORDER[caseKind]) {
    const units = byStage.get(kind) ?? [];
    if (kind === "ALIGNER_BATCH") continue; // handled with ORTHO_START below
    if (kind === "ORTHO_START") {
      // Records + the first aligner batch, then one phase per further batch.
      const batches = byStage.get("ALIGNER_BATCH") ?? [];
      const [first, ...rest] = batches;
      const startUnits = first ? [...units, first] : units;
      if (startUnits.length > 0) groups.push(group("ORTHO_START", startUnits));
      rest.forEach((b, i) => groups.push(group("ALIGNER_BATCH", [b], i + 2)));
      continue;
    }
    if (units.length > 0) groups.push(group(kind, units));
  }
  return groups;
}

/**
 * Order-preserving greedy packing into visits of at most the Pay-in-3 max. A unit larger than the max
 * (an indivisible item) gets a visit of its own and is flagged by its fit band instead.
 */
export function packUnits(units: readonly Unit[], maxCents: number = PAY_IN_3.maxCents): Unit[][] {
  const total = units.reduce((a, u) => a + u.cents, 0);
  if (total <= maxCents) return [units.slice()];
  const bins: Unit[][] = [];
  let cur: Unit[] = [];
  let sum = 0;
  for (const u of units) {
    if (cur.length > 0 && sum + u.cents > maxCents) {
      bins.push(cur);
      cur = [];
      sum = 0;
    }
    cur.push(u);
    sum += u.cents;
  }
  if (cur.length > 0) bins.push(cur);
  return bins;
}

/** Note ids relevant to a phase: healing windows → procedure notes → pay-per-phase promise (phase 1) → fit note. */
export function phaseNoteIds(args: {
  n: number;
  codes: readonly ProcedureCode[];
  dependsOn: readonly PhaseDependency[];
  fit: PhaseFit;
}): NoteId[] {
  const ids: NoteId[] = [];
  for (const d of args.dependsOn) {
    ids.push(d.riskNoteId);
    if (d.deadlineNoteId) ids.push(d.deadlineNoteId);
  }
  for (const c of args.codes) ids.push(...CATALOG[c].noteIds);
  if (args.n === 1) ids.push("PAY_PER_PHASE_PROMISE");
  const fitNote = fitNoteId(args.fit);
  if (fitNote) ids.push(fitNote);
  return [...new Set(ids)];
}

/** Codes of a phase's lines, in line order. */
export function phaseCodes(phase: Pick<Phase, "lineIds">, lines: readonly QuoteLine[]): ProcedureCode[] {
  const byId = new Map(lines.map((l) => [l.id, l]));
  const out: ProcedureCode[] = [];
  for (const id of phase.lineIds) {
    const l = byId.get(id);
    if (l && !out.includes(l.code)) out.push(l.code);
  }
  return out;
}

export function dependencyFrom(predId: string, rule: ReturnType<typeof lagRule>): PhaseDependency {
  const dep: PhaseDependency = { phaseId: predId, minLagDays: rule.minLagDays, riskNoteId: rule.riskNoteId };
  if (rule.maxLagDays !== undefined) dep.maxLagDays = rule.maxLagDays;
  if (rule.deadlineNoteId !== undefined) dep.deadlineNoteId = rule.deadlineNoteId;
  return dep;
}

/** Quote → phased, sized, scheduled draft plan (status "draft", no approvals, no baseline). */
export function buildPlan(input: BuildPlanInput): Plan {
  const lines = structuredClone(input.extraction.lines);
  if (lines.length === 0) throw new EngineError("NO_LINES", "Cannot build a plan from a quote without lines");

  interface Draft {
    kind: PhaseKind;
    title: LocalizedText;
    units: Unit[];
    stageCodes: Set<ProcedureCode>;
  }
  const drafts: Draft[] = [];
  for (const g of stageGroups(lines, input.caseKind)) {
    const bins = packUnits(g.units);
    bins.forEach((units, i) =>
      drafts.push({ kind: g.kind, title: partTitle(g.title, i + 1, bins.length), units, stageCodes: g.codes }),
    );
  }

  const phases: Phase[] = [];
  drafts.forEach((d, i) => {
    const n = i + 1;
    const prevDraft = drafts[i - 1];
    const prev = phases[i - 1];
    const dependsOn =
      prevDraft && prev ? [dependencyFrom(prev.id, lagRule(prevDraft.kind, prevDraft.stageCodes, d.kind))] : [];
    const startDate = prev
      ? nextClinicDay(addDays(prev.endDate, dependsOn[0]!.minLagDays))
      : nextClinicDay(input.startDate);
    const durationDays = Math.max(...d.units.map((u) => CATALOG[u.line.code].durationDays));
    const amountCents = d.units.reduce((a, u) => a + u.cents, 0);
    const fit = fitFor(amountCents);
    const lineIds = [...new Set(d.units.map((u) => u.line.id))];
    const codes = [...new Set(d.units.map((u) => u.line.code))];
    const teeth = [...new Set(d.units.flatMap((u) => u.teeth))].sort((a, b) => a - b);
    const phase: Phase = {
      id: `ph${n}`,
      n,
      kind: d.kind,
      title: d.title,
      lineIds,
      teeth,
      startDate,
      durationDays,
      endDate: addDays(startDate, durationDays),
      dependsOn,
      amountCents,
      fit,
      payment: { dueDate: startDate, status: "scheduled", orderAttempt: 0 },
      delivery: { status: "pending" },
      noteIds: phaseNoteIds({ n, codes, dependsOn, fit }),
    };
    phase.payment.status = paymentStatusAt(phase, input.today);
    phases.push(phase);
  });

  return {
    id: input.planId,
    version: 1,
    caseKind: input.caseKind,
    status: "draft",
    currency: CURRENCY,
    clinic: { ...input.clinic },
    patient: { ...input.patient },
    quoteId: input.extraction.quoteId,
    lines,
    totalCents: lines.reduce((a, l) => a + l.totalCents, 0),
    phases,
    approvedNotes: [],
    createdAt: input.now,
    updatedAt: input.now,
  };
}
