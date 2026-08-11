// src/constants/units.ts
//
// Unit vocabulary for quote and invoice line items.
//
// INVARIANTS
// - The stored value on a line item is the `id` ONLY (e.g. 'sqm').
//   Never store a display glyph such as 'm²'.
// - Units are descriptive. They never participate in any calculation.
//   Line total is always quantity * unit_price regardless of unit.
// - A unit is immutable once a quote is issued. A quote priced in
//   sqm is never re-rendered in sqft for a different viewer.
// - `unit` is OPTIONAL on a line item. Historic rows have no unit
//   key at all; all readers must tolerate undefined.

export type UnitSystem = 'metric' | 'imperial' | 'neutral';

export type UnitCategory =
  | 'count'
  | 'time'
  | 'length'
  | 'area'
  | 'volume'
  | 'weight'
  | 'liquid'
  | 'packaging';

export interface UnitDefinition {
  /** Stored identifier. Never changes. */
  id: string;
  /** Short display label, shown next to quantities. */
  label: string;
  /** Full name, used in tooltips and select options. */
  name: string;
  system: UnitSystem;
  category: UnitCategory;
}

export const UNITS: readonly UnitDefinition[] = [
  // Count
  { id: 'each',   label: 'each',  name: 'each',            system: 'neutral',  category: 'count' },
  { id: 'point',  label: 'pt',    name: 'points',          system: 'neutral',  category: 'count' },
  { id: 'job',    label: 'job',   name: 'per job',         system: 'neutral',  category: 'count' },
  { id: 'visit',  label: 'visit', name: 'per visit',       system: 'neutral',  category: 'count' },

  // Time
  { id: 'hour',   label: 'hr',    name: 'hours',           system: 'neutral',  category: 'time' },
  { id: 'day',    label: 'day',   name: 'days',            system: 'neutral',  category: 'time' },
  { id: 'week',   label: 'wk',    name: 'weeks',           system: 'neutral',  category: 'time' },
  { id: 'month',  label: 'mo',    name: 'months',          system: 'neutral',  category: 'time' },

  // Length
  { id: 'm',      label: 'm',     name: 'metres',          system: 'metric',   category: 'length' },
  { id: 'mm',     label: 'mm',    name: 'millimetres',     system: 'metric',   category: 'length' },
  { id: 'lm',     label: 'lm',    name: 'linear metres',   system: 'metric',   category: 'length' },
  { id: 'ft',     label: 'ft',    name: 'feet',            system: 'imperial', category: 'length' },
  { id: 'in',     label: 'in',    name: 'inches',          system: 'imperial', category: 'length' },
  { id: 'lft',    label: 'ln ft', name: 'linear feet',     system: 'imperial', category: 'length' },
  { id: 'yd',     label: 'yd',    name: 'yards',           system: 'imperial', category: 'length' },

  // Area
  { id: 'sqm',    label: 'm²',    name: 'square metres',   system: 'metric',   category: 'area' },
  { id: 'sqft',   label: 'sq ft', name: 'square feet',     system: 'imperial', category: 'area' },
  { id: 'sqyd',   label: 'sq yd', name: 'square yards',    system: 'imperial', category: 'area' },

  // Volume
  { id: 'cum',    label: 'm³',    name: 'cubic metres',    system: 'metric',   category: 'volume' },
  { id: 'cuft',   label: 'cu ft', name: 'cubic feet',      system: 'imperial', category: 'volume' },
  { id: 'cuyd',   label: 'cu yd', name: 'cubic yards',     system: 'imperial', category: 'volume' },

  // Weight
  { id: 'kg',     label: 'kg',    name: 'kilograms',       system: 'metric',   category: 'weight' },
  { id: 'tonne',  label: 't',     name: 'tonnes',          system: 'metric',   category: 'weight' },
  { id: 'lb',     label: 'lb',    name: 'pounds',          system: 'imperial', category: 'weight' },
  { id: 'ton',    label: 'ton',   name: 'tons',            system: 'imperial', category: 'weight' },

  // Liquid
  { id: 'litre',  label: 'L',     name: 'litres',          system: 'metric',   category: 'liquid' },
  { id: 'gal',    label: 'gal',   name: 'gallons',         system: 'imperial', category: 'liquid' },

  // Packaging
  { id: 'roll',   label: 'roll',  name: 'rolls',           system: 'neutral',  category: 'packaging' },
  { id: 'sheet',  label: 'sheet', name: 'sheets',          system: 'neutral',  category: 'packaging' },
  { id: 'box',    label: 'box',   name: 'boxes',           system: 'neutral',  category: 'packaging' },
  { id: 'pack',   label: 'pack',  name: 'packs',           system: 'neutral',  category: 'packaging' },
  { id: 'bag',    label: 'bag',   name: 'bags',            system: 'neutral',  category: 'packaging' },
  { id: 'pallet', label: 'pallet',name: 'pallets',         system: 'neutral',  category: 'packaging' },
] as const;

export type UnitId = (typeof UNITS)[number]['id'];

/** Which unit systems are offered for entry in each country. */
const COUNTRY_SYSTEMS: Record<string, readonly UnitSystem[]> = {
  GB: ['metric', 'neutral'],
  US: ['imperial', 'neutral'],
  CA: ['metric', 'imperial', 'neutral'],
};

/**
 * Units offered in the picker for a given country.
 * Falls back to GB for unknown country codes.
 */
export function unitsForCountry(countryCode: string): UnitDefinition[] {
  const systems = COUNTRY_SYSTEMS[countryCode] ?? COUNTRY_SYSTEMS.GB;
  return UNITS.filter((u) => systems.includes(u.system));
}

/**
 * Resolve a stored unit id to its display label.
 * Returns '' for undefined, null, or unrecognised ids, so historic
 * line items with no unit render exactly as they do today.
 */
export function unitLabel(unitId: string | null | undefined): string {
  if (!unitId) return '';
  return UNITS.find((u) => u.id === unitId)?.label ?? '';
}

/** True if the id is a recognised unit. Used to guard writes. */
export function isValidUnit(unitId: string | null | undefined): boolean {
  if (!unitId) return false;
  return UNITS.some((u) => u.id === unitId);
}