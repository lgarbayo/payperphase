/**
 * Strips secrets and full tokens from step input/output before they are stored,
 * streamed or shown, and bounds their size. QR images (data URLs under `qrDataUrl`) are kept.
 */
const SECRET_KEY_RE = /secret|token|authorization|password|passwd|api[-_]?key|client[-_]?id|cookie|signature/i;
/** PayPal access tokens (A21AA…), bearer headers, Anthropic keys. */
const SECRET_VALUE_RE = /(Bearer\s+[A-Za-z0-9._~+/=-]{8,})|(A21AA[A-Za-z0-9._-]{16,})|(sk-ant-[A-Za-z0-9_-]{8,})/g;
const KEEP_LONG_KEYS = new Set(["qrDataUrl"]);
const MAX_STRING = 2_000;
const MAX_DEPTH = 8;
const MAX_ARRAY = 50;

export const REDACTED = "[redacted]";

export function redact(value: unknown, depth = 0, key?: string): unknown {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "string") {
    const clean = value.replace(SECRET_VALUE_RE, REDACTED);
    if (key && KEEP_LONG_KEYS.has(key)) return clean;
    return clean.length > MAX_STRING ? `${clean.slice(0, MAX_STRING)}… (${clean.length} chars)` : clean;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object") return String(value);
  if (depth >= MAX_DEPTH) return "[…]";
  if (value instanceof Error) return { error: value.message.replace(SECRET_VALUE_RE, REDACTED).slice(0, 300) };
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ARRAY).map((v) => redact(v, depth + 1));
    if (value.length > MAX_ARRAY) items.push(`… ${value.length - MAX_ARRAY} more`);
    return items;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === undefined) continue;
    out[k] = SECRET_KEY_RE.test(k) ? REDACTED : redact(v, depth + 1, k);
  }
  return out;
}
