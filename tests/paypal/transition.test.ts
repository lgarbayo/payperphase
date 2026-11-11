import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { PaymentMilestone, PaymentStatus } from "@/contracts";
import { PaymentMilestoneSchema } from "@/contracts";
import { settlementRank, transition, type PaymentEvent } from "@/lib/paypal/transition";

const due = (over: Partial<PaymentMilestone> = {}): PaymentMilestone => ({
  dueDate: "2026-11-16",
  status: "due",
  orderAttempt: 0,
  ...over,
});

const completed = (captureId = "CAP-1", orderId = "O-1"): PaymentEvent => ({
  type: "CAPTURE_COMPLETED",
  orderId,
  captureId,
  amountCents: 36_000,
  paidAt: "2026-11-16T10:00:00Z",
});

function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object") {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return o;
}

describe("transition(): unit cases", () => {
  it("is pure: never mutates its input (frozen input works) and is deterministic", () => {
    const m = deepFreeze(due());
    const a = transition(m, completed());
    const b = transition(m, completed());
    expect(a).toEqual(b);
    expect(m.status).toBe("due");
  });

  it("CAPTURE_COMPLETED: due → paid with the order instrument", () => {
    const r = transition(due({ orderId: "O-1", orderAttempt: 1 }), completed());
    expect(r).toMatchObject({ changed: true, from: "due", to: "paid" });
    expect(r.milestone).toMatchObject({
      status: "paid",
      instrument: "order",
      orderId: "O-1",
      captureId: "CAP-1",
      paidCents: 36_000,
      paidAt: "2026-11-16T10:00:00Z",
    });
    expect(PaymentMilestoneSchema.safeParse(r.milestone).success).toBe(true);
  });

  it("paid never goes back and a replay is a DUPLICATE", () => {
    const paid = transition(due(), completed()).milestone;
    expect(transition(paid, completed())).toMatchObject({ changed: false, ignored: "DUPLICATE" });
    for (const e of [
      { type: "CAPTURE_PENDING", orderId: "O-1", captureId: "CAP-1" },
      { type: "CAPTURE_DENIED", orderId: "O-1", captureId: "CAP-1" },
      { type: "ORDER_CREATED", orderId: "O-9", attempt: 9 },
      completed("CAP-OTHER"),
    ] as PaymentEvent[]) {
      const r = transition(paid, e);
      expect(r.changed).toBe(false);
      expect(r.milestone).toBe(paid);
    }
  });

  it("out-of-order events are ignored: PENDING after paid, ORDER_CREATED for an older attempt", () => {
    const paid = transition(due(), completed()).milestone;
    expect(transition(paid, { type: "CAPTURE_PENDING", orderId: "O-1", captureId: "CAP-1" })).toMatchObject({
      changed: false,
      ignored: "OUT_OF_ORDER",
    });
    const m2 = due({ orderId: "O-2", orderAttempt: 2 });
    expect(transition(m2, { type: "ORDER_CREATED", orderId: "O-1", attempt: 1 })).toMatchObject({
      changed: false,
      ignored: "OUT_OF_ORDER",
    });
    expect(transition(m2, { type: "ORDER_CREATED", orderId: "O-2", attempt: 2 })).toMatchObject({
      changed: false,
      ignored: "DUPLICATE",
    });
  });

  it("PENDING → processing; COMPLETED then settles it", () => {
    const p = transition(due(), { type: "CAPTURE_PENDING", orderId: "O-1", captureId: "CAP-1" });
    expect(p).toMatchObject({ changed: true, from: "due", to: "processing" });
    expect(transition(p.milestone, completed())).toMatchObject({ changed: true, from: "processing", to: "paid" });
  });

  it("a DENIED pending capture returns the milestone to due; a DENIED for another capture is ignored", () => {
    const p = transition(due(), { type: "CAPTURE_PENDING", orderId: "O-1", captureId: "CAP-1" }).milestone;
    expect(transition(p, { type: "CAPTURE_DENIED", orderId: "O-1", captureId: "CAP-X" }).changed).toBe(false);
    const d = transition(p, { type: "CAPTURE_DENIED", orderId: "O-1", captureId: "CAP-1" });
    expect(d).toMatchObject({ changed: true, from: "processing", to: "due" });
    expect(d.milestone.captureId).toBeUndefined();
  });

  it("INVOICE_PAID settles with the invoice instrument and marks the phase invoice PAID", () => {
    const m = due({
      invoice: {
        invoiceId: "INV2-AAAA",
        invoiceNumber: "PPP-RIBE-F1-v1",
        version: 1,
        status: "SENT",
        amountCents: 36_000,
        recipientEmail: "paciente.demo@example.com",
        hasQr: true,
        updatedAt: "2026-11-16T08:00:00Z",
      },
    });
    const r = transition(m, {
      type: "INVOICE_PAID",
      invoiceId: "INV2-AAAA",
      amountCents: 36_000,
      paidAt: "2026-11-16T11:00:00Z",
      paymentId: "PAY-1",
    });
    expect(r.milestone).toMatchObject({ status: "paid", instrument: "invoice", paidCents: 36_000, captureId: "PAY-1" });
    expect(r.milestone.invoice?.status).toBe("PAID");
    // The agent recording the checkout payment on the same invoice is the same settlement.
    const paidByOrder = transition(m, completed()).milestone;
    expect(
      transition(paidByOrder, { type: "INVOICE_PAID", invoiceId: "INV2-AAAA", amountCents: 36_000, paidAt: "x" }),
    ).toMatchObject({ changed: false, ignored: "DUPLICATE" });
  });
});

// ---------------------------------------------------------------------------------------------
// Property test over random event sequences
// ---------------------------------------------------------------------------------------------
const orderIdArb = fc.constantFrom("O-1", "O-2", "O-3");
const captureIdArb = fc.constantFrom("CAP-1", "CAP-2", "CAP-3");
const eventArb: fc.Arbitrary<PaymentEvent> = fc.oneof(
  fc.record({ type: fc.constant("ORDER_CREATED" as const), orderId: orderIdArb, attempt: fc.integer({ min: 0, max: 5 }) }),
  fc.record({ type: fc.constant("CAPTURE_PENDING" as const), orderId: orderIdArb, captureId: captureIdArb }),
  fc.record({
    type: fc.constant("CAPTURE_COMPLETED" as const),
    orderId: orderIdArb,
    captureId: captureIdArb,
    amountCents: fc.constantFrom(36_000, 150_000),
    paidAt: fc.constant("2026-11-16T10:00:00Z"),
  }),
  fc.record({ type: fc.constant("CAPTURE_DENIED" as const), orderId: orderIdArb, captureId: captureIdArb }),
  fc.record({
    type: fc.constant("INVOICE_PAID" as const),
    invoiceId: fc.constantFrom("INV2-A", "INV2-B"),
    amountCents: fc.constant(36_000),
    paidAt: fc.constant("2026-11-16T11:00:00Z"),
    paymentId: fc.option(fc.constantFrom("PAY-1", "PAY-2"), { nil: undefined }),
  }),
);
const startArb: fc.Arbitrary<PaymentMilestone> = fc
  .record({
    status: fc.constantFrom<PaymentStatus>("scheduled", "upcoming", "due", "overdue"),
    orderAttempt: fc.integer({ min: 0, max: 2 }),
  })
  .map(({ status, orderAttempt }) => ({ dueDate: "2026-11-16", status, orderAttempt }));

describe("transition(): property over random event sequences", () => {
  it("is pure, monotonic, paid-absorbing and idempotent", () => {
    fc.assert(
      fc.property(startArb, fc.array(eventArb, { maxLength: 40 }), (start, events) => {
        let m = deepFreeze(structuredClone(start));
        let paidSnapshot: PaymentMilestone | null = null;
        const replay: PaymentMilestone[] = [];

        for (const e of events) {
          const before = structuredClone(m);
          const r = transition(m, e);
          // Pure: input untouched (it is frozen, so a mutation would also throw).
          expect(m).toEqual(before);
          // Deterministic.
          expect(transition(m, e)).toEqual(r);
          // Unchanged results hand back the same object.
          if (!r.changed) expect(r.milestone).toBe(m);

          const next = r.milestone;
          // Monotonic settlement: rank never decreases, except a DENIED of the very pending capture.
          if (settlementRank(next.status) < settlementRank(m.status)) {
            expect(e.type).toBe("CAPTURE_DENIED");
            expect(m.status).toBe("processing");
            expect((e as { captureId: string }).captureId).toBe(m.captureId);
            expect(next.status).toBe("due");
          }
          // paid is absorbing: once paid, nothing changes ever again.
          if (paidSnapshot) expect(next).toEqual(paidSnapshot);
          if (next.status === "paid") {
            paidSnapshot ??= structuredClone(next);
            expect(next.paidCents).toBeTypeOf("number");
            expect(next.instrument).toBeDefined();
          }
          // The attempt counter never goes back.
          expect(next.orderAttempt).toBeGreaterThanOrEqual(m.orderAttempt);
          // Applying the same event twice in a row changes nothing the second time.
          expect(transition(next, e).changed).toBe(false);
          // Always a valid milestone.
          expect(PaymentMilestoneSchema.safeParse(next).success).toBe(true);

          m = deepFreeze(structuredClone(next));
          replay.push(m);
        }

        // Replaying the whole sequence yields the same final state.
        const again = events.reduce((acc, e) => transition(acc, e).milestone, structuredClone(start));
        expect(again).toEqual(replay.at(-1) ?? start);
      }),
      { numRuns: 500 },
    );
  });

  it("converges: capture response, webhook and return reconcile of the same capture give one settlement", () => {
    fc.assert(
      fc.property(fc.array(fc.constantFrom(0, 1, 2), { minLength: 1, maxLength: 9 }), (order) => {
        const sources: PaymentEvent[] = [completed("CAP-1"), completed("CAP-1"), completed("CAP-1")];
        let m = due({ orderId: "O-1", orderAttempt: 1 });
        let changes = 0;
        for (const i of order) {
          const r = transition(m, sources[i]!);
          if (r.changed) changes++;
          m = r.milestone;
        }
        expect(changes).toBe(1);
        expect(m.status).toBe("paid");
      }),
    );
  });
});
