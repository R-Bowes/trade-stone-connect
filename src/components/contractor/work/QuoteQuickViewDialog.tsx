import { useEffect, useState } from "react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { formatQuoteRef } from "@/lib/documentRefs";

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

interface QuoteDetail {
  id: string;
  quote_number: number;
  version: number;
  title: string;
  client_name: string;
  status: string;
  total: number;
  subtotal: number;
  tax_amount: number;
  tax_rate: number;
  items: LineItem[];
  sent_at: string | null;
  responded_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
}

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  sent: "bg-blue-100 text-blue-800",
  accepted: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  expired: "bg-amber-100 text-amber-800",
  superseded: "bg-gray-100 text-gray-400",
};

function fmtMoney(n: number): string {
  return `£${Number(n).toFixed(2)}`;
}

export function QuoteQuickViewDialog({
  quoteId,
  open,
  onClose,
}: {
  quoteId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const [quote, setQuote] = useState<QuoteDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open || !quoteId) return;
    setLoading(true);
    supabase
      .from("issued_quotes")
      .select("id, quote_number, version, title, client_name, status, total, subtotal, tax_amount, tax_rate, items, sent_at, responded_at, accepted_at, rejected_at")
      .eq("id", quoteId)
      .single()
      .then(({ data }) => {
        if (data) {
          setQuote({
            ...data,
            items: Array.isArray(data.items) ? (data.items as unknown as LineItem[]) : [],
          } as QuoteDetail);
        }
        setLoading(false);
      });
  }, [open, quoteId]);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        {loading || !quote ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-mono text-xs text-muted-foreground mb-1">
                    {formatQuoteRef(quote.quote_number, { version: quote.version > 1 ? quote.version : undefined })}
                  </p>
                  <DialogTitle className="text-lg leading-tight">{quote.title}</DialogTitle>
                </div>
                <Badge className={STATUS_BADGE[quote.status] ?? "bg-gray-100 text-gray-700"}>{quote.status}</Badge>
              </div>
            </DialogHeader>

            <div className="space-y-4 mt-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground w-20 shrink-0">Client</span>
                <span className="font-medium">{quote.client_name}</span>
              </div>

              <table className="w-full text-sm">
                <tbody>
                  {quote.items.map((item, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="py-1.5">{item.description}</td>
                      <td className="py-1.5 text-right font-mono w-24">{fmtMoney(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="space-y-1">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span><span className="font-mono">{fmtMoney(quote.subtotal)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>VAT ({quote.tax_rate}%)</span><span className="font-mono">{fmtMoney(quote.tax_amount)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-semibold">
                  <span>Total</span><span className="font-mono">{fmtMoney(quote.total)}</span>
                </div>
              </div>

              <div className="space-y-0.5 text-xs text-muted-foreground">
                {quote.sent_at && <div>Sent: {format(new Date(quote.sent_at), "d MMM yyyy")}</div>}
                {quote.responded_at && <div>Responded: {format(new Date(quote.responded_at), "d MMM yyyy")}</div>}
                {quote.accepted_at && <div>Accepted: {format(new Date(quote.accepted_at), "d MMM yyyy")}</div>}
                {quote.rejected_at && <div>Declined: {format(new Date(quote.rejected_at), "d MMM yyyy")}</div>}
              </div>

              <div className="flex justify-end pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { onClose(); navigate("/dashboard/contractor?view=issued-quotes"); }}
                >
                  Manage in Issued Quotes
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
