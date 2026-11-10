/**
 * OWNED BY WP-14. The positioning line against the rivals, in the dictionary so ES/EN stay in sync.
 * Server-safe (no hooks): pass the locale.
 */
import type { Locale } from "@/contracts";
import { translate } from "@/i18n/core";
import { cx } from "@/lib/ui/cx";

export function PositioningLine({
  locale,
  tone = "dark",
  className,
}: {
  locale: Locale;
  tone?: "dark" | "light";
  className?: string;
}) {
  const text = translate("landing", locale, "positioning");
  return (
    <p
      data-testid="positioning-line"
      className={cx("text-balance font-medium tracking-tight", tone === "light" ? "text-teal-200" : "text-primary-strong", className)}
    >
      {text}
    </p>
  );
}
