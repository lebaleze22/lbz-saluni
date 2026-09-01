export type CategorizedService = {
  category: { id: string; name: string } | null;
};

export function groupByServiceCategory<T extends CategorizedService>(services: T[]) {
  const groups = new Map<string, { name: string; items: T[] }>();

  for (const service of services) {
    const id = service.category?.id ?? "__uncategorized__";
    const name = service.category?.name ?? "Sans catégorie";
    const group = groups.get(id) ?? { name, items: [] };
    group.items.push(service);
    groups.set(id, group);
  }

  return Array.from(groups.entries())
    .map(([id, group]) => ({ id, ...group }))
    .sort((left, right) => {
      if (left.id === "__uncategorized__") return 1;
      if (right.id === "__uncategorized__") return -1;
      return left.name.localeCompare(right.name, "fr");
    });
}
