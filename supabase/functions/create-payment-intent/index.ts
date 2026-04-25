import Stripe from "https://esm.sh/stripe@14.21.0?target=deno&no-check";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
});

const PLATFORM_FEE_PERCENT = 0.035;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (status: number, payload: Record<string, unknown>) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type RequestBody = {
  action?: "send_invoice" | "create_client_secret";
  invoiceId: string;
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

    const { action = "create_client_secret", invoiceId }: RequestBody = await req.json();

    if (!invoiceId) {
      return jsonResponse(400, { success: false, error: "invoiceId is required" });
    }

    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select(`
        id,
        invoice_number,
        contractor_id,
        recipient_id,
        client_email,
        client_name,
        due_date,
        items,
        subtotal,
        tax_amount,
        total,
        status,
        stripe_payment_intent_id
      `)
      .eq("id", invoiceId)
      .single();

    if (invoiceError || !invoice) {
      return jsonResponse(400, { success: false, error: "Invoice not found" });
    }

    const { data: contractorProfile, error: contractorError } = await supabase
      .from("profiles")
      .select("stripe_account_id, user_id")
      .eq("id", invoice.contractor_id)
      .single();

    if (contractorError || !contractorProfile?.stripe_account_id) {
      return jsonResponse(400, { success: false, error: "Contractor Stripe account is not configured" });
    }

    if (action === "send_invoice") {
      const authHeader = req.headers.get("Authorization");
      const token = authHeader?.replace("Bearer ", "");
      if (!token) {
        return jsonResponse(401, { success: false, error: "Unauthorized" });
      }

      const { data: authData, error: authError } = await supabase.auth.getUser(token);
      if (authError || !authData.user || authData.user.id !== contractorProfile?.user_id) {
        return jsonResponse(401, { success: false, error: "Unauthorized" });
      }
    }

    const amountInPence = Math.round(Number(invoice.total || 0) * 100);
    if (amountInPence <= 0) {
      return jsonResponse(400, { success: false, error: "Invoice total must be greater than zero" });
    }

    const platformFee = Math.round(amountInPence * PLATFORM_FEE_PERCENT);

    let paymentIntentId = invoice.stripe_payment_intent_id;
    let clientSecret: string | null = null;

    if (paymentIntentId) {
      const existingIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      clientSecret = existingIntent.client_secret;
    } else {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amountInPence,
        currency: "gbp",
        application_fee_amount: platformFee,
        transfer_data: {
          destination: contractorProfile.stripe_account_id,
        },
        metadata: {
          invoiceId: invoice.id,
          contractorId: invoice.contractor_id,
          clientId: invoice.recipient_id,
        },
      });

      paymentIntentId = paymentIntent.id;
      clientSecret = paymentIntent.client_secret;

      const { error: intentUpdateError } = await supabase
        .from("invoices")
        .update({ stripe_payment_intent_id: paymentIntentId })
        .eq("id", invoice.id);

      if (intentUpdateError) {
        throw intentUpdateError;
      }
    }

    if (action === "send_invoice") {
      const { error: sendUpdateError } = await supabase
        .from("invoices")
        .update({ status: "sent" })
        .eq("id", invoice.id);

      if (sendUpdateError) {
        throw sendUpdateError;
      }
    }

    return jsonResponse(200, {
        clientSecret,
        paymentIntentId,
        invoice: {
          id: invoice.id,
          invoice_number: invoice.invoice_number,
          client_name: invoice.client_name,
          due_date: (invoice as any).due_date,
          status: invoice.status,
          items: (invoice as any).items ?? [],
          subtotal: Number((invoice as any).subtotal ?? 0),
          tax_amount: Number((invoice as any).tax_amount ?? 0),
          total: Number(invoice.total ?? 0),
        },
      });
  } catch (error) {
    console.error("create-payment-intent failed", error);
    return jsonResponse(500, { success: false, error: error instanceof Error ? error.message : "Unknown server error" });
  }
});
