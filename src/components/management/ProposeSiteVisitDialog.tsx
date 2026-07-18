import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { SlotPicker, type PickedSlot } from "@/components/recipient/SlotPicker";

type Enquiry = {
  id: string;
  contractor_id: string | null;
  job_description: string;
  location: string;
  preferred_time_of_day?: string | null;
  preferred_window_start?: string | null;
};

interface ProposeSiteVisitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enquiry: Enquiry;
  onSuccess?: () => void;
}

/**
 * D2's "Propose site visit" move — LOCKED DECISION 2: site visits are
 * schedule_events rows (event_type='site_visit') hanging off enquiry_id,
 * same propose/confirm mechanic as quote scheduling, no payment leg, no
 * availability auto-block. This dialog only creates the proposal batch;
 * confirming a slot is out of scope for this slice.
 */
export function ProposeSiteVisitDialog({ open, onOpenChange, enquiry, onSuccess }: ProposeSiteVisitDialogProps) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);

  const contractorId = enquiry.contractor_id;

  const handleSubmit = async (slots: PickedSlot[]) => {
    if (!contractorId || slots.length === 0) return;
    setSubmitting(true);
    try {
      const batchId = crypto.randomUUID();
      const rows = slots.map((slot) => ({
        contractor_id: contractorId,
        enquiry_id: enquiry.id,
        quote_id: null,
        title: "Site visit proposal",
        description: null,
        event_type: "site_visit",
        start_time: slot.startTime,
        end_time: slot.endTime,
        status: "proposed",
        proposed_by: contractorId,
        is_confirmed: false,
        all_day: false,
        batch_id: batchId,
      }));

      const { error } = await supabase.from("schedule_events").insert(rows);
      if (error) throw error;

      toast({
        title: "Site visit proposed",
        description: "The customer has been notified and can pick a time.",
      });
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to propose site visit:", error);
      toast({
        title: "Could not propose a site visit",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Propose a site visit</DialogTitle>
          <DialogDescription>
            Offer up to 5 dates for a site visit before quoting.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md bg-muted p-4 space-y-2 text-sm">
          <p className="text-muted-foreground line-clamp-3">{enquiry.job_description}</p>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" />{enquiry.location}
          </span>
        </div>

        {contractorId ? (
          <SlotPicker
            contractorId={contractorId}
            maxSlots={5}
            helperText="Select up to 5 slots — the customer will pick one."
            submitLabel={(count) => (submitting ? "Sending…" : `Propose ${count} date${count !== 1 ? "s" : ""}`)}
            onSubmit={handleSubmit}
            preferredTimeOfDay={enquiry.preferred_time_of_day}
            preferredWindowStart={enquiry.preferred_window_start}
          />
        ) : (
          <p className="text-sm text-destructive">Contractor profile not found for this enquiry.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
