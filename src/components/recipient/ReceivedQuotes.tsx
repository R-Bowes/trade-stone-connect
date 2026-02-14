import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, CheckCircle, XCircle, Pause, Loader2 } from "lucide-react";
import { useReceivedQuotes, type ReceivedQuote } from "@/hooks/useReceivedQuotes";
import { MessageDialog } from "./MessageDialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

export function ReceivedQuotes() {
  const { quotes, loading, respondToQuote } = useReceivedQuotes();
  const [messageDialog, setMessageDialog] = useState<{ open: boolean; quote: ReceivedQuote | null; action: string }>({
    open: false, quote: null, action: "",
  });
  const { toast } = useToast();

  const handleAccept = async (quote: ReceivedQuote) => {
    await respondToQuote(quote.id, "accepted");
    await supabase.functions.invoke("notify-invoice-quote-action", {
      body: { action_type: "accept", context_type: "quote", context_id: quote.id },
    }).catch(console.error);
    // Open message dialog for scheduling discussion
    setMessageDialog({ open: true, quote, action: "accepted" });
  };

  const handleReject = async (quote: ReceivedQuote) => {
    await respondToQuote(quote.id, "rejected");
    await supabase.functions.invoke("notify-invoice-quote-action", {
      body: { action_type: "reject", context_type: "quote", context_id: quote.id },
    }).catch(console.error);
    toast({ title: "Quote Rejected", description: "The contractor has been notified." });
  };

  const handleStall = async (quote: ReceivedQuote) => {
    await respondToQuote(quote.id, "stalled");
    await supabase.functions.invoke("notify-invoice-quote-action", {
      body: { action_type: "stall", context_type: "quote", context_id: quote.id },
    }).catch(console.error);
    setMessageDialog({ open: true, quote, action: "stalled" });
  };

  const getResponseBadge = (quote: ReceivedQuote) => {
    if (quote.recipient_response === "accepted") return <Badge className="bg-green-100 text-green-800">Accepted</Badge>;
    if (quote.recipient_response === "rejected") return <Badge className="bg-red-100 text-red-800">Rejected</Badge>;
    if (quote.recipient_response === "stalled") return <Badge className="bg-yellow-100 text-yellow-800">Stalled</Badge>;
    return <Badge variant="outline">Pending</Badge>;
  };

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
                  <TableCell>{q.title}</TableCell>
                  <TableCell>{format(new Date(q.valid_until), "dd MMM yyyy")}</TableCell>
                  <TableCell className="text-right font-bold">£{Number(q.total).toFixed(2)}</TableCell>
                  <TableCell>{getResponseBadge(q)}</TableCell>
                  <TableCell className="text-right">
                    {!q.recipient_response && (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" onClick={() => handleAccept(q)}>
                          <CheckCircle className="h-4 w-4 mr-1" />Accept
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => handleReject(q)}>
                          <XCircle className="h-4 w-4 mr-1" />Reject
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleStall(q)}>
                          <Pause className="h-4 w-4 mr-1" />Stall
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {messageDialog.quote && (
        <MessageDialog
          open={messageDialog.open}
          onClose={() => setMessageDialog({ open: false, quote: null, action: "" })}
          contractorId={messageDialog.quote.contractor_id}
          subject={`Quote ${messageDialog.quote.quote_number || messageDialog.quote.id} - ${messageDialog.action === "accepted" ? "Accepted - Let's Schedule" : "Stalled - Discussion Needed"}`}
          contextType="quote"
          contextId={messageDialog.quote.id}
        />
      )}
    </div>
  );
}
