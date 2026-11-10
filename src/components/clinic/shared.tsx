"use client";
/**
 * OWNED BY WP-07. Small shared pieces for the clinic console: label maps, category colours,
 * inline icons and the numbered section header. Display helpers only: no money or date arithmetic.
 */
import type { ReactNode, SVGProps } from "react";
import type {
  CaseKind,
  FitBand,
  InvoiceStatus,
  LineIssue,
  PlanStatus,
  ProcedureCategory,
} from "@/contracts";
import { useT, type KeyOf } from "@/i18n";
import { cx } from "@/lib/ui";

export type ClinicT = ReturnType<typeof useT<"clinic">>;
export type ClinicKey = KeyOf<"clinic">;

export const MAX_PDF_BYTES = 10 * 1024 * 1024;

export const FIT_LABEL: Record<FitBand, ClinicKey> = {
  PAY_IN_3: "fitPayIn3",
  INSTALLMENTS: "fitInstallments",
  PAYPAL_ONLY: "fitPaypalOnly",
};

export const FIT_TONE: Record<FitBand, "primary" | "upcoming" | "neutral"> = {
  PAY_IN_3: "primary",
  INSTALLMENTS: "upcoming",
  PAYPAL_ONLY: "neutral",
};

export const ISSUE_LABEL: Record<LineIssue, ClinicKey> = {
  INVALID_TOOTH: "issueInvalidTooth",
  LOW_CONFIDENCE: "issueLowConfidence",
  QTY_PRICE_MISMATCH: "issueQtyPriceMismatch",
  UNPARSEABLE_MONEY: "issueUnparseableMoney",
  UNKNOWN_PROCEDURE: "issueUnknownProcedure",
};

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, ClinicKey> = {
  DRAFT: "invDraft",
  SENT: "invSent",
  SCHEDULED: "invScheduled",
  UNPAID: "invUnpaid",
  PARTIALLY_PAID: "invPartiallyPaid",
  PAID: "invPaid",
  MARKED_AS_PAID: "invPaid",
  CANCELLED: "invCancelled",
};

export const CASE_LABEL: Record<CaseKind, ClinicKey> = {
  implant: "caseImplant",
  aligner: "caseAligner",
  perio: "casePerio",
};

export const PLAN_STATUS_LABEL: Record<PlanStatus, ClinicKey> = {
  draft: "statusDraft",
  approved: "statusApproved",
  completed: "statusCompleted",
  cancelled: "statusCancelled",
};

/** Procedure category → the scaffold's `--ppp-cat-*` token. */
export function categoryColor(category: ProcedureCategory): string {
  return `var(--ppp-cat-${category.toLowerCase()})`;
}

/** "4 semanas" / "10 días": a span of days as text (display only). */
export function spanText(days: number, t: ClinicT): string {
  const abs = Math.abs(days);
  if (abs !== 0 && abs % 7 === 0) return abs === 7 ? t("weekOne") : t("weeksN", { n: abs / 7 });
  return abs === 1 ? t("dayOne") : t("daysN", { n: abs });
}

/** True when the viewer asked for reduced motion (always false outside a browser). */
export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/** Numbered step header used by every console section. */
export function StepHeader({
  n,
  title,
  hint,
  aside,
}: {
  n?: number;
  title: string;
  hint?: string;
  aside?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-start gap-3">
        {n !== undefined && (
          <span
            aria-hidden
            className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary-strong"
          >
            {n}
          </span>
        )}
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
          {hint && <p className="text-sm text-muted">{hint}</p>}
        </div>
      </div>
      {aside && <div className="flex flex-wrap items-center gap-2">{aside}</div>}
    </div>
  );
}

/** FDI tooth chip, tinted with its procedure category. `invalid` renders a struck red chip. */
export function ToothChip({
  tooth,
  category,
  invalid,
  title,
}: {
  tooth: number;
  category?: ProcedureCategory;
  invalid?: boolean;
  title?: string;
}) {
  return (
    <span
      title={title}
      data-tooth-chip={tooth}
      data-invalid-tooth={invalid ? tooth : undefined}
      className={cx(
        "inline-flex h-6 min-w-8 items-center justify-center rounded-md border px-1.5 font-mono text-xs font-medium tabular-nums",
        invalid
          ? "border-status-overdue/40 bg-status-overdue/10 text-status-overdue line-through"
          : "border-transparent text-ink",
      )}
      style={
        invalid || !category
          ? undefined
          : {
              backgroundColor: `color-mix(in srgb, ${categoryColor(category)} 14%, transparent)`,
              borderColor: `color-mix(in srgb, ${categoryColor(category)} 35%, transparent)`,
            }
      }
    >
      {tooth}
    </span>
  );
}

type IconProps = SVGProps<SVGSVGElement>;
const base = (p: IconProps) => ({
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  ...p,
});

export const Icon = {
  Upload: (p: IconProps) => (
    <svg {...base(p)}>
      <path d="M12 16V4M7 9l5-5 5 5" />
      <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
    </svg>
  ),
  File: (p: IconProps) => (
    <svg {...base(p)}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </svg>
  ),
  Check: (p: IconProps) => (
    <svg {...base(p)}>
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  ),
  X: (p: IconProps) => (
    <svg {...base(p)}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  Alert: (p: IconProps) => (
    <svg {...base(p)}>
      <path d="M12 9v4M12 17h.01" />
      <path d="M10.3 3.9L2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    </svg>
  ),
  Copy: (p: IconProps) => (
    <svg {...base(p)}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h8" />
    </svg>
  ),
  External: (p: IconProps) => (
    <svg {...base(p)}>
      <path d="M14 4h6v6M20 4l-9 9" />
      <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
    </svg>
  ),
  Plus: (p: IconProps) => (
    <svg {...base(p)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  Trash: (p: IconProps) => (
    <svg {...base(p)}>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
    </svg>
  ),
  Spark: (p: IconProps) => (
    <svg {...base(p)}>
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" />
    </svg>
  ),
  Arrow: (p: IconProps) => (
    <svg {...base(p)}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  ),
  Download: (p: IconProps) => (
    <svg {...base(p)}>
      <path d="M12 4v12M7 11l5 5 5-5M5 20h14" />
    </svg>
  ),
};

/** Small spinner for busy buttons. */
export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx("inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent", className)}
    />
  );
}
