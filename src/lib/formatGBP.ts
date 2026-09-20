// Shared GBP formatter — "£1,234.50". "" for nullish/non-numeric input.
// Introduced for the shared EngagementCard / WorkOrderCard. Other files still
// carry their own local copies; consolidating those is a separate sweep.

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

export function formatGBP(value: number | string | null | undefined): string {
  if (value == null || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) ? GBP.format(n) : "";
}
