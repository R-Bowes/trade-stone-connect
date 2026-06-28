import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useConversations } from "@/hooks/useConversations";
import { useMessages } from "@/hooks/useMessages";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, MessageSquare, Send } from "lucide-react";

interface BusinessMessageInboxProps {
  profileId: string;
  senderRole?: "business" | "contractor";
}

function statusPill(status: string) {
  const map: Record<string, { label: string; classes: string }> = {
    scheduled:  { label: "Scheduled",  classes: "bg-slate-100 text-slate-700" },
    in_progress:{ label: "In progress",classes: "bg-orange-100 text-orange-700" },
    snagging:   { label: "Snagging",   classes: "bg-amber-100 text-amber-700" },
    complete:   { label: "Complete",   classes: "bg-green-100 text-green-700" },
    cancelled:  { label: "Cancelled",  classes: "bg-red-100 text-red-700" },
  };
  const entry = map[status] ?? { label: status, classes: "bg-muted text-muted-foreground" };
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${entry.classes}`}>
      {entry.label}
    </span>
  );
}

export function BusinessMessageInbox({
  profileId,
  senderRole = "business",
}: BusinessMessageInboxProps) {
  const { conversations, loading: convsLoading } = useConversations();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Maps profile id → display name for the OTHER party in each conversation
  const [otherPartyNames, setOtherPartyNames] = useState<Record<string, string>>({});
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { messages, loading: msgsLoading, sendMessage, markAllRead } =
    useMessages(selectedId, senderRole);

  // Batch-fetch the OTHER party's display name for each conversation.
  // If current user is the contractor → show customer name.
  // If current user is the customer/business → show contractor name.
  useEffect(() => {
    if (conversations.length === 0) return;

    const otherIds = [
      ...new Set(
        conversations.map((c) =>
          c.contractor_id === profileId ? c.customer_id : c.contractor_id
        ).filter(Boolean)
      ),
    ];

    if (otherIds.length === 0) return;

    supabase
      .from("profiles")
      .select("id, full_name, company_name")
      .in("id", otherIds)
      .then(({ data }) => {
        if (!data) return;
        const map: Record<string, string> = {};
        for (const p of data) {
          map[p.id] = (p as any).company_name || p.full_name || "Unknown";
        }
        setOtherPartyNames(map);
      });
  }, [conversations, profileId]);

  useEffect(() => {
    if (selectedId) markAllRead();
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setInput("");
    await sendMessage(trimmed);
  };

  const getOtherPartyName = (conv: { contractor_id: string; customer_id: string }) => {
    const otherId = conv.contractor_id === profileId ? conv.customer_id : conv.contractor_id;
    return otherPartyNames[otherId] ?? "Loading...";
  };

  const selectedConv = conversations.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="flex border rounded-lg overflow-hidden bg-background" style={{ minHeight: 600 }}>
      {/* Sidebar */}
      <div className="flex flex-col border-r bg-muted/20 shrink-0 overflow-y-auto" style={{ width: 260 }}>
        <div className="px-4 py-3 border-b" style={{ fontFamily: "Lexend, sans-serif" }}>
          <h3 className="text-sm font-semibold" style={{ color: "#1e2d4a" }}>Messages</h3>
        </div>

        {convsLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {!convsLoading && conversations.length === 0 && (
          <div className="px-4 py-8 text-center text-xs text-muted-foreground">
            No conversations yet.
          </div>
        )}

        {conversations.map((conv) => {
          const isSelected = conv.id === selectedId;
          return (
            <button
              key={conv.id}
              type="button"
              onClick={() => setSelectedId(conv.id)}
              className={`w-full text-left px-4 py-3 border-b transition-colors flex flex-col gap-0.5 ${
                isSelected ? "bg-[#1e2d4a]/5 border-l-2 border-l-[#1e2d4a]" : "hover:bg-muted/40"
              }`}
            >
              <div className="flex items-center justify-between gap-1">
                <span className="text-xs font-semibold truncate" style={{ color: "#1e2d4a" }}>
                  {getOtherPartyName(conv)}
                </span>
                {conv.unread_count > 0 && (
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: "#f07820" }} />
                )}
              </div>
              <span className="text-xs text-muted-foreground truncate leading-tight">{conv.job_title}</span>
              <div className="flex items-center gap-1.5 mt-0.5">
  {conv.job_status !== "enquiry" && statusPill(conv.job_status)}
  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
    conv.context === "enquiry"
      ? "bg-blue-50 text-blue-700"
      : "bg-orange-50 text-orange-700"
  }`}>
    {conv.context === "enquiry" ? "Enquiry" : "Job"}
  </span>
</div>
              {conv.latest_message && (
                <span className="text-[11px] text-muted-foreground truncate mt-0.5">{conv.latest_message}</span>
              )}
              {conv.latest_message_at && (
                <span className="text-[10px] text-muted-foreground/60">
                  {format(new Date(conv.latest_message_at), "d MMM yyyy")}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Chat area */}
      <div className="flex flex-col flex-1 overflow-hidden">
        {!selectedConv ? (
          <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground gap-2">
            <MessageSquare className="h-10 w-10 opacity-25" />
            <p className="text-sm">Select a conversation to start messaging</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-5 py-3 border-b flex items-center gap-2" style={{ fontFamily: "Lexend, sans-serif" }}>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold" style={{ color: "#1e2d4a" }}>
                  {getOtherPartyName(selectedConv)}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">{selectedConv.job_title}</span>
                  {statusPill(selectedConv.job_status)}
                </div>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {msgsLoading && (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {!msgsLoading && messages.length === 0 && (
                <p className="text-center text-sm text-muted-foreground py-6">
                  No messages yet. Start the conversation below.
                </p>
              )}
              {messages.map((msg) => {
                // isMine: message was sent by the current user
                const isMine = msg.sender_id === profileId ||
                  msg.sender_role === senderRole;

                if (msg.message_type === "milestone") {
                  return (
                    <div key={msg.id} className="flex items-center gap-3 py-1">
                      <div className="flex-1 h-px bg-border" />
                      <span className="text-[11px] font-medium px-3 py-1 rounded-full border text-muted-foreground shrink-0">
                        {msg.content}
                      </span>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                  );
                }

                return (
                  <div key={msg.id} className={`flex flex-col gap-0.5 ${isMine ? "items-end" : "items-start"}`}>
                    <div
                      className={`max-w-[75%] px-3.5 py-2 rounded-2xl text-sm leading-relaxed ${isMine ? "rounded-br-sm" : "rounded-bl-sm"}`}
                      style={isMine
                        ? { backgroundColor: "#1e2d4a", color: "#fff" }
                        : { backgroundColor: "#f1f1f1", color: "#1a1a1a" }}
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

            {/* Input */}
            <div className="px-4 py-3 border-t flex items-center gap-2">
              <Input
                placeholder="Type a message..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                className="flex-1"
              />
              <Button
                onClick={handleSend}
                disabled={!input.trim()}
                className="shrink-0 hover:opacity-90 transition-opacity"
                style={{ backgroundColor: "#f07820", color: "#fff" }}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}