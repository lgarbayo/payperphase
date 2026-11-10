import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  fromLocalDate,
  isIsoDate,
  isWeekend,
  nextClinicDay,
  toLocalDate,
  weekday,
} from "@/lib/dates";

describe("lib/dates", () => {
  it("validates date-only ISO strings", () => {
    expect(isIsoDate("2026-11-16")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-11-16T00:00:00Z")).toBe(false);
  });

  it("adds days across month, year and DST boundaries in UTC", () => {
    expect(addDays("2026-11-17", 56)).toBe("2027-01-12");
    expect(addDays("2027-01-13", 84)).toBe("2027-04-07");
    expect(addDays("2027-03-27", 2)).toBe("2027-03-29"); // Spain DST switch weekend
    expect(daysBetween("2027-01-12", "2027-02-23")).toBe(42);
  });

  it("knows weekdays and clinic days", () => {
    expect(weekday("2026-11-16")).toBe(1); // Monday
    expect(isWeekend("2026-11-21")).toBe(true);
    expect(nextClinicDay("2026-11-21")).toBe("2026-11-23");
    expect(nextClinicDay("2026-11-18")).toBe("2026-11-18");
  });

  it("round-trips UI dates without timezone drift", () => {
    expect(fromLocalDate(toLocalDate("2027-03-28"))).toBe("2027-03-28");
  });
});
