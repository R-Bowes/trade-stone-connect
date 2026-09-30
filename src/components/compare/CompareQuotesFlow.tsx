import { useEffect, useState } from "react";
import { useCompareShortlist } from "@/lib/compareShortlist";
import { ShortlistConfirmation } from "./ShortlistConfirmation";
import { CompareQuoteRequestDialog } from "./CompareQuoteRequestDialog";

interface CompareQuotesFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source?: "marketplace" | "direct" | "panel";
}

/**
 * Shortlist confirmation, then the job-details form — in that order,
 * deliberately. Shared by both entry points (the directory's selection
 * bar and a contractor profile's "Add to comparison" button) so the two
 * steps and the shortlist-clearing-on-send behaviour exist in one place.
 */
export function CompareQuotesFlow({ open, onOpenChange, source }: CompareQuotesFlowProps) {
  const { shortlist, remove, clear } = useCompareShortlist();
  const [step, setStep] = useState<"confirm" | "form">("confirm");

  useEffect(() => {
    if (open) setStep("confirm");
  }, [open]);

  if (!open) return null;

  if (step === "confirm") {
    return (
      <ShortlistConfirmation
        open
        onOpenChange={onOpenChange}
        shortlist={shortlist}
        onRemove={remove}
        onContinue={() => setStep("form")}
      />
    );
  }

  return (
    <CompareQuoteRequestDialog
      isOpen
      onClose={() => onOpenChange(false)}
      shortlist={shortlist}
      source={source}
      onSent={() => {
        clear();
        onOpenChange(false);
      }}
    />
  );
}
