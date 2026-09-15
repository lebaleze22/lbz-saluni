import { describe, expect, it } from "vitest";
import { retailTotal } from "./total";

describe("retail totals", () => {
  it("calculates integer and fractional quantities with FCFA rounding", () => {
    expect(retailTotal("2", 3_000)).toBe(6_000);
    expect(retailTotal("0.125", 1_000)).toBe(125);
    expect(retailTotal("0.001", 500)).toBe(1);
  });

  it("rejects zero prices, zero quantities and totals beyond the database integer range", () => {
    expect(() => retailTotal("1", 0)).toThrow("prix");
    expect(() => retailTotal("0", 1_000)).toThrow();
    expect(() => retailTotal("999999999.999", 2_147_483_647)).toThrow("total");
  });
});
