import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2 } from "lucide-react";

const REASON_OPTIONS: { value: string; label: string }[] = [
  { value: "price", label: "Price" },
  { value: "timing", label: "Timing didn't work" },
  { value: "went_elsewhere", label: "Went with someone else" },
  { value: "changed_mind", label: "Changed my mind about the job" },
];

interface DeclineQuoteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractorName?: string | null;
  onConfirm: (reasonCode: string | null, reasonNote: string | null) => Promise<void>;
}

/**
 * Optional, not required — a forced picker on an already awkward action
 * produces nothing but five-first-option noise. "Prefer not to say" skips
 * the reason entirely (NULL, not an empty string). The note gets its own
 * notice directly above the field: people write differently once they
 * know a person reads it, and the contractor does.
 */
export function DeclineQuoteDialog({ open, onOpenChange, contractorName, onConfirm }: DeclineQuoteDialogProps) {
  const [reason, setReason] = useState<string>("skip");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setReason("skip");
      setNote("");
      setSubmitting(false);
    }
  }, [open]);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await onConfirm(reason === "skip" ? null : reason, note.trim() || null);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Decline this quote?</DialogTitle>
          <DialogDescription>
            {contractorName ? `${contractorName} will be notified.` : "The contractor will be notified."} Letting them know why is optional.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <RadioGroup value={reason} onValueChange={setReason} className="space-y-2">
            {REASON_OPTIONS.map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 text-sm border rounded-md p-2.5 cursor-pointer">
                <RadioGroupItem value={opt.value} />
                {opt.label}
              </label>
            ))}
            <label className="flex items-center gap-2 text-sm border rounded-md p-2.5 cursor-pointer text-muted-foreground">
              <RadioGroupItem value="skip" />
              Prefer not to say
            </label>
          </RadioGroup>

          <div className="space-y-1.5">
            <Label htmlFor="decline-note" className="text-xs text-muted-foreground">
              The contractor will see this note.
            </Label>
            <Textarea
              id="decline-note"
              placeholder="Optional — add anything you'd like them to know"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="min-h-20"
            />
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={handleConfirm} disabled={submitting} className="flex-1">
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Decline quote
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
