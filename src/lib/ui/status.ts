import type { PaymentStatus } from "@/contracts/plan";

/** Shared payment-status palette (CSS variable names) for Gantt bars, pills and the ledger. */
export const STATUS_COLOR_VAR: Record<PaymentStatus, string> = {
  scheduled: "var(--ppp-status-scheduled)",
  upcoming: "var(--ppp-status-upcoming)",
  due: "var(--ppp-status-due)",
  processing: "var(--ppp-status-processing)",
  paid: "var(--ppp-status-paid)",
  overdue: "var(--ppp-status-overdue)",
};

export const STATUS_LABEL: Record<PaymentStatus, { es: string; en: string }> = {
  scheduled: { es: "Programado", en: "Scheduled" },
  upcoming: { es: "Próximo", en: "Upcoming" },
  due: { es: "A pagar hoy", en: "Due" },
  processing: { es: "Procesando", en: "Processing" },
  paid: { es: "Pagado", en: "Paid" },
  overdue: { es: "Vencido", en: "Overdue" },
};
