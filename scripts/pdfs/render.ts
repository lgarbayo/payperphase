/**
 * Renders the synthetic Spanish clinic quotes (presupuestos) with pdf-lib.
 * Pure and deterministic: no clock, no randomness, no I/O. Same input → byte-identical output, so the
 * sha256 of each PDF is stable and can key the cached extraction fallback.
 */
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import type { RawExtraction } from "@/contracts";
import { GOLDEN_RAW_EXTRACTION } from "@/contracts/fixtures/implantCase";
import { ALIGNER_RAW_EXTRACTION } from "@data/seed/alignerCase";
import { PERIO_RAW_EXTRACTION } from "@data/seed/perioCase";

export interface QuoteDocument {
  /** Sample id (= SeedCase.key) and output file name under public/samples/. */
  id: string;
  fileName: string;
  /** What the PDF prints, verbatim. */
  raw: RawExtraction;
  /** Printed as the signature line: "<dentist> · Nº colegiado ficticio". */
  specialty: string;
}

export const QUOTE_DOCUMENTS: QuoteDocument[] = [
  { id: "implant-ribera", fileName: "presupuesto-implantes-ribera.pdf", raw: GOLDEN_RAW_EXTRACTION, specialty: "Implantología y prótesis" },
  { id: "aligner-ribera", fileName: "presupuesto-ortodoncia-ribera.pdf", raw: ALIGNER_RAW_EXTRACTION, specialty: "Ortodoncia invisible" },
  { id: "perio-ribera", fileName: "presupuesto-perio-implantes.pdf", raw: PERIO_RAW_EXTRACTION, specialty: "Periodoncia e implantología" },
];

const CLINIC = {
  address: "C/ de Colón, 38 bajo · 46004 Valencia",
  nif: "NIF B-00000000 (ficticio)",
  phone: "Tel. 960 000 000 (ficticio)",
  email: "info@clinica-ribera.example",
  registry: "Centro sanitario Nº CS-0000 (ficticio)",
};

// A4, points.
const W = 595.28;
const H = 841.89;
const MX = 44;
const R = W - MX;

const ACCENT = rgb(0.043, 0.38, 0.42);
const ACCENT_SOFT = rgb(0.9, 0.95, 0.95);
const INK = rgb(0.11, 0.13, 0.16);
const MUTED = rgb(0.42, 0.46, 0.5);
const HAIR = rgb(0.84, 0.87, 0.89);
const ZEBRA = rgb(0.975, 0.98, 0.985);
const WHITE = rgb(1, 1, 1);

interface Ctx {
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
}

function textAt(c: Ctx, s: string, x: number, y: number, o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb> } = {}) {
  c.page.drawText(s, { x, y, size: o.size ?? 9, font: o.bold ? c.bold : c.font, color: o.color ?? INK });
}
function textRight(c: Ctx, s: string, xRight: number, y: number, o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb> } = {}) {
  const f = o.bold ? c.bold : c.font;
  textAt(c, s, xRight - f.widthOfTextAtSize(s, o.size ?? 9), y, o);
}
function textCenter(c: Ctx, s: string, xCenter: number, y: number, o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb> } = {}) {
  const f = o.bold ? c.bold : c.font;
  textAt(c, s, xCenter - f.widthOfTextAtSize(s, o.size ?? 9) / 2, y, o);
}
const hline = (c: Ctx, y: number, x1 = MX, x2 = R, color = HAIR, thickness = 0.6) =>
  c.page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness, color });

function letterhead(c: Ctx, specialty: string) {
  c.page.drawRectangle({ x: 0, y: H - 7, width: W, height: 7, color: ACCENT });
  // Abstract monogram (no real logo): accent disc with a white "R" and a small tooth-like arch.
  c.page.drawCircle({ x: MX + 20, y: H - 54, size: 20, color: ACCENT });
  textCenter(c, "R", MX + 20, H - 61, { size: 21, bold: true, color: WHITE });
  textAt(c, "Clínica Dental Ribera", MX + 52, H - 52, { size: 19, bold: true, color: ACCENT });
  textAt(c, specialty.toUpperCase(), MX + 52, H - 67, { size: 7.5, color: MUTED });
  const rx = R;
  textRight(c, CLINIC.address, rx, H - 44, { size: 8.5, color: MUTED });
  textRight(c, `${CLINIC.nif} · ${CLINIC.phone}`, rx, H - 56, { size: 8.5, color: MUTED });
  textRight(c, `${CLINIC.email} · ${CLINIC.registry}`, rx, H - 68, { size: 8.5, color: MUTED });
  hline(c, H - 84, MX, R, ACCENT, 1.2);
}

function titleBlock(c: Ctx, raw: RawExtraction, y: number) {
  textAt(c, `Presupuesto ${raw.quoteRef}`, MX, y, { size: 17, bold: true });
  textRight(c, `Fecha: ${raw.quoteDateText}`, R, y + 1, { size: 10.5, bold: true });
  textRight(c, "Validez del presupuesto: 3 meses", R, y - 13, { size: 8.5, color: MUTED });
}

function patientBlock(c: Ctx, raw: RawExtraction, specialty: string, yTop: number): number {
  const h = 52;
  c.page.drawRectangle({ x: MX, y: yTop - h, width: R - MX, height: h, color: ACCENT_SOFT });
  c.page.drawRectangle({ x: MX, y: yTop - h, width: 3, height: h, color: ACCENT });
  textAt(c, "PACIENTE", MX + 14, yTop - 15, { size: 7.5, bold: true, color: ACCENT });
  textAt(c, raw.patientName, MX + 14, yTop - 30, { size: 11, bold: true });
  textAt(c, "Datos de contacto en la historia clínica (ficticia)", MX + 14, yTop - 43, { size: 8, color: MUTED });
  const mid = MX + (R - MX) * 0.6;
  textAt(c, "PROFESIONAL RESPONSABLE", mid, yTop - 15, { size: 7.5, bold: true, color: ACCENT });
  textAt(c, raw.dentistName, mid, yTop - 30, { size: 11, bold: true });
  textAt(c, specialty, mid, yTop - 43, { size: 8, color: MUTED });
  return yTop - h;
}

const COLS = {
  n: MX + 8,
  desc: MX + 32,
  teethRight: 372,
  qtyRight: 410,
  unitRight: 484,
  totalRight: R - 8,
};

function lineTable(c: Ctx, raw: RawExtraction, yTop: number): number {
  const headH = 22;
  const rowH = 22;
  c.page.drawRectangle({ x: MX, y: yTop - headH, width: R - MX, height: headH, color: ACCENT });
  const hy = yTop - 14.5;
  const head = { size: 8, bold: true, color: WHITE };
  textAt(c, "Nº", COLS.n, hy, head);
  textAt(c, "Descripción", COLS.desc, hy, head);
  textRight(c, "Pieza(s) FDI", COLS.teethRight, hy, head);
  textRight(c, "Cant.", COLS.qtyRight, hy, head);
  textRight(c, "Precio unit.", COLS.unitRight, hy, head);
  textRight(c, "Importe", COLS.totalRight, hy, head);
  let y = yTop - headH;
  raw.lines.forEach((l, i) => {
    if (i % 2 === 1) c.page.drawRectangle({ x: MX, y: y - rowH, width: R - MX, height: rowH, color: ZEBRA });
    const ty = y - 14.5;
    textAt(c, String(l.lineNo), COLS.n, ty, { color: MUTED });
    textAt(c, l.description, COLS.desc, ty, { size: 8.8 });
    textRight(c, l.teeth.length ? l.teeth.join(", ") : "—", COLS.teethRight, ty, { color: l.teeth.length ? INK : MUTED });
    textRight(c, l.quantityText, COLS.qtyRight, ty);
    textRight(c, l.unitPriceText, COLS.unitRight, ty);
    textRight(c, l.lineTotalText, COLS.totalRight, ty, { bold: true });
    y -= rowH;
    hline(c, y, MX, R, HAIR, 0.5);
  });
  return y;
}

function totals(c: Ctx, raw: RawExtraction, yTop: number): number {
  const w = 230;
  const x = R - w;
  const h = 40;
  c.page.drawRectangle({ x, y: yTop - h, width: w, height: h, color: ACCENT });
  textAt(c, "TOTAL", x + 14, yTop - 25, { size: 11, bold: true, color: WHITE });
  textRight(c, raw.printedTotalText, R - 14, yTop - 26, { size: 16, bold: true, color: WHITE });
  textRight(c, "Exento de IVA (art. 20.Uno.3º LIVA)", R, yTop - h - 13, { size: 8.5, color: MUTED });
  textAt(c, "Servicios sanitarios prestados por profesional colegiado.", MX, yTop - h - 13, { size: 8.5, color: MUTED });
  return yTop - h - 18;
}

function conditions(c: Ctx, yTop: number): number {
  textAt(c, "CONDICIONES", MX, yTop, { size: 7.5, bold: true, color: ACCENT });
  const items = [
    "El presupuesto se basa en la exploración y las pruebas realizadas; el plan clínico puede ajustarse si cambia el diagnóstico.",
    "Las fases y su calendario se acordarán con la clínica. Los importes no incluyen tratamientos no indicados en este documento.",
    "Para aceptar este presupuesto, firme y devuelva una copia a la clínica.",
  ];
  let y = yTop - 13;
  for (const t of items) {
    textAt(c, "•", MX + 2, y, { size: 8.5, color: ACCENT });
    textAt(c, t, MX + 14, y, { size: 8.5, color: MUTED });
    y -= 12.5;
  }
  return y;
}

function signatures(c: Ctx, raw: RawExtraction, yTop: number) {
  const boxW = 215;
  const h = 78;
  const y0 = yTop - h;
  // Patient acceptance (left).
  c.page.drawRectangle({ x: MX, y: y0, width: boxW, height: h, borderColor: HAIR, borderWidth: 0.8 });
  textAt(c, "ACEPTACIÓN DEL PACIENTE", MX + 10, yTop - 14, { size: 7.5, bold: true, color: ACCENT });
  hline(c, y0 + 22, MX + 10, MX + boxW - 10, MUTED, 0.6);
  textAt(c, "Firma y fecha", MX + 10, y0 + 11, { size: 7.5, color: MUTED });
  // Clinician (right) with a hand-drawn-looking scribble, never a real signature.
  const rx = R - boxW;
  c.page.drawRectangle({ x: rx, y: y0, width: boxW, height: h, borderColor: HAIR, borderWidth: 0.8 });
  textAt(c, "FIRMA DE LA CLÍNICA", rx + 10, yTop - 14, { size: 7.5, bold: true, color: ACCENT });
  c.page.drawSvgPath("M 0 0 C 8 -22, 18 12, 28 -6 S 46 -20, 54 -4 S 74 10, 86 -12 S 104 -6, 118 -10", {
    x: rx + 22,
    y: y0 + 42,
    borderColor: rgb(0.1, 0.2, 0.45),
    borderWidth: 1.1,
  });
  hline(c, y0 + 22, rx + 10, rx + boxW - 10, MUTED, 0.6);
  textAt(c, `${raw.dentistName} · Nº colegiado ficticio`, rx + 10, y0 + 11, { size: 8, bold: true });
}

function footer(c: Ctx) {
  hline(c, 52, MX, R, HAIR, 0.6);
  textCenter(c, "Documento ficticio generado para una demostración · datos sintéticos", W / 2, 38, { size: 8, color: MUTED });
  textCenter(c, "Clínica, paciente, NIF, teléfono y número de colegiado inventados; cualquier parecido con la realidad es casual.", W / 2, 27, {
    size: 7,
    color: MUTED,
  });
  c.page.drawRectangle({ x: 0, y: 0, width: W, height: 6, color: ACCENT });
}

export async function renderQuotePdf(doc: QuoteDocument): Promise<Uint8Array> {
  const { raw } = doc;
  const pdf = await PDFDocument.create({ updateMetadata: false });
  // Fixed metadata so the bytes (and the sha256) are reproducible.
  const fixed = new Date(Date.UTC(2026, 10, 12, 9, 0, 0));
  pdf.setTitle(`Presupuesto ${raw.quoteRef} · ${raw.clinicName} (ficticio)`);
  pdf.setAuthor(`${raw.clinicName} (ficticia)`);
  pdf.setSubject("Presupuesto dental sintético para una demostración");
  pdf.setKeywords(["presupuesto", "ficticio", "sintético", "PayPerPhase"]);
  pdf.setCreator("PayPerPhase scripts/pdfs");
  pdf.setProducer("pdf-lib");
  pdf.setCreationDate(fixed);
  pdf.setModificationDate(fixed);
  const page = pdf.addPage([W, H]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const c: Ctx = { page, font, bold };

  letterhead(c, doc.specialty);
  titleBlock(c, raw, H - 112);
  let y = patientBlock(c, raw, doc.specialty, H - 134);
  y = lineTable(c, raw, y - 18);
  y = totals(c, raw, y - 16);
  y = conditions(c, y - 18);
  signatures(c, raw, Math.min(y - 14, 190));
  footer(c);
  return pdf.save();
}
