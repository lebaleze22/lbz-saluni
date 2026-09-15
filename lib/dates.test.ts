import { describe, expect, it } from "vitest";
import { dateTimeInDouala, doualaInputToIso, getReportDateRange } from "./dates";

describe("salon time boundaries", () => {
  it("keeps visit inputs in Douala across UTC midnight", () => {
    expect(dateTimeInDouala(new Date("2026-09-07T23:30:00Z"))).toBe("2026-09-08T00:30");
    expect(doualaInputToIso("2026-09-08T00:30")).toBe("2026-09-07T23:30:00.000Z");
  });
  it.each(["", "invalid", "2026-02-30T12:00", "2026-09-08T25:00"])(
    "handles incomplete or impossible date input %s",
    (value) => {
      expect(doualaInputToIso(value)).toBe("");
    },
  );
  it("uses Monday boundaries for a Sunday report reference", () => {
    const range = getReportDateRange("week", "2026-09-13");
    expect(range.start.toISOString()).toBe("2026-09-06T23:00:00.000Z");
    expect(range.end.toISOString()).toBe("2026-09-13T23:00:00.000Z");
  });
});
