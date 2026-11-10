/**
 * OWNED BY WP-07. Clinic console /clinic. SCAFFOLD STUB.
 */
import { ClinicConsole } from "@/components/clinic/ClinicConsole";
import { store } from "@/server/store";

export const dynamic = "force-dynamic";

export default async function ClinicPage() {
  const plan = await store.getPlan("demo");
  const clock = await store.getClock();
  return <ClinicConsole plan={plan} today={clock.today} />;
}
