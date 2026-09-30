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
 *
 * contractor_id is required and is written on every insert — the table's
 * own NOT NULL constraint would reject an insert without it. The enquiry
 * branch resolves on the (enquiry_id, contractor_id) PAIR, never enquiry_id
 * alone: once an enquiry can have more than one contractor recipient,
 * enquiry_id alone no longer identifies a single thread, and the table's
 * own UNIQUE(enquiry_id, contractor_id) index makes that pair the only
 * thing that does. job_id and issued_quote_id are left as single-column
 * lookups — job_id already carries its own UNIQUE constraint, and each
 * contractor's issued_quote_id is already unique to that contractor by
 * construction (a different contractor's quote against the same enquiry is
 * a different row entirely), so neither needs pairing with contractor_id
 * to stay correct.
 */
export async function getOrCreateEngagementConversation(context: {
  jobId?: string | null;
  quoteId?: string | null;
  enquiryId?: string | null;
  /** Required whenever enquiryId is given — see pairing note above. */
  contractorId?: string | null;
}): Promise<string> {
  const { jobId, quoteId, enquiryId, contractorId } = context;

  if (enquiryId && !contractorId) {
    throw new Error("getOrCreateEngagementConversation: contractorId is required for an enquiry-context conversation");
  }

  const lookup = async (): Promise<string | null> => {
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
        .eq("contractor_id", contractorId as string)
        .maybeSingle();
      if (data?.id) return data.id;
    }
    return null;
  };

  const existing = await lookup();
  if (existing) return existing;

  const insertPayload = jobId
    ? { job_id: jobId, contractor_id: contractorId as string, context: "job" as const }
    : quoteId
      ? { issued_quote_id: quoteId, contractor_id: contractorId as string, context: "quote" as const }
      : enquiryId
        ? { enquiry_id: enquiryId, contractor_id: contractorId as string, context: "enquiry" as const }
        : null;

  if (!insertPayload) throw new Error("No context available to start a conversation");
  if (!insertPayload.contractor_id) throw new Error("getOrCreateEngagementConversation: contractorId is required");

  const { data: created, error } = await supabase
    .from("job_conversations")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error) {
    // 23505: unique_violation — a concurrent call won the race and already
    // created this thread (job_id's own UNIQUE, or the new
    // (enquiry_id, contractor_id) UNIQUE). Not an error from the caller's
    // point of view: re-resolve and return the row that now exists rather
    // than surfacing a conflict for something that isn't actually a
    // conflict at the product level — two people trying to open the same
    // thread at once should both just get that thread.
    if (error.code === "23505") {
      const resolved = await lookup();
      if (resolved) return resolved;
    }
    throw error;
  }
  return created.id;
}
