import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileText, CheckCircle, XCircle, Pause, Loader2, Calendar } from "lucide-react";
import { useReceivedQuotes, type ReceivedQuote } from "@/hooks/useReceivedQuotes";
import { MessageDialog } from "./MessageDialog";
import { QuoteScheduleNegotiation } from "./QuoteScheduleNegotiation";
import { QuoteAcceptScreen } from "./QuoteAcceptScreen";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatQuoteRef } from "@/lib/documentRefs";
import { groupByQuoteNumber, resolveGoverningQuote } from "@/lib/quoteVersions";
import { QuoteCard } from "@/components/shared/QuoteCard";
import { EmptyState } from "@/components/shared/EmptyState";

export function ReceivedQuotes() {
  const { quotes, jobIssuedQuoteIdByNumber, loading, respondToQuote, refetch } = useReceivedQuotes();
  const [messageDialog, setMessageDialog] = useState<{
    open: boolean;
    quote: ReceivedQuote | null;
    action: string;
  }>({ open: false, quote: null, action: "" });
  const { toast } = useToast();
  const [scheduleQuote, setScheduleQuote] = useState<ReceivedQuote | null>(null);
  const [acceptScreenQuote, setAcceptScreenQuote] = useState<ReceivedQuote | null>(null);
  const [pendingIds, setPendingIds] = useState<Record<string, string>>({});

  // Governing version per quote_number — same precedence useContractorPipeline
  // uses, shared with IssuedQuotes.tsx via resolveGoverningQuote, not a
  // "highest version wins" pick.
  const governingQuotes = useMemo(() => {
    const versioned = quotes
      .filter((q): q is ReceivedQuote & { quote_number: number } => q.quote_number != null)
      .map((q) => ({ ...q, version: q.version ?? 1 }));
    const groups = groupByQuoteNumber(versioned);
    return Array.from(groups.entries())
      .map(([quoteNumber, versions]) => ({
        governing: resolveGoverningQuote(versions, jobIssuedQuoteIdByNumber.get(quoteNumber) ?? null),
        versions,
      }))
      .sort((a, b) => new Date(b.governing.created_at).getTime() - new Date(a.governing.created_at).getTime());
  }, [quotes, jobIssuedQuoteIdByNumber]);

  // D4: "Accept" no longer writes recipient_response itself — it opens the
  // one-screen accept flow, which confirms a slot AND accepts the quote
  // atomically via accept-quote/accept_quote_with_slot (LOCKED DECISION 1).
  const handleAcceptClick = (quote: ReceivedQuote) => {
    setAcceptScreenQuote(quote);
  };

  const handleAcceptConfirmed = (quote: ReceivedQuote) => {
    setAcceptScreenQuote(null);
    supabase.functions.invoke("notify-invoice-quote-action", {
      body: { action_type: "accept", context_type: "quote", context_id: quote.id },
    }).catch(console.error);
    toast({ title: "Job scheduled", description: "The contractor has been notified." });
    refetch();
  };

  const handleNoneWork = (quote: ReceivedQuote) => {
    setAcceptScreenQuote(null);
    setScheduleQuote(quote);
  };

  const handleReject = async (quote: ReceivedQuote) => {
    setPendingIds((prev) => ({ ...prev, [quote.id]: "rejected" }));
    try {
      await respondToQuote(quote.id, "rejected");
      supabase.functions.invoke("notify-invoice-quote-action", {
        body: { action_type: "reject", context_type: "quote", context_id: quote.id },
      }).catch(console.error);
      toast({ title: "Quote rejected", description: "The contractor has been notified." });
    } finally {
      setPendingIds((prev) => {
        const next = { ...prev };
        delete next[quote.id];
        return next;
      });
    }
  };

  const handleStall = async (quote: ReceivedQuote) => {
    setPendingIds((prev) => ({ ...prev, [quote.id]: "stalled" }));
    try {
      await respondToQuote(quote.id, "stalled");
      supabase.functions.invoke("notify-invoice-quote-action", {
        body: { action_type: "stall", context_type: "quote", context_id: quote.id },
      }).catch(console.error);
      setMessageDialog({ open: true, quote, action: "stalled" });
    } finally {
      setPendingIds((prev) => {
        const next = { ...prev };
        delete next[quote.id];
        return next;
      });
    }
  };

  // Display-layer expiry (A1: nothing ever flips status to 'expired' in the
  // DB) — a quote past valid_until that's still sitting at 'sent' can no
  // longer be accepted, even though the accept_quote_with_slot RPC would
  // also reject it server-side; this avoids the two-step failure of
  // reaching the slot picker before hitting that raw exception.
  const isExpired = (quote: ReceivedQuote) =>
    quote.status === "sent" && !quote.recipient_response && new Date(quote.valid_until) < new Date();

  const canRespond = (quote: ReceivedQuote) =>
    quote.status === "sent" &&
    !quote.recipient_response &&
    !pendingIds[quote.id];

  const canAccept = (quote: ReceivedQuote) => canRespond(quote) && !isExpired(quote);

  const isResponding = (quote: ReceivedQuote) => quote.id in pendingIds;

  const isAccepted = (quote: ReceivedQuote) =>
    quote.recipient_response === "accepted" ||
    quote.status === "accepted" ||
    pendingIds[quote.id] === "accepted";

  if (loading) {
    return (
      <div className="flex justify-center items-center h-32">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (governingQuotes.length === 0) {
    return (
      <EmptyState
        icon={<FileText className="h-10 w-10" />}
        message="When contractors send you quotes, they'll appear here."
      />
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="font-heading text-2xl font-bold">Received Quotes</h2>

      <div className="grid gap-3">
        {governingQuotes.map(({ governing: q, versions }) => (
          <QuoteCard
            key={q.quote_number}
            quote={q}
            versions={versions}
            viewer="recipient"
            counterparty={q.contractor_name}
            contractorCode={q.contractor_ts_code}
            actions={
              <>
                {isResponding(q) && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                {canRespond(q) && !isResponding(q) && (
                  <>
                    {canAccept(q) ? (
                      <Button size="sm" onClick={() => handleAcceptClick(q)}>
                        <CheckCircle className="h-4 w-4 mr-1" />Accept
                      </Button>
                    ) : (
                      <Button size="sm" disabled title="This quote has expired — ask the contractor for a new one">
                        <CheckCircle className="h-4 w-4 mr-1" />Expired
                      </Button>
                    )}
                    <Button size="sm" variant="destructive" onClick={() => handleReject(q)}>
                      <XCircle className="h-4 w-4 mr-1" />Reject
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleStall(q)}>
                      <Pause className="h-4 w-4 mr-1" />Stall
                    </Button>
                  </>
                )}
                {isAccepted(q) && !isResponding(q) && (
                  <Button size="sm" variant="outline" onClick={() => setScheduleQuote(q)}>
                    <Calendar className="h-3.5 w-3.5 mr-1.5" />
                    Agree Schedule
                  </Button>
                )}
              </>
            }
          />
        ))}
      </div>

      {/* D4: one-screen accept flow — slot pick + summary + single CTA */}
      <Dialog
        open={!!acceptScreenQuote}
        onOpenChange={(open) => { if (!open) setAcceptScreenQuote(null); }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "Lexend, sans-serif", color: "#1a2744" }}>
              Accept quote
            </DialogTitle>
          </DialogHeader>
          {acceptScreenQuote && (
            <QuoteAcceptScreen
              quote={acceptScreenQuote}
              contractorName={acceptScreenQuote.contractor_name ?? "Contractor"}
              onNoneWork={() => handleNoneWork(acceptScreenQuote)}
              onConfirmed={() => handleAcceptConfirmed(acceptScreenQuote)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Schedule negotiation — modal dialog, no more scroll-to-bottom */}
      <Dialog
        open={!!scheduleQuote}
        onOpenChange={(open) => { if (!open) setScheduleQuote(null); }}
      >
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "Lexend, sans-serif", color: "#1a2744" }}>
              Agree a schedule
            </DialogTitle>
          </DialogHeader>
          {scheduleQuote && (
            <QuoteScheduleNegotiation
              quoteId={scheduleQuote.id}
              contractorId={scheduleQuote.contractor_id}
              mode="recipient"
              quoteTotal={Number(scheduleQuote.total)}
              quoteDepositAmount={scheduleQuote.deposit_amount != null ? Number(scheduleQuote.deposit_amount) : null}
              contractorName={scheduleQuote.contractor_name ?? "Contractor"}
              quoteItems={Array.isArray(scheduleQuote.items) ? scheduleQuote.items : []}
              quoteSubtotal={Number(scheduleQuote.subtotal)}
              quoteTaxRate={Number(scheduleQuote.tax_rate)}
              quoteTaxAmount={Number(scheduleQuote.tax_amount)}
              quoteValidUntil={scheduleQuote.valid_until}
              quoteNotes={scheduleQuote.notes}
              quoteTerms={scheduleQuote.terms}
              onJobConfirmed={() => {
                setScheduleQuote(null);
                toast({
                  title: "Job confirmed!",
                  description: "Your job has been created and the contractor has been notified.",
                });
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {messageDialog.quote && (
        <MessageDialog
          open={messageDialog.open}
          onClose={() => setMessageDialog({ open: false, quote: null, action: "" })}
          contractorId={messageDialog.quote.contractor_id}
          subject={`${messageDialog.quote.quote_number != null ? formatQuoteRef(messageDialog.quote.quote_number, { contractorCode: messageDialog.quote.contractor_ts_code ?? undefined, version: messageDialog.quote.version ?? 1 }) : messageDialog.quote.id} - ${
            messageDialog.action === "accepted"
              ? "Accepted - Let's Schedule"
              : "Stalled - Discussion Needed"
          }`}
          contextType="quote"
          contextId={messageDialog.quote.id}
        />
      )}
    </div>
  );
}