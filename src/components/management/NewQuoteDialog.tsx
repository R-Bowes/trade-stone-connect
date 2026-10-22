import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CustomerPickerField, type PickedCustomer } from "@/components/shared/CustomerPicker";
import type { DirectQuoteRecipient } from "@/components/management/SendQuoteDialog";

interface NewQuoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Step 2: the quote form, for the confirmed customer. */
  onContinue: (recipient: DirectQuoteRecipient) => void;
}

/**
 * Step 1 of a quote with no enquiry: the customer's exact TS-P code. The
 * name shown to confirm is the one search_customers returns — masked
 * ("Sarah J.") unless the customer already has a relationship with you.
 * Business and contractor codes are refused here and by the database.
 */
export function NewQuoteDialog({ open, onOpenChange, onContinue }: NewQuoteDialogProps) {
  const [picked, setPicked] = useState<PickedCustomer | null>(null);

  useEffect(() => {
    if (!open) setPicked(null);
  }, [open]);

  const customer = picked?.kind === "on_platform" ? picked.result : null;

  const handleContinue = () => {
    if (!customer) return;
    onContinue({
      profileId: customer.profile_id,
      displayName: customer.display_name ?? "TradeStone customer",
      tsCode: customer.ts_code,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New quote</DialogTitle>
          <DialogDescription>
            Enter the customer's TS-P code. They can find it in their TradeStone account.
          </DialogDescription>
        </DialogHeader>

        <CustomerPickerField
          picked={picked}
          onPick={setPicked}
          onClear={() => setPicked(null)}
          mode="ts_p_code"
        />

        {customer && (
          <p className="text-sm text-muted-foreground">
            Check this is the right person before you continue.
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" onClick={handleContinue} disabled={!customer}>Continue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
