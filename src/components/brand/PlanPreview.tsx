"use client";
/**
 * Static, illustrative mini-Gantt for the landing hero: four phases from the seeded
 * synthetic implant case, a hatched healing window and payment diamonds by status. It is a picture,
 * not the Bryntum Gantt, and it says so (caption: illustrative · synthetic · simulated · sandbox).
 */
import { useLocale, useT } from "@/i18n";
import { formatCents } from "@/lib/money";
import { cx } from "@/lib/ui/cx";

const TOTAL_DAYS = 168;
const ROWS = [
  { key: "previewPhase1", start: 0, days: 1, cents: 36_000, status: "paid" },
  { key: "previewPhase2", start: 57, days: 1, cents: 150_000, status: "due" },
  { key: "previewPhase3", start: 142, days: 1, cents: 52_000, status: "scheduled" },
  { key: "previewPhase4", start: 157, days: 1, cents: 169_000, status: "scheduled" },
] as const;
const HEALING = { start: 58, end: 142 };

const pct = (d: number) => `${(d / TOTAL_DAYS) * 100}%`;
const DIAMOND: Record<(typeof ROWS)[number]["status"], string> = {
  paid: "bg-status-paid",
  due: "bg-status-due",
  scheduled: "bg-status-scheduled",
};

export function PlanPreview({ className }: { className?: string }) {
  const t = useT("landing");
  const { locale } = useLocale();
  return (
    <figure
      data-testid="plan-preview"
      className={cx("rounded-[var(--ppp-radius)] border border-border bg-surface p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_30px_80px_-20px_rgba(0,0,0,0.6)]", className)}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-ink">{t("previewLabel")}</p>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-status-paid/10 px-2.5 py-0.5 text-xs font-medium text-status-paid">
          <span className="h-1.5 w-1.5 rounded-full bg-status-paid" aria-hidden="true" />
          {t("previewExposure")}: {formatCents(0, locale)}
        </span>
      </div>

      <ol className="flex flex-col gap-3" aria-label={t("previewLabel")}>
        {ROWS.map((row, i) => (
          <li key={row.key} className="grid grid-cols-[7.5rem_1fr] items-center gap-3 sm:grid-cols-[9.5rem_1fr]">
            <div className="min-w-0">
              <p className="text-xs font-medium leading-tight text-ink">
                {i + 1}. {t(row.key)}
              </p>
              <p className="font-mono text-[11px] text-muted">{formatCents(row.cents, locale, { whole: true })}</p>
            </div>
            <div className="relative h-8 rounded-md bg-surface-2">
              {i === 1 ? (
                <div
                  aria-hidden="true"
                  className="absolute inset-y-1 rounded-sm opacity-90"
                  style={{
                    left: pct(HEALING.start),
                    width: `calc(${pct(HEALING.end - HEALING.start)})`,
                    backgroundImage:
                      "repeating-linear-gradient(135deg, rgba(148,163,184,0.55) 0 4px, rgba(148,163,184,0.12) 4px 8px)",
                  }}
                  title={t("previewHealing")}
                />
              ) : null}
              <div
                className="absolute inset-y-1.5 rounded-sm bg-primary"
                style={{ left: pct(row.start), width: "3.5%" }}
              />
              <span
                aria-hidden="true"
                className={cx("absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rotate-45 rounded-[3px] shadow-sm", DIAMOND[row.status])}
                style={{ left: `calc(${pct(row.start)} + 4%)` }}
              />
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted">
        <Legend color="bg-status-paid" label={t("previewPaid")} />
        <Legend color="bg-status-due" label={t("previewNext")} />
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-3 w-5 rounded-sm"
            style={{ backgroundImage: "repeating-linear-gradient(135deg, rgba(148,163,184,0.7) 0 3px, rgba(148,163,184,0.2) 3px 6px)" }}
          />
          {t("previewHealing")}
        </span>
      </div>
      <figcaption className="mt-3 border-t border-border pt-3 text-xs text-muted">{t("previewCaption")}</figcaption>
    </figure>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden="true" className={cx("h-2.5 w-2.5 rotate-45 rounded-[2px]", color)} />
      {label}
    </span>
  );
}
