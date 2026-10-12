export function contractorCodeSuffix(tsProfileCode: string): string {
  return tsProfileCode.replace(/^TS-C-/, "");
}

export function formatQuoteRef(
  quoteNumber: number,
  opts?: { contractorCode?: string; version?: number }
): string {
  const num = String(quoteNumber).padStart(4, "0");
  const base = opts?.contractorCode
    ? `Q-${contractorCodeSuffix(opts.contractorCode)}-${num}`
    : `Q-${num}`;
  return opts?.version && opts.version > 1 ? `${base}.${opts.version}` : base;
}

export function formatJobRef(
  jobNumber: number,
  opts?: { contractorCode?: string }
): string {
  const num = String(jobNumber).padStart(4, "0");
  return opts?.contractorCode
    ? `J-${contractorCodeSuffix(opts.contractorCode)}-${num}`
    : `J-${num}`;
}

export function formatInvoiceRef(
  invoiceNumber: number | null,
  opts?: { contractorCode?: string }
): string {
  // A draft has no number at all -- issuing is the only thing that assigns
  // one (CLAUDE.md invoice invariants).
  if (invoiceNumber == null) return "Draft";
  const num = String(invoiceNumber).padStart(4, "0");
  return opts?.contractorCode
    ? `INV-${contractorCodeSuffix(opts.contractorCode)}-${num}`
    : `INV-${num}`;
}
