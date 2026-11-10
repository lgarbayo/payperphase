"use client";
/** OWNED BY WP-06. Unknown plan id (or an old id after a demo reset). */
import Link from "next/link";
import { useT } from "@/i18n";
import { Card } from "@/lib/ui";

export default function PlanNotFound() {
  const t = useT("patient");
  return (
    <main className="mx-auto flex max-w-xl flex-col items-center px-4 py-20">
      <Card className="flex w-full flex-col items-center gap-3 px-8 py-10 text-center" data-testid="plan-not-found">
        <h1 className="text-xl font-semibold tracking-tight text-ink">{t("notFoundTitle")}</h1>
        <p className="text-sm text-muted">{t("notFoundBody")}</p>
        <Link
          href="/p/demo"
          className="mt-2 inline-flex h-10 items-center justify-center rounded-[var(--ppp-radius-sm)] bg-primary px-4 text-sm font-medium text-primary-ink hover:bg-primary-strong"
        >
          {t("notFoundCta")}
        </Link>
      </Card>
    </main>
  );
}
