import { supabase } from "@/integrations/supabase/client";

/**
 * Single entry point for resolving "the conversation" for an engagement on
 * job_conversations/job_messages — the only messaging system (legacy
 * conversations/messages must gain no new writers).
 *
 * "One thread per engagement, resolve by furthest artefact": looks for an
 * existing conversation starting at the furthest context provided (job >
 * quote > enquiry) and falling back to earlier contexts — a thread started
 * at the enquiry stage is found and reused once the engagement has moved on
 * to quote or job, rather than fragmenting into a second row. A new row is
 * only created when no conversation exists at any level, at the furthest
 * context available (job_conversations_single_context requires exactly one
 * of job_id/enquiry_id/issued_quote_id).
 */
export async function getOrCreateEngagementConversation(context: {
  jobId?: string | null;
  quoteId?: string | null;
  enquiryId?: string | null;
}): Promise<string> {
  const { jobId, quoteId, enquiryId } = context;

  if (jobId) {
    const { data } = await supabase.from("job_conversations").select("id").eq("job_id", jobId).maybeSingle();
    if (data?.id) return data.id;
  }
  if (quoteId) {
    const { data } = await supabase
      .from("job_conversations")
      .select("id")
      .eq("issued_quote_id", quoteId)
      .maybeSingle();
    if (data?.id) return data.id;
  }
  if (enquiryId) {
    const { data } = await supabase
      .from("job_conversations")
      .select("id")
      .eq("enquiry_id", enquiryId)
      .maybeSingle();
    if (data?.id) return data.id;
  }

  const insertPayload = jobId
    ? { job_id: jobId, context: "job" }
    : quoteId
      ? { issued_quote_id: quoteId, context: "quote" }
      : enquiryId
        ? { enquiry_id: enquiryId, context: "enquiry" }
        : null;

  if (!insertPayload) throw new Error("No context available to start a conversation");

  const { data: created, error } = await supabase
    .from("job_conversations")
    .insert(insertPayload)
    .select("id")
    .single();
  if (error) throw error;
  return created.id;
}
