import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getOrCreateEngagementConversation } from "@/lib/engagementConversation";

interface MessageDialogProps {
  open: boolean;
  onClose: () => void;
  contractorId: string;
  subject: string;
  contextType: "invoice" | "quote";
  contextId: string;
}

/**
 * Writes to job_conversations/job_messages — the only messaging system.
 * `subject`/`contractorId` are kept as props for callers that still build
 * them (contractorId isn't needed for the write itself: job_conversations
 * context columns resolve the parties via RLS, not a stored recipient).
 */
export function MessageDialog({ open, onClose, subject, contextType, contextId }: MessageDialogProps) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  const handleSend = async () => {
    if (!message.trim()) return;
    setSending(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("profiles")
        .select("id, user_type")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!profile?.id) throw new Error("Profile not found");

      let jobId: string | null = null;
      let quoteId: string | null = null;

      if (contextType === "quote") {
        quoteId = contextId;
        const { data: jobRow } = await supabase
          .from("jobs")
          .select("id")
          .eq("issued_quote_id", contextId)
          .neq("status", "cancelled")
          .maybeSingle();
        if (jobRow?.id) jobId = jobRow.id;
      } else {
        const { data: invoiceRow } = await supabase
          .from("invoices")
          .select("job_id, quote_id")
          .eq("id", contextId)
          .maybeSingle();
        jobId = invoiceRow?.job_id ?? null;
        quoteId = invoiceRow?.quote_id ?? null;
      }

      const conversationId = await getOrCreateEngagementConversation({ jobId, quoteId });

      const { error: msgError } = await supabase.from("job_messages").insert({
        conversation_id: conversationId,
        sender_id: profile.id,
        sender_role: profile.user_type || "personal",
        content: message.trim(),
        message_type: "message",
      });
      if (msgError) throw msgError;

      // Notify both parties via edge function
      try {
        await supabase.functions.invoke("notify-invoice-quote-action", {
          body: {
            action_type: contextType === "invoice" ? "query" : "message",
            context_type: contextType,
            context_id: contextId,
            message: message.trim(),
          },
        });
      } catch (e) {
        console.error("Email notification failed:", e);
      }

      toast({ title: "Message Sent", description: "Your message has been sent. Continue the conversation in Messages." });
      setMessage("");
      onClose();
    } catch (error: any) {
      console.error("Error sending message:", error);
      toast({ title: "Error", description: error.message || "Failed to send message", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Send Message</DialogTitle>
          <DialogDescription>
            This will start a conversation ({subject}). You can continue messaging in your Messages tab.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Textarea
            placeholder="Type your message..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={sending}>
              Cancel
            </Button>
            <Button onClick={handleSend} disabled={sending || !message.trim()}>
              {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Send Message
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
