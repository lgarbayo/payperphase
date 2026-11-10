/**
 * OWNED BY WP-02. Seed data entry point: the stable names WP-03 (extraction fallback), WP-07 (samples)
 * and WP-09 (store seed) import. Implementation lives in cases.ts, samples.ts and the per-case modules.
 */
export { seedCases, cachedExtractionBySampleId, cachedExtractionBySha, SEED_NOW, type SeedCase } from "./cases";
export { SAMPLE_PDFS, sampleFileName, type SamplePdf } from "./samples";
export { NOTE_LIBRARY, getNote } from "./notes";
