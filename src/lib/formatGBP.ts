// Shared GBP formatter — "£1,234.50". "" for nullish/non-numeric input.
// Introduced for the shared EngagementCard / WorkOrderCard. Other files still
// carry their own local copies; consolidating those is a separate sweep.

const GBP = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });

export function formatGBP(value: number | string | null | undefined): string {
  if (value == null || value === "") return "";
  const n = Number(value);
  return Number.isFinite(n) ? GBP.format(n) : "";
}

const formattersByCurrency = new Map<string, Intl.NumberFormat>();

/** Same formatting as formatGBP, but for any of invoices.currency's values (GBP/USD/CAD). */
export function formatCurrency(value: number | string | null | undefined, currency: string | null | undefined): string {
  if (value == null || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return "";
  const code = currency || "GBP";
  let fmt = formattersByCurrency.get(code);
  if (!fmt) {
    fmt = new Intl.NumberFormat("en-GB", { style: "currency", currency: code });
    formattersByCurrency.set(code, fmt);
  }
  return fmt.format(n);
}
