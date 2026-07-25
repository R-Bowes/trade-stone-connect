import { useCallback, useEffect, useState } from "react";
import { format } from "date-fns";
import { CheckCircle2, Loader2, MapPin } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface SiteVisitReviewDialogProps {
  enquiryId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolved?: () => void;
}

type Slot = {
  id: string;
  start_time: string;
  status: string;
};

type EnquiryInfo = {
  title: string | null;
  job_description: string;
  location: string;
  contractor_id: string | null;
};

function getAmPmLabel(startIso: string): string {
  const h = new Date(startIso).getHours();
  if (h < 12) return "Morning (AM)";
  return "Afternoon (PM)";
}

export function SiteVisitReviewDialog({ enquiryId, open, onOpenChange, onResolved }: SiteVisitReviewDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [enquiry, setEnquiry] = useState<EnquiryInfo | null>(null);
  const [contractorName, setContractorName] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);

  const confirmedSlot = slots.find((s) => s.status === "accepted") ?? null;
  const pendingSlots = slots.filter((s) => s.status === "proposed");
  const allDeclined = slots.length > 0 && slots.every((s) => s.status === "declined");

  const load = useCallback(async () => {
    setLoading(true);

    const [{ data: enq }, { data: slotRows }] = await Promise.all([
      supabase
        .from("enquiries")
        .select("title, job_description, location, contractor_id")
        .eq("id", enquiryId)
        .maybeSingle(),
      supabase
        .from("schedule_events")
        .select("id, start_time, status")
        .eq("enquiry_id", enquiryId)
        .eq("event_type", "site_visit")
        .order("start_time", { ascending: true }),
    ]);

    setEnquiry(enq ?? null);
    setSlots((slotRows as Slot[]) ?? []);

    if (enq?.contractor_id) {
      const { data: contractor } = await supabase
        .from("profiles")
        .select("full_name, company_name")
        .eq("id", enq.contractor_id)
        .maybeSingle();
      setContractorName(contractor?.company_name || contractor?.full_name || null);
    } else {
      setContractorName(null);
    }

    setLoading(false);
  }, [enquiryId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const notifyContractor = async (title: string, message: string, type: string) => {
    if (!enquiry?.contractor_id) return;
    await supabase.from("notifications").insert({
      user_id: enquiry.contractor_id,
      title,
      message,
      type,
      reference_id: enquiryId,
      reference_type: "enquiry",
    });
  };

  const getCustomerName = async (): Promise<string> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return "The client";
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("user_id", user.id)
      .maybeSingle();
    return profile?.full_name || "The client";
  };

  const handleAccept = async (slotId: string) => {
    setSubmitting(true);
    try {
      const { error: acceptError } = await supabase
        .from("schedule_events")
        .update({ status: "accepted", is_confirmed: true })
        .eq("id", slotId);
      if (acceptError) throw acceptError;

      const { error: declineError } = await supabase
        .from("schedule_events")
        .update({ status: "declined" })
        .eq("enquiry_id", enquiryId)
        .eq("event_type", "site_visit")
        .neq("id", slotId);
      if (declineError) throw declineError;

      const acceptedSlot = slots.find((s) => s.id === slotId);
      const customerName = await getCustomerName();
      if (acceptedSlot) {
        await notifyContractor(
          "Site visit accepted",
          `${customerName} has accepted a site visit on ${format(new Date(acceptedSlot.start_time), "d MMM yyyy")}`,
          "site_visit_accepted",
        );
      }

      toast({ title: "Site visit confirmed" });
      onResolved?.();
      await load();
    } catch (error) {
      console.error("Failed to accept site visit:", error);
      toast({ title: "Could not confirm this date", description: "Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeclineAll = async () => {
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("schedule_events")
        .update({ status: "declined" })
        .eq("enquiry_id", enquiryId)
        .eq("event_type", "site_visit");
      if (error) throw error;

      const customerName = await getCustomerName();
      await notifyContractor(
        "Site visit declined",
        `${customerName} has declined the proposed site visit dates`,
        "site_visit_declined",
      );

      toast({ title: "Proposed dates declined" });
      onResolved?.();
      await load();
    } catch (error) {
      console.error("Failed to decline site visit:", error);
      toast({ title: "Could not decline these dates", description: "Please try again.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg w-[calc(100vw-2rem)]">
        <DialogHeader>
          <DialogTitle>Site visit proposed</DialogTitle>
          <DialogDescription>
            {contractorName ?? "Your contractor"}
            {enquiry?.title ? ` — ${enquiry.title}` : ""}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : confirmedSlot ? (
          <div className="rounded-lg border border-green-200 bg-green-50 p-4 space-y-1">
            <p className="text-sm font-semibold text-green-800 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> Site visit confirmed
            </p>
            <p className="text-sm text-green-900 font-medium">
              {format(new Date(confirmedSlot.start_time), "EEE d MMM yyyy")} · {getAmPmLabel(confirmedSlot.start_time)}
            </p>
            {contractorName && <p className="text-xs text-green-800">with {contractorName}</p>}
          </div>
        ) : allDeclined ? (
          <p className="text-sm text-muted-foreground">You declined the proposed site visit dates.</p>
        ) : pendingSlots.length === 0 ? (
          <p className="text-sm text-muted-foreground">No site visit dates have been proposed yet.</p>
        ) : (
          <div className="space-y-4">
            {enquiry?.location && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3" />{enquiry.location}
              </p>
            )}

            <div className="space-y-2">
              {pendingSlots.map((slot) => (
                <div key={slot.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                  <p className="text-sm font-medium">
                    {format(new Date(slot.start_time), "EEE d MMM yyyy")} · {getAmPmLabel(slot.start_time)}
                  </p>
                  <Button size="sm" disabled={submitting} onClick={() => handleAccept(slot.id)}>
                    {submitting && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                    Accept
                  </Button>
                </div>
              ))}
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" disabled={submitting}>
                  Decline all
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Decline all proposed dates?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {contractorName ?? "The contractor"} will be notified that none of the proposed dates work.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep dates</AlertDialogCancel>
                  <AlertDialogAction disabled={submitting} onClick={handleDeclineAll}>
                    Decline all
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
