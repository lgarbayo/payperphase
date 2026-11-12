/**
 * Patient plan page /p/[planId] (planId may be the alias "demo").
 * Server-renders the initial view (buildPlanView); the client view keeps it live over SSE.
 */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PatientPlanView } from "@/components/patient/PatientPlanView";
import { translate } from "@/i18n/core";
import { buildPlanView } from "@/server/views";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: translate("patient", "es", "metaTitle"),
  robots: { index: false, follow: false },
};

export default async function PatientPlanPage({ params }: { params: Promise<{ planId: string }> }) {
  const { planId } = await params;
  const initial = await buildPlanView(planId, "patient");
  if (!initial) notFound();
  return <PatientPlanView initial={initial} planRef={planId} />;
}
