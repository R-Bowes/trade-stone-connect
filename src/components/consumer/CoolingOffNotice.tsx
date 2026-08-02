import { useState } from "react";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { useCoolingOff } from "@/hooks/useCoolingOff";

interface CoolingOffNoticeProps {
  open: boolean;
  onClose: () => void;
  coolingOffRecordId: string;
  coolingOffEnd: string;
}

/**
 * Legally prescribed cancellation-rights notice (Consumer Contracts
 * Regulations 2013). Shown once after a homeowner accepts a quote. Wording
 * is prescribed — do not casually reword. Can be closed without giving
 * early-start consent (the consumer simply waits out the 14 days); the
 * prescribed information itself is not skippable content, but consent is
 * optional.
 */
export function CoolingOffNotice({ open, onClose, coolingOffRecordId, coolingOffEnd }: CoolingOffNoticeProps) {
  const { giveEarlyStartConsent } = useCoolingOff();
  const [consentChecked, setConsentChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const endDateFormatted = format(new Date(coolingOffEnd), "d MMMM yyyy");

  const handleConfirm = async () => {
    if (consentChecked) {
      setSubmitting(true);
      try {
        await giveEarlyStartConsent(coolingOffRecordId);
      } finally {
        setSubmitting(false);
      }
    }
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Your Cancellation Rights</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm text-muted-foreground">
          <p>
            Under the Consumer Contracts Regulations 2013, you have the right to cancel this contract within{" "}
            <strong className="text-foreground">14 days</strong> without giving any reason.
          </p>

          <p>
            The cancellation period will expire 14 days from today,{" "}
            <strong className="text-foreground">{endDateFormatted}</strong>.
          </p>

          <p>
            To exercise your right to cancel, you must inform us by a clear statement. You can do this through
            TradeStone by clicking "Cancel within cooling-off period" on your job details, or by contacting
            TradeStone at{" "}
            <a href="mailto:support@tradesltd.co.uk" className="text-[#f07820] underline">
              support@tradesltd.co.uk
            </a>.
          </p>

          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-2">
            <p className="font-medium text-foreground">Starting work before the cooling-off period ends</p>
            <p>
              If you would like the contractor to begin work before the 14-day period expires, you must give your
              explicit consent below. By doing so, you acknowledge that:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>You are requesting that work begins during the cooling-off period</li>
              <li>If work is completed before the end of the cooling-off period, you will lose your right to cancel</li>
              <li>
                If you cancel after work has begun but before completion, you will be liable for a proportionate
                amount for the work already carried out
              </li>
            </ul>

            <label className="flex items-start gap-2 pt-2 cursor-pointer">
              <Checkbox
                checked={consentChecked}
                onCheckedChange={(checked) => setConsentChecked(checked === true)}
                className="mt-0.5"
              />
              <span className="text-foreground">
                I consent to work beginning before the end of the cooling-off period and I acknowledge that I may
                lose my right to cancel.
              </span>
            </label>
          </div>
        </div>

        <Button
          className="w-full text-white font-semibold"
          style={{ backgroundColor: "#f07820" }}
          onClick={handleConfirm}
          disabled={submitting}
        >
          {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
          Confirm & Continue
        </Button>
      </DialogContent>
    </Dialog>
  );
}
