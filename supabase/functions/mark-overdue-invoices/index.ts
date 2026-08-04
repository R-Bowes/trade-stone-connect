// supabase/functions/mark-overdue-invoices/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Cron-triggered. Finds sent invoices past their due_date and sends a branded
// payment reminder email to each client. Overdue is NOT a stored status — it
// is derived from due_date at read time (see src/lib/invoiceMoney.ts and the
// invoices_status_valid CHECK constraint, 20260807200000_invoice_status_canonical.sql).
// This function name is legacy; it no longer marks anything.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { buildEmail, buildSubject } from "../_shared/emailTemplate.ts";

serve(async (req) => {
  // Internal-only (verify_jwt=false in config.toml — cron-invoked, no
  // end-user JWT expected). The shared secret is the service-role key,
  // already sent as the Authorization bearer by the invoice-overdue-check
  // cron body (20260712130000_cron_secrets_to_vault.sql, sourced from the
  // same Vault entry ADMIN_SECRET_KEY/SUPABASE_SERVICE_ROLE_KEY mirror —
  // confirmed identical values). Closes the LATER.md "no auth" gap.
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!serviceRoleKey || authHeader !== `Bearer ${serviceRoleKey}`) {
    console.error("[mark-overdue-invoices] rejected call with missing/invalid Authorization header");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("ADMIN_SECRET_KEY")!
    );

    const today = new Date().toISOString().slice(0, 10);

    // status stays 'sent' — overdue is derived from due_date, never stored
    // (invoices_status_valid CHECK no longer permits an 'overdue' value).
    const { data: overdueInvoices, error } = await supabase
      .from("invoices")
      .select("id, invoice_number, client_name, client_email, due_date, contractor_id")
      .eq("status", "sent")
      .lt("due_date", today);

    if (error) throw error;

    if (!overdueInvoices?.length) {
      return new Response(JSON.stringify({ notified: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const publicUrl = Deno.env.get("PUBLIC_APP_URL") ?? "https://tradesltd.co.uk";

    let notified = 0;

    for (const invoice of overdueInvoices) {
      // Dedup: since status no longer flips off 'sent' once overdue, every
      // run would otherwise re-match the same invoice forever. Skip if a
      // reminder for this invoice has already been sent.
      const { data: existing } = await supabase
        .from("notifications")
        .select("id")
        .eq("reference_type", "invoice")
        .eq("reference_id", invoice.id)
        .eq("type", "overdue_invoice")
        .limit(1)
        .maybeSingle();
      if (existing) continue;

      const invoiceRef = invoice.invoice_number != null
        ? `INV-${String(invoice.invoice_number).padStart(4, "0")}`
        : invoice.id;

      const dueDateFormatted = new Date(invoice.due_date).toLocaleDateString("en-GB", {
        day: "2-digit", month: "long", year: "numeric",
      });

      if (RESEND_API_KEY) {
        const emailData = {
          clientName:  invoice.client_name,
          invoiceRef,
          dueDate:     dueDateFormatted,
          payUrl:      `${publicUrl}/pay/${invoice.id}`,
        };

        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: "TradeStone <noreply@tradesltd.co.uk>",
            to: [invoice.client_email],
            subject: buildSubject("overdue_invoice", emailData),
            html: buildEmail("overdue_invoice", emailData),
          }),
        });
      }

      if (invoice.contractor_id) {
        const { error: notifError } = await supabase.from("notifications").insert({
          user_id:        invoice.contractor_id,
          title:          "Invoice overdue",
          message:        `${invoiceRef} is now overdue.`,
          type:           "overdue_invoice",
          reference_type: "invoice",
          reference_id:   invoice.id,
        });
        if (notifError) console.error("[mark-overdue-invoices] failed to insert dedup notification", notifError);
      }

      notified++;
    }

    return new Response(JSON.stringify({ notified }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("mark-overdue-invoices error", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
