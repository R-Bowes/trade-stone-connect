import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type Enquiry = {
  id: string;
  contractor_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  job_description: string;
  location: string;
  preferred_timeline: string | null;
  budget_range: string | null;
  status: string | null;
};

interface RejectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enquiry: Enquiry;
  onSuccess?: () => void;
}

export function RejectDialog({ open, onOpenChange, enquiry, onSuccess }: RejectDialogProps) {
  const { toast } = useToast();
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) setReason("");
  }, [open]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("Not authenticated");

      const { error: enquiryError } = await supabase
        .from("enquiries")
        .update({ status: "archived" })
        .eq("id", enquiry.id);
      if (enquiryError) throw enquiryError;

      // If a reason was given, save it to messages so the customer can see it.
      if (reason.trim()) {
        // conversations.recipient_id references profiles.user_id,
        // but enquiry.customer_id is profiles.id — look up the auth user_id.
        let recipientId: string | null = null;
        if (enquiry.customer_id) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("user_id")
            .eq("id", enquiry.customer_id)
            .maybeSingle();
          recipientId = profile?.user_id ?? null;
        }

        let conversationId: string;
        const { data: existing } = await supabase
          .from("conversations")
          .select("id")
          .eq("initiator_id", user.id)
          .eq("recipient_id", recipientId)
          .limit(1)
          .maybeSingle();

        if (existing) {
          conversationId = existing.id;
        } else {
          const { data: newConv, error: convError } = await supabase
            .from("conversations")
            .insert({
              initiator_id: user.id,
              initiator_type: "contractor",
              recipient_id: recipientId,
              subject: `Re: ${enquiry.job_description.slice(0, 80)}`,
              quote_id: null,
            })
            .select("id")
            .single();

          if (convError) throw convError;
          conversationId = newConv.id;
        }

        await supabase.from("messages").insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content: `Decline reason: ${reason.trim()}`,
        });
      }

      toast({ title: "Enquiry declined" });
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to decline enquiry:", error);
      toast({
        title: "Could not decline enquiry",
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
          <DialogTitle>Decline Enquiry</DialogTitle>
          <DialogDescription>
            Decline the enquiry from {enquiry.customer_name ?? "the customer"}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Read-only enquiry summary */}
          <div className="rounded-md bg-muted p-4 space-y-2 text-sm">
            <p className="font-medium text-foreground">Enquiry details</p>
            <p className="text-muted-foreground">{enquiry.job_description}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />{enquiry.location}
              </span>
              {enquiry.budget_range && <span>Budget: {enquiry.budget_range}</span>}
              {enquiry.preferred_timeline && <span>Timeline: {enquiry.preferred_timeline}</span>}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reject-reason">Reason for declining (optional)</Label>
            <Textarea
              id="reject-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Outside our service area, fully booked for that period..."
              className="min-h-24"
              disabled={submitting}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void handleSubmit()} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Decline Enquiry
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
