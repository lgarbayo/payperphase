import { describe, expect, it, vi } from "vitest";
import { ExtractResponseSchema } from "@/contracts";
import { GOLDEN_EXTRACTION } from "@/contracts/fixtures/implantCase";
import { POST } from "../../app/api/extract/route";
import { store } from "@/server/store";

const { KNOWN_PDF, KNOWN_SHA } = vi.hoisted(() => {
  const bytes = new TextEncoder().encode("%PDF-1.7\n% hero stand-in for the route test\n%%EOF\n");
  const { createHash } = require("node:crypto") as typeof import("node:crypto");
  return { KNOWN_PDF: bytes, KNOWN_SHA: createHash("sha256").update(bytes).digest("hex") };
});
vi.mock("@data/seed", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@data/seed")>();
  return {
    ...actual,
    cachedExtractionBySha: (sha: string) => (sha === KNOWN_SHA ? actual.cachedExtractionBySampleId("implant-ribera") : null),
  };
});

const URL_ = "http://localhost/api/extract";
const jsonReq = (body: unknown) =>
  new Request(URL_, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
function fileReq(bytes: Uint8Array | null, name = "presupuesto.pdf", type = "application/pdf") {
  const form = new FormData();
  if (bytes) form.set("file", new File([new Uint8Array(bytes)], name, { type }));
  return new Request(URL_, { method: "POST", body: form });
}

// Tests run with FORCE_MOCKS=1 (tests/setup.ts): no live Claude call is possible here.
describe("POST /api/extract (mock mode)", () => {
  it("JSON { sampleId } → 200 cached golden extraction, stored", async () => {
    const res = await POST(jsonReq({ sampleId: "implant-ribera" }));
    expect(res.status).toBe(200);
    const body = ExtractResponseSchema.parse(await res.json());
    expect(body.extraction.source).toBe("cached");
    expect(body.extraction.lines).toEqual(GOLDEN_EXTRACTION.lines);
    expect(body.extraction.checks.sumMatches).toBe(true);
    const stored = await store.getExtraction(body.extraction.quoteId);
    expect(stored?.extractedAt).toBe(body.extraction.extractedAt);
  });

  it("multipart known PDF → 200 cached with that PDF's sha", async () => {
    const res = await POST(fileReq(KNOWN_PDF));
    expect(res.status).toBe(200);
    const body = ExtractResponseSchema.parse(await res.json());
    expect(body.extraction).toMatchObject({ source: "cached", pdfSha256: KNOWN_SHA });
  });

  it("multipart unknown PDF → 422 NO_LIVE_EXTRACTION", async () => {
    const res = await POST(fileReq(new TextEncoder().encode("%PDF-1.4\n% another clinic\n")));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error.code).toBe("NO_LIVE_EXTRACTION");
    expect(body.error.message).toMatch(/sample/i);
  });

  it("multipart non-PDF → 415 NOT_A_PDF", async () => {
    const res = await POST(fileReq(new TextEncoder().encode("GIF89a"), "photo.gif", "image/gif"));
    expect(res.status).toBe(415);
    expect((await res.json()).error.code).toBe("NOT_A_PDF");
  });

  it("multipart > 10 MB → 413 FILE_TOO_LARGE", async () => {
    const big = new Uint8Array(10 * 1024 * 1024 + 1);
    big.set(new TextEncoder().encode("%PDF-1.4"));
    const res = await POST(fileReq(big));
    expect(res.status).toBe(413);
    expect((await res.json()).error.code).toBe("FILE_TOO_LARGE");
  });

  it("multipart without a file → 422 VALIDATION", async () => {
    const res = await POST(fileReq(null));
    expect(res.status).toBe(422);
  });

  it("unknown sample → 404, bad JSON → 400/422, other content types → 415", async () => {
    expect((await POST(jsonReq({ sampleId: "nope" }))).status).toBe(404);
    expect((await POST(jsonReq({}))).status).toBe(422);
    const bad = new Request(URL_, { method: "POST", headers: { "content-type": "application/json" }, body: "{" });
    expect((await POST(bad)).status).toBe(400);
    const text = new Request(URL_, { method: "POST", headers: { "content-type": "text/plain" }, body: "hi" });
    expect((await POST(text)).status).toBe(415);
  });
});
