import type { Locale } from "@/contracts/primitives";
import { translate } from "@/i18n/core";
import { Badge } from "./Badge";

/**
 * Positive counterpart of ModeBadge: shown only when a service really runs live
 * (PayPal sandbox, Claude). Renders nothing in mock mode, where ModeBadge says so instead.
 */
export function LiveBadge({
  service,
  mode,
  locale,
}: {
  service: "paypal" | "claude";
  mode: "live" | "mock" | "cached";
  locale: Locale;
}) {
  if (mode !== "live") return null;
  const label = translate("common", locale, service === "paypal" ? "livePayPal" : "liveClaude");
  const title = translate("common", locale, service === "paypal" ? "livePayPalTitle" : "liveClaudeTitle");
  return (
    <Badge tone="paid" data-testid={`live-badge-${service}`} data-mode="live" title={title}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-status-paid" />
      {label}
    </Badge>
  );
}
