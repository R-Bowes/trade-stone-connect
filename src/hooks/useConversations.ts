import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface JobConversation {
  id: string;
  job_id: string;
  job_title: string;
  job_status: string;
  contractor_id: string;
  customer_id: string;
  latest_message: string | null;
  latest_message_at: string | null;
  unread_count: number;
  created_at: string;
}

// Standalone function — can be called outside of the hook (e.g., in ContractorMessagePanel)
export async function getOrCreateConversation(jobId: string): Promise<string> {
  const { data: existing } = await (supabase as any)
    .from("job_conversations")
    .select("id")
    .eq("job_id", jobId)
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  const { data: created, error } = await (supabase as any)
    .from("job_conversations")
    .insert({ job_id: jobId })
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  return created.id as string;
}

export function useConversations() {
  const [conversations, setConversations] = useState<JobConversation[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchConversations = useCallback(async () => {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setLoading(false);
      return;
    }

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profileRow?.id) {
      setLoading(false);
      return;
    }
    const profileId = profileRow.id;

    // Jobs where this user is either contractor or customer
    const { data: jobs } = await supabase
      .from("jobs")
      .select("id, title, status, contractor_id, customer_id")
      .or(`contractor_id.eq.${profileId},customer_id.eq.${profileId}`);

    if (!jobs || jobs.length === 0) {
      setConversations([]);
      setLoading(false);
      return;
    }

    const jobIds = jobs.map((j) => j.id);

    const { data: convData } = await (supabase as any)
      .from("job_conversations")
      .select("id, job_id, created_at")
      .in("job_id", jobIds);

    if (!convData || (convData as any[]).length === 0) {
      setConversations([]);
      setLoading(false);
      return;
    }

    const convIds = (convData as any[]).map((c) => c.id);

    // Fetch all messages for these conversations to compute latest + unread
    const { data: msgData } = await (supabase as any)
      .from("job_messages")
      .select("id, conversation_id, content, created_at, sender_id, read_at")
      .in("conversation_id", convIds)
      .order("created_at", { ascending: false });

    const jobMap = new Map(jobs.map((j) => [j.id, j]));
    const latestByConv = new Map<string, any>();
    const unreadByConv = new Map<string, number>();

    for (const msg of (msgData || []) as any[]) {
      if (!latestByConv.has(msg.conversation_id)) {
        latestByConv.set(msg.conversation_id, msg);
      }
      if (msg.read_at === null && msg.sender_id !== profileId) {
        unreadByConv.set(
          msg.conversation_id,
          (unreadByConv.get(msg.conversation_id) ?? 0) + 1,
        );
      }
    }

    const mapped: JobConversation[] = (convData as any[]).map((conv) => {
      const job = jobMap.get(conv.job_id);
      const latest = latestByConv.get(conv.id);
      return {
        id: conv.id,
        job_id: conv.job_id,
        job_title: job?.title ?? "Unknown job",
        job_status: job?.status ?? "unknown",
        contractor_id: job?.contractor_id ?? "",
        customer_id: job?.customer_id ?? "",
        latest_message: latest?.content ?? null,
        latest_message_at: latest?.created_at ?? null,
        unread_count: unreadByConv.get(conv.id) ?? 0,
        created_at: conv.created_at,
      };
    });

    // Sort most-recently-active first
    mapped.sort((a, b) => {
      if (!a.latest_message_at && !b.latest_message_at) return 0;
      if (!a.latest_message_at) return 1;
      if (!b.latest_message_at) return -1;
      return b.latest_message_at.localeCompare(a.latest_message_at);
    });

    setConversations(mapped);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  return {
    conversations,
    loading,
    getOrCreateConversation,
    refetch: fetchConversations,
  };
}
