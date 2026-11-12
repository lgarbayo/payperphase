import { describe, expect, it } from "vitest";
import { GOLDEN_PLAN } from "@/contracts/fixtures/implantCase";
import { createDragController } from "@/components/gantt/dragController";
import { dragTipHtml } from "@/components/gantt/ganttText";
import { planToBryntum } from "@/components/gantt/toBryntum";

const TODAY = "2026-11-16";

describe("drag tooltip", () => {
  const { meta } = planToBryntum(GOLDEN_PLAN, { today: TODAY, locale: "en", mode: "patient" });
  const ph2 = meta["visit-ph2"]!;

  it("shows the clinic day a weekend drop lands on, the same one the drop commits", () => {
    const ctl = createDragController({
      getPlan: () => GOLDEN_PLAN,
      getToday: () => TODAY,
      getLocale: () => "en",
      getNotes: () => ({}),
    });
    const saturday = "2027-02-20";
    const html = dragTipHtml(ph2, saturday, "en", ctl.validate("ph2", saturday));
    const drop = ctl.drop("ph2", saturday);
    expect(drop).toMatchObject({ kind: "committed", move: { phaseId: "ph2", newStartDate: "2027-02-22" } });
    expect(html).toContain("22 Feb 2027");
    expect(html).toContain("+41 days");
    expect(html).not.toContain("20 Feb 2027");
  });

  it("keeps a weekday drop as is", () => {
    const html = dragTipHtml(ph2, "2027-02-23", "en", { valid: true });
    expect(html).toContain("23 Feb 2027");
    expect(html).toContain("+6 wk");
  });
});
