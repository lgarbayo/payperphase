/**
 * Dentist edits → a new plan version. The phase structure (ids, kinds, titles) is kept; the edited
 * phase is re-sized and re-fitted, every healing lag is re-derived from the phases' procedures, and
 * successors move later when a lag grows (never earlier). Paid or delivered phases cannot be edited.
 */
import {
  PROCEDURE_CATEGORY,
  type FdiTooth,
  type NewQuoteLine,
  type Phase,
  type PhaseKind,
  type Plan,
  type PlanEdit,
  type ProcedureCode,
  type QuoteLine,
} from "@/contracts";
import { nextClinicDay } from "@/lib/dates";
import { lagRule } from "./catalog";
import { EngineError } from "./errors";
import { fitFor } from "./fit";
import { dependencyFrom, phaseCodes, phaseNoteIds } from "./phasing";
import { lockReason, requiredStart, setPhaseStart, topoOrder } from "./schedule";

function assertEditable(phase: Phase): void {
  const locked = lockReason(phase);
  if (locked) throw new EngineError(locked, `Phase ${phase.id} is ${locked === "PHASE_PAID" ? "paid" : "delivered"} and cannot be edited`);
}

function newLine(lines: readonly QuoteLine[], line: NewQuoteLine): QuoteLine {
  const nextE = 1 + Math.max(0, ...lines.filter((l) => l.id.startsWith("E")).map((l) => Number(l.id.slice(1))));
  const nextNo = 1 + Math.max(0, ...lines.map((l) => l.lineNo));
  return {
    id: `E${nextE}`,
    lineNo: nextNo,
    description: line.description,
    code: line.code,
    category: PROCEDURE_CATEGORY[line.code],
    teeth: [...line.teeth],
    qty: line.qty,
    unitPriceCents: line.unitPriceCents,
    totalCents: line.qty * line.unitPriceCents,
    confidence: 1,
    issues: [],
    source: "clinic_edit",
  };
}

/** The single phase that bills `lineId`. A line split across visits cannot be edited in place. */
function owningPhase(plan: Plan, lineId: string): Phase {
  const owners = plan.phases.filter((p) => p.lineIds.includes(lineId));
  if (owners.length === 0) throw new EngineError("UNKNOWN_LINE", `Line ${lineId} is not billed in any phase`);
  if (owners.length > 1) {
    throw new EngineError("SPLIT_LINE", `Line ${lineId} is split across ${owners.map((p) => p.id).join(", ")}`);
  }
  return owners[0]!;
}

/** Teeth of a phase after its lines changed: whole teeth of its own lines, kept teeth of shared ones. */
function phaseTeeth(plan: Plan, phase: Phase, previousTeeth: readonly FdiTooth[]): FdiTooth[] {
  const prev = new Set(previousTeeth);
  const teeth = new Set<FdiTooth>();
  for (const id of phase.lineIds) {
    const line = plan.lines.find((l) => l.id === id);
    if (!line) continue;
    const shared = plan.phases.some((p) => p.id !== phase.id && p.lineIds.includes(id));
    for (const t of line.teeth) if (!shared || prev.has(t)) teeth.add(t);
  }
  return [...teeth].sort((a, b) => a - b);
}

/** Dentist edit → new plan version (re-sized, re-fitted, re-scheduled). */
export function applyEdit(plan: Plan, edit: PlanEdit, now: string): Plan {
  const next = structuredClone(plan);
  let touched: Phase;

  switch (edit.kind) {
    case "ADD_LINE": {
      const phase = next.phases.find((p) => p.id === edit.phaseId);
      if (!phase) throw new EngineError("UNKNOWN_PHASE", `Unknown phase ${edit.phaseId}`);
      assertEditable(phase);
      const line = newLine(next.lines, edit.line);
      const before = phase.teeth;
      next.lines.push(line);
      phase.lineIds.push(line.id);
      phase.amountCents += line.totalCents;
      phase.teeth = [...new Set([...before, ...line.teeth])].sort((a, b) => a - b);
      touched = phase;
      break;
    }
    case "REMOVE_LINE": {
      const line = next.lines.find((l) => l.id === edit.lineId);
      if (!line) throw new EngineError("UNKNOWN_LINE", `Unknown line ${edit.lineId}`);
      const phase = owningPhase(next, line.id);
      assertEditable(phase);
      if (phase.lineIds.length === 1) {
        throw new EngineError("EMPTY_PHASE", `Removing ${line.id} would leave ${phase.id} without treatment`);
      }
      const before = phase.teeth;
      next.lines = next.lines.filter((l) => l.id !== line.id);
      phase.lineIds = phase.lineIds.filter((id) => id !== line.id);
      phase.amountCents -= line.totalCents;
      phase.teeth = phaseTeeth(next, phase, before);
      touched = phase;
      break;
    }
    case "SET_UNIT_PRICE": {
      const line = next.lines.find((l) => l.id === edit.lineId);
      if (!line) throw new EngineError("UNKNOWN_LINE", `Unknown line ${edit.lineId}`);
      const phase = owningPhase(next, line.id);
      assertEditable(phase);
      const total = line.qty * edit.unitPriceCents;
      phase.amountCents += total - line.totalCents;
      line.unitPriceCents = edit.unitPriceCents;
      line.totalCents = total;
      touched = phase;
      break;
    }
  }

  touched.fit = fitFor(touched.amountCents);
  next.totalCents = next.lines.reduce((a, l) => a + l.totalCents, 0);

  // Re-derive every healing lag from the phases' procedures (a bone graft lengthens osseointegration).
  const byId = new Map(next.phases.map((p) => [p.id, p]));
  const stageCodes = new Map<PhaseKind, Set<ProcedureCode>>();
  for (const p of next.phases) {
    const set = stageCodes.get(p.kind) ?? new Set<ProcedureCode>();
    for (const c of phaseCodes(p, next.lines)) set.add(c);
    stageCodes.set(p.kind, set);
  }
  const changed = new Set<string>([touched.id]);
  for (const p of next.phases) {
    p.dependsOn = p.dependsOn.map((d) => {
      const pred = byId.get(d.phaseId);
      if (!pred) return d;
      const fresh = dependencyFrom(d.phaseId, lagRule(pred.kind, stageCodes.get(pred.kind) ?? new Set(), p.kind));
      const same =
        fresh.minLagDays === d.minLagDays &&
        fresh.maxLagDays === d.maxLagDays &&
        fresh.riskNoteId === d.riskNoteId &&
        fresh.deadlineNoteId === d.deadlineNoteId;
      if (same) return d;
      changed.add(p.id);
      return fresh;
    });
  }

  // Re-schedule forward: a successor moves to max(current, pred.endDate + minLag) on a clinic day.
  for (const p of topoOrder(next.phases)) {
    if (lockReason(p)) continue;
    const req = requiredStart(p, (id) => byId.get(id)?.endDate);
    if (req && req.date > p.startDate) setPhaseStart(p, nextClinicDay(req.date));
  }

  for (const p of next.phases) {
    if (!changed.has(p.id)) continue;
    p.noteIds = phaseNoteIds({ n: p.n, codes: phaseCodes(p, next.lines), dependsOn: p.dependsOn, fit: p.fit });
  }

  next.version = plan.version + 1;
  next.updatedAt = now;
  return next;
}
