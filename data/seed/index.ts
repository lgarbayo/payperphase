/**
 * Seed data entry point: the stable names the extraction fallback, the sample picker
 * and the store seed import. Implementation lives in cases.ts, samples.ts and the per-case modules.
 */
export { seedCases, cachedExtractionBySampleId, cachedExtractionBySha, SEED_NOW, type SeedCase } from "./cases";
export { SAMPLE_PDFS, sampleFileName, type SamplePdf } from "./samples";
export { NOTE_LIBRARY, getNote } from "./notes";
