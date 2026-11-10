/** Plain-data plan diff (clinic diff panel, agent invoice reissue, explainDiff wording). */
import type { Phase, PhaseDiff, Plan, PlanDiff, QuoteLine } from "@/contracts";

function linesOf(plan: Plan, phase: Phase | undefined): Map<string, QuoteLine> {
  const out = new Map<string, QuoteLine>();
  if (!phase) return out;
  for (const id of phase.lineIds) {
    const l = plan.lines.find((x) => x.id === id);
    if (l) out.set(id, l);
  }
  return out;
}

/** Only phases whose amount, lines or dates changed, in phase order. */
export function diffPlans(before: Plan, after: Plan): PlanDiff {
  const phases: PhaseDiff[] = [];
  const beforeById = new Map(before.phases.map((p) => [p.id, p]));
  for (const a of [...after.phases].sort((x, y) => x.n - y.n)) {
    const b = beforeById.get(a.id);
    const bLines = linesOf(before, b);
    const aLines = linesOf(after, a);
    const addedLines = [...aLines.values()].filter((l) => !bLines.has(l.id));
    const removedLines = [...bLines.values()].filter((l) => !aLines.has(l.id));
    const amountBeforeCents = b?.amountCents ?? 0;
    const startBefore = b?.startDate ?? a.startDate;
    const changed =
      !b ||
      amountBeforeCents !== a.amountCents ||
      addedLines.length > 0 ||
      removedLines.length > 0 ||
      startBefore !== a.startDate ||
      b.endDate !== a.endDate;
    if (!changed) continue;
    phases.push({
      phaseId: a.id,
      n: a.n,
      amountBeforeCents,
      amountAfterCents: a.amountCents,
      deltaCents: a.amountCents - amountBeforeCents,
      fitBefore: b?.fit.band ?? a.fit.band,
      fitAfter: a.fit.band,
      addedLines: structuredClone(addedLines),
      removedLines: structuredClone(removedLines),
      startBefore,
      startAfter: a.startDate,
    });
  }
  return {
    planId: after.id,
    fromVersion: before.version,
    toVersion: after.version,
    totalBeforeCents: before.totalCents,
    totalAfterCents: after.totalCents,
    totalDeltaCents: after.totalCents - before.totalCents,
    phases,
  };
}
