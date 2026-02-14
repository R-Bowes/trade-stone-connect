import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface MessageDialogProps {
  open: boolean;
  onClose: () => void;
  contractorId: string;
  subject: string;
  contextType: "invoice" | "quote";
  contextId: string;
}

export function MessageDialog({ open, onClose, contractorId, subject, contextType, contextId }: MessageDialogProps) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const { toast } = useToast();

  const handleSend = async () => {
    if (!message.trim()) return;
    setSending(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Get user's profile to determine type
      const { data: profile } = await supabase
        .from("profiles")
        .select("user_type")
        .eq("user_id", user.id)
        .single();

      // Create conversation linked to the invoice/quote
      const conversationData: any = {
        initiator_id: user.id,
        recipient_id: contractorId,
        subject: subject,
        initiator_type: profile?.user_type || "personal",
      };

      if (contextType === "invoice") {
        // No direct invoice link on conversations, use subject reference
      } else if (contextType === "quote") {
        conversationData.issued_quote_id = contextId;
      }

      const { data: conversation, error: convError } = await supabase
        .from("conversations")
        .insert(conversationData)
        .select()
        .single();

      if (convError) throw convError;

      // Send the first message
      const { error: msgError } = await supabase
        .from("messages")
        .insert({
          conversation_id: conversation.id,
          sender_id: user.id,
          content: message.trim(),
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
            This will create a conversation with the contractor. You can continue messaging in your Messages tab.
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
