/**
 * Scaffold-owned. Money is ALWAYS integer EUR cents in this codebase.
 * Only src/engine produces amounts; everything else formats or transports them.
 * Spanish printed-money parsing ("1.250,00 €") belongs to WP-03 (src/ai/extract).
 */
export type Cents = number;

export function isCents(value: unknown): value is Cents {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function assertCents(value: number, label = "amount"): Cents {
  if (!isCents(value)) throw new Error(`${label} must be a non-negative integer number of cents, got ${value}`);
  return value;
}

export function sumCents(values: readonly Cents[]): Cents {
  return values.reduce((a, b) => a + b, 0);
}

/** "1.500,00 €" (es) or "€1,500.00" (en). Pass {whole:true} to drop ",00" on round amounts. */
export function formatCents(cents: Cents, locale: "es" | "en", opts?: { whole?: boolean }): string {
  const whole = opts?.whole && cents % 100 === 0;
  return new Intl.NumberFormat(locale === "es" ? "es-ES" : "en-GB", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
    useGrouping: true,
  }).format(cents / 100);
}

/** PayPal REST `amount.value` string: 150000 -> "1500.00". */
export function centsToPayPalValue(cents: Cents): string {
  assertCents(cents);
  const euros = Math.floor(cents / 100);
  const rest = String(cents % 100).padStart(2, "0");
  return `${euros}.${rest}`;
}

/** Inverse of centsToPayPalValue: "1500.00" -> 150000. Throws on anything else. */
export function payPalValueToCents(value: string): Cents {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!m) throw new Error(`Not a PayPal amount value: ${value}`);
  const frac = (m[2] ?? "").padEnd(2, "0");
  return Number(m[1]) * 100 + Number(frac);
}
