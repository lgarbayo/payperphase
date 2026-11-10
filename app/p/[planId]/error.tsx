"use client";
/** OWNED BY WP-06. Error boundary for the patient page. */
import { useT } from "@/i18n";
import { Button, Card } from "@/lib/ui";

export default function PlanError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT("patient");
  return (
    <main className="mx-auto flex max-w-xl flex-col items-center px-4 py-20">
      <Card role="alert" className="flex w-full flex-col items-center gap-3 px-8 py-10 text-center">
        <h1 className="text-xl font-semibold tracking-tight text-ink">{t("errorTitle")}</h1>
        <p className="text-sm text-muted">{t("errorBody")}</p>
        {error.digest && <p className="font-mono text-xs text-muted">{error.digest}</p>}
        <Button className="mt-2" onClick={reset}>
          {t("retry")}
        </Button>
      </Card>
    </main>
  );
}
