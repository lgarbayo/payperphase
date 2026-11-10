/** /p/[planId] server page: server-renders buildPlanView(planId, "patient") into the client view. */
import { isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { goldenView } from "./fixtures";

const m = vi.hoisted(() => ({
  buildPlanView: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));
vi.mock("@/server/views", () => ({ buildPlanView: m.buildPlanView }));
vi.mock("next/navigation", () => ({ notFound: m.notFound }));
vi.mock("@/components/patient/PatientPlanView", () => ({ PatientPlanView: () => null }));

import PatientPlanPage, { dynamic, metadata } from "../../app/p/[planId]/page";
import { PatientPlanView } from "@/components/patient/PatientPlanView";

describe("/p/[planId] page", () => {
  beforeEach(() => {
    m.buildPlanView.mockReset();
    m.notFound.mockClear();
  });

  it("builds the patient view for the alias and passes it with the plan ref", async () => {
    const view = goldenView();
    m.buildPlanView.mockResolvedValue(view);
    const el = await PatientPlanPage({ params: Promise.resolve({ planId: "demo" }) });
    expect(m.buildPlanView).toHaveBeenCalledWith("demo", "patient");
    expect(isValidElement(el)).toBe(true);
    expect(el.type).toBe(PatientPlanView);
    expect(el.props).toEqual({ initial: view, planRef: "demo" });
    expect(dynamic).toBe("force-dynamic");
    expect(metadata.title).toBe("Tu plan de tratamiento · PayPerPhase");
  });

  it("404s for an unknown plan", async () => {
    m.buildPlanView.mockResolvedValue(null);
    await expect(PatientPlanPage({ params: Promise.resolve({ planId: "pln_missing1" }) })).rejects.toThrow("NEXT_NOT_FOUND");
    expect(m.notFound).toHaveBeenCalled();
  });
});
