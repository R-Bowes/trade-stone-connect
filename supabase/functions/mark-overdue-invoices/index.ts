import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@4.7.0";

const resendApiKey = Deno.env.get("RESEND_API_KEY");
const resend = resendApiKey ? new Resend(resendApiKey) : null;

serve(async () => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const today = new Date().toISOString().slice(0, 10);

    const { data: overdueInvoices, error } = await supabase
      .from("invoices")
      .select("id, invoice_number, client_name, client_email, due_date")
      .eq("status", "sent")
      .lt("due_date", today);

    if (error) {
      throw error;
    }

    if (!overdueInvoices?.length) {
      return new Response(JSON.stringify({ updated: 0 }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const ids = overdueInvoices.map((invoice) => invoice.id);

    const { error: updateError } = await supabase
      .from("invoices")
      .update({ status: "overdue" })
      .in("id", ids);

    if (updateError) {
      throw updateError;
    }

    if (resend) {
      const publicUrl = Deno.env.get("PUBLIC_APP_URL") ?? "http://localhost:5173";
      for (const invoice of overdueInvoices) {
        await resend.emails.send({
          from: Deno.env.get("RESEND_FROM_EMAIL") ?? "TradeStone <noreply@tradesltd.co.uk>",
          to: [invoice.client_email],
          subject: `Reminder: Invoice ${invoice.invoice_number ?? invoice.id} is overdue`,
          html: `
            <p>Hi ${invoice.client_name},</p>
            <p>This is a reminder that invoice <strong>${invoice.invoice_number ?? invoice.id}</strong> was due on ${invoice.due_date}.</p>
            <p>You can pay now at: <a href="${publicUrl}/pay/${invoice.id}">${publicUrl}/pay/${invoice.id}</a></p>
          `,
        });
      }
    }

    return new Response(JSON.stringify({ updated: ids.length }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("mark-overdue-invoices error", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
