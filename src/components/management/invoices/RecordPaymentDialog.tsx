import { useState, useEffect } from "react";
import { format } from "date-fns";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import type { Invoice, ManualPaymentMethod } from "@/hooks/useInvoices";
import { amountOutstanding } from "@/lib/invoiceMoney";

const PAYMENT_METHODS: { value: ManualPaymentMethod; label: string }[] = [
  { value: "bank_transfer", label: "Bank Transfer (BACS)" },
  { value: "cash", label: "Cash" },
  { value: "cheque", label: "Cheque" },
  { value: "other", label: "Other" },
];

type Props = {
  open: boolean;
  invoice: Invoice | null;
  onClose: () => void;
  /** Receives the payment's notes; the server records the amount itself. */
  onConfirm: (notes: string) => Promise<void>;
};

// One "Record payment" action for money received outside TradeStone. The
// amount is not entered: record_manual_payment records whatever is still
// payable on the invoice (total less any deposit already paid). The date,
// method and reference are kept on the payment as its notes.
export function RecordPaymentDialog({ open, invoice, onClose, onConfirm }: Props) {
  const [receivedDate, setReceivedDate] = useState(new Date().toISOString().split("T")[0]);
  const [method, setMethod] = useState<ManualPaymentMethod>("bank_transfer");
  const [reference, setReference] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && invoice) {
      setReceivedDate(new Date().toISOString().split("T")[0]);
      setMethod("bank_transfer");
      setReference("");
    }
  }, [open, invoice]);

  if (!invoice) return null;

  const payable = amountOutstanding(invoice);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const methodLabel = PAYMENT_METHODS.find((m) => m.value === method)?.label ?? "Other";
    const received = receivedDate ? `received ${format(new Date(receivedDate), "d MMM yyyy")}` : null;
    const notes = [methodLabel, received, reference.trim() ? `Ref: ${reference.trim()}` : null]
      .filter(Boolean)
      .join(" — ");

    setSaving(true);
    try {
      await onConfirm(notes);
      onClose();
    } catch {
      // error toast handled by the hook
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription>
            Record a payment for this invoice that happened outside TradeStone (bank transfer, cash, cheque).
            The invoice will be marked as paid.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-md border bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">Amount to be recorded</p>
            <p className="text-lg font-semibold font-mono">
              £{payable.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
            <p className="text-xs text-muted-foreground">The full amount still payable on this invoice.</p>
          </div>

          <div className="space-y-2">
            <Label>Date received</Label>
            <Input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} required />
          </div>

          <div className="space-y-2">
            <Label>Payment method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as ManualPaymentMethod)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Reference (optional)</Label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. bank transfer reference"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Record Payment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
