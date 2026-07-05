import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useEngagementConversation } from "@/hooks/useEngagementConversation";

interface ThreadConversationSectionProps {
  enquiryId?: string | null;
  quoteId?: string | null;
  jobId?: string | null;
}

export function ThreadConversationSection({ enquiryId, quoteId, jobId }: ThreadConversationSectionProps) {
  const { messages, resolving, sendMessage } = useEngagementConversation({ enquiryId, quoteId, jobId });
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setSending(true);
    setInput("");
    try {
      await sendMessage(trimmed);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Conversation</h3>
      <div className="rounded-lg border">
        <div className="max-h-72 overflow-y-auto p-3 space-y-2">
          {resolving ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No messages yet.</p>
          ) : (
            messages.map((msg) => {
              const isMine = msg.sender_role === "contractor";
              return (
                <div key={msg.id} className={`flex flex-col gap-0.5 ${isMine ? "items-end" : "items-start"}`}>
                  <div
                    className={`max-w-[80%] px-3 py-1.5 rounded-2xl text-sm leading-relaxed ${
                      isMine ? "rounded-br-sm bg-[#1e2d4a] text-white" : "rounded-bl-sm bg-muted"
                    }`}
                  >
                    {msg.content}
                  </div>
                  <span className="text-[10px] text-muted-foreground px-1">
                    {format(new Date(msg.created_at), "d MMM, HH:mm")}
                  </span>
                </div>
              );
            })
          )}
          <div ref={endRef} />
        </div>
        <div className="border-t p-2 flex items-end gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Type a message..."
            rows={1}
            className="min-h-9 resize-none"
          />
          <Button size="sm" disabled={sending || !input.trim()} onClick={handleSend} className="shrink-0">
            <Send className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
