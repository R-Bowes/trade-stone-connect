import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { action_type, context_type, context_id, message } = await req.json();

    // Get the acting user's profile
    const { data: actorProfile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("user_id", userData.user.id)
      .single();

    let contractorEmail = "";
    let contractorName = "";
    let recipientEmail = actorProfile?.email || userData.user.email || "";
    let recipientName = actorProfile?.full_name || "User";
    let contextLabel = "";

    if (context_type === "invoice") {
      const { data: invoice } = await supabase
        .from("invoices")
        .select("contractor_id, invoice_number, client_name, client_email")
        .eq("id", context_id)
        .single();

      if (invoice) {
        contextLabel = `Invoice ${invoice.invoice_number || context_id}`;
        const { data: contractorProfile } = await supabase
          .from("profiles")
          .select("full_name, email")
          .eq("user_id", invoice.contractor_id)
          .single();
        contractorEmail = contractorProfile?.email || "";
        contractorName = contractorProfile?.full_name || "Contractor";
      }
    } else if (context_type === "quote") {
      const { data: quote } = await supabase
        .from("issued_quotes")
        .select("contractor_id, quote_number, title")
        .eq("id", context_id)
        .single();

      if (quote) {
        contextLabel = `Quote ${quote.quote_number || quote.title}`;
        const { data: contractorProfile } = await supabase
          .from("profiles")
          .select("full_name, email")
          .eq("user_id", quote.contractor_id)
          .single();
        contractorEmail = contractorProfile?.email || "";
        contractorName = contractorProfile?.full_name || "Contractor";
      }
    }

    const actionLabels: Record<string, string> = {
      pay: "Payment Initiated",
      stall: "Stalled",
      query: "Query Raised",
      accept: "Accepted",
      reject: "Rejected",
      message: "New Message",
    };

    const actionLabel = actionLabels[action_type] || action_type;

    // Send emails via Resend
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (RESEND_API_KEY && contractorEmail) {
      // Email to contractor
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "TradeStone <onboarding@resend.dev>",
          to: [contractorEmail],
          subject: `${contextLabel} - ${actionLabel} by ${recipientName}`,
          html: `
            <h2>TradeStone Notification</h2>
            <p><strong>${recipientName}</strong> has responded to your <strong>${contextLabel}</strong>.</p>
            <p><strong>Action:</strong> ${actionLabel}</p>
            ${message ? `<p><strong>Message:</strong> ${message}</p>` : ""}
            <p>Log in to TradeStone to view details and respond.</p>
          `,
        }),
      });

      // Email to recipient (confirmation)
      if (recipientEmail && recipientEmail !== contractorEmail) {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: "TradeStone <onboarding@resend.dev>",
            to: [recipientEmail],
            subject: `Your response to ${contextLabel} - ${actionLabel}`,
            html: `
              <h2>TradeStone Notification</h2>
              <p>You responded to <strong>${contractorName}'s</strong> ${contextLabel}.</p>
              <p><strong>Your Action:</strong> ${actionLabel}</p>
              ${message ? `<p><strong>Your Message:</strong> ${message}</p>` : ""}
              <p>Log in to TradeStone to continue the conversation.</p>
            `,
          }),
        });
      }
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error in notify-invoice-quote-action:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
