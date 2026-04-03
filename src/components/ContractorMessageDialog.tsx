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

interface ContractorMessageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recipientUserId: string;
  contractorName: string;
  contractorLocation: string;
}

function isMissingRelationError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message || "").toLowerCase();
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  if (msg.includes("does not exist") || msg.includes("schema cache")) return true;
  return false;
}

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

  const insertEnquiryFallback = async (userId: string, text: string, location: string) => {
    const { data: senderProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    const { data: contractorProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", recipientUserId)
      .maybeSingle();

    const { error: errDashboard } = await supabase.from("enquiries").insert({
      homeowner_id: userId,
      contractor_id: recipientUserId,
      title: "Message",
      description: text,
      location,
      status: "message",
    });
    if (!errDashboard) return;

    if (senderProfile?.id && contractorProfile?.id) {
      const { error: errTypes } = await supabase.from("enquiries").insert({
        customer_id: senderProfile.id,
        contractor_id: contractorProfile.id,
        job_description: text,
        location,
        status: "message",
      });
      if (!errTypes) return;
      throw errTypes;
    }

    throw errDashboard;
  };

  const handleSend = async () => {
    const trimmed = message.trim();
    if (!trimmed) return;

    setSending(true);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("profiles")
        .select("user_type")
        .eq("user_id", user.id)
        .maybeSingle();

      const location = contractorLocation.trim() || "General";

      const { data: conversation, error: convError } = await supabase
        .from("conversations")
        .insert({
          initiator_id: user.id,
          recipient_id: recipientUserId,
          subject: `Message — ${contractorName}`,
          initiator_type: profile?.user_type || "personal",
        })
        .select("id")
        .single();

      if (!convError && conversation?.id) {
        const { error: msgError } = await supabase.from("messages").insert({
          conversation_id: conversation.id,
          sender_id: user.id,
          content: trimmed,
        });

        if (!msgError) {
          setSuccess(true);
          return;
        }
        if (!isMissingRelationError(msgError)) throw msgError;
      } else if (convError && !isMissingRelationError(convError)) {
        throw convError;
      }

      await insertEnquiryFallback(user.id, trimmed, location);
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
