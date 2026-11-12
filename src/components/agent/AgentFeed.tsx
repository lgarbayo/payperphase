"use client";
/**
 * Live clinic-agent activity feed: the audit trail from GET /api/agent/steps, then
 * AGENT_STEP / APPROVAL_REQUESTED over SSE. Per run: tool chips with ✓/✗, red guard rejections with the
 * reason ("1.500,00 € ≠ motor 1.950,00 €"), expandable redacted JSON, invoice payer links and QR images,
 * LLM/Playbook and Mock badges, and the approval card (Approve / Reject) that executes the stored payload.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AgentStep, AgentStepsResponse, DomainEvent, Locale, PendingApproval } from "@/contracts";
import { translate, type KeyOf, type Vars } from "@/i18n/core";
import { useDomainEvents } from "@/lib/sse/useDomainEvents";
import { Badge, Button, Card, cx, ModeBadge } from "@/lib/ui";

type AgentKey = KeyOf<"agent">;
type T = (key: AgentKey, vars?: Vars) => string;

const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);

/** Only http(s) links and PNG/JPEG data URLs ever reach href/src. */
const safeHref = (v: unknown): string | undefined => (typeof v === "string" && /^https?:\/\//i.test(v) ? v : undefined);
const safeImage = (v: unknown): string | undefined =>
  typeof v === "string" && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(v) ? v : undefined;

function timeOf(iso: string, locale: Locale): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(locale === "es" ? "es-ES" : "en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function byOrder(a: AgentStep, b: AgentStep): number {
  return a.at === b.at ? a.seq - b.seq : a.at < b.at ? -1 : 1;
}

/** A visible row: a tool call joined with its result, or any other single step. */
interface Row {
  key: string;
  step: AgentStep;
  result?: AgentStep;
}

function toRows(steps: AgentStep[]): Row[] {
  const rows: Row[] = [];
  const used = new Set<string>();
  steps.forEach((s, i) => {
    if (used.has(s.id)) return;
    if (s.kind === "tool_call") {
      const j = steps.findIndex(
        (r, k) => k > i && !used.has(r.id) && r.kind === "tool_result" && r.tool === s.tool && r.phaseId === s.phaseId,
      );
      const result = j >= 0 ? steps[j] : undefined;
      if (result) used.add(result.id);
      rows.push({ key: s.id, step: s, result });
    } else {
      rows.push({ key: s.id, step: s });
    }
  });
  return rows;
}

interface Run {
  runId: string;
  steps: AgentStep[];
  first: AgentStep;
  finished?: AgentStep;
}

function toRuns(all: AgentStep[]): Run[] {
  const byRun = new Map<string, AgentStep[]>();
  for (const s of all) byRun.set(s.runId, [...(byRun.get(s.runId) ?? []), s]);
  const runs: Run[] = [];
  for (const [runId, list] of byRun) {
    const steps = [...list].sort(byOrder);
    runs.push({ runId, steps, first: steps[0]!, finished: steps.find((s) => s.kind === "run_finished") });
  }
  return runs.sort((a, b) => (a.first.at === b.first.at ? 0 : a.first.at < b.first.at ? 1 : -1));
}

function Chip({ tone, children, title, ...rest }: { tone: "ok" | "bad" | "pending" | "neutral"; children: React.ReactNode; title?: string } & Record<string, unknown>) {
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2 py-0.5 font-mono text-xs font-medium",
        tone === "ok" && "bg-status-paid/15 text-status-paid",
        tone === "bad" && "bg-status-overdue/15 text-status-overdue",
        tone === "pending" && "bg-surface-2 text-muted",
        tone === "neutral" && "bg-surface-2 text-ink",
      )}
      {...rest}
    >
      {children}
    </span>
  );
}

function Json({ label, value }: { label: string; value: unknown }) {
  if (value === undefined) return null;
  const text = (() => {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  })();
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted">{label}</p>
      <pre className="max-h-56 overflow-auto rounded-md bg-surface-2 p-2 text-[11px] leading-snug text-ink" data-testid="agent-json">
        {text.length > 4000 ? `${text.slice(0, 4000)}…` : text}
      </pre>
    </div>
  );
}

function Details({ step, result, t }: { step: AgentStep; result?: AgentStep; t: T }) {
  const output = result?.output ?? step.output;
  const input = step.input;
  if (input === undefined && output === undefined) return null;
  // Strip the (large) QR data URL from the JSON view; the image is shown above it.
  const shown = isRecord(output) && "qrDataUrl" in output ? { ...output, qrDataUrl: "data:image/png;base64,…" } : output;
  return (
    <details className="mt-1">
      <summary className="w-fit cursor-pointer rounded text-xs text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{t("showJson")}</summary>
      <div className="mt-2 space-y-2">
        <Json label={t("input")} value={input} />
        <Json label={t("output")} value={shown} />
      </div>
    </details>
  );
}

function StepRow({
  row,
  locale,
  t,
  approvals,
}: {
  row: Row;
  locale: Locale;
  t: T;
  approvals: Map<string, PendingApproval>;
}) {
  const { step, result } = row;
  const text = step.text?.[locale] ?? "";
  const time = timeOf(step.at, locale);
  const phase = step.phaseId ? step.phaseId.replace(/^ph/, "F") : undefined;
  const outputs = [step.output, result?.output].filter(isRecord);
  const qr = safeImage(outputs.map((o) => o.qrDataUrl).find(Boolean));
  const payerUrl = safeHref(outputs.map((o) => o.payerViewUrl).find(Boolean));
  const invoiceNumber = outputs.map((o) => o.invoiceNumber).find((v): v is string => typeof v === "string");

  const shell = "rounded-lg border px-3 py-2 text-sm";

  if (step.kind === "guard_rejected") {
    const guardTest = isRecord(step.output) && step.output.guardTest === true;
    return (
      <li
        data-testid="agent-step"
        data-kind="guard_rejected"
        className={cx(shell, "border-status-overdue/50 border-l-4 border-l-status-overdue bg-status-overdue/10")}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone="bad" data-testid="guard-chip">
            ✗ {t("guardLabel")}
          </Chip>
          {step.tool ? <Chip tone="neutral">{step.tool}</Chip> : null}
          {phase ? <Chip tone="neutral">{phase}</Chip> : null}
          {guardTest ? <Badge tone="overdue">{t("guardTestLabel")}</Badge> : null}
          <span className="ml-auto text-xs tabular-nums text-muted">{time}</span>
        </div>
        <p className="mt-1.5 text-base font-semibold tabular-nums text-status-overdue" data-testid="guard-reason">
          {text}
        </p>
        <Details step={step} t={t} />
      </li>
    );
  }

  if (step.kind === "tool_call") {
    const state: "ok" | "bad" | "pending" = !result ? "pending" : result.ok === false ? "bad" : "ok";
    return (
      <li data-testid="agent-step" data-kind="tool_call" data-state={state} className={cx(shell, "border-border bg-surface")}>
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={state}>
            {state === "ok" ? "✓" : state === "bad" ? "✗" : "…"} {step.tool}
          </Chip>
          {phase ? <Chip tone="neutral">{phase}</Chip> : null}
          <span className="ml-auto text-xs tabular-nums text-muted">{time}</span>
        </div>
        <p className="mt-1 text-ink">{text}</p>
        {result?.text ? (
          <p className={cx("text-xs", result.ok === false ? "text-status-overdue" : "text-muted")}>{result.text[locale]}</p>
        ) : null}
        {payerUrl ? (
          <a
            href={payerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-block rounded text-xs font-medium text-primary-strong underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            data-testid="payer-link"
          >
            {t("payerLink")}{invoiceNumber ? ` · ${invoiceNumber}` : ""}
          </a>
        ) : null}
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qr}
            alt={t("qrAlt", { number: invoiceNumber ?? "" })}
            width={112}
            height={112}
            className="mt-2 rounded-md border border-border bg-white p-1"
            data-testid="invoice-qr"
          />
        ) : null}
        <Details step={step} result={result} t={t} />
      </li>
    );
  }

  if (step.kind === "approval_required" || step.kind === "approval_granted") {
    const approval = step.approvalId ? approvals.get(step.approvalId) : undefined;
    return (
      <li data-testid="agent-step" data-kind={step.kind} className={cx(shell, "border-primary/40 bg-primary/5")}>
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={step.kind === "approval_granted" ? "ok" : "pending"}>
            {step.kind === "approval_granted" ? "✓" : "⏸"} {step.tool ?? "send_invoice"}
          </Chip>
          {phase ? <Chip tone="neutral">{phase}</Chip> : null}
          {approval ? (
            <Badge
              data-testid="approval-status"
              data-status={approval.status}
              tone={approval.status === "failed" || approval.status === "rejected" ? "overdue" : approval.status === "pending" ? "upcoming" : "paid"}
            >
              {t(`approvalStatus_${approval.status}` as AgentKey)}
            </Badge>
          ) : null}
          <span className="ml-auto text-xs tabular-nums text-muted">{time}</span>
        </div>
        <p className="mt-1 text-ink">{text}</p>
        <Details step={step} t={t} />
      </li>
    );
  }

  if (step.kind === "error") {
    return (
      <li data-testid="agent-step" data-kind="error" className={cx(shell, "border-status-overdue/40 bg-status-overdue/5")}>
        <p className="text-status-overdue">
          ✗ {text} <span className="text-xs text-muted">{time}</span>
        </p>
        <Details step={step} t={t} />
      </li>
    );
  }

  if (step.kind === "tool_result") {
    // Orphan result (its call row is hidden or arrives later): show it plainly.
    return (
      <li data-testid="agent-step" data-kind="tool_result" className={cx(shell, "border-border bg-surface-2")}>
        <p className={cx(step.ok === false && "text-status-overdue")}>
          {step.ok === false ? "✗" : "✓"} {text}
        </p>
      </li>
    );
  }

  // run_started / run_finished / explanation
  return (
    <li data-testid="agent-step" data-kind={step.kind} className="px-1 text-sm text-muted">
      {step.kind === "explanation" ? <span aria-hidden>💬 </span> : null}
      <span className={cx(step.kind === "explanation" && "text-ink")}>{text}</span>
      <span className="ml-2 text-xs">{time}</span>
    </li>
  );
}

/** Green "PayPal sandbox · Agent Toolkit": shown where the mock badge sits when no step ran on the mock. */
function SandboxBadge({ t }: { t: T }) {
  return (
    <Badge tone="paid" title={t("sandboxBadgeTitle")} data-testid="sandbox-badge">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-status-paid" />
      {t("sandboxBadge")}
    </Badge>
  );
}

function RunCard({ run, locale, t, approvals }: { run: Run; locale: Locale; t: T; approvals: Map<string, PendingApproval> }) {
  const rows = useMemo(() => toRows(run.steps.filter((s) => s.kind !== "run_started")), [run.steps]);
  const mode = run.steps[run.steps.length - 1]!.mode;
  const mock = run.steps.some((s) => s.mock);
  const issues = run.finished?.ok === false;
  const triggerKey = `trigger_${run.first.trigger}` as AgentKey;
  return (
    <section className="space-y-2 border-t border-border pt-4 first:border-t-0 first:pt-0" data-testid="agent-run" data-run-id={run.runId} aria-label={t(triggerKey)}>
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-sm font-semibold text-ink">{t(triggerKey)}</h4>
        <Badge tone={mode === "llm" ? "primary" : "neutral"} title={mode === "llm" ? t("modeLlmTitle") : t("modePlaybookTitle")} data-testid="mode-badge" data-mode={mode}>
          {mode === "llm" ? t("modeLlm") : t("modePlaybook")}
        </Badge>
        {mock ? <ModeBadge mode="mock" what="PayPal" locale={locale} /> : <SandboxBadge t={t} />}
        {!run.finished ? (
          <Badge tone="processing" data-testid="run-running">
            {t("running")}
          </Badge>
        ) : issues ? (
          <Badge tone="overdue">{t("runFinishedIssues")}</Badge>
        ) : null}
        <span className="ml-auto text-xs tabular-nums text-muted">{timeOf(run.first.at, locale)}</span>
      </div>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <StepRow key={r.key} row={r} locale={locale} t={t} approvals={approvals} />
        ))}
      </ul>
    </section>
  );
}

function invoiceIdOf(a: PendingApproval): string | undefined {
  return isRecord(a.payload) && typeof a.payload.invoice_id === "string" ? a.payload.invoice_id : undefined;
}

function ApprovalCard({
  approval,
  locale,
  t,
  onDecide,
}: {
  approval: PendingApproval;
  locale: Locale;
  t: T;
  onDecide: (a: PendingApproval, decision: "approve" | "reject") => Promise<void>;
}) {
  const [busy, setBusy] = useState<null | "approve" | "reject">(null);
  const [error, setError] = useState(false);
  const invoiceId = invoiceIdOf(approval);

  async function decide(decision: "approve" | "reject") {
    setBusy(decision);
    setError(false);
    try {
      await onDecide(approval, decision);
    } catch {
      setError(true);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      data-testid="approval-card"
      data-approval-id={approval.id}
      role="group"
      aria-label={t("approvalTitle")}
      className="rounded-[var(--ppp-radius-sm)] border-2 border-primary bg-primary/5 p-4"
    >
      <div className="flex items-center gap-2">
        <span aria-hidden>🛡️</span>
        <h4 className="text-base font-semibold text-ink">{t("approvalTitle")}</h4>
        {approval.phaseId ? <Chip tone="neutral">{approval.phaseId.replace(/^ph/, "F")}</Chip> : null}
      </div>
      <p className="mt-1 text-sm font-medium tabular-nums text-ink" data-testid="approval-summary">
        {approval.summary[locale]}
      </p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs text-muted">
        <dt>{t("payloadInvoice")}</dt>
        <dd className="font-mono text-ink">{invoiceId ?? "—"}</dd>
        <dt>{t("payloadHash")}</dt>
        <dd className="font-mono text-ink" title={approval.payloadSha256} data-testid="approval-hash">
          {approval.payloadSha256.slice(0, 16)}…
        </dd>
      </dl>
      <p className="mt-2 text-xs text-muted">{t("approvalHint")}</p>
      <details className="mt-1">
        <summary className="w-fit cursor-pointer rounded text-xs text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{t("showJson")}</summary>
        <div className="mt-2">
          <Json label={t("input")} value={approval.payload} />
        </div>
      </details>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="md" onClick={() => decide("approve")} disabled={busy !== null} data-testid="approve-button">
          {busy === "approve" ? t("approving") : t("approve")}
        </Button>
        <Button size="md" variant="secondary" onClick={() => decide("reject")} disabled={busy !== null} data-testid="reject-button">
          {busy === "reject" ? t("rejecting") : t("reject")}
        </Button>
        {error ? (
          <span role="alert" className="text-xs text-status-overdue">
            {t("approvalError")}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function AgentFeed({ planId, locale }: { planId: string; locale: Locale }) {
  const t = useCallback<T>((key, vars) => translate("agent", locale, key, vars), [locale]);
  const [steps, setSteps] = useState<Map<string, AgentStep>>(new Map());
  const [approvals, setApprovals] = useState<Map<string, PendingApproval>>(new Map());
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const mounted = useRef(true);

  const merge = useCallback((res: AgentStepsResponse) => {
    setSteps((prev) => {
      const next = new Map(prev);
      for (const s of res.steps) next.set(s.id, s);
      return next;
    });
    setApprovals((prev) => {
      const next = new Map(prev);
      for (const a of res.approvals) next.set(a.id, a);
      return next;
    });
  }, []);

  const load = useCallback(
    async (quiet = false) => {
      if (!quiet) setState("loading");
      try {
        const res = await fetch(`/api/agent/steps?planId=${encodeURIComponent(planId)}`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as AgentStepsResponse;
        if (!mounted.current) return;
        merge(body);
        setState("ready");
      } catch {
        if (mounted.current && !quiet) setState("error");
      }
    },
    [planId, merge],
  );

  useEffect(() => {
    mounted.current = true;
    setSteps(new Map());
    setApprovals(new Map());
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  useDomainEvents(planId, (e: DomainEvent) => {
    if (e.type === "DEMO_RESET") {
      setSteps(new Map());
      setApprovals(new Map());
      void load(true);
      return;
    }
    if (e.type === "AGENT_STEP" && e.planId === planId) {
      setSteps((prev) => new Map(prev).set(e.step.id, e.step));
      setState((s) => (s === "loading" ? "ready" : s));
      // Approval status changes (approved / executed / failed) ride on steps that carry the approval id.
      if (e.step.approvalId && e.step.kind !== "approval_required") void load(true);
    } else if (e.type === "APPROVAL_REQUESTED" && e.planId === planId) {
      setApprovals((prev) => new Map(prev).set(e.approval.id, e.approval));
    }
  });

  const decide = useCallback(
    async (a: PendingApproval, decision: "approve" | "reject") => {
      const res = await fetch("/api/agent/approve", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ approvalId: a.id, decidedBy: t("decidedByDefault"), decision }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as { approval: PendingApproval };
      setApprovals((prev) => new Map(prev).set(body.approval.id, body.approval));
      void load(true);
    },
    [t, load],
  );

  const all = useMemo(() => [...steps.values()], [steps]);
  const runs = useMemo(() => toRuns(all), [all]);
  const pending = useMemo(
    () => [...approvals.values()].filter((a) => a.status === "pending").sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)),
    [approvals],
  );
  const mock = all.some((s) => s.mock);

  return (
    <Card data-testid="agent-feed" className="space-y-4" aria-labelledby="agent-feed-title">
      <header className="flex flex-wrap items-start gap-2">
        <div className="min-w-0">
          <h3 id="agent-feed-title" className="text-base font-semibold text-ink">
            {t("title")}
          </h3>
          <p className="text-xs text-muted">{t("subtitle")}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {mock ? <ModeBadge mode="mock" what="PayPal" locale={locale} /> : all.length > 0 ? <SandboxBadge t={t} /> : null}
          <Badge tone="paid" data-testid="live-badge">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-status-paid" aria-hidden />
            {t("live")}
          </Badge>
        </div>
      </header>

      {pending.map((a) => (
        <ApprovalCard key={a.id} approval={a} locale={locale} t={t} onDecide={decide} />
      ))}

      {state === "loading" && runs.length === 0 ? (
        <div data-testid="agent-feed-loading" aria-busy="true" className="space-y-2">
          <p className="text-sm text-muted">{t("loading")}</p>
          <div className="h-9 animate-pulse rounded-lg bg-surface-2" />
          <div className="h-9 animate-pulse rounded-lg bg-surface-2" />
        </div>
      ) : null}

      {state === "error" && runs.length === 0 ? (
        <div role="alert" data-testid="agent-feed-error" className="rounded-lg border border-status-overdue/40 bg-status-overdue/5 p-3 text-sm">
          <p className="text-status-overdue">{t("loadError")}</p>
          <Button size="sm" variant="secondary" className="mt-2" onClick={() => void load()}>
            {t("retry")}
          </Button>
        </div>
      ) : null}

      {state === "ready" && runs.length === 0 ? (
        <div data-testid="agent-feed-empty" className="rounded-lg border border-dashed border-border p-4 text-center">
          <p className="text-sm font-medium text-ink">{t("empty")}</p>
          <p className="mt-1 text-xs text-muted">{t("emptyHint")}</p>
        </div>
      ) : null}

      <div className="max-h-[34rem] space-y-5 overflow-y-auto pr-1" aria-live="polite" data-testid="agent-runs">
        {runs.map((run) => (
          <RunCard key={run.runId} run={run} locale={locale} t={t} approvals={approvals} />
        ))}
      </div>
    </Card>
  );
}
