/**
 * Package ordering shared by the packages list and the timeline, so the
 * two always show packages in the same order: grouped by trade, each group
 * in sort order, groups ordered by their first package, untraded last.
 */

export const OTHER_TRADE = "Other";

interface OrderablePackage {
  trade: string | null;
  sort_order: number;
  created_at: string;
}

export function groupPackagesByTrade<T extends OrderablePackage>(packages: T[]): { trade: string; items: T[] }[] {
  const sorted = [...packages].sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
  const groups = new Map<string, T[]>();
  for (const pkg of sorted) {
    const key = pkg.trade?.trim() || OTHER_TRADE;
    groups.set(key, [...(groups.get(key) ?? []), pkg]);
  }
  const ordered = [...groups.entries()].map(([trade, items]) => ({ trade, items }));
  return [...ordered.filter((g) => g.trade !== OTHER_TRADE), ...ordered.filter((g) => g.trade === OTHER_TRADE)];
}

/** The same order, flattened. */
export function orderPackages<T extends OrderablePackage>(packages: T[]): T[] {
  return groupPackagesByTrade(packages).flatMap((g) => g.items);
}
