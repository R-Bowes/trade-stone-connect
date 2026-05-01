// TODO: Deploy this function and set the required secret:
//   supabase functions deploy notify-contractor
//   supabase secrets set RESEND_API_KEY=your_resend_api_key_here
//
// Call from the frontend immediately after a new enquiry is created:
//   supabase.functions.invoke('notify-contractor', { body: { enquiry_id } })

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const ALLOWED_ORIGINS = [
  "https://tradesltd.co.uk",
  "https://www.tradesltd.co.uk",
  "http://localhost:5173",
  "http://localhost:4173",
];

const getCorsHeaders = (origin: string | null): HeadersInit => {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
};

const jsonResponse = (
  status: number,
  payload: Record<string, unknown>,
  corsHeaders: HeadersInit,
) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    // Verify the caller is authenticated (they must be logged in to submit enquiries).
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse(401, { success: false, error: "Unauthorized" }, corsHeaders);
    }
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return jsonResponse(401, { success: false, error: "Unauthorized" }, corsHeaders);
    }

    const body = await req.json();
    const enquiry_id: string | undefined = body?.enquiry_id;
    if (!enquiry_id || typeof enquiry_id !== "string") {
      return jsonResponse(400, { success: false, error: "enquiry_id required" }, corsHeaders);
    }

    // Fetch the enquiry row.
    const { data: enquiry, error: enquiryError } = await supabase
      .from("enquiries")
      .select("id, job_description, location, contractor_id, customer_id")
      .eq("id", enquiry_id)
      .single();

    if (enquiryError || !enquiry) {
      console.error("[notify-contractor] enquiry fetch failed:", enquiryError);
      return jsonResponse(404, { success: false, error: "Enquiry not found" }, corsHeaders);
    }

    if (!enquiry.contractor_id) {
      return jsonResponse(400, { success: false, error: "Enquiry has no contractor_id" }, corsHeaders);
    }

    // Fetch the contractor's email from profiles (profiles.id = enquiry.contractor_id).
    const { data: contractorProfile } = await supabase
      .from("profiles")
      .select("email, full_name")
      .eq("id", enquiry.contractor_id)
      .maybeSingle();

    if (!contractorProfile?.email) {
      console.warn("[notify-contractor] contractor profile has no email — skipping notification");
      return jsonResponse(200, { success: true, skipped: true }, corsHeaders);
    }

    // Fetch the customer's ts_profile_code for display in the email.
    let customerRef = "Guest";
    if (enquiry.customer_id) {
      const { data: customerProfile } = await supabase
        .from("profiles")
        .select("ts_profile_code")
        .eq("id", enquiry.customer_id)
        .maybeSingle();
      if (customerProfile?.ts_profile_code) {
        customerRef = customerProfile.ts_profile_code;
      }
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      console.error("[notify-contractor] RESEND_API_KEY secret is not set");
      return jsonResponse(500, { success: false, error: "Email service not configured" }, corsHeaders);
    }

    const location = enquiry.location?.trim() || "Not specified";
    const body_text = [
      "You have received a new enquiry via TradeStone.",
      "",
      `Customer:    ${customerRef}`,
      `Location:    ${location}`,
      "",
      "Description:",
      enquiry.job_description,
      "",
      "Log in to TradeStone to view the full enquiry and send a quote.",
      "",
      "— The TradeStone Team",
    ].join("\n");

    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "TradeStone <noreply@tradesltd.co.uk>",
        to: [contractorProfile.email],
        subject: "New enquiry received — TradeStone",
        text: body_text,
      }),
    });

    if (!emailRes.ok) {
      const resendError = await emailRes.json();
      console.error("[notify-contractor] Resend API error:", resendError);
      return jsonResponse(500, { success: false, error: "Failed to send email" }, corsHeaders);
    }

    console.log(
      `[notify-contractor] email sent to ${contractorProfile.email} for enquiry ${enquiry_id}`,
    );
    return jsonResponse(200, { success: true }, corsHeaders);
  } catch (error: unknown) {
    console.error("[notify-contractor] unexpected error:", error);
    return jsonResponse(500, { success: false, error: "Internal server error" }, corsHeaders);
  }
});
