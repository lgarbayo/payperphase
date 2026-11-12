/**
 * Human-approval payload hashing: canonical JSON (sorted keys, no undefined) → sha256.
 * The stored PendingApproval.payload is executed verbatim after the Approve click, and the hash is
 * re-checked right before execution, so a payload changed after the request is refused.
 */
import { createHash } from "node:crypto";

/** Deterministic JSON: object keys sorted recursively, undefined members dropped (like JSON.stringify). */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((v) => (v === undefined ? null : sortDeep(v)));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[key];
      if (v !== undefined) out[key] = sortDeep(v);
    }
    return out;
  }
  return value;
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function payloadSha256(payload: unknown): string {
  return sha256Hex(canonicalJson(payload));
}

/** True when `payload` still hashes to the stored digest. */
export function payloadMatches(payload: unknown, expectedSha256: string): boolean {
  return payloadSha256(payload) === expectedSha256;
}
