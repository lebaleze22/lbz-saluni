import { describe, expect, it } from "vitest";
import { retailSaleSchema } from "./retail";

const valid = () => ({
  id: crypto.randomUUID(),
  productId: crypto.randomUUID(),
  quantity: "1.250",
  expectedUnitPrice: 3_000,
  method: "cash",
  soldAt: new Date(),
});

describe("retail sale validation", () => {
  it("accepts supported payments, optional clients and normalized quantities", () => {
    for (const method of ["cash", "orange_money", "mtn_momo"]) {
      const parsed = retailSaleSchema.parse({ ...valid(), method, clientId: crypto.randomUUID() });
      expect(parsed.quantity).toBe("1.250");
    }
  });

  it("rejects invalid IDs, nonpositive quantities and future dates", () => {
    expect(retailSaleSchema.safeParse({ ...valid(), id: "bad" }).success).toBe(false);
    expect(retailSaleSchema.safeParse({ ...valid(), quantity: "0" }).success).toBe(false);
    expect(
      retailSaleSchema.safeParse({ ...valid(), soldAt: new Date(Date.now() + 120_000) }).success,
    ).toBe(false);
  });
});
