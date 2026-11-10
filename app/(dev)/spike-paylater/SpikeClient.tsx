"use client";
/**
 * OWNED BY WP-04. Client half of the Pay Later ES spike. For each intent it loads the SDK once,
 * mounts the official message for each amount (unedited), checks Pay Later button eligibility, and
 * renders the standard vertical buttons. Results are shown on screen and on window.__pppSpike
 * (read by the headless check described in docs/spikes/paylater-es.md).
 */
import { useEffect, useRef, useState } from "react";
import { loadPayPalSdk, type PayPalNamespace } from "@/components/pay/sdk";
import { formatCents } from "@/lib/money";
import { buildSdkUrl, type SdkIntent } from "@/lib/paypal/sdk-url";
import { Badge, Card, cx } from "@/lib/ui";

const AMOUNTS = [36_000, 150_000, 195_000] as const;
const INTENTS: SdkIntent[] = ["capture", "authorize"];

type MsgState = "pending" | "rendered" | "no-message" | "error";
interface IntentResult {
  sdk: "loading" | "loaded" | "error";
  sdkVersion?: string;
  payLaterEligible?: boolean;
  buttonsRendered?: boolean;
  messages: Record<number, MsgState>;
  approvedOrderId?: string;
  error?: string;
}

type Results = Record<SdkIntent, IntentResult>;

const initial = (): IntentResult => ({ sdk: "loading", messages: Object.fromEntries(AMOUNTS.map((a) => [a, "pending"])) });

declare global {
  interface Window {
    __pppSpike?: Results;
  }
}

export function SpikeClient({
  clientId,
  source,
  buyerCountry,
}: {
  clientId: string;
  source: "query" | "env" | "placeholder";
  buyerCountry: string;
}) {
  const [results, setResults] = useState<Results>({ capture: initial(), authorize: initial() });

  useEffect(() => {
    window.__pppSpike = results;
  }, [results]);

  const update = (intent: SdkIntent, patch: (r: IntentResult) => IntentResult) =>
    setResults((prev) => ({ ...prev, [intent]: patch(prev[intent]) }));

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Pay Later ES spike</h1>
          <Badge tone="upcoming">Sandbox · dev only</Badge>
        </div>
        <p className="max-w-3xl text-sm text-muted">
          Does PayPal&apos;s official Pay Later message render for a Spanish buyer in EUR, under intent=capture and
          intent=authorize, for our phase amounts? Messages are mounted unedited with the phase amount; PayPal decides
          what they say. Result recorded in <code className="font-mono">docs/spikes/paylater-es.md</code>.
        </p>
        <p className="text-xs text-muted">
          client-id: <code className="font-mono">{clientId.length > 12 ? `${clientId.slice(0, 8)}…` : clientId}</code> (
          {source === "placeholder" ? "PayPal public sandbox placeholder, no credentials configured" : source}) ·
          buyer-country {buyerCountry} · locale es_ES
        </p>
      </header>

      <SummaryTable results={results} />

      <div className="grid gap-6 lg:grid-cols-2">
        {INTENTS.map((intent) => (
          <IntentColumn
            key={intent}
            intent={intent}
            clientId={clientId}
            buyerCountry={buyerCountry}
            result={results[intent]}
            update={(p) => update(intent, p)}
          />
        ))}
      </div>
    </main>
  );
}

function SummaryTable({ results }: { results: Results }) {
  const cell = (ok: boolean | undefined, pending: boolean) =>
    pending ? <Badge tone="neutral">…</Badge> : ok ? <Badge tone="paid">yes</Badge> : <Badge tone="overdue">no</Badge>;
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[560px] text-left text-sm" data-testid="spike-summary">
        <thead className="border-b border-border bg-surface-2 text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-4 py-2 font-medium">intent</th>
            <th className="px-4 py-2 font-medium">SDK</th>
            {AMOUNTS.map((a) => (
              <th key={a} className="px-4 py-2 font-medium">
                msg {formatCents(a, "es", { whole: true })}
              </th>
            ))}
            <th className="px-4 py-2 font-medium">Pay Later button</th>
            <th className="px-4 py-2 font-medium">Buttons</th>
          </tr>
        </thead>
        <tbody>
          {INTENTS.map((intent) => {
            const r = results[intent];
            const loading = r.sdk === "loading";
            return (
              <tr key={intent} className="border-b border-border last:border-0" data-intent={intent}>
                <td className="px-4 py-2 font-mono">{intent}</td>
                <td className="px-4 py-2">{cell(r.sdk === "loaded", loading)}</td>
                {AMOUNTS.map((a) => (
                  <td key={a} className="px-4 py-2" data-amount={a} data-state={r.messages[a]}>
                    {cell(r.messages[a] === "rendered", r.messages[a] === "pending")}
                  </td>
                ))}
                <td className="px-4 py-2">{cell(r.payLaterEligible, loading)}</td>
                <td className="px-4 py-2">{cell(r.buttonsRendered, loading)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

function IntentColumn({
  intent,
  clientId,
  buyerCountry,
  result,
  update,
}: {
  intent: SdkIntent;
  clientId: string;
  buyerCountry: string;
  result: IntentResult;
  update: (p: (r: IntentResult) => IntentResult) => void;
}) {
  const url = buildSdkUrl({ clientId, locale: "es", intent, buyerCountry });
  const buttonsRef = useRef<HTMLDivElement>(null);
  const msgRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const updateRef = useRef(update);
  updateRef.current = update;

  useEffect(() => {
    let disposed = false;
    const set = (p: (r: IntentResult) => IntentResult) => !disposed && updateRef.current(p);

    loadPayPalSdk(url)
      .then(async (paypal: PayPalNamespace) => {
        const version = paypal.version;
        set((r) => ({ ...r, sdk: "loaded", sdkVersion: version }));

        // Messages: official component, unedited, one per amount.
        for (const amount of AMOUNTS) {
          const el = msgRefs.current[amount];
          if (!el || !paypal.Messages) {
            set((r) => ({ ...r, messages: { ...r.messages, [amount]: "no-message" } }));
            continue;
          }
          el.replaceChildren();
          paypal
            .Messages({
              amount: amount / 100,
              placement: "payment",
              style: { layout: "text", logo: { type: "inline" } },
              onRender: () => set((r) => ({ ...r, messages: { ...r.messages, [amount]: "rendered" } })),
            })
            .render(el)
            .catch(() => set((r) => ({ ...r, messages: { ...r.messages, [amount]: "error" } })));
        }
        // PayPal renders nothing (and never calls onRender) when there is no offer for this buyer/amount.
        setTimeout(
          () =>
            set((r) => ({
              ...r,
              messages: Object.fromEntries(
                Object.entries(r.messages).map(([k, v]) => [k, v === "pending" ? "no-message" : v]),
              ) as IntentResult["messages"],
            })),
          12_000,
        );

        // Pay Later button eligibility (standalone funding source).
        const paylater = paypal.FUNDING?.PAYLATER;
        const eligible = paylater
          ? Boolean(
              paypal
                .Buttons({
                  fundingSource: paylater,
                  createOrder: async () => "",
                  onApprove: async () => {},
                })
                .isEligible?.(),
            )
          : false;
        set((r) => ({ ...r, payLaterEligible: eligible }));

        // Standard vertical buttons (PayPal + Pay Later + card when eligible).
        if (!buttonsRef.current) return;
        buttonsRef.current.replaceChildren();
        const sdkWithOrders = paypal as unknown as {
          Buttons: (o: Record<string, unknown>) => { render: (el: HTMLElement) => Promise<void> };
        };
        await sdkWithOrders
          .Buttons({
            style: { layout: "vertical", color: "gold", shape: "rect", label: "pay", height: 44 },
            createOrder: (_d: unknown, actions: { order: { create: (o: unknown) => Promise<string> } }) =>
              actions.order.create({
                intent: intent.toUpperCase(),
                purchase_units: [{ amount: { currency_code: "EUR", value: "360.00" }, description: "Spike · Fase 1" }],
                application_context: { shipping_preference: "NO_SHIPPING" },
              }),
            onApprove: async (data: { orderID: string }) => set((r) => ({ ...r, approvedOrderId: data.orderID })),
            onError: (e: unknown) => set((r) => ({ ...r, error: e instanceof Error ? e.message : String(e) })),
          })
          .render(buttonsRef.current);
        set((r) => ({ ...r, buttonsRendered: true }));
      })
      .catch((e: unknown) => set((r) => ({ ...r, sdk: "error", error: e instanceof Error ? e.message : String(e) })));

    return () => {
      disposed = true;
    };
  }, [url, intent]);

  return (
    <Card className="flex flex-col gap-4" data-testid={`spike-${intent}`}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">
          intent=<span className="font-mono">{intent}</span>
        </h2>
        <Badge tone={result.sdk === "loaded" ? "paid" : result.sdk === "error" ? "overdue" : "neutral"}>
          SDK {result.sdk}
          {result.sdkVersion ? ` · v${result.sdkVersion}` : ""}
        </Badge>
      </div>
      <code className="block break-all rounded-[var(--ppp-radius-sm)] bg-surface-2 p-2 font-mono text-[11px] leading-relaxed text-muted">
        {url.replace(`client-id=${encodeURIComponent(clientId)}`, "client-id=…")}
      </code>

      <section className="flex flex-col gap-3">
        {AMOUNTS.map((amount) => (
          <div key={amount} className="flex flex-col gap-1 border-b border-border pb-3 last:border-0">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium tabular-nums">{formatCents(amount, "es")}</span>
              <span
                className={cx(
                  "text-xs",
                  result.messages[amount] === "rendered" ? "text-status-paid" : "text-muted",
                )}
              >
                {result.messages[amount]}
              </span>
            </div>
            <div
              ref={(el) => {
                msgRefs.current[amount] = el;
              }}
              data-pp-amount={(amount / 100).toFixed(2)}
              data-testid={`spike-msg-${intent}-${amount}`}
              className="min-h-5"
            />
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <p className="text-xs text-muted">
          Pay Later button eligible:{" "}
          <strong>{result.payLaterEligible === undefined ? "…" : result.payLaterEligible ? "yes" : "no"}</strong>
          {result.approvedOrderId && (
            <>
              {" "}
              · approved order <span className="font-mono">{result.approvedOrderId}</span> (not captured)
            </>
          )}
        </p>
        <div ref={buttonsRef} className="min-h-[44px]" data-testid={`spike-buttons-${intent}`} />
        {result.error && <p className="text-xs text-status-overdue">{result.error}</p>}
      </section>
    </Card>
  );
}
