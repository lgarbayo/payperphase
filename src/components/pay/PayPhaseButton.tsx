"use client";
/**
 * OWNED BY WP-04. Per-phase PayPal button (JS SDK v5 Buttons, EUR, Pay Later enabled).
 *
 * - Payable only when the milestone is `due` or `overdue`; otherwise disabled with the reason
 *   "Se paga el día de la visita" (the server enforces the same rule: no prepayment).
 * - Creates the order via POST /api/paypal/orders {planId, phaseId}: the server reads the amount.
 *   `amountCents` here is display-only.
 * - Captures via POST /api/paypal/orders/:id/capture. DECLINED → actions.restart().
 * - Mock mode (server has no PayPal credentials): a clearly labelled "Pagar (simulación)" button with
 *   a ModeBadge that runs the very same server create → capture path.
 * - The SDK is loaded once per page (locale es_ES / en_GB) and shared with <PayLaterMessage/>.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type {
  CapturePhaseOrderResponse,
  CreatePhaseOrderResponse,
  Locale,
  PaymentStatus,
} from "@/contracts";
import { translate, type KeyOf, type Vars } from "@/i18n/core";
import { formatCents } from "@/lib/money";
import { buildSdkUrl, type PayPalClientConfig } from "@/lib/paypal/sdk-url";
import { Button, ModeBadge, cx } from "@/lib/ui";
import { CalendarIcon, CheckIcon, LockIcon, Spinner } from "./icons";
import { loadPayPalSdk, postJson, type PayPalButtonsInstance } from "./sdk";
import { usePayPalConfig } from "./usePayPalConfig";

export interface PayPhaseButtonProps {
  planId: string;
  phaseId: string;
  /** Display only; the server never trusts it. */
  amountCents: number;
  status: PaymentStatus;
  locale: Locale;
  onPaid?: (r: { phaseId: string; captureId?: string }) => void;
  onError?: (message: string) => void;
}

type PayKey = KeyOf<"pay">;
type T = (key: PayKey, vars?: Vars) => string;

/** API error code → patient-facing message. */
const ERROR_KEY: Partial<Record<string, PayKey>> = {
  NOT_DUE_YET: "errorNotDue",
  ALREADY_PAID: "errorAlreadyPaid",
  PROCESSING: "errorProcessing",
  PLAN_NOT_APPROVED: "errorPlanNotApproved",
  NETWORK: "errorNetwork",
};

type Local =
  | { kind: "idle" }
  | { kind: "paid" }
  | { kind: "pending" }
  | { kind: "notice"; key: PayKey; tone: "error" | "info" };

export function PayPhaseButton({ planId, phaseId, amountCents, status, locale, onPaid, onError }: PayPhaseButtonProps) {
  const t = useCallback<T>((key, vars) => translate("pay", locale, key, vars), [locale]);
  const [local, setLocal] = useState<Local>({ kind: "idle" });
  const amount = formatCents(amountCents, locale);
  const payable = status === "due" || status === "overdue";

  // A new server status (refetch, demo reset, clock) supersedes whatever happened locally.
  useEffect(() => setLocal({ kind: "idle" }), [status, planId, phaseId]);

  const settle = useCallback(
    (cap: CapturePhaseOrderResponse) => {
      if (cap.outcome === "PENDING") {
        setLocal({ kind: "pending" });
        return;
      }
      if (cap.outcome === "DECLINED") {
        setLocal({ kind: "notice", key: "declined", tone: "info" });
        return;
      }
      setLocal({ kind: "paid" });
      onPaid?.({ phaseId, captureId: cap.captureId });
    },
    [onPaid, phaseId],
  );

  const fail = useCallback(
    (code: string) => {
      const key = ERROR_KEY[code] ?? "errorGeneric";
      setLocal({ kind: "notice", key, tone: "error" });
      onError?.(t(key));
    },
    [onError, t],
  );

  const notice = useCallback((key: PayKey) => setLocal({ kind: "notice", key, tone: "info" }), []);

  if (status === "paid" || local.kind === "paid") {
    return (
      <div
        data-testid="pay-phase-paid"
        className="flex items-center gap-2 rounded-[var(--ppp-radius-sm)] bg-status-paid/10 px-3 py-2.5 text-sm font-medium text-status-paid"
      >
        <CheckIcon />
        <span>
          {t("paid")} · <span className="tabular-nums">{amount}</span>
        </span>
      </div>
    );
  }

  if (status === "processing" || local.kind === "pending") {
    return (
      <div
        role="status"
        data-testid="pay-phase-pending"
        className="flex items-start gap-2 rounded-[var(--ppp-radius-sm)] bg-status-processing/10 px-3 py-2.5 text-sm text-status-processing"
      >
        <Spinner className="mt-0.5 shrink-0" />
        <span>{t("pending")}</span>
      </div>
    );
  }

  if (!payable) return <NotDueButton amount={amount} t={t} />;

  return (
    <div className="flex flex-col gap-2" data-pay-phase={phaseId}>
      <PayableBody
        planId={planId}
        phaseId={phaseId}
        amount={amount}
        locale={locale}
        t={t}
        onSettled={settle}
        onFail={fail}
        onNotice={notice}
        clearNotice={() => setLocal({ kind: "idle" })}
      />
      {local.kind === "notice" && (
        <p
          role={local.tone === "error" ? "alert" : "status"}
          className={cx(
            "rounded-[var(--ppp-radius-sm)] px-3 py-2 text-sm",
            local.tone === "error" ? "bg-status-overdue/10 text-status-overdue" : "bg-surface-2 text-muted",
          )}
        >
          {t(local.key)}
        </p>
      )}
    </div>
  );
}

function NotDueButton({ amount, t }: { amount: string; t: T }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <Button size="lg" className="w-full" disabled data-testid="pay-phase" aria-describedby={id}>
        <CalendarIcon />
        <span>
          {t("payWithPayPal")} · <span className="tabular-nums">{amount}</span>
        </span>
      </Button>
      <p id={id} data-testid="pay-phase-reason" className="text-xs text-muted">
        {t("notDueReason")}
      </p>
    </div>
  );
}

interface BodyProps {
  planId: string;
  phaseId: string;
  amount: string;
  locale: Locale;
  t: T;
  onSettled: (cap: CapturePhaseOrderResponse) => void;
  onFail: (code: string) => void;
  onNotice: (key: PayKey) => void;
  clearNotice: () => void;
}

function PayableBody(props: BodyProps) {
  const { config, error, retry } = usePayPalConfig();
  if (error) return <LoadError message={props.t("sdkError")} retry={props.t("retry")} onRetry={retry} />;
  if (!config) return <ButtonSkeleton label={props.t("sdkLoading")} />;
  if (config.mode === "mock" || !config.clientId) return <MockPayButton {...props} />;
  return <LivePayPalButtons {...props} config={config} />;
}

function MockPayButton({ planId, phaseId, amount, locale, t, onSettled, onFail, clearNotice }: BodyProps) {
  const [working, setWorking] = useState(false);

  async function pay() {
    setWorking(true);
    clearNotice();
    try {
      const order = await postJson<CreatePhaseOrderResponse>("/api/paypal/orders", { planId, phaseId });
      if (!order.ok) return onFail(order.code);
      const orderId = order.body.orderId;
      const cap = await postJson<CapturePhaseOrderResponse>(
        `/api/paypal/orders/${encodeURIComponent(orderId)}/capture`,
        { planId, phaseId, orderId },
      );
      if (!cap.ok) return onFail(cap.code);
      onSettled(cap.body);
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Button
        size="lg"
        className="w-full"
        data-testid="pay-phase"
        data-mode="mock"
        disabled={working}
        aria-busy={working}
        onClick={() => void pay()}
      >
        {working ? <Spinner /> : <LockIcon />}
        {working ? (
          <span>{t("working")}</span>
        ) : (
          <span>
            {t("mockPay")} · <span className="tabular-nums">{amount}</span>
          </span>
        )}
      </Button>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <ModeBadge mode="mock" what={t("mockWhat")} locale={locale} />
        <span className="text-xs text-muted">{t("onlyThisPhase")}</span>
      </div>
    </div>
  );
}

function LivePayPalButtons({
  planId,
  phaseId,
  locale,
  t,
  config,
  onSettled,
  onFail,
  onNotice,
  clearNotice,
}: BodyProps & { config: PayPalClientConfig }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [sdk, setSdk] = useState<"loading" | "ready" | "error">("loading");
  const [capturing, setCapturing] = useState(false);
  const [reload, setReload] = useState(0);
  // Latest callbacks without re-rendering the PayPal iframe on every parent render.
  const handlers = useRef({ onSettled, onFail, onNotice, clearNotice });
  handlers.current = { onSettled, onFail, onNotice, clearNotice };

  const url = buildSdkUrl({
    clientId: config.clientId ?? "",
    locale,
    intent: config.intent,
    buyerCountry: config.buyerCountry,
  });

  useEffect(() => {
    let disposed = false;
    let instance: PayPalButtonsInstance | undefined;
    let rendering: Promise<void> | undefined;
    let lastCode: string | null = null;
    const container = containerRef.current;
    setSdk("loading");

    loadPayPalSdk(url)
      .then(async (paypal) => {
        // A fast beat switch can unmount us while the SDK loads: never hand PayPal a detached node.
        if (disposed || !container || !container.isConnected) return;
        instance = paypal.Buttons({
          style: { layout: "vertical", color: "gold", shape: "rect", label: "pay", height: 44 },
          createOrder: async () => {
            lastCode = null;
            handlers.current.clearNotice();
            const r = await postJson<CreatePhaseOrderResponse>("/api/paypal/orders", { planId, phaseId });
            if (!r.ok) {
              lastCode = r.code;
              throw new Error(r.code);
            }
            return r.body.orderId;
          },
          onApprove: async (data, actions) => {
            setCapturing(true);
            try {
              const r = await postJson<CapturePhaseOrderResponse>(
                `/api/paypal/orders/${encodeURIComponent(data.orderID)}/capture`,
                { planId, phaseId, orderId: data.orderID },
              );
              if (!r.ok) {
                lastCode = r.code;
                throw new Error(r.code);
              }
              if (r.body.outcome === "DECLINED") {
                handlers.current.onNotice("declined");
                await actions.restart();
                return;
              }
              handlers.current.onSettled(r.body);
            } finally {
              if (!disposed) setCapturing(false);
            }
          },
          onCancel: () => handlers.current.onNotice("cancelled"),
          onError: () => handlers.current.onFail(lastCode ?? "PAYPAL"),
        });
        const buttons = instance;
        container.replaceChildren();
        rendering = Promise.resolve().then(() => buttons.render(container));
        await rendering;
        if (!disposed) setSdk("ready");
      })
      .catch(() => {
        if (!disposed) setSdk("error");
      });

    return () => {
      disposed = true;
      const buttons = instance;
      if (!buttons?.close) return;
      // Close only after render settled, and only while the container is still in the document:
      // PayPal's close() on a node React already removed throws "reading 'nodeType'".
      void (rendering ?? Promise.resolve())
        .catch(() => {})
        .then(() => (container?.isConnected ? buttons.close?.() : undefined))
        .catch(() => {});
    };
  }, [url, planId, phaseId, reload]);

  return (
    <div className="relative" data-testid="pay-phase" data-mode="live" aria-busy={sdk === "loading" || capturing}>
      {sdk === "loading" && <ButtonSkeleton label={t("sdkLoading")} tall />}
      {sdk === "error" && (
        <LoadError message={t("sdkError")} retry={t("retry")} onRetry={() => setReload((n) => n + 1)} />
      )}
      <div ref={containerRef} className={cx("min-h-[44px]", sdk !== "ready" && "hidden")} />
      {capturing && (
        <div
          role="status"
          className="absolute inset-0 z-10 flex items-center justify-center gap-2 rounded-[var(--ppp-radius-sm)] bg-surface/85 text-sm font-medium text-ink backdrop-blur-[1px]"
        >
          <Spinner /> {t("working")}
        </div>
      )}
    </div>
  );
}

function ButtonSkeleton({ label, tall = false }: { label: string; tall?: boolean }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-2">
      <div className="h-11 w-full animate-pulse rounded-[var(--ppp-radius-sm)] bg-surface-2" />
      {tall && <div className="h-11 w-full animate-pulse rounded-[var(--ppp-radius-sm)] bg-surface-2/70" />}
      <span className="sr-only">{label}</span>
    </div>
  );
}

function LoadError({ message, retry, onRetry }: { message: string; retry: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 rounded-[var(--ppp-radius-sm)] border border-status-overdue/30 bg-status-overdue/5 px-3 py-2 text-sm text-status-overdue"
    >
      <span>{message}</span>
      <Button size="sm" variant="secondary" onClick={onRetry}>
        {retry}
      </Button>
    </div>
  );
}
