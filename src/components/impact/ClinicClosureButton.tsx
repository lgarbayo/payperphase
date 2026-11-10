"use client";
/**
 * OWNED BY WP-12. "What if the clinic closes today?" — linked loan vs PayPerPhase counters,
 * labelled illustrative, citing dsca.gob.es. Numbers come from engine.closureStressTest().
 * SCAFFOLD STUB.
 */
import type { ClosureStressTest, Locale } from "@/contracts";

export function ClinicClosureButton({ stress, locale }: { stress: ClosureStressTest; locale: Locale }) {
  void stress;
  return (
    <button type="button" data-testid="closure-button">
      {locale === "es" ? "¿Y si la clínica cierra hoy?" : "What if the clinic closes today?"}
    </button>
  );
}
