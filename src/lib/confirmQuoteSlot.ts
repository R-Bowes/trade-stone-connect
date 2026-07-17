import { supabase } from "@/integrations/supabase/client";

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
  const { data, error } = await supabase.functions.invoke("accept-quote", {
    body: { quote_id: quoteId, event_id: eventId },
  });

  if (error || data?.error) {
    throw new Error(data?.error ?? error?.message ?? "Failed to confirm this date");
  }

  return data as ConfirmQuoteSlotResult;
}
