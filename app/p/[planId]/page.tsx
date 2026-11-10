/**
 * OWNED BY WP-06. Patient plan page /p/[planId] (planId may be the alias "demo").
 * SCAFFOLD STUB: server-renders the initial view (WP-09's buildPlanView) into the client view.
 */
import { notFound } from "next/navigation";
import { PatientPlanView } from "@/components/patient/PatientPlanView";
import { buildPlanView } from "@/server/views";

export const dynamic = "force-dynamic";

export default async function PatientPlanPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  const initial = await buildPlanView(planId, "patient");
  if (!initial) notFound();
  return <PatientPlanView initial={initial} />;
}
