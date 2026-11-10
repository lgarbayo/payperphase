"use client";
/**
 * OWNED BY WP-07. "Aprobar y enviar al paciente": lists the per-phase invoices the agent will issue
 * (this click is the human approval for that initial issue, see WP-10), then shows the patient
 * link /p/{id} with a copy button and its QR code (`qrcode` data URL).
 */
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { formatInvoiceNumber, type Locale, type Phase, type Plan } from "@/contracts";
import { formatIsoDate } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { Badge, Button, cx } from "@/lib/ui";
import { Icon, INVOICE_STATUS_LABEL, Spinner, type ClinicT } from "./shared";

export interface SendToPatientProps {
  plan: Plan;
  locale: Locale;
  t: ClinicT;
  /** Every note ticked: the approve button unlocks. */
  notesApproved: boolean;
  approving: boolean;
  error?: string | null;
  onApprove: () => void;
}

export function patientPath(planId: string): string {
  return `/p/${planId}`;
}

function invoiceNumberFor(plan: Plan, phase: Phase): string {
  return phase.payment.invoice?.invoiceNumber ?? formatInvoiceNumber(plan.id, phase.n, 1);
}

export function SendToPatient({ plan, locale, t, notesApproved, approving, error, onApprove }: SendToPatientProps) {
  const approved = plan.status !== "draft";
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(300px,1fr)]">
      <InvoicesPreview plan={plan} locale={locale} t={t} approved={approved} />
      {approved ? (
        <PatientLinkCard plan={plan} locale={locale} t={t} />
      ) : (
        <div className="flex flex-col justify-between gap-4 rounded-[var(--ppp-radius)] border border-border bg-surface p-5 shadow-[var(--ppp-shadow)]">
          <div>
            <p className="text-sm font-medium text-ink">{plan.clinic.dentistName}</p>
            <p className="text-sm text-muted">{notesApproved ? t("notesReady") : t("notesRequired")}</p>
          </div>
          <div className="flex flex-col gap-2">
            <Button
              size="lg"
              data-testid="approve-send"
              disabled={!notesApproved || approving}
              onClick={onApprove}
              className="w-full"
            >
              {approving ? <Spinner /> : <Icon.Check />}
              {approving ? t("approving") : t("approveSend")}
            </Button>
            {error && (
              <p role="alert" className="flex items-center gap-2 text-sm text-status-overdue">
                <Icon.Alert />
                {error}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function InvoicesPreview({ plan, locale, t, approved }: { plan: Plan; locale: Locale; t: ClinicT; approved: boolean }) {
  return (
    <div
      data-testid="invoices-preview"
      className="overflow-hidden rounded-[var(--ppp-radius)] border border-border bg-surface shadow-[var(--ppp-shadow)]"
    >
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold text-ink">{t("invoicesTitle")}</h3>
        <p className="text-xs text-muted">{approved ? t("invoicesHintApproved") : t("invoicesHint")}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead>
            <tr className="bg-surface-2/60 text-left text-[11px] font-medium uppercase tracking-wide text-muted">
              <th scope="col" className="px-4 py-2 font-medium">
                {t("colInvoice")}
              </th>
              <th scope="col" className="px-4 py-2 font-medium">
                {t("colVisit")}
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                {t("colAmount")}
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                {t("colStatus")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {plan.phases.map((phase) => {
              const inv = phase.payment.invoice;
              const paid = phase.payment.status === "paid";
              return (
                <tr key={phase.id} data-testid={`invoice-row-${phase.id}`}>
                  <td className="px-4 py-2.5">
                    <span className="block font-mono text-xs font-medium text-ink">
                      {invoiceNumberFor(plan, phase)}
                    </span>
                    <span className="block text-xs text-muted">
                      {t("phaseLabel", { n: phase.n })} · {phase.title[locale]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-muted">{formatIsoDate(phase.payment.dueDate, locale)}</td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums text-ink">
                    {formatCents(phase.amountCents, locale)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {paid ? (
                      <Badge tone="paid">{t("invPaid")}</Badge>
                    ) : inv ? (
                      <Badge tone={inv.status === "CANCELLED" ? "neutral" : "primary"}>
                        {t(INVOICE_STATUS_LABEL[inv.status])}
                      </Badge>
                    ) : (
                      <Badge tone="neutral">{t("invToIssue")}</Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PatientLinkCard({ plan, locale, t }: { plan: Plan; locale: Locale; t: ClinicT }) {
  const path = patientPath(plan.id);
  const [origin, setOrigin] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [copy, setCopy] = useState<"idle" | "copied" | "failed">("idle");
  const link = `${origin}${path}`;

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!origin) return;
    let alive = true;
    QRCode.toDataURL(link, {
      margin: 1,
      width: 320,
      errorCorrectionLevel: "M",
      color: { dark: "#10243a", light: "#ffffff" },
    })
      .then((url) => alive && setQr(url))
      .catch(() => alive && setQr(null));
    return () => {
      alive = false;
    };
  }, [link, origin]);

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
    setTimeout(() => setCopy("idle"), 1800);
  };

  return (
    <div
      data-testid="patient-link-card"
      className="flex flex-col gap-4 rounded-[var(--ppp-radius)] border border-status-paid/30 bg-surface p-5 shadow-[var(--ppp-shadow)]"
    >
      <div className="flex items-center gap-2 text-sm font-medium text-status-paid">
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-status-paid text-white">
          <Icon.Check width={12} height={12} strokeWidth={3} />
        </span>
        {plan.approvedBy && plan.approvedAt
          ? t("approvedOn", { name: plan.approvedBy, date: formatIsoDate(plan.approvedAt.slice(0, 10), locale) })
          : t("planApproved")}
      </div>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <figure className="flex shrink-0 flex-col items-center gap-1">
          <div className="flex h-36 w-36 items-center justify-center rounded-xl border border-border bg-white p-2">
            {qr ? (
              <img data-testid="patient-qr" src={qr} alt={t("qrAlt")} width={128} height={128} className="h-32 w-32" />
            ) : (
              <div aria-hidden className="h-32 w-32 animate-pulse rounded-lg bg-surface-2" />
            )}
          </div>
          <figcaption className="text-xs text-muted">{t("qrCaption")}</figcaption>
        </figure>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t("patientLink")}</p>
          <div className="flex items-center gap-2 rounded-[var(--ppp-radius-sm)] border border-border bg-surface-2/60 py-1 pl-3 pr-1">
            <code
              data-testid="patient-link"
              className="min-w-0 flex-1 truncate font-mono text-xs text-ink"
              title={link}
            >
              {link}
            </code>
            <button
              type="button"
              data-testid="copy-link"
              onClick={onCopy}
              className={cx(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
                copy === "copied" ? "bg-status-paid/15 text-status-paid" : "bg-surface text-ink hover:bg-surface-2",
              )}
            >
              {copy === "copied" ? <Icon.Check width={14} height={14} /> : <Icon.Copy width={14} height={14} />}
              {copy === "copied" ? t("copied") : copy === "failed" ? t("copyFailed") : t("copy")}
            </button>
          </div>
          <a
            href={path}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 self-start text-sm font-medium text-primary-strong hover:underline"
          >
            {t("openPatient")}
            <Icon.External width={14} height={14} />
          </a>
        </div>
      </div>
    </div>
  );
}
