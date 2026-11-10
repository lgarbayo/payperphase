"use client";
/**
 * OWNED BY WP-14. Director Mode overlay (?director=1). Renders nothing and listens to nothing unless
 * enabled (persisted per tab in sessionStorage; ?director=0 switches it off).
 *
 *   R reset · 1–6 beat states + pages · C clock +7 weeks · G agent guard test · H hide the HUD
 *
 * A beat deep link (?director=1&beat=N) applies the beat on load, navigates to its page and strips the param.
 * Every simulated or cached state is labelled in the HUD (simulated clock, mock/cached integrations).
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, HERO_PLAN_ALIAS, type ClockResponse, type HealthResponse } from "@/contracts";
import { useLocale, useT } from "@/i18n";
import { ModeBadge, SimClockBadge } from "@/lib/ui";
import { BEATS, beatByN, CLOCK_ADVANCE_DAYS, DIRECTOR_STORAGE_KEY, type BeatDef } from "./beats";

const BEAT_KEY = "ppp.director.beat";
const REQUEST_TIMEOUT_MS = 20_000;

interface HudToast {
  id: number;
  text: string;
  tone: "success" | "error";
}

export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function readStore(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStore(key: string, value: string | null): void {
  try {
    if (value === null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, value);
  } catch {
    /* storage unavailable: Director Mode still works for this page load */
  }
}

export function DirectorMode() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const t = useT("landing");
  const { locale } = useLocale();

  const [enabled, setEnabled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [beatN, setBeatN] = useState<number | null>(null);
  const [today, setToday] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [toasts, setToasts] = useState<HudToast[]>([]);
  const busyRef = useRef(false);
  const deepLinkRef = useRef<string | null>(null);

  const directorParam = params?.get("director") ?? null;
  const beatParam = params?.get("beat") ?? null;

  // Enable / disable (client-only, so the server render and first paint are always empty).
  useEffect(() => {
    if (directorParam === "1") writeStore(DIRECTOR_STORAGE_KEY, "1");
    else if (directorParam === "0") writeStore(DIRECTOR_STORAGE_KEY, null);
    setEnabled(directorParam === "1" || (directorParam !== "0" && readStore(DIRECTOR_STORAGE_KEY) === "1"));
    const stored = Number(readStore(BEAT_KEY));
    setBeatN(Number.isInteger(stored) && stored >= 1 && stored <= 6 ? stored : null);
  }, [directorParam]);

  const toast = useCallback((text: string, tone: HudToast["tone"]) => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list, { id, text, tone }]);
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), 3500);
  }, []);

  const refreshHealth = useCallback(async () => {
    try {
      const h = await apiFetch<HealthResponse>("/api/health");
      setHealth(h);
      if (h.simToday) setToday(h.simToday);
    } catch {
      /* HUD keeps its last known state */
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    void refreshHealth();
    const id = setInterval(() => void refreshHealth(), 8000);
    return () => clearInterval(id);
  }, [enabled, refreshHealth]);

  /** Runs one action exclusively: ignores further keys while a request is in flight. */
  const run = useCallback(
    async (fn: () => Promise<void>) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      try {
        await fn();
      } catch (e) {
        toast(t("toastError", { message: e instanceof Error ? e.message : String(e) }), "error");
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [t, toast],
  );

  const post = useCallback(
    <T,>(url: string, json: unknown) => apiFetch<T>(url, { method: "POST", json, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }),
    [],
  );

  const applyBeat = useCallback(
    async (b: BeatDef, nav: "push" | "replace") => {
      await post("/api/demo/beat", { beat: b.beat });
      setBeatN(b.n);
      writeStore(BEAT_KEY, String(b.n));
      if (nav === "push") router.push(b.href);
      else router.replace(b.href);
      router.refresh();
      toast(t("toastBeat", { beat: b.n, name: t(b.nameKey) }), "success");
      void refreshHealth();
    },
    [post, refreshHealth, router, t, toast],
  );

  const reset = useCallback(async () => {
    await post("/api/demo/reset", {});
    setBeatN(null);
    writeStore(BEAT_KEY, null);
    router.refresh();
    toast(t("toastReset"), "success");
    void refreshHealth();
  }, [post, refreshHealth, router, t, toast]);

  const advanceClock = useCallback(async () => {
    const res = await post<ClockResponse>("/api/clock", { advanceDays: CLOCK_ADVANCE_DAYS });
    setToday(res.clock.today);
    router.refresh();
    toast(t("toastClock", { date: res.clock.today }), "success");
  }, [post, router, t, toast]);

  const guardTest = useCallback(async () => {
    await post("/api/agent/guard-test", { planId: HERO_PLAN_ALIAS });
    toast(t("toastGuard"), "success");
  }, [post, t, toast]);

  // Hotkeys.
  const handlers = useRef({ applyBeat, reset, advanceClock, guardTest, run });
  handlers.current = { applyBeat, reset, advanceClock, guardTest, run };
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      const h = handlers.current;
      const key = e.key.toLowerCase();
      if (key === "h") {
        setHidden((v) => !v);
      } else if (key === "r") {
        void h.run(h.reset);
      } else if (key === "c") {
        void h.run(h.advanceClock);
      } else if (key === "g") {
        void h.run(h.guardTest);
      } else if (/^[1-6]$/.test(key)) {
        const b = beatByN(Number(key));
        if (b) void h.run(() => h.applyBeat(b, "push"));
      } else {
        return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [enabled]);

  // Deep link: ?director=1&beat=N applies the beat once, then replaces the URL without the param.
  useEffect(() => {
    if (!enabled) return;
    if (!beatParam) {
      deepLinkRef.current = null;
      return;
    }
    if (deepLinkRef.current === beatParam) return;
    deepLinkRef.current = beatParam;
    const b = beatByN(Number(beatParam));
    if (!b) return;
    void handlers.current.run(() => handlers.current.applyBeat(b, "replace"));
  }, [enabled, beatParam, pathname]);

  if (!enabled) return null;

  const current = beatN ? beatByN(beatN) : undefined;
  return (
    <div data-testid="director-hud" data-hidden={hidden ? "true" : "false"} className="pointer-events-none fixed inset-x-0 bottom-0 z-[200] flex flex-col items-start gap-2 p-3">
      {toasts.length > 0 ? (
        <div aria-live="polite" className="flex flex-col gap-1.5">
          {toasts.map((x) => (
            <div
              key={x.id}
              data-testid="director-toast"
              className={`pointer-events-auto rounded-md px-3 py-1.5 text-sm font-medium text-white shadow-lg ${x.tone === "error" ? "bg-status-overdue" : "bg-status-paid"}`}
            >
              {x.text}
            </div>
          ))}
        </div>
      ) : null}
      {hidden ? null : (
        <div className="pointer-events-auto flex max-w-full flex-col gap-1.5 rounded-xl border border-white/10 bg-[#0b1b2c]/95 px-3 py-2 text-xs text-slate-200 shadow-2xl backdrop-blur">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-status-overdue px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
              {t("directorLabel")}
            </span>
            <span data-testid="director-beat" className="font-medium text-white">
              {current ? `B${current.n} · ${t(current.nameKey)}` : `${t("directorBeat")}: ${t("directorNoBeat")}`}
            </span>
            {today ? <SimClockBadge today={today} locale={locale} /> : null}
            {health ? (
              <>
                <ModeBadge mode={health.modes.paypal} what={t("modePaypalWhat")} locale={locale} />
                <ModeBadge mode={health.modes.anthropic === "mock" ? "cached" : "live"} what={t("modeAnthropicWhat")} locale={locale} />
                <ModeBadge mode={health.modes.agent === "playbook" ? "mock" : "live"} what={t("modeAgentWhat")} locale={locale} />
              </>
            ) : null}
            {busy ? <span className="text-teal-300">{t("directorBusy")}</span> : null}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-300">
            <Key k="R" label={t("directorKeyReset")} />
            <Key k="1–6" label={t("directorKeyBeats")} />
            <Key k="C" label={t("directorKeyClock")} />
            <Key k="G" label={t("directorKeyGuard")} />
            <Key k="H" label={t("directorKeyHide")} />
          </div>
        </div>
      )}
    </div>
  );
}

function Key({ k, label }: { k: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <kbd className="rounded border border-white/25 bg-white/10 px-1.5 py-0.5 font-mono text-[10px] text-white">{k}</kbd>
      {label}
    </span>
  );
}

export { BEATS };
