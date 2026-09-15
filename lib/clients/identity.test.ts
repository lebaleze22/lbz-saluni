import { describe, expect, it } from "vitest";
import { clientIdentityKey, normalizeClientPhone } from "./identity";

describe("four-field client identity", () => {
  it("normalizes name spacing, email casing and Cameroon phone formats", () => {
    expect(
      clientIdentityKey({
        name: "  Marie   N. ",
        phone: "00237 699-11-22-33",
        email: "MARIE@EXAMPLE.COM",
        sex: "femme",
      }),
    ).toBe(
      clientIdentityKey({
        name: "marie n.",
        phone: "699112233",
        email: "marie@example.com",
        sex: "femme",
      }),
    );
    expect(normalizeClientPhone("+33 6 12 34 56 78")).toBe("33612345678");
  });
  it("uses every field to distinguish people and treats missing fields consistently", () => {
    const base = { name: "Marie", phone: "699112233", email: "marie@example.com", sex: "femme" };
    for (const changed of [
      { name: "Maria" },
      { phone: "699112234" },
      { email: "other@example.com" },
      { sex: "homme" },
    ])
      expect(clientIdentityKey({ ...base, ...changed })).not.toBe(clientIdentityKey(base));
    expect(clientIdentityKey({ name: "Marie" })).toBe(
      clientIdentityKey({ name: "Marie", phone: "", email: null, sex: null }),
    );
  });
});
