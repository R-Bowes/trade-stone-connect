import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { EnquiryPhotoThumbnails } from "@/components/EnquiryPhotoThumbnails";

type Enquiry = {
  id: string;
  contractor_id: string | null;
  customer_id: string | null;
  customer_name: string | null;   // write-only — never render
  customer_email: string | null;  // write-only — never render
  customer_phone: string | null;  // write-only — never render
  customer_ts_code?: string | null;
  job_description: string;
  title?: string | null;
  location: string;
  preferred_timeline: string | null;
  budget_range: string | null;
  status: string | null;
  photo_urls?: string[] | null;
};

interface RespondDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enquiry: Enquiry;
  onSuccess?: () => void;
}

export function RespondDialog({ open, onOpenChange, enquiry, onSuccess }: RespondDialogProps) {
  const { toast } = useToast();
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) setMessage("");
  }, [open]);

  const handleSubmit = async () => {
    if (!message.trim()) {
      toast({
        title: "Message required",
        description: "Please enter a message before sending.",
        variant: "destructive",
      });
      return;
    }

    setSubmitting(true);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("Not authenticated");

      // Resolve contractor's profile id
      const { data: contractorProfile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!contractorProfile?.id) throw new Error("Contractor profile not found");

      // customer_id on enquiry is already a profiles.id
      const customerId = enquiry.customer_id;
      if (!customerId) throw new Error("No customer on this enquiry");

      // Find or create a job_conversations row for this enquiry
      let conversationId: string;

      const { data: existing } = await (supabase as any)
        .from("job_conversations")
        .select("id")
        .eq("enquiry_id", enquiry.id)
        .maybeSingle();

      if (existing?.id) {
        conversationId = existing.id;
      } else {
        const { data: newConv, error: convError } = await (supabase as any)
          .from("job_conversations")
          .insert({
            enquiry_id: enquiry.id,
            context: "enquiry",
            // job_id is null at this stage — will be linked when job is created
          })
          .select("id")
          .single();

        if (convError) throw convError;
        conversationId = newConv.id;
      }

      // Write message to job_messages
      const { error: msgError } = await (supabase as any)
        .from("job_messages")
        .insert({
          conversation_id: conversationId,
          sender_id: contractorProfile.id,
          sender_role: "contractor",
          content: message.trim(),
          message_type: "message",
        });
      if (msgError) throw msgError;

      // Update enquiry status to replied
      const { error: enquiryError } = await supabase
        .from("enquiries")
        .update({ status: "replied" })
        .eq("id", enquiry.id);
      if (enquiryError) throw enquiryError;

      toast({
        title: "Response sent",
        description: "Your message has been sent to the customer.",
      });
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to send response:", error);
      toast({
        title: "Could not send response",
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
          <DialogTitle>Request more information</DialogTitle>
          <DialogDescription>
            {/* Never render customer name — use TS code or generic label */}
            Send a message to {enquiry.customer_ts_code ?? "this customer"} about their enquiry.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Read-only enquiry summary — no contact details */}
          <div className="rounded-md bg-muted p-4 space-y-2 text-sm">
            <p className="font-medium text-foreground">
              {enquiry.title ?? "Enquiry details"}
            </p>
            <p className="text-muted-foreground line-clamp-3">{enquiry.job_description}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />{enquiry.location}
              </span>
              {enquiry.budget_range && <span>Budget: {enquiry.budget_range}</span>}
              {enquiry.preferred_timeline && <span>Timeline: {enquiry.preferred_timeline}</span>}
            </div>
            {enquiry.photo_urls && enquiry.photo_urls.length > 0 && (
              <EnquiryPhotoThumbnails paths={enquiry.photo_urls.slice(0, 4)} label="Customer photos" />
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="respond-message">Your message</Label>
            <Textarea
              id="respond-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. Thanks for reaching out — could you tell me more about..."
              className="min-h-28"
              disabled={submitting}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={() => void handleSubmit()} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Send message
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}