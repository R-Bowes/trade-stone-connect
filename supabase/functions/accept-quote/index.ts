import Stripe from "https://esm.sh/stripe@14.21.0?target=deno";
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

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify the calling user
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) return json(401, { error: "Unauthorized" });

    const { quote_id }: { quote_id: string } = await req.json();
    if (!quote_id) return json(400, { error: "quote_id is required" });

    // Fetch quote with contractor profile and enquiry (for customer info)
    const { data: quote, error: quoteError } = await supabase
      .from("quotes")
      .select(`
        id,
        contractor_id,
        enquiry_id,
        total_amount,
        deposit_amount,
        description,
        profiles!contractor_id (
          id,
          ts_code,
          stripe_account_id,
          display_name,
          business_name,
          user_id
        ),
        enquiries!enquiry_id (
          id,
          customer_id,
          trade,
          message
        )
      `)
      .eq("id", quote_id)
      .single();

    if (quoteError || !quote) return json(400, { error: "Quote not found" });

    // Verify the calling user owns the customer profile on this enquiry
    const { data: customerProfile } = await supabase
      .from("profiles")
      .select("id, ts_code, display_name, email")
      .eq("user_id", authData.user.id)
      .single();

    if (!customerProfile) return json(403, { error: "Customer profile not found" });

    const enquiry = quote.enquiries as any;
    if (enquiry.customer_id !== customerProfile.id) {
      return json(403, { error: "Not authorised to accept this quote" });
    }

    const contractor = quote.profiles as any;
    if (!contractor?.stripe_account_id) {
      return json(400, { error: "Contractor is not set up to receive payments" });
    }

    // Calculate amounts
    const totalPence = Math.round(Number(quote.total_amount) * 100);
    const depositPence = quote.deposit_amount
      ? Math.round(Number(quote.deposit_amount) * 100)
      : Math.round(totalPence * 0.25); // default 25% deposit
    const platformFee = Math.round(depositPence * PLATFORM_FEE_PERCENT);

    // Create the invoice record
    const contractorTsCode = contractor.ts_code ?? "TS-C-UNKNOWN";
    const customerTsCode = customerProfile.ts_code ?? "TS-P-UNKNOWN";
    const invoiceNumber = `INV-${contractorTsCode}-${customerTsCode}-${Date.now()}`;

    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .insert({
        contractor_id: quote.contractor_id,
        client_id: customerProfile.id,
        client_email: authData.user.email,
        client_name: customerProfile.display_name ?? "Customer",
        invoice_number: invoiceNumber,
        quote_id: quote.id,
        subtotal: Number(quote.total_amount),
        tax_amount: 0,
        total: Number(quote.total_amount),
        deposit_amount: depositPence / 100,
        status: "pending",
        items: [
          {
            description: quote.description ?? enquiry.trade ?? "Works as quoted",
            quantity: 1,
            unit_price: Number(quote.total_amount),
            total: Number(quote.total_amount),
          },
        ],
      })
      .select()
      .single();

    if (invoiceError || !invoice) {
      console.error("Invoice creation failed", invoiceError);
      return json(500, { error: "Failed to create invoice" });
    }

    // Create Stripe Payment Intent for the deposit
    const paymentIntent = await stripe.paymentIntents.create({
      amount: depositPence,
      currency: "gbp",
      application_fee_amount: platformFee,
      transfer_data: { destination: contractor.stripe_account_id },
      metadata: {
        invoiceId: invoice.id,
        quoteId: quote.id,
        contractorId: quote.contractor_id,
        clientId: customerProfile.id,
        type: "deposit",
      },
    });

    // Store the payment intent ID on the invoice
    await supabase
      .from("invoices")
      .update({ stripe_payment_intent_id: paymentIntent.id })
      .eq("id", invoice.id);

    // Mark quote as accepted
    await supabase
      .from("quotes")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
      })
      .eq("id", quote.id);

    return json(200, {
      client_secret: paymentIntent.client_secret,
      invoice_id: invoice.id,
      deposit_amount: depositPence / 100,
      total_amount: Number(quote.total_amount),
    });

  } catch (err) {
    console.error("accept-quote failed", err);
    return json(500, { error: err instanceof Error ? err.message : "Unknown error" });
  }
});