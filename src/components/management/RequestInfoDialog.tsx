import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
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

interface RequestInfoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  enquiry: Enquiry;
  onSuccess?: () => void;
}

export function RequestInfoDialog({ open, onOpenChange, enquiry, onSuccess }: RequestInfoDialogProps) {
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

      // issued_quotes.recipient_id and conversations.recipient_id reference profiles.user_id,
      // but enquiry.customer_id is profiles.id — look up the customer's auth user_id.
      let recipientId: string | null = null;
      if (enquiry.customer_id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("user_id")
          .eq("id", enquiry.customer_id)
          .maybeSingle();
        recipientId = profile?.user_id ?? null;
      }

      // Find an existing conversation between this contractor and the customer, or create one.
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
            subject: `Enquiry: ${enquiry.job_description.slice(0, 80)}`,
            quote_id: null,
          })
          .select("id")
          .single();

        if (convError) throw convError;
        conversationId = newConv.id;
      }

      const { error: msgError } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: user.id,
        content: message.trim(),
      });

      if (msgError) throw msgError;

      toast({
        title: "Message sent",
        description: `Your message has been sent to ${enquiry.customer_name ?? "the customer"}.`,
      });
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error("Failed to send message:", error);
      toast({
        title: "Could not send message",
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
          <DialogTitle>Request More Information</DialogTitle>
          <DialogDescription>
            Send a message to {enquiry.customer_name ?? "the customer"} about their enquiry.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md bg-muted p-3 text-sm">
            <p className="font-medium text-foreground mb-1">Enquiry</p>
            <p className="text-muted-foreground line-clamp-3">{enquiry.job_description}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="info-message">Your message</Label>
            <Textarea
              id="info-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. Could you share photos of the area? What type of finish are you after?"
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
              Send Message
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
