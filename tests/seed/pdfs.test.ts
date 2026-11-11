import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PDFArray, PDFDocument, PDFName, decodePDFRawStream, type PDFRawStream } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { GOLDEN_RAW_EXTRACTION } from "@/contracts/fixtures/implantCase";
import { SAMPLE_PDFS, sampleFileName } from "@data/seed";
import { QUOTE_DOCUMENTS, renderQuotePdf } from "../../scripts/pdfs/render";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const samplesDir = path.join(process.cwd(), "public/samples");

describe("synthetic presupuesto PDFs", () => {
  it("has one document per sample entry, with matching ids and file names", () => {
    expect(QUOTE_DOCUMENTS.map((d) => d.id).sort()).toEqual(SAMPLE_PDFS.map((s) => s.id).sort());
    for (const s of SAMPLE_PDFS) {
      expect(QUOTE_DOCUMENTS.find((d) => d.id === s.id)?.fileName).toBe(sampleFileName(s));
    }
  });

  for (const doc of QUOTE_DOCUMENTS) {
    describe(doc.fileName, () => {
      it("renders byte-identical files when generated twice", async () => {
        const a = await renderQuotePdf(doc);
        const b = await renderQuotePdf(doc);
        expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
        expect(Buffer.from(a).subarray(0, 5).toString("latin1")).toBe("%PDF-");
      });

      it("is committed under public/samples/ and equals a fresh render (so `npm run pdfs` is a no-op)", async () => {
        const file = path.join(samplesDir, doc.fileName);
        expect(existsSync(file)).toBe(true);
        const fresh = await renderQuotePdf(doc);
        expect(sha(readFileSync(file))).toBe(sha(fresh));
      });

      it("has its real sha256 in SAMPLE_PDFS", () => {
        const sample = SAMPLE_PDFS.find((s) => s.id === doc.id)!;
        expect(sample.sha256).toMatch(/^[0-9a-f]{64}$/);
        expect(sha(readFileSync(path.join(samplesDir, doc.fileName)))).toBe(sample.sha256);
      });
    });
  }

  it("uses distinct bytes per sample (the sha256 is a unique cache key)", () => {
    expect(new Set(SAMPLE_PDFS.map((s) => s.sha256)).size).toBe(SAMPLE_PDFS.length);
  });

  it("the hero PDF is a single A4 page with fixed metadata and no random ID", async () => {
    const hero = QUOTE_DOCUMENTS.find((d) => d.id === "implant-ribera")!;
    const { PDFDocument } = await import("pdf-lib");
    const pdf = await PDFDocument.load(await renderQuotePdf(hero), { updateMetadata: false });
    expect(pdf.getPageCount()).toBe(1);
    const { width, height } = pdf.getPage(0).getSize();
    expect([Math.round(width), Math.round(height)]).toEqual([595, 842]);
    expect(pdf.getCreationDate()?.toISOString()).toBe("2026-11-12T09:00:00.000Z");
    expect(pdf.getModificationDate()?.toISOString()).toBe("2026-11-12T09:00:00.000Z");
    expect(pdf.getProducer()).toBe("pdf-lib");
    const raw = Buffer.from(await renderQuotePdf(hero)).toString("latin1");
    expect(raw).not.toMatch(/\/ID\s*\[/);
  });

  it("the hero PDF prints every golden line, the totals, the IVA line, the signature and the synthetic footer", async () => {
    const hero = QUOTE_DOCUMENTS.find((d) => d.id === "implant-ribera")!;
    expect(hero.raw).toBe(GOLDEN_RAW_EXTRACTION);
    const printed = await printedStrings(await renderQuotePdf(hero));
    const raw = GOLDEN_RAW_EXTRACTION;
    for (const s of [
      "Clínica Dental Ribera",
      `Presupuesto ${raw.quoteRef}`,
      "Presupuesto PRES-2026-0142",
      "Fecha: 12/11/2026",
      raw.patientName,
      "María García (paciente ficticia)",
      "Nº",
      "Descripción",
      "Pieza(s) FDI",
      "Cant.",
      "Precio unit.",
      "Importe",
      "TOTAL",
      "4.070,00 €",
      "Exento de IVA (art. 20.Uno.3º LIVA)",
      "Dra. Lucía Ruiz · Nº colegiado ficticio",
      "Documento ficticio generado para una demostración · datos sintéticos",
    ]) {
      expect(printed, s).toContain(s);
    }
    expect(printed.some((s) => /^NIF /.test(s) || s.includes("NIF "))).toBe(true);
    for (const l of raw.lines) {
      for (const s of [String(l.lineNo), l.description, l.quantityText, l.unitPriceText, l.lineTotalText]) expect(printed, s).toContain(s);
      if (l.teeth.length) expect(printed).toContain(l.teeth.join(", "));
    }
    // The printed line totals add up to the printed total (what the extraction check bar verifies).
    expect(sumEuros(raw.lines.map((l) => l.lineTotalText))).toBe(sumEuros([raw.printedTotalText]));
  });

  it("the other samples print their own quote lines and totals", async () => {
    for (const doc of QUOTE_DOCUMENTS) {
      const printed = await printedStrings(await renderQuotePdf(doc));
      expect(printed).toContain(doc.raw.printedTotalText);
      expect(printed).toContain(`Presupuesto ${doc.raw.quoteRef}`);
      expect(printed).toContain("Exento de IVA (art. 20.Uno.3º LIVA)");
      expect(printed).toContain(`${doc.raw.dentistName} · Nº colegiado ficticio`);
      expect(printed.some((s) => s.includes("datos sintéticos"))).toBe(true);
      for (const l of doc.raw.lines) expect(printed).toContain(l.description);
    }
  });
});

/** Every string drawn on page 1, decoded from the (WinAnsi, hex-encoded) content stream. */
async function printedStrings(bytes: Uint8Array): Promise<string[]> {
  const pdf = await PDFDocument.load(bytes, { updateMetadata: false });
  const page = pdf.getPage(0);
  const contents = pdf.context.lookup(page.node.get(PDFName.of("Contents")));
  const refs = contents instanceof PDFArray ? contents.asArray() : [page.node.get(PDFName.of("Contents"))];
  const WIN1252: Record<number, string> = { 0x80: "€", 0x95: "•", 0x97: "—" };
  const out: string[] = [];
  for (const ref of refs) {
    const stream = pdf.context.lookup(ref);
    const text = Buffer.from(decodePDFRawStream(stream as PDFRawStream).decode()).toString("latin1");
    for (const m of text.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
      const hex = m[1]!;
      let s = "";
      for (let i = 0; i < hex.length; i += 2) {
        const code = parseInt(hex.slice(i, i + 2), 16);
        s += WIN1252[code] ?? String.fromCharCode(code);
      }
      out.push(s);
    }
  }
  return out;
}

function sumEuros(texts: string[]): number {
  return texts.reduce((a, t) => a + Math.round(Number(t.replace(/[^\d,]/g, "").replace(",", ".")) * 100), 0);
}
