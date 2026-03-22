import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");
    const { data: { user } } = await supabase.auth.getUser(token);

    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if contractor already has a Stripe account
    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_account_id, full_name, email")
      .eq("user_id", user.id)
      .single();

    let accountId = profile?.stripe_account_id;

    if (!accountId) {
      // Create a new Express account
      const account = await stripe.accounts.create({
        type: "express",
        country: "GB",
        email: profile?.email || user.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: "individual",
        settings: {
          payouts: {
            schedule: { interval: "weekly", weekly_anchor: "friday" },
          },
        },
      });

      accountId = account.id;

      // Save to profile
      await supabase
        .from("profiles")
        .update({ stripe_account_id: accountId })
        .eq("user_id", user.id);
    }

    const publicUrl = Deno.env.get("PUBLIC_URL")!;

    // Create onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `${publicUrl}/dashboard/contractor?stripe=refresh`,
      return_url: `${publicUrl}/dashboard/contractor?stripe=success`,
      type: "account_onboarding",
    });

    return new Response(JSON.stringify({ url: accountLink.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
