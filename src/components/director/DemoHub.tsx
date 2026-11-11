"use client";
/** OWNED BY WP-14. Public demo hub: Reset, beat list with deep links, recordable cards, sample PDFs. */
import Link from "next/link";
import { useLocale, useT } from "@/i18n";
import { Card } from "@/lib/ui";
import { SAMPLE_PDFS } from "@data/seed";
import { BEATS, beatDeepLink } from "./beats";
import { ResetDemoButton } from "./ResetDemoButton";

const KEYS = [
  ["R", "directorKeyReset"],
  ["1–6", "directorKeyBeats"],
  ["C", "directorKeyClock"],
  ["G", "directorKeyGuard"],
  ["H", "directorKeyHide"],
] as const;

export function DemoHub() {
  const t = useT("landing");
  const { locale } = useLocale();
  return (
    <main data-testid="demo-hub" className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">{t("hubTitle")}</h1>
        <p className="max-w-2xl text-muted">{t("hubLead")}</p>
      </header>

      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-semibold text-ink">{t("hubResetTitle")}</h2>
          <p className="text-sm text-muted">{t("hubResetBody")}</p>
        </div>
        <ResetDemoButton />
      </Card>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold text-ink">{t("hubBeatsTitle")}</h2>
        <ol className="grid gap-3 md:grid-cols-2">
          {BEATS.map((b) => (
            <li key={b.n}>
              <Card className="flex h-full flex-col gap-2">
                <div className="flex items-center gap-3">
                  <kbd className="flex h-8 w-8 items-center justify-center rounded-md border border-border bg-surface-2 font-mono text-sm font-semibold text-ink">
                    {b.n}
                  </kbd>
                  <div className="min-w-0">
                    <p className="font-medium text-ink">{t(b.hubKey)}</p>
                    <p className="text-xs text-muted">
                      B{b.n} · {t(b.nameKey)} · {b.time}
                    </p>
                  </div>
                </div>
                <p className="break-all font-mono text-[11px] text-muted" data-testid={`beat-link-text-${b.n}`}>
                  {beatDeepLink(b)}
                </p>
                <Link
                  data-testid={`beat-link-${b.n}`}
                  href={beatDeepLink(b)}
                  className="mt-auto self-start text-sm font-medium text-primary-strong underline underline-offset-4"
                >
                  {t("hubBeatOpen")} {b.n} →
                </Link>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Card className="flex flex-col gap-2">
          <h2 className="font-semibold text-ink">{t("hubKeysTitle")}</h2>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
            {KEYS.map(([k, label]) => (
              <li key={k} className="inline-flex items-center gap-1.5">
                <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-xs text-ink">{k}</kbd>
                {t(label)}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted">{t("hubKeysNote")}</p>
          <Link href="/demo?director=1" className="text-sm font-medium text-primary-strong underline underline-offset-4">
            /demo?director=1
          </Link>
        </Card>

        <Card className="flex flex-col gap-2">
          <h2 className="font-semibold text-ink">{t("hubCardsTitle")}</h2>
          <ul className="flex flex-col gap-1 text-sm">
            <li>
              <Link className="text-primary-strong underline underline-offset-4" href="/demo/title?step=0">
                {t("hubCardHook")}
              </Link>
            </li>
            <li>
              <Link className="text-primary-strong underline underline-offset-4" href="/demo/title?step=2">
                {t("hubCardTitle")}
              </Link>
            </li>
            <li>
              <Link className="text-primary-strong underline underline-offset-4" href="/demo/closing">
                {t("hubCardClosing")}
              </Link>
            </li>
          </ul>
          <p className="text-xs text-muted">{t("hubCardsNote")}</p>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold text-ink">{t("hubSamplesTitle")}</h2>
        <p className="text-sm text-muted">{t("hubSamplesNote")}</p>
        <ul className="flex flex-col gap-1 text-sm">
          {SAMPLE_PDFS.map((s) => (
            <li key={s.id}>
              <a href={s.path} download className="text-primary-strong underline underline-offset-4">
                {s.label[locale]}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
