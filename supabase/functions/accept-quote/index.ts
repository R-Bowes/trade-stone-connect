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
import { PLATFORM_FEE_PERCENT } from "../_shared/paymentMath.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
  apiVersion: "2025-08-27.basil",
});

// The invoice's due date, when the contractor has no finance_settings row
// yet (default_payment_terms_days unset). Matches the default used
// elsewhere (CLAUDE.md invoice conventions).
const DEFAULT_PAYMENT_TERMS_DAYS = 14;

const ALLOWED_ORIGINS = [
  "https://tradesltd.co.uk",
  "https://www.tradesltd.co.uk",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://localhost:8080",
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

  const json = (status: number, body: Record<string, unknown>) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

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

    // A deposit-bearing quote that could never be issued as an invoice (bad
    // figures, or 20%+ VAT from a contractor who isn't registered) must be
    // caught BEFORE acceptance — not after the slot is confirmed and the
    // quote is already marked accepted. Non-deposit quotes don't mint an
    // invoice at acceptance time at all, so they skip this check entirely.
    const { data: depositQuote, error: depositQuoteError } = await serviceClient
      .from("issued_quotes")
      .select("deposit_required")
      .eq("id", quote_id)
      .maybeSingle();
    if (depositQuoteError) {
      console.error("Failed to read quote deposit_required before acceptance", depositQuoteError);
      return json(500, { error: "Could not check this quote before accepting it" });
    }
    if (depositQuote?.deposit_required) {
      const { data: problem, error: problemError } = await serviceClient.rpc("_quote_invoice_problem", {
        p_quote_id: quote_id,
      });
      if (problemError) {
        console.error("_quote_invoice_problem failed", problemError);
        return json(500, { error: "Could not check this quote before accepting it" });
      }
      if (problem) {
        return json(409, {
          error: `This quote can't be accepted yet: ${problem} Ask the contractor to send a revised quote.`,
        });
      }
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
        "id, contractor_id, recipient_id, title, description, client_name, client_email, client_phone, client_address, items, subtotal, tax_rate, tax_amount, total",
      )
      .eq("id", quote_id)
      .single();

    if (quoteError || !quote) {
      console.error("Failed to reload quote after acceptance", quoteError);
      return json(500, { error: "Quote accepted but could not be reloaded for payment setup" });
    }

    const { data: contractorProfile } = await serviceClient
      .from("profiles")
      .select("stripe_account_id, stripe_transfers_capability")
      .eq("id", quote.contractor_id)
      .maybeSingle();

    if (!contractorProfile?.stripe_account_id) {
      return json(400, { error: "Contractor is not set up to receive payments" });
    }

    // NULL (not yet observed) fails open — only a confirmed non-active
    // capability blocks. See profiles.stripe_transfers_capability's column
    // comment.
    if (
      contractorProfile.stripe_transfers_capability != null &&
      contractorProfile.stripe_transfers_capability !== "active"
    ) {
      return json(400, { error: "Contractor's payment account cannot currently receive payments — please contact them directly." });
    }

    const depositAmount = Number(result.deposit_amount);
    if (!depositAmount || depositAmount <= 0) {
      return json(500, { error: "Deposit amount could not be resolved" });
    }

    // One live invoice per quote (DB-enforced: invoices_one_live_per_quote).
    // A retried pay-button click (e.g. after a failed Payment Element load,
    // or a page refresh) must reuse that invoice, not try to mint a second
    // one for the same quote.
    const { data: existingInvoices } = await serviceClient
      .from("invoices")
      .select("id, status, stripe_payment_intent_id")
      .eq("quote_id", quote.id)
      .neq("status", "void")
      .order("created_at", { ascending: false })
      .limit(1);

    let invoice = existingInvoices?.[0] as { id: string; status: string; stripe_payment_intent_id: string | null } | undefined;

    // A found invoice that is still 'draft' (e.g. a retry after a previous
    // issue attempt failed) must be issued before any PaymentIntent is
    // created or reused for it — never mint or reuse a PI against a draft.
    if (invoice && invoice.status === "draft") {
      const { error: issueError } = await serviceClient.rpc("_issue_invoice", { p_invoice_id: invoice.id });
      if (issueError) {
        console.error("_issue_invoice failed for existing draft deposit invoice", issueError);
        return json(500, { error: issueError.message });
      }
      invoice = { ...invoice, status: "sent" };
    }

    if (invoice?.stripe_payment_intent_id) {
      try {
        const existingPi = await stripe.paymentIntents.retrieve(invoice.stripe_payment_intent_id);
        if (["requires_payment_method", "requires_action", "requires_confirmation"].includes(existingPi.status)) {
          return json(200, {
            deposit_required: true,
            client_secret: existingPi.client_secret,
            invoice_id: invoice.id,
            deposit_amount: depositAmount,
            confirmed_start: result.confirmed_start,
          });
        }
        // Otherwise (canceled/succeeded/processing) fall through and mint a fresh PI on the same invoice.
      } catch (piErr) {
        console.error("Failed to retrieve existing PaymentIntent, creating a new one", piErr);
        // Fall through and mint a fresh PI on the same invoice.
      }
    }

    if (!invoice) {
      // The invoice carries the FULL quote value (invoices.total is always
      // gross -- CLAUDE.md) and mirrors the quote's own items/subtotal/
      // tax_rate/tax_amount exactly; deposit_amount is tracked separately as
      // a payment against that total, not a smaller "total".
      const { data: financeSettings } = await serviceClient
        .from("finance_settings")
        .select("default_payment_terms_days")
        .eq("contractor_id", quote.contractor_id)
        .maybeSingle();
      const termsDays = financeSettings?.default_payment_terms_days ?? DEFAULT_PAYMENT_TERMS_DAYS;
      const dueDate = (() => {
        const due = new Date();
        due.setDate(due.getDate() + termsDays);
        return due.toISOString().slice(0, 10);
      })();

      const { data: draftInvoice, error: draftError } = await serviceClient
        .from("invoices")
        .insert({
          contractor_id: quote.contractor_id,
          recipient_id: quote.recipient_id,
          quote_id: quote.id,
          client_name: quote.client_name,
          client_email: quote.client_email,
          client_phone: quote.client_phone,
          client_address: quote.client_address,
          items: quote.items,
          subtotal: quote.subtotal,
          tax_rate: quote.tax_rate,
          tax_amount: quote.tax_amount,
          total: quote.total,
          deposit_amount: depositAmount,
          due_date: dueDate,
        })
        .select("id")
        .single();

      if (draftError || !draftInvoice) {
        console.error("Draft invoice creation failed", draftError);
        return json(500, { error: "Failed to create invoice" });
      }

      // _issue_invoice is service_role only -- call it on serviceClient, not
      // the caller's JWT. If it refuses (e.g. 20% tax from an unregistered
      // contractor), surface its message rather than swallowing it: the
      // deposit flow cannot proceed with an invoice that was never issued.
      const { error: issueError } = await serviceClient.rpc("_issue_invoice", { p_invoice_id: draftInvoice.id });
      if (issueError) {
        console.error("_issue_invoice failed for deposit invoice", issueError);
        return json(500, { error: issueError.message });
      }

      const { data: issuedInvoice, error: reloadError } = await serviceClient
        .from("invoices")
        .select("id, status, stripe_payment_intent_id")
        .eq("id", draftInvoice.id)
        .single();
      if (reloadError || !issuedInvoice) {
        console.error("Failed to reload invoice after issuing", reloadError);
        return json(500, { error: "Invoice issued but could not be reloaded for payment setup" });
      }
      invoice = issuedInvoice;
    }

    const depositPence = Math.round(depositAmount * 100);
    const platformFee = Math.round(depositPence * PLATFORM_FEE_PERCENT);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: depositPence,
      currency: "gbp",
      // Card only (Apple/Google Pay ride on 'card' via the Payment Element) —
      // drops Klarna/Revolut Pay and other BNPL/delayed-confirmation methods,
      // which don't suit a deposit that needs to confirm the job immediately.
      payment_method_types: ["card"],
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
