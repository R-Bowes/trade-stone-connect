import { useState } from "react";
import { format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, ShieldCheck } from "lucide-react";
import { useCoolingOff, type CoolingOffRecord } from "@/hooks/useCoolingOff";
import { CoolingOffNotice } from "./CoolingOffNotice";

interface CoolingOffStatusCardProps {
  record: CoolingOffRecord;
  jobStatus: string;
  onChanged: () => void;
}

const DISMISSED_KEY_PREFIX = "cooling_off_notice_dismissed_";

export function CoolingOffStatusCard({ record, jobStatus, onChanged }: CoolingOffStatusCardProps) {
  const { giveEarlyStartConsent, cancelWithinCoolingOff } = useCoolingOff();
  const [showNotice, setShowNotice] = useState(
    () => !localStorage.getItem(DISMISSED_KEY_PREFIX + record.job_id),
  );
  const [showConsentDialog, setShowConsentDialog] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const dismissNotice = () => {
    localStorage.setItem(DISMISSED_KEY_PREFIX + record.job_id, "1");
    setShowNotice(false);
    onChanged();
  };

  const endDateFormatted = format(new Date(record.cooling_off_end), "d MMMM yyyy");

  const handleGiveConsent = async () => {
    setSubmitting(true);
    try {
      await giveEarlyStartConsent(record.id);
      setShowConsentDialog(false);
      onChanged();
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    setSubmitting(true);
    try {
      await cancelWithinCoolingOff(record.id, cancelReason.trim() || undefined);
      setShowCancelDialog(false);
      onChanged();
    } finally {
      setSubmitting(false);
    }
  };

  if (record.cancelled) {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardContent className="p-4 text-sm text-green-800">
          This job was cancelled within the cooling-off period on {format(new Date(record.cancelled_at!), "d MMMM yyyy")}.
        </CardContent>
      </Card>
    );
  }

  if (record.cooling_off_elapsed) {
    return (
      <p className="text-xs text-muted-foreground">
        Cooling-off period ended {endDateFormatted}. Standard cancellation terms apply.
      </p>
    );
  }

  return (
    <>
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-blue-900 font-medium">
            <ShieldCheck className="h-4 w-4" />
            Cooling-off period — {Math.max(0, Math.ceil((new Date(record.cooling_off_end).getTime() - Date.now()) / (24 * 60 * 60 * 1000)))} days remaining
          </div>
          <p className="text-sm text-blue-800">
            You can cancel this job without reason until {endDateFormatted}.
          </p>

          {record.early_start_consent ? (
            <p className="text-xs text-blue-800">
              You consented to early commencement on {format(new Date(record.early_start_consented_at!), "d MMMM yyyy")}.
            </p>
          ) : (
            <div className="rounded-md bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 space-y-1">
              <p>
                Work should not begin until the cooling-off period expires on {endDateFormatted}, unless you consent
                to early commencement.
              </p>
              <button
                type="button"
                className="text-[#f07820] underline font-medium"
                onClick={() => setShowConsentDialog(true)}
              >
                Give consent
              </button>
            </div>
          )}

          <Button variant="outline" size="sm" onClick={() => setShowCancelDialog(true)}>
            Cancel within cooling-off period
          </Button>
        </CardContent>
      </Card>

      {showNotice && (
        <CoolingOffNotice
          open={showNotice}
          onClose={dismissNotice}
          coolingOffRecordId={record.id}
          coolingOffEnd={record.cooling_off_end}
        />
      )}

      <Dialog open={showConsentDialog} onOpenChange={setShowConsentDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Consent to early commencement</DialogTitle>
            <DialogDescription>
              By consenting, you acknowledge that if the work is completed before the cooling-off period ends you
              will lose your right to cancel, and if you cancel after work has begun you will be liable for a
              proportionate amount for work already carried out.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConsentDialog(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              className="text-white font-semibold"
              style={{ backgroundColor: "#f07820" }}
              onClick={handleGiveConsent}
              disabled={submitting}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              I consent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Are you sure you want to cancel?</DialogTitle>
            <DialogDescription>
              This is within your 14-day cooling-off period. You can cancel without reason or penalty.
              {jobStatus === "in_progress" && (
                <span className="block mt-2 text-amber-700 font-medium">
                  Work has already begun. You will be liable for a proportionate amount for work completed to date.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason (optional)"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCancelDialog(false)} disabled={submitting}>
              Back
            </Button>
            <Button variant="destructive" onClick={handleCancel} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirm Cancellation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
