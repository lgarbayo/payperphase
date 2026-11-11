/**
 * OWNED BY WP-11. Deterministic mock router (no API key; answers are labelled cached).
 * Delay questions (ES/EN) become a `simulate_delay` call; medication and everything else is referred
 * to the clinic. No model, no randomness: the same question always routes the same way.
 */
import type { Phase, Plan } from "@/contracts";
import type { SimulateDelayInput } from "./delay";

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

const DELAY_WORDS =
  /\b(esper\w*|retras\w*|aplaz\w*|pospon\w*|posterg\w*|demor\w*|alarg\w*|wait\w*|delay\w*|postpon\w*|put off|push\w* back|later)\b/;
const MEDICAL_WORDS =
  /\b(ibuprofen\w*|paracetamol|aspirin\w*|nolotil|enantyum|dolor|duele|dosis|medicin\w*|medicament\w*|medicat\w*|pastilla\w*|antibiotic\w*|analgesic\w*|antiinflam\w*|pain\w*|painkiller\w*|dose|dosage|pill\w*|drug\w*|infecc\w*|infect\w*|sangr\w*|bleed\w*|hincha\w*|swell\w*|fiebre|fever|alerg\w*|embaraz\w*|pregnan\w*|diagnos\w*)\b/;

const WORD_NUMBERS: Record<string, number> = {
  un: 1, uno: 1, una: 1, one: 1, a: 1, dos: 2, two: 2, tres: 3, three: 3, cuatro: 4, four: 4, cinco: 5, five: 5,
  seis: 6, six: 6, siete: 7, seven: 7, ocho: 8, eight: 8, nueve: 9, nine: 9, diez: 10, ten: 10,
  once: 11, eleven: 11, doce: 12, twelve: 12,
};
const AMOUNT =
  /\b(\d{1,3}|a|un|uno|una|one|dos|two|tres|three|cuatro|four|cinco|five|seis|six|siete|seven|ocho|eight|nueve|nine|diez|ten|once|eleven|doce|twelve)\s+(?:more\s+|mas\s+)?(semanas?|weeks?|meses|mes|months?|anos?|years?)\b/;

export interface ParsedAmount {
  amount: number;
  unit: "weeks" | "months";
}

export function parseAmount(question: string): ParsedAmount | null {
  const m = AMOUNT.exec(norm(question));
  if (!m) return null;
  const n = /^\d+$/.test(m[1]!) ? Number(m[1]) : WORD_NUMBERS[m[1]!];
  if (!n) return null;
  const u = m[2]!;
  if (u.startsWith("sem") || u.startsWith("week")) return { amount: n, unit: "weeks" };
  if (u.startsWith("an") || u.startsWith("year")) return { amount: n * 12, unit: "months" };
  return { amount: n, unit: "months" };
}

/** Which phase the patient means: "fase 2", "phase two", or a procedure word; else the next pending phase. */
export function resolvePhase(question: string, plan: Plan): Phase | undefined {
  const s = norm(question);
  const explicit = /\b(?:fase|phase|visita|visit)\s+(\d{1,2}|un|uno|dos|tres|cuatro|one|two|three|four|five)\b/.exec(s);
  if (explicit) {
    const n = /^\d+$/.test(explicit[1]!) ? Number(explicit[1]) : WORD_NUMBERS[explicit[1]!];
    const hit = plan.phases.find((p) => p.n === n);
    if (hit) return hit;
  }
  const byKind: [RegExp, Phase["kind"][]][] = [
    [/\b(implant\w*|cirugia|surgery)\b/, ["IMPLANT_SURGERY"]],
    [/\b(coron\w*|crown\w*|protesis|prosthe\w*|definitiv\w*)\b/, ["PROSTHETIC"]],
    [/\b(pilar\w*|abutment\w*|impresion\w*|impression\w*|escaner|scan\w*)\b/, ["IMPRESSIONS"]],
    [/\b(extraccion\w*|extraction\w*|limpieza|cleaning|diagnostic\w*)\b/, ["PREP"]],
    [/\b(encia\w*|gum\w*|periodon\w*|perio\w*)\b/, ["PERIO_THERAPY", "PERIO_REEVALUATION"]],
    [/\b(alineador\w*|aligner\w*|ortodon\w*|ortho\w*)\b/, ["ALIGNER_BATCH", "ORTHO_START", "ORTHO_FINISH"]],
  ];
  for (const [re, kinds] of byKind) {
    if (!re.test(s)) continue;
    const hit = plan.phases.find((p) => kinds.includes(p.kind));
    if (hit) return hit;
  }
  return undefined;
}

/** Default when the patient names no phase: the first phase that is not yet paid or delivered. */
export function nextPendingPhase(plan: Plan): Phase | undefined {
  return [...plan.phases]
    .sort((a, b) => a.n - b.n)
    .find((p) => p.payment.status !== "paid" && p.delivery.status !== "delivered");
}

export type Route =
  | { kind: "delay"; input: SimulateDelayInput }
  | { kind: "needs_amount" }
  | { kind: "referral" };

export function routeQuestion(question: string, plan: Plan): Route {
  const s = norm(question).replace(/\b(sala de espera|lista de espera|waiting (?:room|list))\b/g, " ");
  if (MEDICAL_WORDS.test(s)) return { kind: "referral" };
  if (!DELAY_WORDS.test(s)) return { kind: "referral" };
  const amount = parseAmount(question);
  if (!amount) return { kind: "needs_amount" };
  const phase = resolvePhase(question, plan) ?? nextPendingPhase(plan);
  if (!phase) return { kind: "referral" };
  return { kind: "delay", input: { phaseN: phase.n, ...amount } };
}
