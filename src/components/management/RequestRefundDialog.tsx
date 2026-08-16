import { useEffect, useState } from "react";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Invoice } from "@/hooks/useInvoices";
import { format } from "date-fns";

// Mirrors the refunds.reason CHECK constraint in
// supabase/migrations/20260807240000_refunds_table.sql — do not add a value
// here that isn't in that constraint, the RPC will just reject it.
const REFUND_REASONS: { value: string; label: string }[] = [
  { value: "cooling_off_cancellation", label: "Cooling-off cancellation" },
  { value: "work_not_completed", label: "Work not completed" },
  { value: "work_defective", label: "Work defective" },
  { value: "overpayment", label: "Overpayment" },
  { value: "duplicate_payment", label: "Duplicate payment" },
  { value: "goodwill", label: "Goodwill" },
  { value: "other", label: "Other" },
];

type PaymentRow = {
  id: string;
  amount: number;
  refunded_amount: number;
  stripe_payment_intent_id: string | null;
  type: string | null;
  created_at: string | null;
};

type Props = {
  open: boolean;
  invoice: Invoice | null;
  onClose: () => void;
};

export function RequestRefundDialog({ open, invoice, onClose }: Props) {
  const { toast } = useToast();
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [selectedPaymentId, setSelectedPaymentId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState<string>("work_not_completed");
  const [reasonDetail, setReasonDetail] = useState("");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open || !invoice) return;
    setLoadingPayments(true);
    setPayments([]);
    setSelectedPaymentId("");
    setAmount("");
    setAmountError(null);
    setReason("work_not_completed");
    setReasonDetail("");

    supabase
      .from("payments")
      .select("id, amount, refunded_amount, stripe_payment_intent_id, type, created_at")
      .eq("invoice_id", invoice.id)
      .then(({ data, error }) => {
        setLoadingPayments(false);
        if (error) {
          toast({ title: "Error", description: "Failed to load payments for this invoice", variant: "destructive" });
          return;
        }
        const rows = (data || []) as PaymentRow[];
        setPayments(rows);
        if (rows.length === 1) {
          setSelectedPaymentId(rows[0].id);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoice]);

  const selectedPayment = payments.find(p => p.id === selectedPaymentId) || null;
  const maxRefundable = selectedPayment
    ? Number(selectedPayment.amount) - Number(selectedPayment.refunded_amount)
    : 0;

  useEffect(() => {
    if (selectedPayment) {
      setAmount(maxRefundable > 0 ? maxRefundable.toFixed(2) : "");
      setAmountError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPaymentId]);

  if (!invoice) return null;

  const refundablePayments = payments.filter(p => !!p.stripe_payment_intent_id);
  const hasNoRefundablePayment = !loadingPayments && refundablePayments.length === 0;

  const validateAmount = (value: string): number | null => {
    const num = parseFloat(value);
    if (Number.isNaN(num) || num <= 0) {
      setAmountError("Enter an amount greater than £0.00");
      return null;
    }
    if (num > maxRefundable) {
      setAmountError(`Amount cannot exceed the refundable balance of £${maxRefundable.toFixed(2)}`);
      return null;
    }
    setAmountError(null);
    return num;
  };

  const handleSubmit = async () => {
    if (!selectedPayment) {
      setAmountError("Select which payment to refund");
      return;
    }
    const amountNum = validateAmount(amount);
    if (amountNum === null) return;

    setSubmitting(true);
    const { error } = await supabase.rpc("request_refund", {
      p_payment_id: selectedPayment.id,
      p_amount: amountNum,
      p_reason: reason,
      p_reason_detail: reasonDetail || null,
    });
    setSubmitting(false);

    if (error) {
      toast({ title: "Refund request failed", description: error.message, variant: "destructive" });
      return;
    }

    toast({
      title: "Refund request submitted",
      description: "Sent for TradeStone review — no money moves until it is approved.",
    });
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Request Refund</DialogTitle>
          <DialogDescription>
            Request a refund on a payment for this invoice. TradeStone reviews every request before any money moves.
          </DialogDescription>
        </DialogHeader>

        {loadingPayments ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading payments…
          </div>
        ) : payments.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">
            No online payment was found for this invoice, so there is nothing to refund here. It may have been
            recorded manually via Record Payment.
          </p>
        ) : hasNoRefundablePayment ? (
          <p className="text-sm text-muted-foreground py-2">
            This invoice has no online payment to refund — it may have been recorded manually via Record Payment.
          </p>
        ) : (
          <div className="space-y-4">
            {refundablePayments.length > 1 ? (
              <div className="space-y-2">
                <Label>Which payment?</Label>
                <RadioGroup value={selectedPaymentId} onValueChange={setSelectedPaymentId}>
                  {refundablePayments.map(p => {
                    const remaining = Number(p.amount) - Number(p.refunded_amount);
                    return (
                      <div key={p.id} className="flex items-start gap-2 rounded-md border p-3">
                        <RadioGroupItem value={p.id} id={`payment-${p.id}`} className="mt-1" />
                        <Label htmlFor={`payment-${p.id}`} className="font-normal cursor-pointer flex-1">
                          <div className="flex justify-between">
                            <span className="capitalize">{p.type || "Payment"}</span>
                            <span className="font-medium">£{Number(p.amount).toFixed(2)}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {p.created_at ? format(new Date(p.created_at), "dd MMM yyyy") : "—"}
                            {remaining < Number(p.amount) && ` · £${remaining.toFixed(2)} refundable`}
                          </div>
                        </Label>
                      </div>
                    );
                  })}
                </RadioGroup>
              </div>
            ) : null}

            {selectedPayment && (
              <>
                <div className="space-y-2">
                  <Label>Refund amount (£)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max={maxRefundable}
                    value={amount}
                    onChange={(e) => { setAmount(e.target.value); validateAmount(e.target.value); }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Maximum refundable: £{maxRefundable.toFixed(2)}
                  </p>
                  {amountError && <p className="text-xs text-destructive">{amountError}</p>}
                </div>

                <div className="space-y-2">
                  <Label>Reason</Label>
                  <Select value={reason} onValueChange={setReason}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {REFUND_REASONS.map(r => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Detail (optional)</Label>
                  <Textarea
                    value={reasonDetail}
                    onChange={(e) => setReasonDetail(e.target.value)}
                    placeholder="Any further detail for the reviewing admin…"
                  />
                </div>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          {!hasNoRefundablePayment && payments.length > 0 && (
            <Button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !selectedPayment || !!amountError}
            >
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Submit Request
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}