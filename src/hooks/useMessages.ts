import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface JobMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  sender_role: "business" | "contractor" | "personal";
  content: string;
  message_type: "message" | "milestone";
  read_at: string | null;
  created_at: string;
}

export function useMessages(
  conversationId: string | null,
  senderRole: "business" | "contractor" | "personal",
) {
  const [messages, setMessages] = useState<JobMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profileRow } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (profileRow?.id) setProfileId(profileRow.id);
    };
    init();
  }, []);

  const fetchMessages = useCallback(async () => {
    if (!conversationId) { setMessages([]); return; }
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("job_messages")
      .select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });

    if (error) {
      toast({ title: "Error", description: "Failed to load messages", variant: "destructive" });
    } else {
      setMessages((data || []) as JobMessage[]);
    }
    setLoading(false);
  }, [conversationId, toast]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel(`job_messages:${conversationId}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "job_messages",
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        const newMsg = payload.new as unknown as JobMessage;
        setMessages((prev) => prev.some((m) => m.id === newMsg.id) ? prev : [...prev, newMsg]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [conversationId]);

  const sendMessage = useCallback(async (content: string) => {
    if (!conversationId || !profileId) return;
    const trimmed = content.trim();
    if (!trimmed) return;
    const { error } = await (supabase as any).from("job_messages").insert({
      conversation_id: conversationId,
      sender_id: profileId,
      sender_role: senderRole,
      content: trimmed,
      message_type: "message",
    });
    if (error) {
      toast({ title: "Error", description: "Failed to send message", variant: "destructive" });
    }
  }, [conversationId, profileId, senderRole, toast]);

  const markAllRead = useCallback(async () => {
    if (!conversationId || !profileId) return;
    const now = new Date().toISOString();
    await (supabase as any)
      .from("job_messages")
      .update({ read_at: now })
      .eq("conversation_id", conversationId)
      .is("read_at", null)
      .neq("sender_id", profileId);
    setMessages((prev) =>
      prev.map((m) => m.read_at === null && m.sender_id !== profileId ? { ...m, read_at: now } : m)
    );
  }, [conversationId, profileId]);

  const unreadCount = profileId
    ? messages.filter((m) => m.read_at === null && m.sender_id !== profileId).length
    : 0;

  return { messages, loading, sendMessage, unreadCount, markAllRead };
}