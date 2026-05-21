import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { getOrCreateConversation } from "@/hooks/useConversations";
import { useMessages } from "@/hooks/useMessages";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, MessageSquare, Send } from "lucide-react";

interface ContractorMessagePanelProps {
  jobId: string;
  profileId: string;
}

export function ContractorMessagePanel({
  jobId,
  profileId,
}: ContractorMessagePanelProps) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [convLoading, setConvLoading] = useState(true);
  const [convError, setConvError] = useState(false);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, loading: msgsLoading, sendMessage } = useMessages(
    conversationId,
    "contractor",
  );

  // Resolve or create conversation for this job on mount
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        const id = await getOrCreateConversation(jobId);
        if (!cancelled) setConversationId(id);
      } catch {
        if (!cancelled) setConvError(true);
      } finally {
        if (!cancelled) setConvLoading(false);
      }
    };
    init();
    return () => { cancelled = true; };
  }, [jobId]);

  // Scroll to bottom when messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setInput("");
    await sendMessage(trimmed);
  };

  if (convLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (convError) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        Unable to load conversation.
      </p>
    );
  }

  return (
    <div className="flex flex-col rounded-md border overflow-hidden">
      {/* Header */}
      <div
        className="px-3 py-2 border-b"
        style={{ fontFamily: "Lexend, sans-serif" }}
      >
        <h4
          className="text-xs font-semibold flex items-center gap-1.5"
          style={{ color: "#1e2d4a" }}
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Job Messages
        </h4>
      </div>

      {/* Messages thread */}
      <div
        className="overflow-y-auto px-3 py-3 space-y-2.5 flex-1"
        style={{ maxHeight: 320 }}
      >
        {(convLoading || msgsLoading) && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}

        {!msgsLoading && messages.length === 0 && (
          <p className="text-center text-xs text-muted-foreground py-4">
            No messages yet.
          </p>
        )}

        {messages.map((msg) => {
          const isMine = msg.sender_role === "contractor";

          if (msg.message_type === "milestone") {
            return (
              <div key={msg.id} className="flex items-center gap-2 py-0.5">
                <div className="flex-1 h-px bg-border" />
                <span className="text-[10px] font-medium px-2.5 py-0.5 rounded-full border text-muted-foreground shrink-0">
                  {msg.content}
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>
            );
          }

          return (
            <div
              key={msg.id}
              className={`flex flex-col gap-0.5 ${isMine ? "items-end" : "items-start"}`}
            >
              <div
                className={`max-w-[80%] px-3 py-1.5 rounded-xl text-xs leading-relaxed ${
                  isMine ? "rounded-br-sm" : "rounded-bl-sm"
                }`}
                style={
                  isMine
                    ? { backgroundColor: "#1e2d4a", color: "#fff" }
                    : { backgroundColor: "#f1f1f1", color: "#1a1a1a" }
                }
              >
                {msg.content}
              </div>
              <span className="text-[10px] text-muted-foreground px-1">
                {format(new Date(msg.created_at), "d MMM yyyy, HH:mm")}
              </span>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Input bar */}
      <div className="px-3 py-2 border-t flex items-center gap-2">
        <Input
          placeholder="Type a message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          className="flex-1 h-8 text-sm"
        />
        <Button
          size="sm"
          onClick={handleSend}
          disabled={!input.trim()}
          className="shrink-0 h-8 w-8 p-0 hover:opacity-90 transition-opacity"
          style={{ backgroundColor: "#f07820", color: "#fff" }}
        >
          <Send className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
