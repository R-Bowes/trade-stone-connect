import type { TenderStatus, TenderType } from "@/hooks/useTenders";

// Shared between BusinessTendersView and BusinessTenderDetail (same
// dashboard, genuine reuse) -- split into its own file rather than exported
// from a component so Fast Refresh isn't broken (react-refresh/only-export
// -components) and so both call sites import the identical vocabulary.
export const STATUS_LABEL: Record<TenderStatus, string> = {
  draft: "Draft",
  published: "Published",
  closed: "Closed",
  unsealed: "Unsealed",
  awarded: "Awarded",
  cancelled: "Cancelled",
  lapsed: "Lapsed",
};

export const STATUS_COLOUR: Record<TenderStatus, string> = {
  draft: "bg-gray-100 text-gray-600",
  published: "bg-blue-100 text-blue-800",
  closed: "bg-amber-100 text-amber-800",
  unsealed: "bg-purple-100 text-purple-800",
  awarded: "bg-green-100 text-green-800",
  cancelled: "bg-gray-100 text-gray-500",
  lapsed: "bg-gray-100 text-gray-500",
};

export const TYPE_LABEL: Record<TenderType, string> = {
  works: "Works",
  term: "Term",
};

// Terminal states rendered muted (per the confirmed mapping: cancelled/lapsed
// are dead ends, not something needing the same visual weight as live rows).
export const MUTED_STATUSES: TenderStatus[] = ["cancelled", "lapsed"];
