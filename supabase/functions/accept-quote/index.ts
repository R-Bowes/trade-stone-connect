// supabase/functions/accept-quote/index.ts
//
// Atomic accept -> deposit -> job slice. Body: { quote_id, event_id }.
//
// The recipient picks one proposed schedule_events slot for a quote; this
// function calls accept_quote_with_slot(quote_id, event_id) on a USER-JWT-
// bound client so auth.uid() resolves to the recipient inside that
// SECURITY DEFINER function (it re-derives the caller's profile id itself
// and rejects anyone but the quote's recipient). The RPC does the atomic
// work: confirms the chosen slot, declines the rest, marks the quote
// accepted, and -- if no deposit is due -- mints the job immediately via
// mint_job_from_quote.
//
// If a deposit IS due, minting is deferred to the stripe-webhook on
// payment_intent.succeeded (LOCKED DECISION: a scheduled job means money
// has moved, or none was due) -- this function only sets up the invoice and
// PaymentIntent. Never reads the legacy `quotes` table. Never defaults a
// deposit amount -- it comes only from issued_quotes.deposit_amount, itself
// only reachable through the RPC's own return value.
import Stripe from "https://esm.sh/stripe@18.5.0?target=deno";
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2025-08-27.basil",
});

const PLATFORM_FEE_PERCENT = 0.035;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) return json(401, { error: "Unauthorized" });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    // Service-role client: token verification, invoice creation, Stripe setup.
    const serviceClient = createClient(supabaseUrl, Deno.env.get("ADMIN_SECRET_KEY")!, {
      auth: { persistSession: false },
    });

    // User-JWT-bound client: the RPC itself derives the caller's profile from
    // auth.uid(), so this MUST carry the caller's own token, not the service
    // role -- SUPABASE_ANON_KEY is a Supabase-reserved, platform-injected
    // secret (always present, no manual configuration needed).
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: authData, error: authError } = await serviceClient.auth.getUser(token);
    if (authError || !authData.user) return json(401, { error: "Unauthorized" });

    const { quote_id, event_id }: { quote_id?: string; event_id?: string } = await req.json();
    if (!quote_id || !event_id) {
      return json(400, { error: "quote_id and event_id are required" });
    }

    const { data: rpcResult, error: rpcError } = await userClient.rpc("accept_quote_with_slot", {
      p_quote_id: quote_id,
      p_event_id: event_id,
    });

    if (rpcError) {
      console.error("accept_quote_with_slot failed", rpcError);
      return json(400, { error: rpcError.message });
    }

    const result = rpcResult as {
      deposit_required: boolean;
      deposit_amount: number | null;
      job_id: string | null;
      confirmed_start: string;
    };

    if (!result.deposit_required) {
      return json(200, {
        deposit_required: false,
        job_id: result.job_id,
        confirmed_start: result.confirmed_start,
      });
    }

    // Deposit required — set up the invoice + PaymentIntent. The job is NOT
    // minted here; the stripe-webhook mints it on payment_intent.succeeded.
    const { data: quote, error: quoteError } = await serviceClient
      .from("issued_quotes")
      .select(
        "id, contractor_id, recipient_id, title, description, client_name, client_email, client_phone, client_address, total",
      )
      .eq("id", quote_id)
      .single();

    if (quoteError || !quote) {
      console.error("Failed to reload quote after acceptance", quoteError);
      return json(500, { error: "Quote accepted but could not be reloaded for payment setup" });
    }

    const { data: contractorProfile } = await serviceClient
      .from("profiles")
      .select("stripe_account_id")
      .eq("id", quote.contractor_id)
      .maybeSingle();

    if (!contractorProfile?.stripe_account_id) {
      return json(400, { error: "Contractor is not set up to receive payments" });
    }

    const depositAmount = Number(result.deposit_amount);
    if (!depositAmount || depositAmount <= 0) {
      return json(500, { error: "Deposit amount could not be resolved" });
    }

    // Idempotency: a retried pay-button click (e.g. after a failed Payment
    // Element load, or a page refresh) must reuse the existing pending
    // invoice/PaymentIntent rather than minting a new one every time.
    const { data: existingInvoices } = await serviceClient
      .from("invoices")
      .select("id, stripe_payment_intent_id")
      .eq("quote_id", quote.id)
      .eq("status", "pending")
      .not("stripe_payment_intent_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1);

    const existingInvoice = existingInvoices?.[0];
    if (existingInvoice?.stripe_payment_intent_id) {
      try {
        const existingPi = await stripe.paymentIntents.retrieve(existingInvoice.stripe_payment_intent_id);
        if (["requires_payment_method", "requires_action", "requires_confirmation"].includes(existingPi.status)) {
          return json(200, {
            deposit_required: true,
            client_secret: existingPi.client_secret,
            invoice_id: existingInvoice.id,
            deposit_amount: depositAmount,
            confirmed_start: result.confirmed_start,
          });
        }
        // Otherwise (canceled/succeeded/processing) fall through and mint a fresh invoice + PI.
      } catch (piErr) {
        console.error("Failed to retrieve existing PaymentIntent, creating a new one", piErr);
        // Fall through and mint a fresh invoice + PI.
      }
    }

    const depositPence = Math.round(depositAmount * 100);
    const platformFee = Math.round(depositPence * PLATFORM_FEE_PERCENT);

    const { data: invoice, error: invoiceError } = await serviceClient
      .from("invoices")
      .insert({
        contractor_id: quote.contractor_id,
        recipient_id: quote.recipient_id,
        quote_id: quote.id,
        client_name: quote.client_name,
        client_email: quote.client_email,
        client_phone: quote.client_phone,
        client_address: quote.client_address,
        subtotal: Number(quote.total),
        tax_amount: 0,
        total: Number(quote.total),
        deposit_amount: depositAmount,
        due_date: new Date().toISOString().slice(0, 10),
        status: "pending",
        items: [
          {
            description: quote.description ?? quote.title ?? "Works as quoted",
            quantity: 1,
            unit_price: Number(quote.total),
            total: Number(quote.total),
          },
        ],
      })
      .select()
      .single();

    if (invoiceError || !invoice) {
      console.error("Invoice creation failed", invoiceError);
      return json(500, { error: "Failed to create invoice" });
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: depositPence,
      currency: "gbp",
      application_fee_amount: platformFee,
      transfer_data: { destination: contractorProfile.stripe_account_id },
      metadata: {
        invoiceId: invoice.id,
        quoteId: quote.id,
        contractorId: quote.contractor_id,
        clientId: quote.recipient_id ?? "",
        type: "deposit",
      },
    });

    const { error: piUpdateError } = await serviceClient
      .from("invoices")
      .update({ stripe_payment_intent_id: paymentIntent.id })
      .eq("id", invoice.id);
    if (piUpdateError) {
      console.error("Failed to store payment intent id on invoice", piUpdateError);
    }

    return json(200, {
      deposit_required: true,
      client_secret: paymentIntent.client_secret,
      invoice_id: invoice.id,
      deposit_amount: depositAmount,
      confirmed_start: result.confirmed_start,
    });
  } catch (err) {
    console.error("accept-quote failed", err);
    return json(500, { error: err instanceof Error ? err.message : "Unknown error" });
  }
});
