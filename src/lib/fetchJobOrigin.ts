import { supabase } from "@/integrations/supabase/client";

export interface JobOriginEnquiry {
  title: string | null;
  job_description: string;
  location: string;
  preferred_time_of_day: string | null;
  preferred_window_start: string | null;
  preferred_window_end: string | null;
  budget_range: string | null;
  photo_urls: string[] | null;
}

export interface JobOriginQuote {
  quote_number: number;
  version: number;
  items: { description: string; quantity: number; unit_price: number; total: number }[];
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  deposit_required: boolean | null;
  deposit_amount: number | null;
  deposit_paid: boolean | null;
  valid_until: string;
  notes: string | null;
  terms: string | null;
}

export interface JobOrigin {
  quote: JobOriginQuote | null;
  enquiry: JobOriginEnquiry | null;
  engagementNumber: string | null;
}

const EMPTY_ORIGIN: JobOrigin = { quote: null, enquiry: null, engagementNumber: null };

/**
 * Origin context for a job's detail view — the accepted quote (with its
 * source enquiry, if any) or the term engagement a call-out job was raised
 * under. Flat selects only, called on-demand when a job detail surface is
 * opened/expanded — never from a jobs list query.
 */
export async function fetchJobOrigin(params: {
  issuedQuoteId: string | null;
  engagementId: string | null;
}): Promise<JobOrigin> {
  const { issuedQuoteId, engagementId } = params;

  if (issuedQuoteId) {
    const { data: quoteRow } = await supabase
      .from("issued_quotes")
      .select(
        "quote_number, version, enquiry_id, items, subtotal, tax_rate, tax_amount, total, deposit_required, deposit_amount, deposit_paid, valid_until, notes, terms",
      )
      .eq("id", issuedQuoteId)
      .maybeSingle();

    if (!quoteRow) return EMPTY_ORIGIN;

    const quote: JobOriginQuote = {
      quote_number: quoteRow.quote_number,
      version: quoteRow.version,
      items: Array.isArray(quoteRow.items) ? (quoteRow.items as unknown as JobOriginQuote["items"]) : [],
      subtotal: quoteRow.subtotal,
      tax_rate: quoteRow.tax_rate,
      tax_amount: quoteRow.tax_amount,
      total: quoteRow.total,
      deposit_required: quoteRow.deposit_required,
      deposit_amount: quoteRow.deposit_amount,
      deposit_paid: quoteRow.deposit_paid,
      valid_until: quoteRow.valid_until,
      notes: quoteRow.notes,
      terms: quoteRow.terms,
    };

    let enquiry: JobOriginEnquiry | null = null;
    if (quoteRow.enquiry_id) {
      const { data: enquiryRow } = await supabase
        .from("enquiries")
        .select(
          "title, job_description, location, preferred_time_of_day, preferred_window_start, preferred_window_end, budget_range, photo_urls",
        )
        .eq("id", quoteRow.enquiry_id)
        .maybeSingle();
      if (enquiryRow) enquiry = enquiryRow;
    }

    return { quote, enquiry, engagementNumber: null };
  }

  if (engagementId) {
    const { data: engRow } = await supabase
      .from("term_engagements")
      .select("engagement_number")
      .eq("id", engagementId)
      .maybeSingle();
    return { quote: null, enquiry: null, engagementNumber: engRow?.engagement_number ?? null };
  }

  return EMPTY_ORIGIN;
}
