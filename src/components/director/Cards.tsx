"use client";
/**
 * Recordable full-screen 16:9 cards (hook, title, closing). Rendered as a fixed overlay
 * above the app shell, dark, sized with vw units so 1920×1080 recordings look right at any window size.
 */
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { COMPLIANCE_COPY, DSCA_ADVICE_URL } from "@/contracts/constants";
import { useLocale, useT } from "@/i18n";
import { PositioningLine } from "@/components/brand/PositioningLine";
import { Wordmark } from "@/components/brand/Wordmark";

function CardShell({ children, testId, footer }: { children: ReactNode; testId: string; footer?: ReactNode }) {
  return (
    <div
      data-testid={testId}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[radial-gradient(ellipse_at_30%_20%,#12314d,#07111c_70%)] px-[6vw] text-white"
    >
      <div className="flex w-full max-w-[84vw] flex-1 flex-col items-center justify-center gap-[3vh] text-center">{children}</div>
      <div className="w-full pb-[2.5vh] text-center text-[0.9vw] leading-snug text-slate-400">{footer}</div>
    </div>
  );
}

/** Beat 1 hook (steps 0–1) then beat 2 title (step 2). → or space advances, ← goes back. */
export function HookTitleCards({ initialStep = 0 }: { initialStep?: number }) {
  const t = useT("landing");
  const { locale } = useLocale();
  const total = 3;
  // ?rec=1 is the recording mode: no on-screen step hint in the footage.
  const recording = useSearchParams()?.get("rec") === "1";
  const [step, setStep] = useState(Math.min(Math.max(initialStep, 0), total - 1));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        setStep((s) => Math.min(s + 1, total - 1));
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setStep((s) => Math.max(s - 1, 0));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <CardShell
      testId={`card-step-${step}`}
      footer={
        <>
          <p>{COMPLIANCE_COPY[locale]}</p>
          {recording ? null : (
            <p data-testid="card-hint" className="mt-1 opacity-70">
              {t("cardsStep", { n: step + 1, total })} · {t("cardsNext")}
            </p>
          )}
        </>
      }
    >
      {step === 0 ? (
        <>
          <p data-testid="card-hook" className="text-balance text-[4vw] font-semibold leading-[1.12] tracking-tight">
            {t("cardsHook1")}
          </p>
          <p className="max-w-[70vw] text-balance text-[2.3vw] leading-snug text-slate-200">{t("cardsHook1Sub")}</p>
          <p data-testid="card-hook-source" className="text-[1.1vw] tracking-wide text-slate-400">
            {t("hookSources")}
          </p>
        </>
      ) : null}
      {step === 1 ? (
        <div data-testid="card-source" className="flex max-w-[66vw] flex-col items-center gap-[2.5vh]">
          <p className="text-[1.2vw] font-semibold uppercase tracking-[0.2em] text-teal-300">{t("cardsHook2Source")}</p>
          <p className="text-[1.6vw] text-slate-300">
            {t("cardsHook2Org")} · {t("cardsHook2Faq")}
          </p>
          <p data-testid="card-quote" className="text-balance text-[3vw] font-medium leading-snug">
            {t("cardsHook2Question")}
          </p>
          {locale === "en" ? <p className="max-w-[56vw] text-balance text-[1.2vw] text-slate-400">{t("cardsHook2Note")}</p> : null}
          <p data-testid="card-answer" className="text-balance text-[3.2vw] font-semibold leading-snug text-teal-300">
            {t("cardsHook2Answer")}
          </p>
          <a
            href={DSCA_ADVICE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all font-mono text-[1vw] text-slate-400 underline decoration-slate-500/60 underline-offset-4"
          >
            {DSCA_ADVICE_URL}
          </a>
        </div>
      ) : null}
      {step === 2 ? (
        <>
          <Wordmark tone="light" size={72} />
          <p data-testid="card-title" className="max-w-[72vw] text-balance text-[3.4vw] font-semibold leading-[1.15] tracking-tight">
            {t("cardsTitleMain")}
          </p>
          <PositioningLine locale={locale} tone="light" className="max-w-[72vw] text-[1.6vw]" />
        </>
      ) : null}
    </CardShell>
  );
}

/** Beat 9 close: the idea first (tagline), then the hosted URL, then the compliance line, small but visible. */
export function ClosingCard({ url }: { url: string }) {
  const t = useT("landing");
  const { locale } = useLocale();
  const shown = url.replace(/\/+$/, "");
  return (
    <CardShell
      testId="closing-card"
      footer={
        <p data-testid="closing-compliance" className="mx-auto max-w-[80vw] text-[1vw] leading-snug">
          {COMPLIANCE_COPY[locale]}
        </p>
      }
    >
      <Wordmark tone="light" size={72} />
      <p data-testid="closing-tagline" className="max-w-[74vw] text-balance text-[3.4vw] font-semibold leading-[1.15] tracking-tight">
        {t("cardsClosingTagline")}
      </p>
      <p data-testid="closing-url" className="font-mono text-[2vw] text-teal-300">
        {shown}
      </p>
    </CardShell>
  );
}
