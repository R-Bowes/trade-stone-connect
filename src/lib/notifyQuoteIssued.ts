import { toast } from "@/hooks/use-toast";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";

/**
 * Emails the customer that a quote has arrived, after the quote is already
 * sent. Call once per successful send (direct send from SendQuoteDialog, or
 * send_quote from IssuedQuotes — revisions included); the edge function
 * re-checks ownership and sent status, resolves the customer's email
 * server-side, and sends at most once per quote version.
 *
 * Fire-and-forget: never awaited by the send flow, so an email failure can't
 * fail or undo the send. A failure is logged and shown as a non-blocking
 * toast. Guest quotes (no recipient) are skipped by the function without
 * error.
 */
export function notifyQuoteIssued(quoteId: string): void {
  invokeEdgeFunction("notify-invoice-quote-action", {
    body: { action_type: "issue", context_type: "quote", context_id: quoteId },
  }).catch((error: unknown) => {
    console.error("Quote email failed", { quoteId, error: error instanceof Error ? error.message : String(error) });
    toast({
      title: "Quote sent, but the email didn't go",
      description: "The customer can still see the quote in their TradeStone account.",
    });
  });
}
