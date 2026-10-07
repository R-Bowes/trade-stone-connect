import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import type { Invoice } from "@/hooks/useInvoices";
import { formatInvoiceRef } from "@/lib/documentRefs";

type Props = {
  open: boolean;
  invoice: Invoice | null;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
};

// A sent invoice is never edited: it is voided with a reason and replaced
// by a new one. Voiding cancels any open card payment on the invoice first
// (void-invoice edge function), and is refused once money has been paid.
export function VoidInvoiceDialog({ open, invoice, onClose, onConfirm }: Props) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setReason("");
  }, [open, invoice]);

  if (!invoice) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;
    setSaving(true);
    try {
      await onConfirm(reason.trim());
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
          <DialogTitle>Void {formatInvoiceRef(invoice.invoice_number)}</DialogTitle>
          <DialogDescription>
            The client will no longer be able to pay this invoice. To correct it, void it and create a new one.
            An invoice that has been paid, or has a deposit paid, cannot be voided.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="void-reason">Reason</Label>
            <Textarea
              id="void-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Wrong amount — reissuing"
              maxLength={500}
              rows={3}
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="destructive" disabled={saving || !reason.trim()}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Void invoice
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
