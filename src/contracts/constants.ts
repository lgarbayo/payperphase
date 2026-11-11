/**
 * Scaffold-owned shared constants. Only the integrator edits this file
 * (builders file a "Contract change request" in their WP).
 */
export const CURRENCY = "EUR" as const;

/** PayPal Pay in 3 (Spain) range. Copy may say "within Pay in 3 range", never "eligible". */
export const PAY_IN_3 = { minCents: 2_000, maxCents: 200_000 } as const;
/** PayPal Pay Later installments (6/12/24 months, Spain), approximate published range. */
export const INSTALLMENTS = { minCents: 12_000, maxCents: 500_000 } as const;

/** A phase payment turns "upcoming" (amber) this many days before its visit. Not payable yet. */
export const UPCOMING_WINDOW_DAYS = 14;
/** A due phase payment turns "overdue" this many days after its visit date. */
export const OVERDUE_GRACE_DAYS = 7;

/** Default first day of the simulated clock (a Monday). Always labelled "Simulated" in the UI. */
export const SIM_DEFAULT_START = "2026-11-16";

/** Illustrative linked consumer loan used by the clinic-closure stress test. */
export const LINKED_LOAN_ILLUSTRATIVE = { months: 24, aprBasisPoints: 0 } as const;

/** Official Spanish consumer guidance on financed dental treatment when a clinic closes. */
export const DSCA_SOURCE_URL =
  "https://www.dsca.gob.es/es/consumo/preguntas-frecuentes/tenia-tratamiento-dental-financiado-entidad-que-propuso-clinica-pero";

/** DSCA consumer advice page on dental clinics (carries «Recomendamos no pagar el importe total del tratamiento por adelantado.»). */
export const DSCA_ADVICE_URL = "https://www.dsca.gob.es/es/consumo/notas-informativas/bienes-y-servicios/clinicas-dentales";

/** Ministerio de Consumo press note, 17/11/2020: 101,481 affected people, 65% with a linked loan, right to stop paying instalments. */
export const MONCLOA_DENTIX_URL = "https://www.lamoncloa.gob.es/serviciosdeprensa/notasprensa/consumo/Paginas/2020/171120-dentix.aspx";

/** PayPal invoice_number max length. Our scheme: PPP-{plan4}-F{n}-v{k}. */
export const INVOICE_NUMBER_MAX = 25;

/** Alias that always resolves to the current hero demo plan (store.resolvePlanId). */
export const HERO_PLAN_ALIAS = "demo";

export const COMPLIANCE_COPY = {
  es: "Solo sandbox · pacientes sintéticos · los servicios médicos requieren aprobación previa de PayPal en producción",
  en: "Sandbox only · synthetic patients · medical services require PayPal pre-approval in production",
} as const;

export const TRUST_STRIP_COPY = {
  es: "Claude lee · El código decide importes y fechas · Tu dentista aprueba cada palabra",
  en: "Claude reads · Code decides money & dates · Your dentist approves every word",
} as const;

export const GDPR_COPY = {
  es: "Todos los pacientes son ficticios. No se procesan datos de salud reales.",
  en: "All patients are synthetic. No real health data is processed.",
} as const;
