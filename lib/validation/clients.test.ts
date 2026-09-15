import { describe, expect, it } from "vitest";
import { clientInputSchema, clientFiltersSchema } from "./clients";

describe("client profiles and segmentation filters", () => {
  it("normalizes optional contact data while keeping internal notes", () => {
    const value = clientInputSchema.parse({
      name: " Grâce ",
      email: " GRACE@EXAMPLE.COM ",
      phone: "",
      sex: "",
      notes: " Préfère le matin ",
      allergies: " Produit signalé ",
    });
    expect(value).toMatchObject({
      name: "Grâce",
      email: "grace@example.com",
      phone: undefined,
      sex: undefined,
      notes: "Préfère le matin",
      allergies: "Produit signalé",
    });
  });
  it.each([
    { name: " " },
    { name: "Client", email: "incorrect" },
    { name: "Client", email: 123 },
    { name: "Client", notes: "a".repeat(4001) },
  ])("rejects malformed profile input %j", (input) => {
    expect(clientInputSchema.safeParse(input).success).toBe(false);
  });
  it("bounds inactivity windows and pagination", () => {
    expect(clientFiltersSchema.parse({})).toMatchObject({ days: 90, page: 1, status: "active" });
    expect(clientFiltersSchema.safeParse({ days: 0 }).success).toBe(false);
    expect(clientFiltersSchema.safeParse({ page: -1 }).success).toBe(false);
  });
});
