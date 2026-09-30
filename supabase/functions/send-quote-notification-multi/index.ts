// supabase/functions/send-quote-notification-multi/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Compare-quotes fan-out: one enquiry, up to 5 contractor recipients. A
// separate function from send-quote-notification (not a parameterised
// version of it) — the single-contractor path stays completely untouched.
// Creates the enquiry with contractor_id = NULL (never ambiguous about
// which single contractor it "belongs" to) and one enquiry_recipients row
// per contractor. The cap and "nothing accepted yet" rule are enforced by
// the enquiry_recipients_enforce_limits trigger, not re-checked here —
// this function relies on the database to reject an insert past 5, the
// same guarantee any other insert path gets.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildEmail, buildSubject } from "../_shared/emailTemplate.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const ADMIN_SECRET_KEY = Deno.env.get("ADMIN_SECRET_KEY") || "";

const RATE_LIMIT_MAX_REQUESTS = 10;
const RATE_LIMIT_WINDOW_MINUTES = 60;
const MAX_RECIPIENTS = 5;

const DEFAULT_ALLOWED_ORIGINS = [
  "https://tradesltd.co.uk",
  "https://www.tradesltd.co.uk",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://localhost:8080",
];

const allowedOrigins = (() => {
  const envOrigins = Deno.env.get("ALLOWED_ORIGINS");
  if (!envOrigins) return DEFAULT_ALLOWED_ORIGINS;
  return envOrigins.split(",").map((o) => o.trim()).filter((o) => o.length > 0);
})();

const resolveCorsOrigin = (origin: string | null): string | null =>
  origin && allowedOrigins.includes(origin) ? origin : null;

const buildCorsHeaders = (origin: string | null): HeadersInit => {
  const safeOrigin = resolveCorsOrigin(origin) ?? DEFAULT_ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": safeOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
};

interface RecipientInput {
  id: string;
  name: string;
}

interface MultiQuoteRequest {
  contractors: RecipientInput[];
  customer_name: string;
  customer_email: string;
  customer_phone?: string | null;
  project_title: string;
  project_description: string;
  project_location?: string | null;
  budget_range?: string | null;
  timeline?: string | null;
  preferred_time_of_day?: string | null;
  job_type?: string | null;
  priority?: string | null;
  access_notes?: string | null;
  additional_details?: Record<string, string> | null;
  source?: "marketplace" | "direct" | "panel";
}

const JOB_TYPE_VALUES = ["repair", "service", "installation", "inspection", "emergency_callout", "other"];
const PRIORITY_VALUES = ["low", "medium", "high", "emergency"];
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validateInput = (data: MultiQuoteRequest): string | null => {
  if (!Array.isArray(data.contractors) || data.contractors.length === 0) {
    return "At least one contractor is required";
  }
  if (data.contractors.length > MAX_RECIPIENTS) {
    return `No more than ${MAX_RECIPIENTS} contractors can be selected`;
  }
  const seen = new Set<string>();
  for (const c of data.contractors) {
    if (!c?.id || typeof c.id !== "string" || !UUID_REGEX.test(c.id)) {
      return "Invalid contractor ID format";
    }
    if (!c?.name || typeof c.name !== "string" || c.name.length > 200) {
      return "Invalid contractor name";
    }
    if (seen.has(c.id)) return "Duplicate contractor in selection";
    seen.add(c.id);
  }

  if (!data.customer_name || typeof data.customer_name !== "string" || data.customer_name.length > 200) {
    return "Invalid customer name";
  }
  if (!data.customer_email || typeof data.customer_email !== "string" || data.customer_email.length > 255) {
    return "Invalid customer email";
  }
  if (!EMAIL_REGEX.test(data.customer_email)) return "Invalid email format";
  if (!data.project_title || typeof data.project_title !== "string" || data.project_title.length > 500) {
    return "Invalid project title";
  }
  if (!data.project_description || typeof data.project_description !== "string" || data.project_description.length > 5000) {
    return "Invalid project description";
  }
  if (data.preferred_time_of_day && !["am", "pm", "any"].includes(data.preferred_time_of_day)) {
    return "Invalid preferred_time_of_day";
  }
  if (data.job_type && !JOB_TYPE_VALUES.includes(data.job_type)) return "Invalid job_type";
  if (data.priority && !PRIORITY_VALUES.includes(data.priority)) return "Invalid priority";
  if (data.access_notes && (typeof data.access_notes !== "string" || data.access_notes.length > 2000)) {
    return "Invalid access_notes";
  }
  return null;
};

const sanitizeText = (text: string): string =>
  text.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;").trim();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClientAny = ReturnType<typeof createClient<any>>;

const checkRateLimit = async (
  supabase: SupabaseClientAny,
  identifier: string,
  actionType: string,
): Promise<{ allowed: boolean; remainingRequests: number; resetTime: Date }> => {
  const windowStart = new Date();
  windowStart.setMinutes(windowStart.getMinutes() - RATE_LIMIT_WINDOW_MINUTES);

  const { count, error } = await supabase
    .from("rate_limits")
    .select("*", { count: "exact", head: true })
    .eq("identifier", identifier)
    .eq("action_type", actionType)
    .gte("created_at", windowStart.toISOString());

  if (error) {
    console.error("[send-quote-notification-multi] rate limit check error:", error);
    return { allowed: true, remainingRequests: RATE_LIMIT_MAX_REQUESTS, resetTime: new Date() };
  }

  const currentCount = count || 0;
  return {
    allowed: currentCount < RATE_LIMIT_MAX_REQUESTS,
    remainingRequests: Math.max(0, RATE_LIMIT_MAX_REQUESTS - currentCount),
    resetTime: new Date(windowStart.getTime() + RATE_LIMIT_WINDOW_MINUTES * 60 * 1000),
  };
};

const recordRateLimitEntry = async (supabase: SupabaseClientAny, identifier: string, actionType: string) => {
  const { error } = await supabase.from("rate_limits").insert({ identifier, action_type: actionType });
  if (error) console.error("[send-quote-notification-multi] failed to record rate limit entry:", error);
};

/** Human-readable recipient list for the customer's own confirmation email — not shown to any contractor. */
const formatNames = (names: string[]): string => {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
};

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = buildCorsHeaders(origin);

  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (!resolveCorsOrigin(origin)) {
    return new Response(JSON.stringify({ error: "Origin not allowed", success: false }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  const supabase = createClient(SUPABASE_URL, ADMIN_SECRET_KEY);
  const authHeader = req.headers.get("Authorization") ?? "";

  try {
    let requestData: MultiQuoteRequest;
    try {
      requestData = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid request body", success: false }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const validationError = validateInput(requestData);
    if (validationError) {
      return new Response(JSON.stringify({ error: validationError, success: false }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    let authUser: { id: string; email?: string } | null = null;
    let customerProfile: { id: string; full_name: string | null } | null = null;
    if (token) {
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError) {
        console.warn("[send-quote-notification-multi] getUser error:", authError.message);
      } else if (user) {
        authUser = user;
        const { data: cp } = await supabase
          .from("profiles")
          .select("id, full_name")
          .eq("user_id", user.id)
          .maybeSingle();
        customerProfile = cp ?? null;
      }
    }

    if (!customerProfile?.id) {
      return new Response(JSON.stringify({ error: "Not authenticated", success: false }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Resolve contractor profile ids — request carries the recipient's own
    // profiles.id already (matching send-quote-notification's contract),
    // but confirm each one actually exists before inserting anything.
    const requestedIds = requestData.contractors.map((c) => c.id);
    const { data: contractorProfiles, error: contractorLookupError } = await supabase
      .from("profiles")
      .select("id")
      .in("id", requestedIds);
    if (contractorLookupError) {
      console.error("[send-quote-notification-multi] contractor lookup failed:", contractorLookupError);
      return new Response(JSON.stringify({ error: "Could not verify contractors", success: false }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    const validIds = new Set((contractorProfiles ?? []).map((p) => p.id));
    const recipients = requestData.contractors.filter((c) => validIds.has(c.id));
    if (recipients.length === 0) {
      return new Response(JSON.stringify({ error: "No valid contractors found", success: false }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const customerEmail = (authUser?.email ?? requestData.customer_email).trim().toLowerCase();
    const customerName = sanitizeText(customerProfile.full_name || requestData.customer_name);
    const projectTitle = sanitizeText(requestData.project_title);
    const projectDescription = sanitizeText(requestData.project_description);

    const rateLimitIdentifier = customerEmail;
    const { allowed, remainingRequests, resetTime } = await checkRateLimit(
      supabase,
      rateLimitIdentifier,
      "quote_request_multi",
    );
    if (!allowed) {
      return new Response(
        JSON.stringify({
          error: "Too many quote requests. Please try again later.",
          success: false,
          retryAfter: resetTime.toISOString(),
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": Math.ceil((resetTime.getTime() - Date.now()) / 1000).toString(),
            ...corsHeaders,
          },
        },
      );
    }
    await recordRateLimitEntry(supabase, rateLimitIdentifier, "quote_request_multi");

    // One enquiry, contractor_id left NULL — never ambiguous about which
    // single recipient it belongs to, unlike the single-contractor path.
    const { data: enquiryRow, error: enquiryError } = await supabase
      .from("enquiries")
      .insert({
        customer_id: customerProfile.id,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: requestData.customer_phone?.trim() || null,
        contractor_id: null,
        title: projectTitle,
        job_description: requestData.project_description.trim(),
        job_type: requestData.job_type || null,
        priority: requestData.priority || null,
        access_notes: requestData.access_notes ? sanitizeText(requestData.access_notes) : null,
        location: requestData.project_location?.trim() || "",
        preferred_timeline: requestData.timeline || null,
        budget_range: requestData.budget_range || null,
        preferred_time_of_day: requestData.preferred_time_of_day || null,
        status: "new",
        source: requestData.source === "direct" || requestData.source === "panel" ? requestData.source : "marketplace",
      })
      .select("id")
      .single();

    if (enquiryError || !enquiryRow) {
      console.error("[send-quote-notification-multi] failed to insert enquiry:", enquiryError);
      return new Response(JSON.stringify({ error: "Failed to create enquiry", success: false }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    const enquiryId = enquiryRow.id as string;

    // One row per recipient, one statement — enquiry_recipients_enforce_limits
    // fires per row within this single INSERT and sees earlier rows in the
    // same statement, so the cap is correct even for a first-time 5-recipient
    // enquiry created in one call.
    const { data: recipientRows, error: recipientsError } = await supabase
      .from("enquiry_recipients")
      .insert(recipients.map((r) => ({ enquiry_id: enquiryId, contractor_id: r.id, status: "invited" })))
      .select("id, contractor_id");

    if (recipientsError) {
      console.error("[send-quote-notification-multi] failed to insert recipients:", recipientsError);
      // The enquiry row now exists with zero recipients — not left silently
      // orphaned: surfaced as a failure so the caller knows to retry, not a
      // partial success.
      return new Response(
        JSON.stringify({ error: recipientsError.message || "Failed to add recipients", success: false, enquiry_id: enquiryId }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } },
      );
    }

    // In-app notifications, one per recipient.
    const notifRows = recipients.map((r) => ({
      user_id: r.id,
      title: "New Quote Request",
      message: `${sanitizeText(requestData.customer_name)} has requested a quote for "${projectTitle}"`,
      type: "quote_request",
      reference_type: "enquiry",
    }));
    const { error: notifError } = await supabase.from("notifications").insert(notifRows);
    if (notifError) console.error("[send-quote-notification-multi] failed to insert notifications:", notifError);

    // Email each recipient individually via notify-contractor, forwarding
    // the same caller auth — matches its existing auth model exactly
    // (it authenticates the caller, not that the caller IS the contractor).
    await Promise.all(
      recipients.map(async (r) => {
        try {
          const res = await fetch(`${SUPABASE_URL}/functions/v1/notify-contractor`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: authHeader },
            body: JSON.stringify({ enquiry_id: enquiryId, contractor_id: r.id }),
          });
          if (!res.ok) {
            console.error(`[send-quote-notification-multi] notify-contractor failed for ${r.id}:`, await res.text());
          }
        } catch (err) {
          console.error(`[send-quote-notification-multi] notify-contractor invocation failed for ${r.id}:`, err);
        }
      }),
    );

    // One confirmation email to the customer, naming their own selections —
    // this is the requester's own list, not exposed to any contractor.
    if (RESEND_API_KEY) {
      try {
        const publicUrl = Deno.env.get("PUBLIC_APP_URL") ?? "https://tradesltd.co.uk";
        const emailData = {
          customerName,
          contractorName: formatNames(recipients.map((r) => r.name)),
          projectTitle,
          projectDescription,
          ctaUrl: `${publicUrl}/enquiries`,
        };
        const emailResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: "TradeStone <noreply@tradesltd.co.uk>",
            to: [customerEmail],
            subject: buildSubject("quote_request_confirmation", emailData),
            html: buildEmail("quote_request_confirmation", emailData),
          }),
        });
        if (!emailResponse.ok) {
          console.error("[send-quote-notification-multi] confirmation email failed:", await emailResponse.json());
        }
      } catch (emailErr) {
        console.error("[send-quote-notification-multi] confirmation email error:", emailErr);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        rateLimitRemaining: remainingRequests - 1,
        enquiry_id: enquiryId,
        recipient_count: recipientRows?.length ?? recipients.length,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } },
    );
  } catch (error) {
    console.error("[send-quote-notification-multi] unexpected error:", error);
    return new Response(JSON.stringify({ error: "An error occurred processing your quote request", success: false }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
