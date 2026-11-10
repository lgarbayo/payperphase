/**
 * OWNED BY WP-03. Synthetic stand-in for the hero presupuesto, rendered from GOLDEN_RAW_EXTRACTION, so the
 * Claude PDF spike can run before WP-02's real sample PDF exists. Not used at runtime.
 */
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { GOLDEN_RAW_EXTRACTION } from "@/contracts/fixtures/implantCase";

export async function renderSyntheticHeroPdf(): Promise<Uint8Array> {
  const raw = GOLDEN_RAW_EXTRACTION;
  const doc = await PDFDocument.create();
  doc.setTitle(`Presupuesto ${raw.quoteRef} (ficticio)`);
  doc.setCreator("PayPerPhase WP-03 spike");
  doc.setProducer("pdf-lib");
  // Fixed dates so the bytes (and the sha256) are reproducible.
  doc.setCreationDate(new Date(Date.UTC(2026, 10, 12)));
  doc.setModificationDate(new Date(Date.UTC(2026, 10, 12)));
  const page = doc.addPage([595.28, 841.89]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(0.12, 0.14, 0.18);
  const muted = rgb(0.42, 0.45, 0.5);
  const text = (s: string, x: number, y: number, size = 9.5, f = font, color = ink) =>
    page.drawText(s, { x, y, size, font: f, color });
  const right = (s: string, xRight: number, y: number, size = 9.5, f = font) =>
    text(s, xRight - f.widthOfTextAtSize(s, size), y, size, f);

  let y = 790;
  text(raw.clinicName, 48, y, 18, bold);
  text("C/ de la Reina 14, 46011 Valencia · Tel. 960 000 000 (ficticio)", 48, (y -= 18), 9, font, muted);
  text("PRESUPUESTO", 400, 790, 14, bold);
  text(`Nº ${raw.quoteRef}`, 400, 772, 10);
  text(`Fecha: ${raw.quoteDateText}`, 400, 758, 10);

  y = 715;
  text(`Paciente: ${raw.patientName}`, 48, y, 10);
  text(`Odontóloga responsable: ${raw.dentistName}`, 48, (y -= 15), 10);

  y -= 30;
  const cols = { n: 48, desc: 72, qty: 380, unit: 470, total: 547 };
  page.drawRectangle({ x: 44, y: y - 6, width: 507, height: 20, color: rgb(0.93, 0.95, 0.97) });
  text("Nº", cols.n, y, 9, bold);
  text("Tratamiento", cols.desc, y, 9, bold);
  right("Cant.", cols.qty + 20, y, 9, bold);
  right("Precio unit.", cols.unit + 10, y, 9, bold);
  right("Importe", cols.total, y, 9, bold);
  y -= 22;
  for (const l of raw.lines) {
    text(String(l.lineNo), cols.n, y);
    text(l.description, cols.desc, y);
    right(l.quantityText, cols.qty + 20, y);
    right(l.unitPriceText, cols.unit + 10, y);
    right(l.lineTotalText, cols.total, y);
    page.drawLine({ start: { x: 44, y: y - 6 }, end: { x: 551, y: y - 6 }, thickness: 0.4, color: rgb(0.85, 0.87, 0.9) });
    y -= 20;
  }
  y -= 10;
  right("TOTAL PRESUPUESTO", cols.unit + 10, y, 11, bold);
  right(raw.printedTotalText, cols.total, y, 11, bold);
  y -= 16;
  right("Tratamientos sanitarios exentos de IVA (art. 20 LIVA)", cols.total, y, 8, font);

  text("Validez del presupuesto: 3 meses. Documento ficticio generado para la demo de PayPerPhase.", 48, 70, 8, font, muted);
  text("Paciente y clínica ficticias; cualquier parecido con la realidad es casual.", 48, 58, 8, font, muted);
  return doc.save();
}
