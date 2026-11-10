/** OWNED BY WP-09. Random ids (crypto, not Math.random). */

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** `n` chars from [a-z0-9], unbiased (rejection sampling on bytes >= 252). */
export function randomAlnum(n: number): string {
  let out = "";
  const buf = new Uint8Array(n * 2);
  while (out.length < n) {
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b >= 252) continue; // 252 = 7 * 36: keeps the distribution uniform
      out += ALPHABET[b % 36];
      if (out.length === n) break;
    }
  }
  return out;
}

/**
 * "pln_" + 8 random [a-z0-9] (PlanIdSchema). The first 4 random chars become `plan4` in invoice
 * numbers (PPP-{plan4}-F{n}-v{k}), so a fresh id gives fresh PayPal invoice numbers.
 */
export function newPlanId(taken: (id: string) => boolean = () => false): string {
  for (;;) {
    const id = `pln_${randomAlnum(8)}`;
    if (!taken(id)) return id;
  }
}
