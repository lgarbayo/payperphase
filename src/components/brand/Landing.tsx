"use client";
/**
 * OWNED BY WP-14. Story landing: hook with its official source (text link, no logos), how it works,
 * positioning against the alternatives, trust strip and GDPR line. ES default, EN via the header toggle.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { DSCA_SOURCE_URL, GDPR_COPY } from "@/contracts/constants";
import { useLocale, useT } from "@/i18n";
import { cx } from "@/lib/ui/cx";
import { PlanPreview } from "./PlanPreview";
import { PositioningLine } from "./PositioningLine";
import { TrustStrip } from "./TrustStrip";

export function Landing() {
  const t = useT("landing");
  const { locale } = useLocale();

  return (
    <main data-testid="landing" className="overflow-x-hidden">
      {/* Hero */}
      <section className="relative border-b border-border bg-[radial-gradient(1200px_500px_at_85%_-10%,rgba(15,118,110,0.10),transparent),linear-gradient(180deg,#ffffff,var(--ppp-bg))]">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-6 py-14 md:py-20 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="flex flex-col gap-6">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary">{t("heroEyebrow")}</p>
            <h1 className="text-balance text-4xl font-semibold leading-[1.08] tracking-tight text-ink md:text-5xl">
              {t("heroTitleA")} <span className="text-primary">{t("heroTitleB")}</span>
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-muted">{t("heroLead")}</p>
            <div className="flex flex-wrap items-center gap-3">
              <CtaLink href="/demo" variant="primary">
                {t("ctaDemo")}
              </CtaLink>
              <CtaLink href="/clinic" variant="secondary">
                {t("ctaClinic")}
              </CtaLink>
              <CtaLink href="/p/demo" variant="secondary">
                {t("ctaPatient")}
              </CtaLink>
            </div>
            <TrustStrip locale={locale} className="self-start" />
          </div>
          <PlanPreview />
        </div>
      </section>

      {/* The problem */}
      <section className="bg-[#0b1b2c] text-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-14 md:py-16 lg:grid-cols-[1.3fr_1fr]">
          <div className="flex flex-col gap-5">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-teal-300">{t("hookEyebrow")}</p>
            <p data-testid="hook" className="text-balance text-2xl font-medium leading-snug tracking-tight md:text-3xl">
              {t("hookText")}
            </p>
          </div>
          <div className="flex flex-col gap-4 border-l border-white/15 pl-6 text-base leading-relaxed text-slate-300">
            <p>{t("hookMore")}</p>
            <p className="text-sm">
              {t("hookSourceLead")}{" "}
              <a
                data-testid="dsca-source"
                href={DSCA_SOURCE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal-300 underline decoration-teal-300/50 underline-offset-4 hover:decoration-teal-300"
              >
                {t("hookSourceLink")}
              </a>
            </p>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-6 py-14 md:py-20">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary">{t("howEyebrow")}</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight text-ink">{t("howTitle")}</h2>
        <ol className="mt-8 grid gap-5 md:grid-cols-3">
          {(
            [
              ["1", "step1Title", "step1Body"],
              ["2", "step2Title", "step2Body"],
              ["3", "step3Title", "step3Body"],
            ] as const
          ).map(([n, title, body]) => (
            <li
              key={n}
              data-testid="how-step"
              className="relative flex flex-col gap-3 rounded-[var(--ppp-radius)] border border-border bg-surface p-6 shadow-[var(--ppp-shadow)]"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-ink">
                {n}
              </span>
              <h3 className="text-lg font-semibold tracking-tight text-ink">{t(title)}</h3>
              <p className="text-sm leading-relaxed text-muted">{t(body)}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Positioning */}
      <section className="border-y border-border bg-surface">
        <div className="mx-auto max-w-6xl px-6 py-14 md:py-20">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary">{t("positioningEyebrow")}</p>
          <h2 className="mt-2 max-w-2xl text-balance text-3xl font-semibold tracking-tight text-ink">{t("positioningTitle")}</h2>
          <PositioningLine locale={locale} className="mt-5 max-w-3xl text-lg" />

          <div className="mt-8 overflow-x-auto rounded-[var(--ppp-radius)] border border-border">
            <table data-testid="comparison" className="w-full min-w-[34rem] border-collapse text-left text-sm">
              <thead>
                <tr className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
                  <th scope="col" className="px-4 py-3 font-medium" />
                  <th scope="col" className="px-4 py-3 text-center font-medium">
                    {t("colUpfront")}
                  </th>
                  <th scope="col" className="px-4 py-3 text-center font-medium">
                    {t("colLoan")}
                  </th>
                  <th scope="col" className="bg-primary/10 px-4 py-3 text-center font-semibold text-primary-strong">
                    {t("colPpp")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["row1", false, false],
                    ["row2", false, false],
                    ["row3", false, false],
                    ["row4", false, false],
                  ] as const
                ).map(([row, a, b]) => (
                  <tr key={row} className="border-t border-border">
                    <th scope="row" className="px-4 py-3.5 font-medium text-ink">
                      {t(row)}
                    </th>
                    <Mark ok={a} yes={t("yes")} no={t("no")} />
                    <Mark ok={b} yes={t("yes")} no={t("no")} />
                    <Mark ok highlight yes={t("yes")} no={t("no")} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-muted">{t("positioningNote")}</p>
        </div>
      </section>

      {/* Trust */}
      <section className="mx-auto max-w-6xl px-6 py-14 md:py-16">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary">{t("trustEyebrow")}</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-ink">{t("trustTitle")}</h2>
        <ul className="mt-6 grid gap-4 md:grid-cols-3">
          {(
            [
              ["trustClaudeTitle", "trustClaudeBody"],
              ["trustCodeTitle", "trustCodeBody"],
              ["trustDentistTitle", "trustDentistBody"],
            ] as const
          ).map(([title, body]) => (
            <li key={title} className="rounded-[var(--ppp-radius)] border border-border bg-surface p-5">
              <h3 className="text-base font-semibold text-ink">{t(title)}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{t(body)}</p>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-col items-start gap-2">
          <p data-testid="gdpr" className="text-sm text-muted">
            {GDPR_COPY[locale]}
          </p>
          <p className="text-sm text-muted">{t("sandboxNote")}</p>
        </div>
      </section>
    </main>
  );
}

function CtaLink({ href, variant, children }: { href: string; variant: "primary" | "secondary"; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={cx(
        "inline-flex h-12 items-center justify-center rounded-[var(--ppp-radius-sm)] px-6 text-base font-medium transition-colors",
        variant === "primary"
          ? "bg-primary text-primary-ink shadow-sm hover:bg-primary-strong"
          : "border border-border bg-surface text-ink hover:bg-surface-2",
      )}
    >
      {children}
    </Link>
  );
}

function Mark({ ok, yes, no, highlight }: { ok: boolean; yes: string; no: string; highlight?: boolean }) {
  return (
    <td className={cx("px-4 py-3.5 text-center", highlight && "bg-primary/5")}>
      <span
        role="img"
        aria-label={ok ? yes : no}
        className={cx(
          "inline-flex h-6 w-6 items-center justify-center rounded-full text-sm font-bold",
          ok ? "bg-status-paid/15 text-status-paid" : "bg-surface-2 text-muted",
        )}
      >
        {ok ? "✓" : "–"}
      </span>
    </td>
  );
}
