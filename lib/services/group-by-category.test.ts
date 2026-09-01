import { describe, expect, it } from "vitest";
import { groupByServiceCategory } from "./group-by-category";

describe("regroupement des prestations", () => {
  it("regroupe et trie les prestations par catégorie", () => {
    const groups = groupByServiceCategory([
      { id: "1", category: { id: "massage", name: "Massages" } },
      { id: "2", category: { id: "barber", name: "Barber" } },
      { id: "3", category: { id: "massage", name: "Massages" } },
    ]);

    expect(groups.map(({ name }) => name)).toEqual(["Barber", "Massages"]);
    expect(groups[1].items.map(({ id }) => id)).toEqual(["1", "3"]);
  });

  it("place les prestations historiques sans catégorie à la fin", () => {
    const groups = groupByServiceCategory([
      { id: "legacy", category: null },
      { id: "current", category: { id: "beauty", name: "Beauty" } },
    ]);

    expect(groups.map(({ name }) => name)).toEqual(["Beauty", "Sans catégorie"]);
  });
});
