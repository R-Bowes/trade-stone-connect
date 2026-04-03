/** Canonical trades for directory, onboarding, and contractor profile editing */
export const CONTRACTOR_TRADES = [
  "Bricklaying",
  "Carpentry",
  "Decorating",
  "Drainage",
  "Electrical",
  "Flooring",
  "Gas & Heating",
  "General Building",
  "Groundwork",
  "Joinery",
  "Landscaping",
  "Plastering",
  "Plumbing",
  "Roofing",
  "Scaffolding",
  "Tiling",
  "Windows & Doors",
] as const;

export type ContractorTrade = (typeof CONTRACTOR_TRADES)[number];

export const TRADE_TYPES: readonly string[] = [...CONTRACTOR_TRADES];
