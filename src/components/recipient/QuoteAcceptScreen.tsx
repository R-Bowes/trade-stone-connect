import { useState } from "react";
import { format } from "date-fns";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useQuoteScheduling } from "@/hooks/useQuoteScheduling";
import { useToast } from "@/hooks/use-toast";
import { confirmQuoteSlot } from "@/lib/confirmQuoteSlot";
import { DepositPaymentDialog } from "./DepositPaymentDialog";

interface QuoteAcceptScreenProps {
  quoteId: string;
  contractorId: string;
  quoteTotal: number;
  quoteDepositAmount: number | null;
  contractorName: string;
  onNoneWork: () => void;
  onConfirmed: () => void;
}

/**
 * D4 — one screen: current-cycle proposed slots as a radio pick + total/
 * deposit summary + single CTA. This is the atomic first-interaction accept
 * (quote-accept + slot-pick collapsed into one click) — calls accept-quote
 * directly with { quote_id, event_id }. "None of these work" hands off to
 * the existing QuoteScheduleNegotiation for counter-proposals; this screen
 * does not reimplement negotiation itself.
 */
export function QuoteAcceptScreen({
  quoteId,
  contractorId,
  quoteTotal,
  quoteDepositAmount,
  contractorName,
  onNoneWork,
  onConfirmed,
}: QuoteAcceptScreenProps) {
  const { pendingFromOther, loading } = useQuoteScheduling(quoteId, contractorId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [depositEventId, setDepositEventId] = useState<string | null>(null);
  const { toast } = useToast();

  const hasDeposit = quoteDepositAmount != null && quoteDepositAmount > 0;

  const getAmPmLabel = (startIso: string) => {
    const h = new Date(startIso).getHours();
    if (h === 9) return "Morning (AM)";
    if (h === 13) return "Afternoon (PM)";
    return format(new Date(startIso), "p");
  };

  const handleConfirm = async () => {
    if (!selectedId) return;

    if (hasDeposit) {
      // DepositPaymentDialog is the sole caller of accept-quote for the
      // deposit branch — opening it here avoids calling the edge function
      // twice (which would create a duplicate invoice/PaymentIntent).
      setDepositEventId(selectedId);
      return;
    }

    setSubmitting(true);
    try {
      // No deposit due — mint_job_from_quote runs inside the RPC and the
      // jobs-insert trigger (block_date_on_job_confirmed) blocks the
      // contractor's calendar server-side; nothing to do here.
      await confirmQuoteSlot(quoteId, selectedId);
      toast({ title: "Job confirmed", description: "Your job has been scheduled." });
      onConfirmed();
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Could not confirm this date",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading available dates...
      </div>
    );
  }

  if (pendingFromOther.length === 0) {
    return (
      <div className="space-y-3 py-2">
        <p className="text-sm text-muted-foreground">
          No open dates from {contractorName} right now — message them to agree a date.
        </p>
        <Button variant="outline" size="sm" onClick={onNoneWork}>Agree a date</Button>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="space-y-2">
          <p className="text-sm font-medium">Pick a date for the job:</p>
          <div className="space-y-2">
            {pendingFromOther.map((p) => (
              <label
                key={p.id}
                className={`flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                  selectedId === p.id ? "border-[#f07820] bg-orange-50" : "hover:border-muted-foreground/40"
                }`}
              >
                <input
                  type="radio"
                  name="accept-screen-slot"
                  className="h-4 w-4"
                  checked={selectedId === p.id}
                  onChange={() => setSelectedId(p.id)}
                />
                <span className="text-sm font-medium">
                  {format(new Date(p.start_time), "EEE d MMM yyyy")} · {getAmPmLabel(p.start_time)}
                </span>
              </label>
            ))}
          </div>
        </div>

        <Separator />

        <div className="rounded-lg bg-muted/40 p-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total job value</span>
            <span className="font-medium">£{quoteTotal.toFixed(2)}</span>
          </div>
          {hasDeposit && (
            <div className="flex justify-between font-semibold" style={{ color: "#f07820" }}>
              <span>Deposit due to confirm</span>
              <span>£{quoteDepositAmount!.toFixed(2)}</span>
            </div>
          )}
        </div>

        <Button
          className="w-full text-white font-semibold"
          style={{ backgroundColor: "#f07820" }}
          disabled={!selectedId || submitting}
          onClick={handleConfirm}
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <CheckCircle2 className="h-4 w-4 mr-2" />
          )}
          {hasDeposit ? `Accept & Pay £${quoteDepositAmount!.toFixed(2)} Deposit` : "Accept & Confirm Job"}
        </Button>

        <Button variant="outline" size="sm" className="w-full" onClick={onNoneWork} disabled={submitting}>
          None of these work
        </Button>
      </div>

      {hasDeposit && depositEventId && (
        <DepositPaymentDialog
          quoteId={quoteId}
          eventId={depositEventId}
          totalAmount={quoteTotal}
          depositAmount={quoteDepositAmount!}
          contractorName={contractorName}
          open={!!depositEventId}
          onClose={() => setDepositEventId(null)}
          onSuccess={() => {
            setDepositEventId(null);
            onConfirmed();
          }}
        />
      )}
    </>
  );
}
