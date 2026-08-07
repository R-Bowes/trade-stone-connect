import Stripe from "https://esm.sh/stripe@14.21.0?target=deno&no-check";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { amountPayable, depositSettled, platformFeePence, toPence } from "../_shared/paymentMath.ts";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
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
      Deno.env.get("ADMIN_SECRET_KEY")!
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
        stripe_payment_intent_id,
        deposit_amount,
        deposit_deducted,
        deposit_paid
      `)
      .eq("id", invoiceId)
      .single();

    if (invoiceError || !invoice) {
      return jsonResponse(400, { success: false, error: "Invoice not found" });
    }

    // Nothing left to collect on a paid invoice, and a voided one should
    // never be charged at all.
    if (invoice.status === "paid" || invoice.status === "void") {
      return jsonResponse(400, {
        success: false,
        error: `This invoice is ${invoice.status} — there is nothing to pay.`,
      });
    }

    const { data: contractorProfile, error: contractorError } = await supabase
      .from("profiles")
      .select("stripe_account_id, user_id, stripe_transfers_capability")
      .eq("id", invoice.contractor_id)
      .single();

    if (contractorError || !contractorProfile?.stripe_account_id) {
      return jsonResponse(400, { success: false, error: "Contractor Stripe account is not configured" });
    }

    // NULL (not yet observed) fails open — only a confirmed non-active
    // capability blocks. See profiles.stripe_transfers_capability's column
    // comment.
    if (
      contractorProfile.stripe_transfers_capability != null &&
      contractorProfile.stripe_transfers_capability !== "active"
    ) {
      return jsonResponse(400, { success: false, error: "Contractor's payment account cannot currently receive payments — please contact them directly." });
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

    if (action === "create_client_secret") {
      // Verify-if-present, not required: this path also serves the
      // anonymous overdue-invoice email link (/pay/:invoiceId — see
      // mark-overdue-invoices), which has no session and no Authorization
      // header worth trusting. supabase.functions.invoke() sends the anon
      // key by default when there's no active session, which resolves to
      // no user below — that case is intentionally let through, bounded
      // by the invoice id being an unguessable UUID. Only a caller who
      // resolves to a REAL, WRONG user is rejected.
      const authHeader = req.headers.get("Authorization");
      const token = authHeader?.replace("Bearer ", "");
      if (token) {
        const { data: authData } = await supabase.auth.getUser(token);
        if (authData?.user && authData.user.id !== invoice.recipient_id) {
          return jsonResponse(401, { success: false, error: "Unauthorized" });
        }
      }
    }

    // LOCKED INVARIANT: invoice.total is ALWAYS the gross value of works. A
    // deposit is a payment against the invoice, never a reduction of its
    // value — the amount to charge here is total minus whatever deposit has
    // already been settled, not total itself. See
    // ../_shared/paymentMath.ts and src/lib/invoiceMoney.ts.
    const grossTotal = Number(invoice.total || 0);
    if (grossTotal <= 0) {
      return jsonResponse(400, { success: false, error: "Invoice total must be greater than zero" });
    }

    const settledDeposit = depositSettled(invoice);
    const payable = amountPayable(invoice);
    if (payable <= 0) {
      return jsonResponse(400, {
        success: false,
        error: "Nothing left to pay on this invoice — the deposit already covers the full amount",
      });
    }

    const amountInPence = toPence(payable);
    const platformFee = platformFeePence(amountInPence);

    let paymentIntentId = invoice.stripe_payment_intent_id;
    let clientSecret: string | null = null;
    let reusable = false;

    // Idempotency (LATER.md-flagged gap, closed here): a stored PI id isn't
    // automatically reusable — if it's already terminal (canceled/succeeded)
    // or mid-processing, handing back its client_secret fails or does
    // nothing useful at confirm time. Mirrors accept-quote's deposit-branch
    // status gate.
    //
    // Three conditions must ALL hold to reuse the stored PI:
    //   1. It isn't accept-quote's deposit PaymentIntent — that function
    //      stores its own PI id on this same column, and reusing (or even
    //      reasoning about) it here is how a balance payment gets confused
    //      with the deposit.
    //   2. Its status is still open (requires_payment_method/action/confirmation).
    //   3. Its amount still matches what we're charging now — if the payable
    //      figure has moved (e.g. a deposit was settled since the PI was
    //      minted), the stored PI is for a stale amount and must be replaced,
    //      not reused.
    if (paymentIntentId) {
      try {
        const existingIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
        const isNotDeposit = existingIntent.metadata?.type !== "deposit";
        const isOpenStatus = ["requires_payment_method", "requires_action", "requires_confirmation"].includes(existingIntent.status);
        const isCurrentAmount = existingIntent.amount === amountInPence;

        if (isNotDeposit && isOpenStatus && isCurrentAmount) {
          clientSecret = existingIntent.client_secret;
          reusable = true;
        } else if (isNotDeposit && isOpenStatus && !isCurrentAmount) {
          // Stale amount — cancel it so we don't leave a dangling open PI
          // for the wrong figure, then fall through and mint a fresh one.
          try {
            await stripe.paymentIntents.cancel(paymentIntentId);
          } catch (cancelErr) {
            console.error("Failed to cancel stale PaymentIntent, minting a new one anyway", cancelErr);
          }
        }
        // Otherwise (the deposit PI, or terminal/processing) fall through and mint a fresh one.
      } catch (piErr) {
        console.error("Failed to retrieve existing PaymentIntent, creating a new one", piErr);
        // Fall through and mint a fresh one.
      }
    }

    if (!reusable) {
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
          type: "invoice",
          grossTotal: grossTotal.toFixed(2),
          depositSettled: settledDeposit.toFixed(2),
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
          total: grossTotal,
          deposit_settled: settledDeposit,
          amount_payable: payable,
        },
      });
  } catch (error) {
    console.error("create-payment-intent failed", error);
    return jsonResponse(500, { success: false, error: error instanceof Error ? error.message : "Unknown server error" });
  }
});
