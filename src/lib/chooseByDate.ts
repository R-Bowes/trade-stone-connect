/**
 * Shared "choose a contractor by" rule for an unfilled package, used by
 * NeedsYouCard (per-project) and the overview's cross-project Needs You
 * panel, so both agree on the same date and the same overdue cutoff.
 */

/** How far ahead of a package's needed-from date a contractor should be chosen. */
export const CHOOSE_BY_DAYS = 14;

export function chooseBy(neededFrom: string): { date: Date; overdue: boolean } {
  const [y, m, d] = neededFrom.slice(0, 10).split("-").map(Number);
  const date = new Date(y, m - 1, d - CHOOSE_BY_DAYS);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return { date, overdue: date < today };
}
