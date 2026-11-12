/**
 * OWNED BY WP-14. The six video beats: hotkey, store state, where Director Mode navigates, and the
 * deep link that reproduces it (`?director=1&beat=N` applies the beat on load, then strips the param).
 * B5 puts the simulated clock on phase 2's visit day (the implant): phase 2 is due, so its invoice is
 * issued that day, and the bone-graft edit reissues it (src/server/seed.ts).
 */
import type { DemoBeat } from "@/contracts";

export interface BeatDef {
  /** Hotkey "1".."6" and the `beat` query value. */
  n: 1 | 2 | 3 | 4 | 5 | 6;
  beat: DemoBeat;
  /** Navigation target after the beat state is applied (path + optional anchor). */
  href: string;
  path: string;
  hash: string;
  /** landing.* dictionary keys. */
  nameKey: "beatB1" | "beatB2" | "beatB3" | "beatB4" | "beatB5" | "beatB6";
  hubKey: "hubB1" | "hubB2" | "hubB3" | "hubB4" | "hubB5" | "hubB6";
  /** Where the beat sits in the 2:50 script. */
  time: string;
}

function def(
  n: BeatDef["n"],
  beat: DemoBeat,
  path: string,
  hash: string,
  time: string,
): BeatDef {
  return {
    n,
    beat,
    path,
    hash,
    href: `${path}${hash}`,
    nameKey: `beatB${n}`,
    hubKey: `hubB${n}`,
    time,
  };
}

export const BEATS: readonly BeatDef[] = [
  def(1, "B1_CLINIC_EMPTY", "/clinic", "", "0:18–0:48"),
  def(2, "B2_PLAN_SENT", "/p/demo", "", "0:48–1:15"),
  def(3, "B3_PHASE1_PAID", "/p/demo", "", "1:00–1:15"),
  def(4, "B4_WHATIF_READY", "/p/demo", "#gantt", "1:15–1:45"),
  def(5, "B5_AGENT_READY", "/clinic", "#plan-editor", "2:02–2:30"),
  def(6, "B6_CLOSURE_READY", "/p/demo", "#closure", "2:30–2:46"),
];

export function beatByN(n: number): BeatDef | undefined {
  return BEATS.find((b) => b.n === n);
}

/** Bookmarkable deep link, e.g. /clinic?director=1&beat=1 or /p/demo?director=1&beat=4#gantt. */
export function beatDeepLink(b: BeatDef): string {
  return `${b.path}?director=1&beat=${b.n}${b.hash}`;
}

/** The simulated clock jump of hotkey C: 7 weeks. */
export const CLOCK_ADVANCE_DAYS = 49;
export const DIRECTOR_STORAGE_KEY = "ppp.director";
