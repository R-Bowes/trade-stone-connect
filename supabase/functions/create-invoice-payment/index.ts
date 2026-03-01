import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const DEFAULT_ALLOWED_ORIGINS = [
  "https://tradestone.lovable.app",
  "https://id-preview--044cecf7-f854-4f7f-a7bd-b9c1af6bc7e3.lovable.app",
  "http://localhost:5173",
  "http://localhost:4173",
];

const ALLOWED_ORIGINS = (() => {
  const envOrigins = Deno.env.get("ALLOWED_ORIGINS");
  if (!envOrigins) return DEFAULT_ALLOWED_ORIGINS;
  return envOrigins.split(",").map((o) => o.trim()).filter((o) => o.length > 0);
})();

const getCorsHeaders = (origin: string | null): HeadersInit => {
  const allowedOrigin = origin && ALLOWED_ORIGINS.includes(origin)
    ? origin
    : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
    "Vary": "Origin",
  };
};

serve(async (req) => {
  const origin = req.headers.get("origin");
  const corsHeaders = getCorsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), {
      status: 403,
      headers: corsHeaders,
    });
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

    const { invoice_id } = await req.json();
    if (!invoice_id) {
      return new Response(JSON.stringify({ error: "invoice_id required" }), { status: 400, headers: corsHeaders });
    }

    // Get the invoice
    const { data: invoice, error: invError } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", invoice_id)
      .eq("recipient_id", userData.user.id)
      .single();

    if (invError || !invoice) {
      return new Response(JSON.stringify({ error: "Invoice not found or not authorized" }), { status: 404, headers: corsHeaders });
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return new Response(JSON.stringify({ error: "Payment processing unavailable" }), { status: 500, headers: corsHeaders });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Check if customer exists
    const customers = await stripe.customers.list({ email: userData.user.email!, limit: 1 });
    let customerId: string | undefined;
    if (customers.data.length > 0) {
      customerId = customers.data[0].id;
    }

    // Convert total to pence (GBP minor units)
    const amountInPence = Math.round(Number(invoice.total) * 100);

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : userData.user.email!,
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: {
              name: `Invoice ${invoice.invoice_number || invoice.id}`,
              description: `Payment for invoice from TradeStone`,
            },
            unit_amount: amountInPence,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${req.headers.get("origin")}/dashboard?payment=success`,
      cancel_url: `${req.headers.get("origin")}/dashboard?payment=cancelled`,
      metadata: {
        invoice_id: invoice.id,
        contractor_id: invoice.contractor_id,
      },
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error in create-invoice-payment:", error);
    return new Response(JSON.stringify({ error: "An error occurred processing your payment request" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
