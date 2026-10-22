/** The address fields a quote carries for where the work is. */
export interface WorkAddressFields {
  client_address?: string | null;
  addr_line1?: string | null;
  addr_line2?: string | null;
  addr_city?: string | null;
  addr_region?: string | null;
  addr_postcode?: string | null;
}

/**
 * One line for where the work is: the structured fields when the quote has
 * them, else the older free-text client_address. Null when neither is set.
 */
export function formatWorkAddress(q: WorkAddressFields): string | null {
  const structured = [q.addr_line1, q.addr_line2, q.addr_city, q.addr_region, q.addr_postcode]
    .map((p) => p?.trim())
    .filter((p): p is string => !!p)
    .join(", ");
  return structured || q.client_address?.trim() || null;
}
