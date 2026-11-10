import { describe, expect, it } from "vitest";
import { WordingResponseSchema } from "@/contracts";
import { GOLDEN_PLAN_ID } from "@/contracts/fixtures/implantCase";
import { POST } from "../../app/api/wording/route";

const req = (body: unknown) =>
  new Request("http://localhost/api/wording", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

// FORCE_MOCKS=1 in tests: deterministic templates, labelled cached.
describe("POST /api/wording (mock mode)", () => {
  it("returns validated ES/EN drafts for every phase", async () => {
    const res = await POST(req({ planId: GOLDEN_PLAN_ID }));
    expect(res.status).toBe(200);
    const { drafts } = WordingResponseSchema.parse(await res.json());
    expect(drafts).toMatchObject({ planId: GOLDEN_PLAN_ID, planVersion: 1, source: "cached" });
    expect(drafts.phases).toHaveLength(4);
    expect(drafts.phases[0]!.template.es).toContain("{{amount}}");
    expect(drafts.phases[0]!.rendered.es).not.toContain("{{");
  });

  it("404 for an unknown plan, 422 for a malformed id", async () => {
    expect((await POST(req({ planId: "pln_nothere1" }))).status).toBe(404);
    expect((await POST(req({ planId: "nope" }))).status).toBe(422);
  });
});
