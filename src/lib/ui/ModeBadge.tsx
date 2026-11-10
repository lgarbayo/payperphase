import type { Locale } from "@/contracts/primitives";
import { Badge } from "./Badge";

/** Required wherever a mock or cached fixture is used (binding rule). */
export function ModeBadge({ mode, what, locale }: { mode: "live" | "mock" | "cached"; what: string; locale: Locale }) {
  if (mode === "live") return null;
  const label = mode === "mock" ? (locale === "es" ? "Simulación" : "Mock") : locale === "es" ? "En caché" : "Cached";
  return (
    <Badge tone="upcoming" data-mode={mode} title={`${what}: ${label}`}>
      {what} · {label}
    </Badge>
  );
}
