import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface JobConversation {
  id: string;
  job_id: string | null;
  enquiry_id: string | null;
  issued_quote_id: string | null;
  context: "job" | "enquiry" | "quote";
  job_title: string;
  job_status: string;
  contractor_id: string;
  customer_id: string;
  latest_message: string | null;
  latest_message_at: string | null;
  unread_count: number;
  created_at: string;
}

// Standalone function — get or create a job-stage conversation
export async function getOrCreateConversation(jobId: string): Promise<string> {
  const { data: existing } = await (supabase as any)
    .from("job_conversations")
    .select("id")
    .eq("job_id", jobId)
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  const { data: created, error } = await (supabase as any)
    .from("job_conversations")
    .insert({ job_id: jobId, context: "job" })
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

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!profileRow?.id) { setLoading(false); return; }
    const profileId = profileRow.id;

    // ── 1. Job-stage conversations ──────────────────────────────────────────
    const { data: jobs } = await supabase
      .from("jobs")
      .select("id, title, status, contractor_id, customer_id")
      .or(`contractor_id.eq.${profileId},customer_id.eq.${profileId}`);

    const jobIds = (jobs || []).map((j) => j.id);
    const jobMap = new Map((jobs || []).map((j) => [j.id, j]));

    let jobConvData: any[] = [];
    if (jobIds.length > 0) {
      const { data } = await (supabase as any)
        .from("job_conversations")
        .select("id, job_id, enquiry_id, context, created_at")
        .in("job_id", jobIds);
      jobConvData = data || [];
    }

    // ── 2. Enquiry-stage conversations ──────────────────────────────────────
    // These have job_id = null but enquiry_id set.
    // The contractor is on the enquiry; the customer is the enquiry's customer_id.
    const { data: enquiryConvData } = await (supabase as any)
      .from("job_conversations")
      .select("id, job_id, enquiry_id, context, created_at")
      .eq("context", "enquiry")
      .is("job_id", null);

    // Filter to only enquiry convs where the current user is involved
    // (contractor on the enquiry, or customer on the enquiry)
    const enquiryIds = (enquiryConvData || [])
      .map((c: any) => c.enquiry_id)
      .filter(Boolean);

    let relevantEnquiryConvs: any[] = [];
    if (enquiryIds.length > 0) {
      const { data: enquiries } = await supabase
        .from("enquiries")
        .select("id, title, contractor_id, customer_id")
        .in("id", enquiryIds)
        .or(`contractor_id.eq.${profileId},customer_id.eq.${profileId}`);

      const relevantEnquiryIds = new Set((enquiries || []).map((e) => e.id));
      const enquiryMap = new Map((enquiries || []).map((e) => [e.id, e]));

      relevantEnquiryConvs = (enquiryConvData || [])
        .filter((c: any) => relevantEnquiryIds.has(c.enquiry_id))
        .map((c: any) => ({ ...c, _enquiry: enquiryMap.get(c.enquiry_id) }));
    }

    // ── 3. Quote-stage conversations ─────────────────────────────────────────
    // job_id = null, enquiry_id = null, issued_quote_id set — pre-job
    // scheduling-negotiation threads.
    const { data: quoteConvData } = await supabase
      .from("job_conversations")
      .select("id, job_id, enquiry_id, issued_quote_id, context, created_at")
      .eq("context", "quote")
      .is("job_id", null);

    const quoteIds = (quoteConvData || [])
      .map((c) => c.issued_quote_id)
      .filter((id): id is string => !!id);

    let relevantQuoteConvs: ((typeof quoteConvData)[number] & { _quote?: { id: string; title: string; contractor_id: string; recipient_id: string | null } })[] = [];
    if (quoteIds.length > 0) {
      const { data: quotes } = await supabase
        .from("issued_quotes")
        .select("id, title, contractor_id, recipient_id")
        .in("id", quoteIds)
        .or(`contractor_id.eq.${profileId},recipient_id.eq.${profileId}`);

      const relevantQuoteIds = new Set((quotes || []).map((q) => q.id));
      const quoteMap = new Map((quotes || []).map((q) => [q.id, q]));

      relevantQuoteConvs = (quoteConvData || [])
        .filter((c) => c.issued_quote_id && relevantQuoteIds.has(c.issued_quote_id))
        .map((c) => ({ ...c, _quote: quoteMap.get(c.issued_quote_id!) }));
    }

    // ── 4. Merge all conversations ──────────────────────────────────────────
    const allConvs = [...jobConvData, ...relevantEnquiryConvs, ...relevantQuoteConvs];

    if (allConvs.length === 0) {
      setConversations([]);
      setLoading(false);
      return;
    }

    const convIds = allConvs.map((c: any) => c.id);

    // ── 5. Fetch messages for all conversations ─────────────────────────────
    const { data: msgData } = await (supabase as any)
      .from("job_messages")
      .select("id, conversation_id, content, created_at, sender_id, read_at")
      .in("conversation_id", convIds)
      .order("created_at", { ascending: false });

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

    // ── 6. Map to JobConversation ───────────────────────────────────────────
    const mapped: JobConversation[] = allConvs.map((conv: any) => {
      const latest = latestByConv.get(conv.id);

      if (conv.context === "job" && conv.job_id) {
        const job = jobMap.get(conv.job_id);
        return {
          id: conv.id,
          job_id: conv.job_id,
          enquiry_id: conv.enquiry_id ?? null,
          issued_quote_id: null,
          context: "job" as const,
          job_title: job?.title ?? "Unknown job",
          job_status: job?.status ?? "unknown",
          contractor_id: job?.contractor_id ?? "",
          customer_id: job?.customer_id ?? "",
          latest_message: latest?.content ?? null,
          latest_message_at: latest?.created_at ?? null,
          unread_count: unreadByConv.get(conv.id) ?? 0,
          created_at: conv.created_at,
        };
      } else if (conv.context === "quote") {
        const quote = conv._quote;
        return {
          id: conv.id,
          job_id: null,
          enquiry_id: null,
          issued_quote_id: conv.issued_quote_id ?? null,
          context: "quote" as const,
          job_title: quote?.title ?? "Quote",
          job_status: "quote",
          contractor_id: quote?.contractor_id ?? "",
          customer_id: quote?.recipient_id ?? "",
          latest_message: latest?.content ?? null,
          latest_message_at: latest?.created_at ?? null,
          unread_count: unreadByConv.get(conv.id) ?? 0,
          created_at: conv.created_at,
        };
      } else {
        // Enquiry-stage conversation
        const enquiry = conv._enquiry;
        return {
          id: conv.id,
          job_id: null,
          enquiry_id: conv.enquiry_id ?? null,
          issued_quote_id: null,
          context: "enquiry" as const,
          job_title: enquiry?.title ?? "Enquiry",
          job_status: "enquiry",
          contractor_id: enquiry?.contractor_id ?? "",
          customer_id: enquiry?.customer_id ?? "",
          latest_message: latest?.content ?? null,
          latest_message_at: latest?.created_at ?? null,
          unread_count: unreadByConv.get(conv.id) ?? 0,
          created_at: conv.created_at,
        };
      }
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