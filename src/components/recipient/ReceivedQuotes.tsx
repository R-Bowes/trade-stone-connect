import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, CheckCircle, XCircle, Pause, Loader2, Calendar } from "lucide-react";
import { useReceivedQuotes, type ReceivedQuote } from "@/hooks/useReceivedQuotes";
import { MessageDialog } from "./MessageDialog";
import { QuoteScheduleNegotiation } from "./QuoteScheduleNegotiation";
import { QuoteAcceptScreen } from "./QuoteAcceptScreen";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { formatQuoteRef } from "@/lib/documentRefs";

export function ReceivedQuotes() {
  const { quotes, loading, respondToQuote, refetch } = useReceivedQuotes();
  const [messageDialog, setMessageDialog] = useState<{
    open: boolean;
    quote: ReceivedQuote | null;
    action: string;
  }>({ open: false, quote: null, action: "" });
  const { toast } = useToast();
  const [scheduleQuote, setScheduleQuote] = useState<ReceivedQuote | null>(null);
  const [acceptScreenQuote, setAcceptScreenQuote] = useState<ReceivedQuote | null>(null);
  const [pendingIds, setPendingIds] = useState<Record<string, string>>({});

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

  const getResponseBadge = (quote: ReceivedQuote) => {
    const response = quote.recipient_response ?? pendingIds[quote.id] ?? null;
    if (response === "accepted" && quote.deposit_required && !quote.deposit_paid) {
      return <Badge className="bg-amber-100 text-amber-800">Awaiting deposit — waiting on you</Badge>;
    }
    if (response === "accepted") return <Badge className="bg-green-100 text-green-800">Accepted</Badge>;
    if (response === "rejected") return <Badge className="bg-red-100 text-red-800">Rejected</Badge>;
    if (response === "stalled") return <Badge className="bg-yellow-100 text-yellow-800">Stalled</Badge>;
    if (quote.status === "accepted") return <Badge className="bg-green-100 text-green-800">Accepted</Badge>;
    if (quote.status === "rejected") return <Badge className="bg-red-100 text-red-800">Rejected</Badge>;
    if (quote.status === "expired") return <Badge variant="outline" className="text-muted-foreground">Expired</Badge>;
    return <Badge variant="outline">Pending</Badge>;
  };

  const canRespond = (quote: ReceivedQuote) =>
    quote.status === "sent" &&
    !quote.recipient_response &&
    !pendingIds[quote.id];

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

  if (quotes.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No Quotes Received</h3>
          <p className="text-muted-foreground">
            When contractors send you quotes, they'll appear here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="font-heading text-2xl font-bold">Received Quotes</h2>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quote #</TableHead>
                <TableHead>Contractor</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Valid Until</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotes.map((q) => (
                <TableRow key={q.id}>
                  <TableCell className="font-medium font-mono">
                    {q.quote_number != null
                      ? formatQuoteRef(q.quote_number, { contractorCode: q.contractor_ts_code ?? undefined, version: q.version ?? 1 })
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span>{q.contractor_name}</span>
                      {q.contractor_ts_code && (
                        <span className="text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
                          {q.contractor_ts_code}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>{q.title}</TableCell>
                  <TableCell>{format(new Date(q.valid_until), "dd MMM yyyy")}</TableCell>
                  <TableCell className="text-right font-bold">
                    £{Number(q.total).toFixed(2)}
                  </TableCell>
                  <TableCell>{getResponseBadge(q)}</TableCell>
                  <TableCell className="text-right">
                    {isResponding(q) && (
                      <div className="flex justify-end">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    )}
                    {canRespond(q) && !isResponding(q) && (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" onClick={() => handleAcceptClick(q)}>
                          <CheckCircle className="h-4 w-4 mr-1" />Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleReject(q)}
                        >
                          <XCircle className="h-4 w-4 mr-1" />Reject
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleStall(q)}
                        >
                          <Pause className="h-4 w-4 mr-1" />Stall
                        </Button>
                      </div>
                    )}
                    {isAccepted(q) && !isResponding(q) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setScheduleQuote(q)}
                      >
                        <Calendar className="h-3.5 w-3.5 mr-1.5" />
                        Agree Schedule
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* D4: one-screen accept flow — slot pick + summary + single CTA */}
      <Dialog
        open={!!acceptScreenQuote}
        onOpenChange={(open) => { if (!open) setAcceptScreenQuote(null); }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle style={{ fontFamily: "Lexend, sans-serif", color: "#1e2d4a" }}>
              Accept quote
            </DialogTitle>
          </DialogHeader>
          {acceptScreenQuote && (
            <QuoteAcceptScreen
              quoteId={acceptScreenQuote.id}
              contractorId={acceptScreenQuote.contractor_id}
              quoteTotal={Number(acceptScreenQuote.total)}
              quoteDepositAmount={acceptScreenQuote.deposit_amount != null ? Number(acceptScreenQuote.deposit_amount) : null}
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
            <DialogTitle style={{ fontFamily: "Lexend, sans-serif", color: "#1e2d4a" }}>
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