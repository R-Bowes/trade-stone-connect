import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
});

// Brief 2 added a CONTRACTOR_PAYOUT_DELAY_DAYS payout hold as a flagged
// placeholder. REMOVED (Brief 2a): debit_negative_balances is confirmed On
// (verified in the Stripe Dashboard on the existing connected account), so
// a failed transfer reversal already pulls from the contractor's attached
// bank account without needing a payout delay to create a clawback window.
// A payout delay adds nothing against chargebacks, which can arrive up to
// 120 days after the charge — far longer than any delay we'd impose — and
// it imposes real cashflow friction on contractors, counter to TradeStone's
// positioning. Revisit only if reversal failures are observed in practice.

const ALLOWED_BUSINESS_TYPES = ["individual", "company", "non_profit", "government_entity"] as const;
type BusinessType = typeof ALLOWED_BUSINESS_TYPES[number];

const ALLOWED_ORIGINS = [
  "https://tradesltd.co.uk",
  "https://www.tradesltd.co.uk",
  "http://localhost:5173",
  "http://localhost:4173",
];

const getCorsHeaders = (origin: string | null): HeadersInit => {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
};

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req.headers.get("Origin"));

  const jsonResponse = (status: number, payload: Record<string, unknown>) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("ADMIN_SECRET_KEY")!
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse(401, { success: false, error: "Unauthorized" });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return jsonResponse(401, { success: false, error: "Unauthorized" });
    }

    // business_type from the request body — defaults to "individual" if
    // absent (matches the previous hardcoded behaviour for existing
    // callers). NOTE: no caller currently sends this — the contractor
    // onboarding UI needs updating to collect and pass it; not built here.
    let requestedBusinessType: string | undefined;
    try {
      const body = await req.json();
      requestedBusinessType = body?.business_type;
    } catch {
      // No body (or invalid JSON) sent — fall through to the default.
    }
    const businessType: BusinessType = requestedBusinessType && (ALLOWED_BUSINESS_TYPES as readonly string[]).includes(requestedBusinessType)
      ? requestedBusinessType as BusinessType
      : "individual";
    if (requestedBusinessType && !(ALLOWED_BUSINESS_TYPES as readonly string[]).includes(requestedBusinessType)) {
      return jsonResponse(400, { success: false, error: `Invalid business_type. Must be one of: ${ALLOWED_BUSINESS_TYPES.join(", ")}` });
    }

    // Check if contractor already has a Stripe account
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("stripe_account_id, full_name, email")
      .eq("user_id", user.id)
      .single();

    if (profileError) {
      return jsonResponse(500, { success: false, error: "Failed to load profile" });
    }

    let accountId = profile?.stripe_account_id;

    if (!accountId) {
      // Create a new Express account.
      //
      // These settings apply to NEWLY CREATED accounts only — existing
      // connected accounts (including acct_1TnLKCK6BjgGpUY4) need updating
      // separately; see the Brief 2 report for how to list them and update
      // in bulk.
      const account = await stripe.accounts.create({
        type: "express",
        country: "GB",
        email: profile?.email || user.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: businessType,
        settings: {
          payouts: {
            schedule: { interval: "weekly", weekly_anchor: "friday" },
            // Lets Stripe debit the connected account's external (bank)
            // account to cover a negative balance — e.g. when a transfer
            // reversal (Brief 2, D2) takes it negative. Express accounts
            // already default controller.losses.payments to "application"
            // (TradeStone, not Stripe, is liable for negative balances —
            // confirmed against Stripe's account-type-to-controller mapping:
            // type=express implies losses.payments=application with no
            // extra parameter needed), so debit_negative_balances is the
            // parameter that actually governs the recovery mechanism here.
            // Explicit rather than relying on its own Stripe-side default
            // (also true) — see the Brief 2 report for the full reasoning
            // and why controller.losses.payments is deliberately NOT also
            // set alongside `type`. Confirmed On in the Stripe Dashboard
            // for the existing connected account (Brief 2a) — kept
            // explicit here rather than relying on that default persisting.
            debit_negative_balances: true,
          },
        },
      });

      accountId = account.id;

      // Save to profile
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ stripe_account_id: accountId })
        .eq("user_id", user.id);

      if (updateError) {
        throw updateError;
      }
    }

    const publicUrl = Deno.env.get("PUBLIC_URL")!;

    // Create onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${publicUrl}/dashboard/contractor?stripe=refresh`,
      return_url: `${publicUrl}/dashboard/contractor?stripe=success`,
      type: "account_onboarding",
    });

    return jsonResponse(200, { success: true, url: accountLink.url });
  } catch (error) {
    console.error("Error:", error);
    return jsonResponse(500, { success: false, error: error instanceof Error ? error.message : "Unknown server error" });
  }
});
