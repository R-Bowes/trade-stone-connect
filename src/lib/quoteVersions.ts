export interface QuoteVersionLike {
  id: string;
  quote_number: number;
  version: number;
  status: string;
}

/** Every version sharing a quote_number, keyed by that number. */
export function groupByQuoteNumber<T extends QuoteVersionLike>(rows: T[]): Map<number, T[]> {
  const map = new Map<number, T[]>();
  for (const row of rows) {
    const list = map.get(row.quote_number) ?? [];
    list.push(row);
    map.set(row.quote_number, list);
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
