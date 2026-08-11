// src/lib/formatDate.ts
//
// Single source of truth for rendering dates/timestamps in the UI.
//
// Two bugs this exists to close:
// 1. `toLocaleDateString()` / `toLocaleString()` called with no locale
//    argument render in whatever locale the VIEWER's browser is set to —
//    the same stored date reads as two different calendar dates depending
//    who's looking (11/08/2026 is 11 Aug in the UK, 8 Nov in the US).
//    formatDate/formatDateTime always produce the same unambiguous
//    "11 Aug 2026" form, everywhere, regardless of viewer locale.
// 2. A date-only string ('2026-08-11') passed bare to `new Date(...)`
//    parses as UTC midnight. Rendered anywhere west of UTC that shows the
//    PREVIOUS day. Every date-only string is parsed as LOCAL midnight
//    instead, via `new Date(y, m-1, d)` — never `new Date(dateOnlyString)`.
//
// This is deliberately NOT locale-correct — "11 Aug 2026" is the same
// string shown to a UK and a US viewer. That's the point: an unambiguous
// format everywhere beats a locale-correct one that silently flips
// day/month meaning between countries.

import { format } from "date-fns";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse a value into a Date, treating a bare date-only string
 * ('2026-08-11') as LOCAL midnight rather than UTC midnight.
 * Returns null for nullish or unparseable input.
 */
function toLocalDate(value: string | Date | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }
  if (DATE_ONLY.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/** "11 Aug 2026". "" for nullish/invalid input. */
export function formatDate(value: string | Date | null | undefined): string {
  const date = toLocalDate(value);
  return date ? format(date, "d MMM yyyy") : "";
}

/** "11 Aug 2026, 14:30". "" for nullish/invalid input. */
export function formatDateTime(value: string | Date | null | undefined): string {
  const date = toLocalDate(value);
  return date ? format(date, "d MMM yyyy, HH:mm") : "";
}
