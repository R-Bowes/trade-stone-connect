import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { formatQuoteRef } from "@/lib/documentRefs";

export interface ThreadQuoteVersion {
  id: string;
  version: number;
  status: string;
  created_at: string;
}

export interface ThreadQuote {
  id: string;
  quote_number: number;
  version: number;
  title: string;
  status: string;
  total: number;
  subtotal: number;
  tax_amount: number;
  tax_rate: number;
  items: { description: string; quantity: number; unit_price: number; total: number }[];
  sent_at: string | null;
  responded_at: string | null;
  accepted_at: string | null;
  rejected_at: string | null;
  deposit_required: boolean | null;
  deposit_amount: number | null;
}

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  sent: "bg-blue-100 text-blue-800",
  accepted: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  expired: "bg-amber-100 text-amber-800",
  superseded: "bg-gray-100 text-gray-400",
  lapsed: "bg-gray-100 text-gray-400",
};

function fmtMoney(n: number): string {
  return `£${Number(n).toFixed(2)}`;
}

export function ThreadQuoteSection({
  quote,
  versions,
}: {
  quote: ThreadQuote;
  versions: ThreadQuoteVersion[];
}) {
  const navigate = useNavigate();

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Quote</h3>
        <Badge className={STATUS_BADGE[quote.status] ?? "bg-gray-100 text-gray-700"}>{quote.status}</Badge>
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

      <div className="space-y-1 text-sm">
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

      {quote.deposit_required && quote.deposit_amount != null && (
        <div className="text-sm bg-muted/40 rounded p-2">
          <span className="text-muted-foreground">Deposit required: </span>
          <span className="font-mono font-semibold">{fmtMoney(quote.deposit_amount)}</span>
        </div>
      )}

      <div className="space-y-0.5 text-xs text-muted-foreground">
        {quote.sent_at && <div>Sent: {format(new Date(quote.sent_at), "d MMM yyyy")}</div>}
        {quote.responded_at && <div>Responded: {format(new Date(quote.responded_at), "d MMM yyyy")}</div>}
        {quote.accepted_at && <div>Accepted: {format(new Date(quote.accepted_at), "d MMM yyyy")}</div>}
        {quote.rejected_at && <div>Declined: {format(new Date(quote.rejected_at), "d MMM yyyy")}</div>}
      </div>

      {versions.length > 1 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Version history</p>
          {versions.map((v) => (
            <div
              key={v.id}
              className={`flex items-center justify-between text-xs px-2 py-1 rounded ${v.id === quote.id ? "bg-muted font-medium" : ""}`}
            >
              <span className="font-mono">{formatQuoteRef(quote.quote_number, { version: v.version })}</span>
              <Badge className={`text-[10px] py-0 px-1.5 ${STATUS_BADGE[v.status] ?? "bg-gray-100"}`}>{v.status}</Badge>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end pt-2 border-t">
        <Button variant="outline" size="sm" onClick={() => navigate("/dashboard/contractor?view=issued-quotes")}>
          {quote.status === "sent" || quote.status === "rejected" ? "Revise in Issued Quotes" : "Manage in Issued Quotes"}
        </Button>
      </div>
    </div>
  );
}
