import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@4.7.0";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2024-06-20",
});

const resendApiKey = Deno.env.get("RESEND_API_KEY");
const resend = resendApiKey ? new Resend(resendApiKey) : null;

const PLATFORM_FEE_PERCENT = 0.035;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
      return new Response(JSON.stringify({ error: "invoiceId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select(`
        id,
        invoice_number,
        contractor_id,
        client_id,
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
      return new Response(JSON.stringify({ error: "Invoice not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "send_invoice") {
      const authHeader = req.headers.get("Authorization");
      const token = authHeader?.replace("Bearer ", "");
      if (!token) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: authData } = await supabase.auth.getUser(token);
      if (!authData.user || authData.user.id !== invoice.contractor_id) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { data: contractorProfile, error: contractorError } = await supabase
      .from("profiles")
      .select("stripe_account_id")
      .eq("user_id", invoice.contractor_id)
      .single();

    if (contractorError || !contractorProfile?.stripe_account_id) {
      return new Response(JSON.stringify({ error: "Contractor Stripe account is not configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const amountInPence = Math.round(Number(invoice.total || 0) * 100);
    if (amountInPence <= 0) {
      return new Response(JSON.stringify({ error: "Invoice total must be greater than zero" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
          clientId: invoice.client_id,
        },
      });

      paymentIntentId = paymentIntent.id;
      clientSecret = paymentIntent.client_secret;

      await supabase
        .from("invoices")
        .update({ stripe_payment_intent_id: paymentIntentId })
        .eq("id", invoice.id);
    }

    if (action === "send_invoice") {
      const { error: sendUpdateError } = await supabase
        .from("invoices")
        .update({ status: "sent" })
        .eq("id", invoice.id);

      if (sendUpdateError) {
        throw sendUpdateError;
      }

      if (resend) {
        const publicUrl = Deno.env.get("PUBLIC_APP_URL") ?? "http://localhost:5173";
        const paymentLink = `${publicUrl}/pay/${invoice.id}`;

        await resend.emails.send({
          from: Deno.env.get("RESEND_FROM_EMAIL") ?? "TradeStone <invoices@tradestone.app>",
          to: [invoice.client_email],
          subject: `Invoice ${invoice.invoice_number ?? invoice.id} is ready for payment`,
          html: `
            <h2>Invoice from TradeStone contractor</h2>
            <p>Hi ${invoice.client_name},</p>
            <p>Your invoice <strong>${invoice.invoice_number ?? invoice.id}</strong> is now ready.</p>
            <p><a href="${paymentLink}">Pay invoice securely</a></p>
            <p>Thank you.</p>
          `,
        });
      }
    }

    return new Response(
      JSON.stringify({
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
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("create-payment-intent failed", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
