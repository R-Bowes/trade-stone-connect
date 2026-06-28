// Deploy: supabase functions deploy create-deposit-checkout
// Required secrets: SUPABASE_URL, ADMIN_SECRET_KEY, STRIPE_SECRET_KEY
// Optional: SITE_URL (defaults to https://tradesltd.co.uk)

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import Stripe from "https://esm.sh/stripe@18.5.0";

const PLATFORM_FEE = 0.035; // 3.5%

const ALLOWED_ORIGINS = [
  "https://tradesltd.co.uk",
  "https://www.tradesltd.co.uk",
  "http://localhost:5173",
  "http://localhost:4173",
];

const getCorsHeaders = (origin: string | null): HeadersInit => {
  const allowed =
    origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
};

const jsonResponse = (
  status: number,
  payload: Record<string, unknown>,
  cors: HeadersInit,
) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

serve(async (req) => {
  const origin = req.headers.get("origin");
  const cors = getCorsHeaders(origin);

  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("ADMIN_SECRET_KEY")!,
      { auth: { persistSession: false } },
    );

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse(401, { error: "Unauthorized" }, cors);

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !userData.user) return jsonResponse(401, { error: "Unauthorized" }, cors);

    // Stripe key
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      return jsonResponse(500, { error: "Payment processing unavailable" }, cors);
    }

    // Parse body
    const body = await req.json();
    const {
      project_id,
      proposal_id,
      amount,
      contractor_stripe_account,
    } = body as {
      project_id?: string;
      proposal_id?: string;
      amount?: number;
      contractor_stripe_account?: string;
    };

    if (!project_id || !amount || !contractor_stripe_account) {
      return jsonResponse(400, {
        error: "project_id, amount, and contractor_stripe_account are required",
      }, cors);
    }

    const amountPence = Math.round(amount * 100);
    if (amountPence <= 0) {
      return jsonResponse(400, { error: "Amount must be greater than zero" }, cors);
    }

    // Fetch project (for title and ownership check)
    const { data: project, error: projErr } = await supabase
      .from("projects")
      .select("title, posted_by")
      .eq("id", project_id)
      .single();
    if (projErr || !project) {
      return jsonResponse(404, { error: "Project not found" }, cors);
    }

    // Verify caller is the project poster (two-step lookup)
    const { data: caller } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", userData.user.id)
      .single();
    if (!caller || project.posted_by !== caller.id) {
      return jsonResponse(403, { error: "Forbidden" }, cors);
    }

    // Create Stripe Checkout session
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const platformFee = Math.round(amountPence * PLATFORM_FEE);
    const siteUrl = Deno.env.get("SITE_URL") || "https://tradesltd.co.uk";

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: {
              name: `Project Deposit: ${project.title}`,
            },
            unit_amount: amountPence,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${siteUrl}/projects/${project_id}?deposit=success`,
      cancel_url: `${siteUrl}/projects/${project_id}?deposit=cancelled`,
      payment_intent_data: {
        application_fee_amount: platformFee,
        transfer_data: {
          destination: contractor_stripe_account,
        },
      },
      metadata: {
        project_id,
        proposal_id: proposal_id ?? "",
        type: "project_deposit",
      },
    });

    return jsonResponse(200, { checkout_url: session.url }, cors);
  } catch (err) {
    console.error("[create-deposit-checkout] error:", err);
    return jsonResponse(500, {
      error: err instanceof Error ? err.message : "Internal server error",
    }, cors);
  }
});
