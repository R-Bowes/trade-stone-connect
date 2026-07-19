import { markRecentAction } from "@/lib/recentActions";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";

/**
 * The one exit door for the recipient-side quote transaction: confirms a
 * schedule_events slot and, in the same atomic RPC, accepts the quote and
 * either mints the job (no deposit due) or reports what's owed (deposit
 * due) so the caller can proceed to payment. Never call schedule_events or
 * issued_quotes directly for this — see accept_quote_with_slot.
 */
export interface ConfirmQuoteSlotResult {
  deposit_required: boolean;
  deposit_amount: number | null;
  job_id: string | null;
  confirmed_start: string;
  client_secret?: string;
  invoice_id?: string;
}

export async function confirmQuoteSlot(quoteId: string, eventId: string): Promise<ConfirmQuoteSlotResult> {
  const data = await invokeEdgeFunction<ConfirmQuoteSlotResult>("accept-quote", {
    body: { quote_id: quoteId, event_id: eventId },
  });

  // accept_quote_with_slot flips issued_quotes.recipient_response, which
  // fires notify_quote_response's "You have accepted..." self-confirmation
  // for us (the recipient) — suppress its toast, the caller shows its own.
  markRecentAction(quoteId);

  return data;
}
