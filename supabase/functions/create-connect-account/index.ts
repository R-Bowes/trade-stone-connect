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

const jsonResponse = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
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
