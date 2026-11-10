/**
 * Scaffold-owned. Date-only ISO helpers ("YYYY-MM-DD"), always computed in UTC.
 *
 * Conventions used everywhere (engine, Gantt, store, agent):
 * - An IsoDate is a calendar day with no time and no timezone.
 * - Phase.startDate is inclusive; Phase.endDate is EXCLUSIVE (= startDate + durationDays),
 *   which is also Bryntum's convention. A 1-day visit on 2026-11-16 has endDate 2026-11-17.
 * - A dependency lag is measured from the predecessor's (exclusive) endDate to the
 *   successor's startDate: successor.startDate >= addDays(pred.endDate, minLagDays).
 * - Never use `new Date("2026-11-16")` arithmetic in local time; use these helpers.
 */
export type IsoDate = string;

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== "string") return false;
  const m = ISO_RE.exec(value);
  if (!m) return false;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return toIsoDate(ms) === value;
}

/** Milliseconds since epoch at 00:00 UTC of the given day. */
export function toUtcMs(date: IsoDate): number {
  const m = ISO_RE.exec(date);
  if (!m) throw new Error(`Invalid IsoDate: ${date}`);
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function toIsoDate(ms: number): IsoDate {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Date-only ISO for a JS Date, using its UTC calendar day. */
export function fromDate(d: Date): IsoDate {
  return toIsoDate(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** A JS Date at local midnight of the day. Use ONLY to hand dates to UI widgets (Bryntum). */
export function toLocalDate(date: IsoDate): Date {
  const ms = toUtcMs(date);
  const u = new Date(ms);
  return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate());
}

/** Inverse of toLocalDate: read the local calendar day of a UI Date. */
export function fromLocalDate(d: Date): IsoDate {
  return toIsoDate(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}

export function addDays(date: IsoDate, days: number): IsoDate {
  if (!Number.isInteger(days)) throw new Error(`addDays expects an integer, got ${days}`);
  return toIsoDate(toUtcMs(date) + days * DAY_MS);
}

export function addWeeks(date: IsoDate, weeks: number): IsoDate {
  return addDays(date, weeks * 7);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

export function compareIso(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function maxIso(...dates: IsoDate[]): IsoDate {
  if (dates.length === 0) throw new Error("maxIso needs at least one date");
  return dates.reduce((m, d) => (d > m ? d : m));
}

export function minIso(...dates: IsoDate[]): IsoDate {
  if (dates.length === 0) throw new Error("minIso needs at least one date");
  return dates.reduce((m, d) => (d < m ? d : m));
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: IsoDate): number {
  return new Date(toUtcMs(date)).getUTCDay();
}

export function isWeekend(date: IsoDate): boolean {
  const w = weekday(date);
  return w === 0 || w === 6;
}

/** The same day if it is Mon–Fri, otherwise the following Monday (clinics open Mon–Fri). */
export function nextClinicDay(date: IsoDate): IsoDate {
  const w = weekday(date);
  if (w === 6) return addDays(date, 2);
  if (w === 0) return addDays(date, 1);
  return date;
}

/** Display helper, e.g. "16 nov 2026" / "16 Nov 2026". Never use for arithmetic. */
export function formatIsoDate(date: IsoDate, locale: "es" | "en", opts?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
    ...opts,
  }).format(new Date(toUtcMs(date)));
}
