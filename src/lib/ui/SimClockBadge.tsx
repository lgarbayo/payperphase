import type { Locale } from "@/contracts/primitives";
import { formatIsoDate } from "@/lib/dates";
import { Badge } from "./Badge";

/** The simulated clock is ALWAYS labelled. */
export function SimClockBadge({ today, locale }: { today: string; locale: Locale }) {
  return (
    <Badge tone="neutral" data-testid="sim-clock" className="font-mono">
      {locale === "es" ? "Simulado" : "Simulated"} · {formatIsoDate(today, locale)}
    </Badge>
  );
}
