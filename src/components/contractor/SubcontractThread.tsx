import { useEffect, useRef, useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useSubcontractThread } from "@/hooks/useContractorProjectParticipation";
import { messageOf } from "@/components/projects/projectErrors";
import { format } from "date-fns";

const MAX_LENGTH = 4000;
const OPEN_STATUSES = new Set(["invited", "accepted"]);

/**
 * The message thread for one sub-contract: main contractor and
 * subcontractor only. Text only, no attachments, no edit, no delete.
 * Deliberately separate from the job_conversations/job_messages
 * system used everywhere else.
 */
export function SubcontractThread({
  subcontractId,
  status,
  otherPartyName,
}: {
  subcontractId: string;
  status: string;
  otherPartyName: string | null;
}) {
  const canSend = OPEN_STATUSES.has(status);
  const { messages, loading, error, sending, send, refetch } = useSubcontractThread(subcontractId, canSend);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
      setCurrentUserId(data?.id ?? null);
    })();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  const handleSend = async () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setSendError(null);
    try {
      await send(trimmed);
      setDraft("");
    } catch (err) {
      setSendError(messageOf(err));
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-2 py-4">
        <p className="text-sm text-destructive">{error}</p>
        <Button size="sm" variant="outline" onClick={() => void refetch()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 min-h-0 overflow-y-auto space-y-3 py-2">
        {messages.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-6">No messages yet.</p>
        ) : (
          messages.map((m) => {
            const isMine = m.sender_id === currentUserId;
            return (
              <div key={m.id} className={`flex flex-col gap-0.5 ${isMine ? "items-end" : "items-start"}`}>
                <span className="text-xs text-muted-foreground px-1">{isMine ? "You" : otherPartyName ?? "Them"}</span>
                <div
                  className={`max-w-[80%] px-3.5 py-2 rounded-2xl text-sm leading-relaxed ${isMine ? "rounded-br-sm" : "rounded-bl-sm"}`}
                  style={isMine ? { backgroundColor: "#1a2744", color: "#fff" } : { backgroundColor: "#f1f1f1", color: "#1a1a1a" }}
                >
                  {m.content}
                </div>
                <span className="text-xs text-muted-foreground px-1">{format(new Date(m.created_at), "d MMM yyyy, HH:mm")}</span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {canSend ? (
        <div className="shrink-0 space-y-2 border-t pt-3">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_LENGTH))}
            placeholder="Type a message..."
            rows={2}
            disabled={sending}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{draft.length}/{MAX_LENGTH}</span>
            {sendError && <span className="text-xs text-destructive">{sendError}</span>}
            <Button size="sm" onClick={() => void handleSend()} disabled={sending || !draft.trim()}>
              {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Send
            </Button>
          </div>
        </div>
      ) : (
        <p className="shrink-0 border-t pt-3 text-center text-sm text-muted-foreground">This thread is closed.</p>
      )}
    </div>
  );
}
