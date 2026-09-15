import { describe, expect, it } from "vitest";
import { clientInputSchema } from "./clients";
describe("client address and discovery validation", () => {
  it("accepts optional address fields and all supported discovery sources", () => {
    for (const discoverySource of [
      "unknown",
      "recommendation",
      "search",
      "social_media",
      "walk_by",
      "advertisement",
      "other",
    ])
      expect(
        clientInputSchema.safeParse({ name: "Alice", city: "Douala", discoverySource }).success,
      ).toBe(true);
    expect(clientInputSchema.safeParse({ name: "Alice" }).success).toBe(true);
  });
  it("rejects incompatible or ambiguous referrers and oversized addresses", () => {
    expect(
      clientInputSchema.safeParse({ name: "Alice", discoverySource: "search", referrerName: "Bob" })
        .success,
    ).toBe(false);
    expect(
      clientInputSchema.safeParse({
        name: "Alice",
        discoverySource: "recommendation",
        referredByClientId: crypto.randomUUID(),
        referrerName: "Bob",
      }).success,
    ).toBe(false);
    expect(
      clientInputSchema.safeParse({ name: "Alice", addressDetails: "a".repeat(501) }).success,
    ).toBe(false);
  });
});
