export interface QuoteVersionLike {
  id: string;
  contractor_id: string;
  quote_number: number;
  version: number;
  status: string;
}

/**
 * quote_number is per-contractor (each contractor's own sequential Q-0001,
 * Q-0002, ...), never platform-unique — so grouping by quote_number alone
 * conflates different contractors' quote #1s into one bucket wherever a
 * listing spans more than one contractor (ReceivedQuotes.tsx does; a
 * homeowner's quotes come from however many contractors they've dealt
 * with). Every grouping key here MUST include contractor_id.
 */
export function quoteVersionKey(contractorId: string, quoteNumber: number): string {
  return `${contractorId}:${quoteNumber}`;
}

/** Every version sharing a (contractor_id, quote_number) pair, keyed by that pair. */
export function groupByQuoteNumber<T extends QuoteVersionLike>(rows: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const key = quoteVersionKey(row.contractor_id, row.quote_number);
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  }
  return map;
}

/**
 * The governing version among one quote_number's sibling rows — the same
 * precedence useContractorPipeline uses: the version a job was actually
 * minted from, else the accepted version, else the latest non-draft
 * version. Replaces the "highest version wins" logic IssuedQuotes.tsx and
 * useReceivedQuotes.ts each reimplemented independently, which could let an
 * unrelated newer draft revision mask a rejected (or otherwise governing)
 * sibling still awaiting attention.
 *
 * Unlike the pipeline — which simply omits an all-draft quote_number group
 * from the work list — these are full listing surfaces that can't omit a
 * quote that exists in the database, so an all-draft family falls back to
 * its latest version rather than resolving to nothing.
 */
export function resolveGoverningQuote<T extends QuoteVersionLike>(
  versions: T[],
  jobIssuedQuoteId?: string | null,
): T {
  const jobQuote = jobIssuedQuoteId ? versions.find((v) => v.id === jobIssuedQuoteId) : undefined;
  const acceptedVersion = versions
    .filter((v) => v.status === "accepted")
    .reduce<T | undefined>((a, b) => (!a || b.version > a.version ? b : a), undefined);
  const nonDraft = versions.filter((v) => v.status !== "draft");
  const latestNonDraft = nonDraft.length ? nonDraft.reduce((a, b) => (b.version > a.version ? b : a)) : undefined;
  const latestOverall = versions.reduce((a, b) => (b.version > a.version ? b : a));
  return jobQuote ?? acceptedVersion ?? latestNonDraft ?? latestOverall;
}

/** True when the latest version is an unsent draft revision beyond the governing one — shown as an indicator, not a card of its own. */
export function hasDraftRevision<T extends QuoteVersionLike>(versions: T[], governing: T): boolean {
  const latest = versions.reduce((a, b) => (b.version > a.version ? b : a));
  return latest.status === "draft" && latest.id !== governing.id;
}
