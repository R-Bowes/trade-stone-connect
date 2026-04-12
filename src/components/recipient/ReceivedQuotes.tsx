import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, CheckCircle, XCircle, Pause, Loader2 } from "lucide-react";
import { useReceivedQuotes, type ReceivedQuote } from "@/hooks/useReceivedQuotes";
import { MessageDialog } from "./MessageDialog";
import { QuoteScheduleNegotiation } from "./QuoteScheduleNegotiation";
import { DepositPaymentDialog } from "./DepositPaymentDialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

export function ReceivedQuotes() {
  const { quotes, loading, respondToQuote } = useReceivedQuotes();
  const [messageDialog, setMessageDialog] = useState<{ open: boolean; quote: ReceivedQuote | null; action: string }>({
    open: false, quote: null, action: "",
  });
  const { toast } = useToast();
  const [openNegotiationFor, setOpenNegotiationFor] = useState<string | null>(null);
  const [pendingIds, setPendingIds] = useState<Record<string, string>>({});

  // Deposit payment dialog state
  const [depositDialog, setDepositDialog] = useState<{ open: boolean; quote: ReceivedQuote | null }>({
    open: false,
    quote: null,
  });

  // Called after Stripe confirms payment successfully
  const handleDepositSuccess = async (quote: ReceivedQuote) => {
    setPendingIds((prev) => ({ ...prev, [quote.id]: "accepted" }));

    try {
      // Mark quote accepted in our DB
      await respondToQuote(quote.id, "accepted");

      // Notify contractor (best-effort)
      supabase.functions.invoke("notify-invoice-quote-action", {
        body: { action_type: "accept", context_type: "quote", context_id: quote.id },
      }).catch(console.error);

      // Look up location from linked enquiry
      let location: string | null = null;
      if (quote.enquiry_id) {
        const { data: enquiry } = await supabase
          .from("enquiries")
          .select("location")
          .eq("id", quote.enquiry_id)
          .maybeSingle();
        location = enquiry?.location ?? null;
      }

      // Create the job
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { error: jobError } = await supabase.from("jobs").insert({
          contractor_id: quote.contractor_id,
          client_id: user.id,
          issued_quote_id: quote.id,
          title: quote.title,
          description: quote.description || null,
          location: location || null,
          contract_value: quote.total || 0,
          status: "scheduled",
        });
        if (jobError) console.error("Failed to create job:", jobError);
      }

      toast({
        title: "Deposit paid — job confirmed!",
        description: "Your job has been created. You can discuss scheduling with your contractor.",
      });

      setMessageDialog({ open: true, quote, action: "accepted" });
    } finally {
      setPendingIds((prev) => {
        const next = { ...prev };
        delete next[quote.id];
        return next;
      });
    }
  };

  const handleReject = async (quote: ReceivedQuote) => {
    setPendingIds((prev) => ({ ...prev, [quote.id]: "rejected" }));
    try {
      await respondToQuote(quote.id, "rejected");

      supabase.functions.invoke("notify-invoice-quote-action", {
        body: { action_type: "reject", context_type: "quote", context_id: quote.id },
      }).catch(console.error);

      toast({ title: "Quote Rejected", description: "The contractor has been notified." });
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

  if (loading) {
    return <div className="flex justify-center items-center h-32"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  if (quotes.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No Quotes Received</h3>
          <p className="text-muted-foreground">When contractors send you quotes, they'll appear here.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Received Quotes</h2>
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
                  <TableCell className="font-medium">{q.quote_number || "—"}</TableCell>
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
                  <TableCell className="text-right font-bold">£{Number(q.total).toFixed(2)}</TableCell>
                  <TableCell>{getResponseBadge(q)}</TableCell>
                  <TableCell className="text-right">
                    {isResponding(q) && (
                      <div className="flex justify-end">
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      </div>
                    )}
                    {canRespond(q) && (
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          style={{ backgroundColor: "#f07820" }}
                          className="text-white hover:opacity-90"
                          onClick={() => setDepositDialog({ open: true, quote: q })}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Accept & Pay Deposit
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => handleReject(q)}>
                          <XCircle className="h-4 w-4 mr-1" />Reject
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleStall(q)}>
                          <Pause className="h-4 w-4 mr-1" />Stall
                        </Button>
                      </div>
                    )}
                    {(q.recipient_response === "accepted" || pendingIds[q.id] === "accepted") && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setOpenNegotiationFor(openNegotiationFor === q.id ? null : q.id)}
                      >
                        {openNegotiationFor === q.id ? "Hide Schedule" : "Negotiate Schedule"}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {quotes
        .filter((quote) => quote.recipient_response === "accepted" && openNegotiationFor === quote.id)
        .map((quote) => (
          <QuoteScheduleNegotiation key={quote.id} quoteId={quote.id} contractorId={quote.contractor_id} mode="recipient" />
        ))}

      {/* Deposit payment dialog */}
      {depositDialog.quote && (
        <DepositPaymentDialog
          quoteId={depositDialog.quote.id}
          totalAmount={Number(depositDialog.quote.total)}
          depositAmount={
            (depositDialog.quote as any).deposit_amount
              ? Number((depositDialog.quote as any).deposit_amount)
              : undefined
          }
          contractorName={depositDialog.quote.contractor_name ?? "Contractor"}
          open={depositDialog.open}
          onClose={() => setDepositDialog({ open: false, quote: null })}
          onSuccess={() => {
            if (depositDialog.quote) handleDepositSuccess(depositDialog.quote);
            setDepositDialog({ open: false, quote: null });
          }}
        />
      )}

      {messageDialog.quote && (
        <MessageDialog
          open={messageDialog.open}
          onClose={() => setMessageDialog({ open: false, quote: null, action: "" })}
          contractorId={messageDialog.quote.contractor_id}
          subject={`Quote ${messageDialog.quote.quote_number || messageDialog.quote.id} - ${
            messageDialog.action === "accepted" ? "Accepted - Let's Schedule" : "Stalled - Discussion Needed"
          }`}
          contextType="quote"
          contextId={messageDialog.quote.id}
        />
      )}
    </div>
  );
}
