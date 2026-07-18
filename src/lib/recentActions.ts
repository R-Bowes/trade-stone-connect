/**
 * Self-caused-notification suppression. A small number of DB triggers
 * deliberately notify BOTH parties on a state change (notify_job_status_change)
 * or send the acting party a "You have accepted/rejected/..." confirmation
 * (notify_quote_response, notify_invoice_response) — in both cases, the
 * acting party's own client already shows its own local toast for the same
 * action, so the Realtime-driven notification toast for that same row is
 * redundant noise, not new information. The notification ROW itself is still
 * kept (so it shows correctly in the bell/notifications history) — only the
 * TOAST is suppressed.
 *
 * This is NOT a generic "any recent mutation" heuristic (a fixed time window
 * after ANY app action would be both too broad — suppressing a toast for an
 * unrelated concurrent change — and too narrow — missing a slow trigger).
 * Instead, call sites that are KNOWN to cause a self-targeted notification
 * explicitly mark the reference_id they just acted on. useNotifications then
 * checks incoming Realtime rows against this set before toasting.
 *
 * Known call sites that must call markRecentAction(referenceId):
 * - useReceivedQuotes.ts's respondToQuote (reject/stall -> notify_quote_response)
 * - confirmQuoteSlot.ts (accept -> notify_quote_response via accept_quote_with_slot)
 * - JobManagement.tsx's status advance/revert (-> notify_job_status_change,
 *   which notifies both customer_id and contractor_id unconditionally)
 *
 * If a new trigger is added later that also notifies the acting party, its
 * call site must be added to this list and call markRecentAction too.
 */

const RECENT_ACTION_WINDOW_MS = 8000;

const recentActions = new Map<string, number>();

function pruneStale(now: number) {
  for (const [id, ts] of recentActions) {
    if (now - ts > RECENT_ACTION_WINDOW_MS) recentActions.delete(id);
  }
}

export function markRecentAction(referenceId: string): void {
  const now = Date.now();
  pruneStale(now);
  recentActions.set(referenceId, now);
}

export function wasRecentAction(referenceId: string | null): boolean {
  if (!referenceId) return false;
  const ts = recentActions.get(referenceId);
  if (ts === undefined) return false;
  return Date.now() - ts <= RECENT_ACTION_WINDOW_MS;
}
