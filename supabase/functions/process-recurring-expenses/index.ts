// supabase/functions/process-recurring-expenses/index.ts
// ─────────────────────────────────────────────────────────────────────────────
// Cron-triggered, daily (06:00, see 20260801200000_recurring_expenses.sql).
// For every recurring expense whose recurrence_next_due has arrived, creates
// the next occurrence as a child row (recurrence_parent_id set, is_recurring
// false — children don't themselves recur) and advances the parent's
// recurrence_next_due. If the advanced date would fall after
// recurrence_end_date, the parent's recurrence is switched off instead of
// producing an occurrence past the end date.
// ─────────────────────────────────────────────────────────────────────────────

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type RecurrenceInterval = "weekly" | "fortnightly" | "monthly" | "quarterly" | "annually";

type RecurringExpenseRow = {
  id: string;
  contractor_id: string;
  category_id: string | null;
  description: string;
  amount: number;
  vat_amount: number | null;
  vat_rate: number | null;
  vat_reclaimable: boolean | null;
  payment_method: string | null;
  job_id: string | null;
  project_id: string | null;
  vendor: string | null;
  notes: string | null;
  recurrence_interval: RecurrenceInterval;
  recurrence_next_due: string;
  recurrence_end_date: string | null;
  recurrence_auto_confirm: boolean;
};

// Date-only arithmetic in UTC to avoid timezone rollover shifting the
// calendar date by a day either side of midnight.
function addInterval(dateStr: string, interval: RecurrenceInterval): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  switch (interval) {
    case "weekly":
      d.setUTCDate(d.getUTCDate() + 7);
      break;
    case "fortnightly":
      d.setUTCDate(d.getUTCDate() + 14);
      break;
    case "monthly":
      d.setUTCMonth(d.getUTCMonth() + 1);
      break;
    case "quarterly":
      d.setUTCMonth(d.getUTCMonth() + 3);
      break;
    case "annually":
      d.setUTCFullYear(d.getUTCFullYear() + 1);
      break;
  }
  return d.toISOString().slice(0, 10);
}

serve(async (req) => {
  // Internal-only (verify_jwt=false in config.toml — cron-invoked, no
  // end-user JWT expected). Same shared-secret pattern as
  // insurance-expiry-check / mark-overdue-invoices.
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!serviceRoleKey || authHeader !== `Bearer ${serviceRoleKey}`) {
    console.error("[process-recurring-expenses] rejected call with missing/invalid Authorization header");
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      serviceRoleKey,
      { auth: { persistSession: false } },
    );

    const todayStr = new Date().toISOString().slice(0, 10);

    const { data: dueRows, error: dueError } = await supabase
      .from("expenses")
      .select(`
        id, contractor_id, category_id, description, amount,
        vat_amount, vat_rate, vat_reclaimable, payment_method, job_id, project_id,
        vendor, notes, recurrence_interval, recurrence_next_due, recurrence_end_date,
        recurrence_auto_confirm
      `)
      .eq("is_recurring", true)
      .not("recurrence_interval", "is", null)
      .not("recurrence_next_due", "is", null)
      .lte("recurrence_next_due", todayStr);
    if (dueError) throw dueError;

    const rows = (dueRows ?? []) as RecurringExpenseRow[];
    let created = 0;
    let stopped = 0;

    for (const row of rows) {
      const status = row.recurrence_auto_confirm ? "confirmed" : "pending_confirmation";

      const { data: child, error: insertError } = await supabase
        .from("expenses")
        .insert({
          contractor_id: row.contractor_id,
          category_id: row.category_id,
          description: row.description,
          amount: row.amount,
          vat_amount: row.vat_amount,
          vat_rate: row.vat_rate,
          vat_reclaimable: row.vat_reclaimable,
          payment_method: row.payment_method,
          job_id: row.job_id,
          project_id: row.project_id,
          vendor: row.vendor,
          notes: row.notes,
          expense_date: row.recurrence_next_due,
          is_recurring: false,
          recurrence_parent_id: row.id,
          recurrence_auto_confirm: row.recurrence_auto_confirm,
          expense_status: status,
        })
        .select("id")
        .single();

      if (insertError || !child) {
        console.error("[process-recurring-expenses] failed to create occurrence for", row.id, insertError);
        continue;
      }
      created++;

      if (status === "pending_confirmation") {
        const { error: notifyError } = await supabase.from("notifications").insert({
          user_id: row.contractor_id,
          title: "Recurring expense needs confirmation",
          message: `"${row.description}" (£${Number(row.amount).toFixed(2)}) is ready — confirm or skip it in Expenses.`,
          type: "expense_pending_confirmation",
          reference_type: "expense",
          reference_id: child.id,
        });
        if (notifyError) console.error("[process-recurring-expenses] notification insert failed for", row.id, notifyError);
      }

      const nextDue = addInterval(row.recurrence_next_due, row.recurrence_interval);
      const pastEnd = row.recurrence_end_date !== null && nextDue > row.recurrence_end_date;

      const { error: updateError } = await supabase
        .from("expenses")
        .update(
          pastEnd
            ? { is_recurring: false }
            : { recurrence_next_due: nextDue },
        )
        .eq("id", row.id);
      if (updateError) console.error("[process-recurring-expenses] failed to advance parent", row.id, updateError);
      if (pastEnd) stopped++;
    }

    return new Response(
      JSON.stringify({ processed: rows.length, created, stopped }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("[process-recurring-expenses] error", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
