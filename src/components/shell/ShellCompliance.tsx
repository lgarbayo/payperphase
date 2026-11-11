"use client";
import { useLocale } from "@/i18n";
import { ComplianceBadge } from "@/lib/ui";

/** Footer compliance line in the active locale only (binding rule: visible on every page). */
export function ShellCompliance() {
  const { locale } = useLocale();
  return <ComplianceBadge locale={locale} />;
}
