/**
 * OWNED BY WP-07. Clinic console /clinic. Server-renders the hero plan (alias "demo"; null on an
 * empty store, Director beat B1), the simulated clock and the note library into the client console.
 */
import type { Metadata } from "next";
import { ClinicConsole } from "@/components/clinic/ClinicConsole";
import { HERO_PLAN_ALIAS } from "@/contracts/constants";
import { store } from "@/server/store";
import { SAMPLE_PDFS } from "@data/seed";
import { NOTE_LIBRARY } from "@data/seed/notes";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Consola de la clínica · PayPerPhase",
};

export default async function ClinicPage() {
  const [plan, clock] = await Promise.all([store.getPlan(HERO_PLAN_ALIAS), store.getClock()]);
  return <ClinicConsole plan={plan} today={clock.today} notes={Object.values(NOTE_LIBRARY)} samples={SAMPLE_PDFS} />;
}
