"use client";
/**
 * Optional composition of the two impact visuals: the exposure meter beside the
 * "What if the clinic closes today?" button. Props only; nothing imports this yet.
 */
import type { ClosureStressTest, ExposureReport, Locale } from "@/contracts";
import { ClinicClosureButton, type PhaseTitles } from "./ClinicClosureButton";
import { ExposureMeter } from "./ExposureMeter";

export function ImpactStrip({
  report,
  stress,
  locale,
  phaseTitles,
}: {
  report: ExposureReport;
  stress: ClosureStressTest;
  locale: Locale;
  phaseTitles?: PhaseTitles;
}) {
  return (
    <div data-testid="impact-strip" className="grid items-center gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
      <ExposureMeter report={report} locale={locale} />
      <ClinicClosureButton stress={stress} locale={locale} phaseTitles={phaseTitles} />
    </div>
  );
}
