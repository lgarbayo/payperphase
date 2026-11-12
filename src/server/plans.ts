/**
 * OWNED BY WP-09. Plan use cases behind /api/plans/*. Route handlers parse and validate the body,
 * then call these. Rules:
 * - money and dates come only from the engine; the store is the only writer;
 * - each read-modify-write runs inside store.updatePlan (atomic, serialized);
 * - events are published only after the change is on disk.
 */
import {
  type ApprovePlanRequest,
  type CreatePlanRequest,
  type EditPlanRequest,
  type EditPlanResponse,
  type MoveValidation,
  type Plan,
  type PlanDiff,
  type WhatIfRequest,
  type WhatIfResponse,
  type WhatIfResult,
  planShortCode,
} from "@/contracts";
import { explainDiff, phaseSlotValues, slotStrings } from "@/ai/wording";
import {
  applyEdit,
  applyPaymentStatuses,
  buildPlan,
  captureBaseline,
  diffPlans,
  markDelivered,
  reschedule,
  validateMove,
  type StatusChange,
} from "@/engine";
import { nowIso } from "@/lib/http";
import { NOTE_LIBRARY } from "@data/seed/notes";
import { seedCases } from "@data/seed";
import { RouteError } from "./errors";
import { publish } from "./events";
import { newPlanId } from "./ids";
import { store } from "./store";

/** Synthetic patient email used when a quote does not match a seed case (the agent's guard checks it). */
export const FALLBACK_PATIENT_EMAIL = "paciente.demo@example.com";
const FALLBACK_CITY = "Valencia";

function publishStatusChanges(planId: string, changes: readonly StatusChange[]): void {
  for (const c of changes) publish({ type: "PHASE_STATUS_CHANGED", planId, phaseId: c.phaseId, from: c.from, to: c.to });
}

/** What a filled phase template shows ({{amount}} {{date}} {{teeth}} {{minWeeks}} …), in both locales. */
function slotText(plan: Plan, phase: Plan["phases"][number]): string {
  const values = phaseSlotValues(plan, phase);
  return JSON.stringify([slotStrings(values, "es"), slotStrings(values, "en")]);
}

/**
 * An approved summary is a template already filled with the engine values of approval time, and
 * only the filled text is stored. When an edit or a move changes any of those values, the text would
 * contradict the amount and date on the same card, so it is dropped (the card keeps the engine's own
 * figures). Phases whose values did not change keep their approved text.
 */
function dropStaleSummaries(before: Plan, after: Plan): Plan {
  return {
    ...after,
    phases: after.phases.map((p) => {
      if (!p.summary) return p;
      const prev = before.phases.find((x) => x.id === p.id);
      if (prev && slotText(before, prev) === slotText(after, p)) return p;
      const { summary: _stale, ...rest } = p;
      return rest;
    }),
  };
}

/** "María García (paciente ficticia)" → "María G." (privacy-friendly alias for the UI). */
export function patientAlias(printedName: string): string {
  const words = printedName.replace(/\(.*?\)/g, " ").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "Paciente";
  const [first, second] = words;
  return second ? `${first} ${second.charAt(0).toUpperCase()}.` : first!;
}

// ---------------------------------------------------------------- create

/** POST /api/plans: a draft plan (engine.buildPlan) from a stored extraction. Publishes PLAN_CREATED. */
export async function createDraftPlan(req: CreatePlanRequest): Promise<Plan> {
  const extraction = await store.getExtraction(req.quoteId);
  if (!extraction) throw new RouteError(404, "UNKNOWN_QUOTE", `No extraction stored for quoteId ${req.quoteId}`);
  const { today } = await store.getClock();
  const taken = new Set((await store.listPlans()).map((p) => p.id));
  const taken4 = new Set([...taken].map(planShortCode));
  // A quote from a seed case keeps that case's clinic and synthetic patient (same sandbox recipient).
  const template = seedCases().find((c) => c.extraction.quoteId === extraction.quoteId)?.plan;
  const plan = buildPlan({
    planId: newPlanId((id) => taken.has(id) || taken4.has(planShortCode(id))),
    extraction,
    caseKind: req.caseKind,
    startDate: req.startDate ?? today,
    today,
    clinic: template?.clinic ?? { name: extraction.clinicName, city: FALLBACK_CITY, dentistName: extraction.dentistName },
    patient: template?.patient ?? {
      alias: patientAlias(extraction.patientName),
      email: FALLBACK_PATIENT_EMAIL,
      locale: "es",
    },
    now: nowIso(),
  });
  const saved = await store.savePlan(plan);
  publish({ type: "PLAN_CREATED", planId: saved.id });
  return saved;
}

// ---------------------------------------------------------------- approve

/**
 * POST /api/plans/:id/approve: the dentist's "Approve & send to patient" (also the human approval
 * for the initial per-phase invoice issue). Draft → approved with the approved notes (library
 * versions), phase summaries and the baseline snapshot; statuses applied at the simulated day.
 * An implant plan becomes the hero (alias "demo"). Publishes PLAN_APPROVED.
 * On an already approved plan the same call only releases notes that are not approved yet (409
 * when there are none); it publishes nothing, so the agent does not reissue invoices.
 */
export async function approvePlan(id: string, req: ApprovePlanRequest): Promise<Plan> {
  const noteIds = [...new Set(req.noteIds)];
  const unknownNote = noteIds.find((n) => !NOTE_LIBRARY[n]);
  if (unknownNote) throw new RouteError(422, "UNKNOWN_NOTE", `Note ${unknownNote} is not in the note library`);
  const { today } = await store.getClock();
  const now = nowIso();
  let notesOnly = false;
  const plan = await store.updatePlan(id, (cur) => {
    if (cur.status !== "draft") {
      // After an edit the plan cites notes the patient has not seen (e.g. the bone-graft healing
      // note). The clinic releases them here: only the not-yet-approved notes are added; dates,
      // baseline, summaries and invoices are untouched.
      const have = new Set(cur.approvedNotes.map((n) => n.noteId));
      const fresh = noteIds.filter((n) => !have.has(n));
      if (fresh.length === 0) throw new RouteError(409, "PLAN_NOT_DRAFT", `Plan ${cur.id} is already ${cur.status}`);
      notesOnly = true;
      return {
        ...cur,
        approvedNotes: [
          ...cur.approvedNotes,
          ...fresh.map((noteId) => ({ noteId, noteVersion: NOTE_LIBRARY[noteId].version, approvedBy: req.approvedBy, approvedAt: now })),
        ],
      };
    }
    const unknownPhase = req.summaries.find((s) => !cur.phases.some((p) => p.id === s.phaseId));
    if (unknownPhase) throw new RouteError(422, "UNKNOWN_PHASE", `Summary for unknown phase ${unknownPhase.phaseId}`);
    const approved = captureBaseline(
      {
        ...cur,
        status: "approved",
        approvedBy: req.approvedBy,
        approvedAt: now,
        approvedNotes: noteIds.map((noteId) => ({
          noteId,
          noteVersion: NOTE_LIBRARY[noteId].version,
          approvedBy: req.approvedBy,
          approvedAt: now,
        })),
        phases: cur.phases.map((p) => {
          const s = req.summaries.find((x) => x.phaseId === p.id);
          return s ? { ...p, summary: s.text } : p;
        }),
      },
      now,
    );
    return applyPaymentStatuses(approved, today).plan;
  });
  if (notesOnly) return plan;
  if (plan.caseKind === "implant") await store.setHeroPlanId(plan.id);
  publish({ type: "PLAN_APPROVED", planId: plan.id, version: plan.version });
  return plan;
}

// ---------------------------------------------------------------- what-if

const REJECTED = Symbol("move rejected");

/**
 * POST /api/plans/:id/whatif: engine.validateMove → engine.reschedule. persist:false is a pure
 * preview. A persisted move keeps the approved baseline (the Gantt's ghost), re-derives statuses
 * and publishes PLAN_RESCHEDULED (plus PHASE_STATUS_CHANGED for any milestone that changed).
 */
export async function whatIf(id: string, req: WhatIfRequest): Promise<{ status: 200 | 409; body: WhatIfResponse }> {
  const { today } = await store.getClock();
  const move = { phaseId: req.phaseId, newStartDate: req.newStartDate };

  if (!req.persist) {
    const plan = await store.getPlan(id);
    if (!plan) throw new RouteError(404, "NOT_FOUND", `Plan not found: ${id}`);
    const validation = validateMove(plan, move, today);
    if (!validation.ok) return { status: 409, body: { ok: false, validation } };
    const preview = reschedule(plan, move, today);
    return { status: 200, body: { ok: true, result: { ...preview, plan: dropStaleSummaries(plan, preview.plan) } } };
  }

  let rejection: MoveValidation | null = null;
  let result: WhatIfResult | null = null;
  let changes: StatusChange[] = [];
  let saved: Plan;
  try {
    saved = await store.updatePlan(id, (cur) => {
      const validation = validateMove(cur, move, today);
      if (!validation.ok) {
        rejection = validation;
        throw REJECTED;
      }
      const moved = reschedule(cur, move, today);
      const applied = applyPaymentStatuses({ ...moved.plan, baseline: cur.baseline }, today);
      result = moved;
      changes = applied.changes;
      return dropStaleSummaries(cur, applied.plan);
    });
  } catch (err) {
    if (err === REJECTED && rejection) return { status: 409, body: { ok: false, validation: rejection } };
    throw err;
  }
  const done: WhatIfResult = { ...result!, plan: saved };
  publish({ type: "PLAN_RESCHEDULED", planId: saved.id, version: saved.version, shifts: done.shifts });
  publishStatusChanges(saved.id, changes);
  return { status: 200, body: { ok: true, result: done } };
}

// ---------------------------------------------------------------- edit

/**
 * POST /api/plans/:id/edit: engine.applyEdit + diffPlans, saved, PLAN_EDITED {diff} (the agent
 * reissues the changed invoice), then the plain-language explainDiff for the clinic.
 */
export async function editPlan(id: string, req: EditPlanRequest): Promise<EditPlanResponse> {
  const { today } = await store.getClock();
  const now = nowIso();
  let diff: PlanDiff | null = null;
  let changes: StatusChange[] = [];
  const after = await store.updatePlan(id, (cur) => {
    const edited = applyPaymentStatuses(applyEdit(cur, req.edit, now), today);
    changes = edited.changes;
    diff = diffPlans(cur, edited.plan);
    return dropStaleSummaries(cur, edited.plan);
  });
  const planDiff = diff!;
  publish({ type: "PLAN_EDITED", planId: after.id, diff: planDiff });
  publishStatusChanges(after.id, changes);
  const explanation = await explainDiff(planDiff, after).catch((err: unknown) => {
    console.warn("[plans] explainDiff failed; returning the diff without an explanation:", err);
    return undefined;
  });
  return explanation ? { plan: after, diff: planDiff, explanation } : { plan: after, diff: planDiff };
}

// ---------------------------------------------------------------- deliver

/** POST /api/plans/:id/phases/:phaseId/deliver: engine.markDelivered on the simulated day. */
export async function deliverPhase(id: string, phaseId: string): Promise<Plan> {
  const { today } = await store.getClock();
  let changed = false;
  const plan = await store.updatePlan(id, (cur) => {
    const phase = cur.phases.find((p) => p.id === phaseId);
    if (!phase) throw new RouteError(404, "UNKNOWN_PHASE", `Phase not found: ${phaseId}`);
    if (cur.status === "draft") throw new RouteError(409, "PLAN_NOT_APPROVED", `Plan ${cur.id} is not approved yet`);
    changed = phase.delivery.status !== "delivered";
    return markDelivered(cur, phaseId, today);
  });
  if (changed) publish({ type: "PHASE_DELIVERED", planId: plan.id, phaseId });
  return plan;
}
