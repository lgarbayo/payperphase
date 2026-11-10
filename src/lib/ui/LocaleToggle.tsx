"use client";
import { useLocale } from "@/i18n";
import { cx } from "./cx";

export function LocaleToggle() {
  const { locale, setLocale } = useLocale();
  return (
    <div role="group" aria-label="Language" className="inline-flex rounded-full border border-border bg-surface p-0.5 text-xs">
      {(["es", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          data-testid={`locale-${l}`}
          aria-pressed={locale === l}
          onClick={() => setLocale(l)}
          className={cx("rounded-full px-2.5 py-1 font-medium uppercase", locale === l ? "bg-primary text-primary-ink" : "text-muted")}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
