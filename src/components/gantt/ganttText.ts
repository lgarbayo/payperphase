/**
 * OWNED BY WP-05. Pure render helpers for the Gantt: grid cells (DomConfig objects, so text is set
 * as textContent) and tooltips (HTML strings, every interpolated value escaped).
 */
import type { ClinicalNote, Locale, NoteId } from "@/contracts";
import { STATUS_LABEL } from "@/lib/ui/status";
import { daysBetween } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { BAND_KEY, amountLabel, shortDate, tg, type GanttTaskMeta } from "./toBryntum";

/** Minimal DomConfig shape accepted by Bryntum renderers. */
export interface Dom {
  tag?: string;
  className?: string;
  text?: string;
  style?: string;
  dataset?: Record<string, string>;
  children?: Dom[];
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESC[c] ?? c);
}

/** Day + month only, for bar labels ("12 ene"). */
export function dayMonth(date: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(`${date}T00:00:00Z`))
    .replace(".", "");
}

// ── Grid cells ───────────────────────────────────────────────────────────────────────────────────

export function nameCell(m: GanttTaskMeta, locale: Locale): Dom {
  if (m.kind === "visit") {
    return {
      className: "ppp-cell ppp-cell-phase",
      dataset: { phase: m.phaseId },
      children: [
        { tag: "span", className: `ppp-n ppp-status-${m.status}`, text: String(m.n) },
        { tag: "span", className: "ppp-cell-title", text: m.title },
      ],
    };
  }
  if (m.kind === "payment") {
    return {
      className: "ppp-cell ppp-cell-sub",
      children: [
        { tag: "span", className: `ppp-diamond ppp-status-${m.status}` },
        { tag: "span", text: tg(locale, "paymentRow", { n: m.n }) },
      ],
    };
  }
  return {
    className: "ppp-cell ppp-cell-sub ppp-cell-healing",
    children: [
      { tag: "span", className: "ppp-hatch" },
      { tag: "span", className: "ppp-cell-title", text: m.noteTitle ?? tg(locale, "healingFallback") },
    ],
  };
}

export function amountCell(m: GanttTaskMeta, locale: Locale): Dom | string {
  if (m.kind === "visit") return { tag: "span", className: "ppp-amount", text: formatCents(m.amountCents, locale) };
  if (m.kind === "healing" && m.minLagDays !== undefined) {
    const weeks = m.minLagDays % 7 === 0;
    return {
      tag: "span",
      className: "ppp-cell-muted",
      text: weeks ? tg(locale, "healingRowMinWeeks", { weeks: m.minLagDays / 7 }) : tg(locale, "healingRowMinDays", { days: m.minLagDays }),
    };
  }
  return "";
}

export function statusCell(m: GanttTaskMeta, locale: Locale): Dom | string {
  if (m.kind !== "visit") return "";
  return {
    tag: "span",
    className: `ppp-pill ppp-status-${m.status}`,
    dataset: { status: m.status },
    children: [{ tag: "span", className: "ppp-dot" }, { tag: "span", text: STATUS_LABEL[m.status][locale] }],
  };
}

export function bandCell(m: GanttTaskMeta, locale: Locale): Dom | string {
  if (m.kind !== "visit") return "";
  return { tag: "span", className: `ppp-chip ppp-band-${m.band}`, text: tg(locale, BAND_KEY[m.band]) };
}

/** Label drawn after the bar: amount for the payment diamond, short date for the visit. */
export function afterLabel(m: GanttTaskMeta, locale: Locale): string {
  if (m.kind === "payment") {
    const amount = amountLabel(m.amountCents, locale);
    return m.status === "paid" ? tg(locale, "paymentLabelPaid", { amount }) : tg(locale, "paymentLabel", { amount });
  }
  if (m.kind === "visit") return dayMonth(m.startDate, locale);
  return "";
}

// ── Tooltips (HTML) ──────────────────────────────────────────────────────────────────────────────

const row = (text: string, cls = "") => `<div class="ppp-tip-row ${cls}">${escapeHtml(text)}</div>`;

function pill(m: GanttTaskMeta, locale: Locale) {
  return `<span class="ppp-pill ppp-status-${m.status}"><span class="ppp-dot"></span>${escapeHtml(STATUS_LABEL[m.status][locale])}</span>`;
}

export function tooltipHtml(
  m: GanttTaskMeta,
  locale: Locale,
  notes: Partial<Record<NoteId, ClinicalNote>>,
): string {
  const parts: string[] = [];
  if (m.kind === "visit") {
    parts.push(
      `<div class="ppp-tip-title"><span class="ppp-n ppp-status-${m.status}">${m.n}</span>${escapeHtml(m.title)}</div>`,
      row(tg(locale, "tipVisitDate", { date: shortDate(m.startDate, locale) })),
      `<div class="ppp-tip-row">${escapeHtml(tg(locale, "tipAmount", { amount: formatCents(m.amountCents, locale) }))} ${pill(m, locale)}</div>`,
    );
    if (m.baselineStart && m.baselineStart !== m.startDate)
      parts.push(row(tg(locale, "tipBaseline", { date: shortDate(m.baselineStart, locale) }), "ppp-tip-muted"));
    if (m.previewStart && m.previewStart !== m.startDate)
      parts.push(row(tg(locale, "tipPreview", { date: shortDate(m.previewStart, locale) }), "ppp-tip-muted"));
    if (m.deadlineDate) parts.push(row(tg(locale, "tipDeadline", { date: shortDate(m.deadlineDate, locale) })));
    if (m.deadlineExceededDays) {
      const note = m.deadlineNoteId ? notes[m.deadlineNoteId] : undefined;
      parts.push(
        `<div class="ppp-tip-warn">${escapeHtml(tg(locale, "tipDeadlineExceeded", { days: m.deadlineExceededDays }))}${
          note ? ` ${escapeHtml(note.text[locale])}` : ""
        }</div>`,
      );
    }
    const hint =
      m.lock === null
        ? tg(locale, "tipDragHint")
        : m.lock === "paid"
          ? tg(locale, "tipLockedPaid")
          : m.lock === "delivered"
            ? tg(locale, "tipLockedDelivered")
            : m.lock === "past"
              ? tg(locale, "tipLockedPast")
              : "";
    if (hint) parts.push(row(hint, "ppp-tip-hint"));
  } else if (m.kind === "payment") {
    parts.push(
      `<div class="ppp-tip-title"><span class="ppp-diamond ppp-status-${m.status}"></span>${escapeHtml(
        tg(locale, "paymentRow", { n: m.n }),
      )} · ${escapeHtml(formatCents(m.amountCents, locale))}</div>`,
      row(tg(locale, "tipPayOnVisit", { date: shortDate(m.dueDate, locale) })),
      `<div class="ppp-tip-row">${pill(m, locale)}</div>`,
    );
    if (m.baselineStart && m.baselineStart !== m.dueDate)
      parts.push(row(tg(locale, "tipBaseline", { date: shortDate(m.baselineStart, locale) }), "ppp-tip-muted"));
  } else {
    const note = m.noteId ? notes[m.noteId] : undefined;
    parts.push(`<div class="ppp-tip-title"><span class="ppp-hatch"></span>${escapeHtml(m.noteTitle ?? tg(locale, "healingFallback"))}</div>`);
    if (m.minLagDays !== undefined && m.minEndDate) {
      parts.push(
        row(
          m.minLagDays % 7 === 0
            ? tg(locale, "tipHealingMin", { weeks: m.minLagDays / 7, date: shortDate(m.minEndDate, locale) })
            : tg(locale, "tipHealingMinDays", { days: m.minLagDays, date: shortDate(m.minEndDate, locale) }),
        ),
      );
    }
    if (m.maxEndDate) parts.push(row(tg(locale, "tipHealingMax", { date: shortDate(m.maxEndDate, locale) }), m.exceeded ? "ppp-tip-warn" : ""));
    if (m.extraDays) parts.push(row(tg(locale, "tipHealingExtra", { days: m.extraDays }), "ppp-tip-muted"));
    if (note) parts.push(row(note.text[locale], "ppp-tip-note"));
  }
  return `<div class="ppp-tip">${parts.join("")}</div>`;
}

/** Compact drag tooltip: target date, signed shift, and the clinician note when the drop is illegal. */
export function dragTipHtml(
  m: GanttTaskMeta,
  newStart: string,
  locale: Locale,
  verdict: { valid: true } | { valid: false; message: string },
): string {
  const delta = daysBetween(m.startDate, newStart);
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "±";
  const abs = Math.abs(delta);
  const shift =
    abs > 0 && abs % 7 === 0 ? tg(locale, "tipDragDeltaWeeks", { weeks: abs / 7 }) : tg(locale, "tipDragDelta", { days: abs });
  const parts = [
    `<div class="ppp-tip-title"><span class="ppp-n ppp-status-${m.status}">${m.n}</span>${escapeHtml(m.title)}</div>`,
    `<div class="ppp-tip-row"><strong>${escapeHtml(tg(locale, "tipDragTo", { date: shortDate(newStart, locale) }))}</strong><span class="ppp-tip-delta">${sign}${escapeHtml(shift)}</span></div>`,
  ];
  if (!verdict.valid && verdict.message) parts.push(`<div class="ppp-tip-reject">${escapeHtml(verdict.message)}</div>`);
  return `<div class="ppp-tip ppp-drag-tip${verdict.valid ? "" : " ppp-drag-invalid"}">${parts.join("")}</div>`;
}

/** Dependency hover: phase → phase, the clinical minimum wait (the lag) and the planned wait. */
export function dependencyTipHtml(
  from: GanttTaskMeta,
  to: GanttTaskMeta,
  lagDays: number,
  noteTitle: string | undefined,
  locale: Locale,
): string {
  const actual = daysBetween(from.endDate, to.startDate);
  const min =
    lagDays % 7 === 0
      ? tg(locale, "depMinWeeks", { weeks: lagDays / 7, days: lagDays })
      : tg(locale, "depMinDays", { days: lagDays });
  return `<div class="ppp-tip"><div class="ppp-tip-title">${escapeHtml(tg(locale, "depTitle", { from: from.n, to: to.n }))}</div>${
    noteTitle ? row(noteTitle, "ppp-tip-muted") : ""
  }${row(min)}${row(tg(locale, "depActual", { days: actual }), "ppp-tip-muted")}</div>`;
}

