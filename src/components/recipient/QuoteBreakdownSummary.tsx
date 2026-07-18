import { useState } from "react";
import { format } from "date-fns";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Separator } from "@/components/ui/separator";

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
  total: number;
}

interface QuoteBreakdownSummaryProps {
  items: LineItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  depositRequired?: boolean | null;
  depositAmount?: number | null;
  validUntil?: string | null;
  notes?: string | null;
  terms?: string | null;
}

const COLLAPSE_THRESHOLD = 5;

/**
 * The full commitment a client is agreeing to — line items, tax, deposit,
 * terms/notes, validity — shown on every screen that ends in the accept
 * action (QuoteAcceptScreen, QuoteScheduleNegotiation's confirm-job panel).
 * Never let a customer commit without seeing this on the same screen.
 */
export function QuoteBreakdownSummary({
  items,
  subtotal,
  taxRate,
  taxAmount,
  total,
  depositRequired,
  depositAmount,
  validUntil,
  notes,
  terms,
}: QuoteBreakdownSummaryProps) {
  const [expanded, setExpanded] = useState(items.length <= COLLAPSE_THRESHOLD);
  const visibleItems = expanded ? items : items.slice(0, COLLAPSE_THRESHOLD);
  const fmt = (n: number) => n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <div className="rounded-lg border p-4 space-y-3 text-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground text-left">
            <th className="font-medium pb-1">Description</th>
            <th className="font-medium pb-1 text-right">Qty</th>
            <th className="font-medium pb-1 text-right">Unit</th>
            <th className="font-medium pb-1 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {visibleItems.map((item, i) => (
            <tr key={i} className="border-t border-border/40">
              <td className="py-1.5 pr-2">{item.description}</td>
              <td className="py-1.5 text-right">{item.quantity}</td>
              <td className="py-1.5 text-right">£{fmt(item.unit_price)}</td>
              <td className="py-1.5 text-right font-medium">£{fmt(item.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {items.length > COLLAPSE_THRESHOLD && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
        >
          {expanded ? (
            <><ChevronUp className="h-3 w-3" />Show fewer items</>
          ) : (
            <><ChevronDown className="h-3 w-3" />Show all {items.length} items</>
          )}
        </button>
      )}

      <Separator />

      <div className="space-y-1">
        <div className="flex justify-between text-muted-foreground">
          <span>Subtotal</span>
          <span>£{fmt(subtotal)}</span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span>Tax ({taxRate}%)</span>
          <span>£{fmt(taxAmount)}</span>
        </div>
        <div className="flex justify-between font-semibold border-t pt-1">
          <span>Total</span>
          <span>£{fmt(total)}</span>
        </div>
        {depositRequired && depositAmount != null && depositAmount > 0 && (
          <div className="flex justify-between font-medium" style={{ color: "#f07820" }}>
            <span>Deposit due to confirm</span>
            <span>£{fmt(depositAmount)}</span>
          </div>
        )}
      </div>

      {validUntil && (
        <p className="text-xs text-muted-foreground">
          Valid until {format(new Date(validUntil), "d MMM yyyy")}
        </p>
      )}

      {terms && (
        <div className="pt-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Terms</p>
          <p className="text-sm whitespace-pre-wrap">{terms}</p>
        </div>
      )}

      {notes && (
        <div className="pt-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notes</p>
          <p className="text-sm whitespace-pre-wrap">{notes}</p>
        </div>
      )}
    </div>
  );
}
