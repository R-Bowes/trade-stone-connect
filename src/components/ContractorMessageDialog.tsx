import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getOrCreateEngagementConversation } from "@/lib/engagementConversation";

interface ContractorMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientUserId: string;
  contractorName: string;
  contractorLocation: string;
}

/**
 * First contact from a contractor's public profile, before any enquiry
 * exists — creates the enquiry (the only "context" a fresh message can
 * attach to) and seeds its job_conversations/job_messages thread with the
 * message, rather than writing to the legacy conversations/messages tables
 * (which have no reader — a message "sent" there was a silent dead end).
 */
export function ContractorMessageDialog({
  open,
  onOpenChange,
  recipientUserId,
  contractorName,
  contractorLocation,
}: ContractorMessageDialogProps) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) {
      setMessage("");
      setSuccess(false);
      setSending(false);
    }
  }, [open]);

  const handleSend = async () => {
    const trimmed = message.trim();
    if (!trimmed) return;

    setSending(true);
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("Not authenticated");

      const { data: senderProfile } = await supabase
        .from("profiles")
        .select("id, user_type")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!senderProfile?.id) throw new Error("Profile not found");

      const { data: contractorProfile } = await supabase
        .from("profiles")
        .select("id, user_id")
        .eq("user_id", recipientUserId)
        .maybeSingle();
      if (!contractorProfile?.id) throw new Error("Contractor profile not found");

      const location = contractorLocation.trim() || "General";

      const { data: enquiryRow, error: enquiryError } = await supabase
        .from("enquiries")
        .insert({
          customer_id: senderProfile.id,
          contractor_id: contractorProfile.id,
          job_description: trimmed,
          location,
          status: "new",
        })
        .select("id")
        .single();
      if (enquiryError) throw enquiryError;

      const conversationId = await getOrCreateEngagementConversation({ enquiryId: enquiryRow.id });
      const { error: msgError } = await supabase.from("job_messages").insert({
        conversation_id: conversationId,
        sender_id: senderProfile.id,
        sender_role: senderProfile.user_type || "personal",
        content: trimmed,
        message_type: "message",
      });
      if (msgError) throw msgError;

      if (contractorProfile.user_id) {
        await supabase.from("notifications").insert({
          user_id: contractorProfile.user_id,
          title: "New enquiry received",
          message: `A customer sent an enquiry: ${trimmed.slice(0, 60)}${trimmed.length > 60 ? "…" : ""}`,
          type: "enquiry",
          reference_id: enquiryRow.id,
          reference_type: "enquiry",
          is_read: false,
        }).catch(console.error);

        supabase.functions
          .invoke("notify-contractor", { body: { enquiry_id: enquiryRow.id } })
          .catch(console.error);
      }

      setSuccess(true);
    } catch (e) {
      console.error("Send message failed:", e);
      const err = e as { message?: string };
      toast({
        variant: "destructive",
        title: "Could not send",
        description: err?.message || "Something went wrong. Please try again.",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Message {contractorName}</DialogTitle>
        </DialogHeader>
        {success ? (
          <p className="text-sm text-muted-foreground py-2">Message sent successfully</p>
        ) : (
          <div className="space-y-4">
            <Textarea
              placeholder="Write your message…"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              disabled={sending}
              className="resize-none"
            />
            <div className="flex justify-end">
              <Button onClick={() => void handleSend()} disabled={sending || !message.trim()}>
                {sending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
