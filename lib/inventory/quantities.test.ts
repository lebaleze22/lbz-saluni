import { describe, expect, it } from "vitest";
import { planConsumption, quantityToThousandths, thousandthsToQuantity } from "./quantities";
import {
  productCreateSchema,
  stockMovementSchema,
  serviceProductSchema,
} from "../validation/inventory";

describe("stock quantities and service consumption", () => {
  it("combines a product shared by multiple services without decimal drift", () => {
    expect(
      planConsumption([
        { productId: "b", quantity: "12.5" },
        { productId: "a", quantity: "0.1" },
        { productId: "a", quantity: "0.2" },
      ]),
    ).toEqual([
      { productId: "a", quantity: "0.300" },
      { productId: "b", quantity: "12.500" },
    ]);
  });
  it("retains precise signed movement amounts and decimal commas", () => {
    expect(quantityToThousandths("12,345")).toBe(12345);
    expect(thousandthsToQuantity(-12345)).toBe("-12.345");
    expect(quantityToThousandths("999999999.999")).toBe(999999999999);
  });
  it.each(["", "-1", "0.0001", "Infinity", "1e3", "1000000000", "1.2.3"])(
    "rejects unrepresentable stock %s",
    (value) => {
      expect(() => quantityToThousandths(value)).toThrow();
    },
  );
  it("rejects aggregate consumption beyond database precision", () => {
    expect(() =>
      planConsumption([
        { productId: "a", quantity: "999999999.999" },
        { productId: "a", quantity: "0.001" },
      ]),
    ).toThrow();
  });
  it("allows a zero physical count, but never a zero receipt or sale", () => {
    const input = {
      productId: "00000000-0000-4000-8000-000000000001",
      quantity: "0",
      reason: "Comptage après fermeture",
    };
    expect(stockMovementSchema.safeParse({ ...input, type: "adjustment" }).success).toBe(true);
    expect(stockMovementSchema.safeParse({ ...input, type: "restock" }).success).toBe(false);
    expect(stockMovementSchema.safeParse({ ...input, type: "sale" }).success).toBe(false);
    expect(serviceProductSchema.safeParse({ ...input, serviceId: input.productId }).success).toBe(
      false,
    );
  });
  it("normalizes SKU and bounds integer FCFA prices", () => {
    const input = {
      name: "Shampooing",
      sku: " sham-1 ",
      unit: "ml",
      costPrice: "10",
      salePrice: "20",
      lowStockThreshold: "50",
      initialStock: "500.125",
    };
    expect(productCreateSchema.parse(input)).toMatchObject({
      sku: "SHAM-1",
      initialStock: "500.125",
      costPrice: 10,
    });
    expect(productCreateSchema.safeParse({ ...input, costPrice: "1.5" }).success).toBe(false);
    expect(productCreateSchema.safeParse({ ...input, salePrice: "2147483648" }).success).toBe(
      false,
    );
  });
});
