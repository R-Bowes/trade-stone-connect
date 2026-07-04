import { supabase } from "@/integrations/supabase/client";

/**
 * Creates the `jobs` row for a quote once scheduling is agreed, shared by both
 * the no-deposit ("Confirm Job") and deposit-paid confirmation paths so they
 * can't drift out of sync on payload fields again.
 */
export async function createJobFromQuote(quoteId: string): Promise<{ jobId: string }> {
  const { data: quote, error: quoteError } = await supabase
    .from("issued_quotes")
    .select("contractor_id, recipient_id, title, client_address, total, enquiry_id")
    .eq("id", quoteId)
    .single();
  if (quoteError || !quote) throw quoteError ?? new Error("Quote not found");

  let company_id: string | null = null;
  let site_id: string | null = null;
  let asset_id: string | null = null;
  if (quote.enquiry_id) {
    const { data: enq } = await supabase
      .from("enquiries")
      .select("company_id, site_id, asset_id")
      .eq("id", quote.enquiry_id)
      .maybeSingle();
    if (enq) {
      company_id = enq.company_id;
      site_id = enq.site_id;
      asset_id = enq.asset_id;
    }
  }

  const { data: confirmedEvents } = await supabase
    .from("schedule_events")
    .select("id, start_time")
    .eq("quote_id", quoteId)
    .or("status.eq.accepted,is_confirmed.eq.true")
    .order("start_time", { ascending: true })
    .limit(1);
  const confirmedEvent = confirmedEvents?.[0] ?? null;
  const startDate = confirmedEvent ? confirmedEvent.start_time.slice(0, 10) : null;

  const { data: jobRow, error: jobError } = await supabase
    .from("jobs")
    .insert({
      contractor_id: quote.contractor_id,
      customer_id: quote.recipient_id,
      issued_quote_id: quoteId,
      title: quote.title,
      location: quote.client_address,
      status: "scheduled",
      contract_value: quote.total,
      start_date: startDate,
      company_id,
      site_id,
      asset_id,
    })
    .select("id")
    .single();
  if (jobError) throw jobError;

  if (confirmedEvent?.id && jobRow?.id) {
    await supabase
      .from("schedule_events")
      .update({ job_id: jobRow.id })
      .eq("id", confirmedEvent.id);
  }

  if (jobRow?.id && company_id) {
    await supabase.functions.invoke("sla-clock", {
      body: { action: "start", job_id: jobRow.id },
    });
  }

  return { jobId: jobRow!.id };
}
