import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useInvoices, type InvoiceItem } from "@/hooks/useInvoices";
import type { Database } from "@/integrations/supabase/types";

// invoice_number is assigned by a BEFORE INSERT trigger (contractor_counters
// allocator) — never generated client-side, hence the Omit here (see
// SendQuoteDialog.tsx's IssuedQuoteInsert for the same pattern).
type InvoiceInsertNoNumber = Omit<Database["public"]["Tables"]["invoices"]["Insert"], "invoice_number">;

export type PaymentStage = Database["public"]["Tables"]["payment_stages"]["Row"];
export type PaymentSchedule = Database["public"]["Tables"]["payment_schedules"]["Row"] & {
  stages: PaymentStage[];
};

export interface DraftStage {
  stage_number: number;
  title: string;
  percentage: number | null;
  fixed_amount?: number | null;
  trigger_type: "milestone" | "date" | "on_acceptance";
  trigger_date?: string | null;
  milestone_description?: string | null;
  description?: string | null;
}

export function usePaymentSchedule() {
  const [schedule, setSchedule] = useState<PaymentSchedule | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const { createInvoice, sendInvoice } = useInvoices();

  const fetchSchedule = useCallback(async (jobId: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("payment_schedules")
      .select("*, payment_stages(*)")
      .eq("job_id", jobId)
      .maybeSingle();

    if (error) {
      console.error("Error loading payment schedule:", error);
      setSchedule(null);
    } else if (data) {
      const { payment_stages, ...rest } = data as any;
      const stages = ((payment_stages ?? []) as PaymentStage[]).sort((a, b) => a.stage_number - b.stage_number);
      setSchedule({ ...(rest as Database["public"]["Tables"]["payment_schedules"]["Row"]), stages });
    } else {
      setSchedule(null);
    }
    setLoading(false);
    return data;
  }, []);

  const createSchedule = useCallback(async (
    jobId: string,
    quoteId: string | null,
    contractorId: string,
    customerId: string,
    totalValue: number,
    stages: DraftStage[],
  ) => {
    const { data: scheduleRow, error: scheduleError } = await supabase
      .from("payment_schedules")
      .insert({
        job_id: jobId,
        quote_id: quoteId,
        contractor_id: contractorId,
        customer_id: customerId,
        schedule_type: "milestone",
        total_contract_value: totalValue,
      })
      .select()
      .single();

    if (scheduleError || !scheduleRow) {
      toast({ title: "Error", description: "Failed to create payment schedule", variant: "destructive" });
      throw scheduleError;
    }

    const stageRows = stages.map((s) => ({
      schedule_id: scheduleRow.id,
      stage_number: s.stage_number,
      title: s.title,
      description: s.description ?? null,
      percentage: s.percentage,
      fixed_amount: s.fixed_amount ?? null,
      calculated_amount: s.fixed_amount ?? Math.round((totalValue * (s.percentage ?? 0)) / 100 * 100) / 100,
      trigger_type: s.trigger_type,
      trigger_date: s.trigger_date ?? null,
      milestone_description: s.milestone_description ?? null,
      status: s.trigger_type === "on_acceptance" ? "paid" as const : "pending" as const,
      marked_ready_at: s.trigger_type === "on_acceptance" ? new Date().toISOString() : null,
      marked_ready_by: s.trigger_type === "on_acceptance" ? contractorId : null,
    }));

    const { error: stagesError } = await supabase.from("payment_stages").insert(stageRows);
    if (stagesError) {
      toast({ title: "Error", description: "Failed to create payment stages", variant: "destructive" });
      throw stagesError;
    }

    toast({ title: "Payment schedule created" });
    return fetchSchedule(jobId);
  }, [toast, fetchSchedule]);

  const markStageReady = useCallback(async (stageId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    const { data: profileRow } = await supabase.from("profiles").select("id").eq("user_id", user?.id).maybeSingle();

    const { data: stage, error } = await supabase
      .from("payment_stages")
      .update({ status: "ready", marked_ready_at: new Date().toISOString(), marked_ready_by: profileRow?.id ?? null })
      .eq("id", stageId)
      .select("*, payment_schedules(job_id, customer_id, contractor_id)")
      .single();

    if (error || !stage) {
      toast({ title: "Error", description: "Could not mark milestone reached", variant: "destructive" });
      throw error;
    }

    const parentSchedule = (stage as any).payment_schedules;
    if (parentSchedule) {
      await supabase.from("notifications").insert({
        user_id: parentSchedule.customer_id,
        title: "Milestone reached",
        message: `"${stage.title}" milestone reached on your job.`,
        type: "payment_stage_ready",
        reference_type: "job",
        reference_id: parentSchedule.job_id,
        is_read: false,
      });
      await fetchSchedule(parentSchedule.job_id);
    }

    toast({ title: "Milestone marked reached", description: "The customer has been notified." });
    return stage;
  }, [toast, fetchSchedule]);

  const createStageInvoice = useCallback(async (stageId: string) => {
    const { data: stage, error: stageError } = await supabase
      .from("payment_stages")
      .select("*, payment_schedules(job_id, quote_id, contractor_id, customer_id)")
      .eq("id", stageId)
      .single();

    if (stageError || !stage) {
      toast({ title: "Error", description: "Stage not found", variant: "destructive" });
      throw stageError;
    }

    const parentSchedule = (stage as any).payment_schedules;

    const { data: job } = await supabase
      .from("jobs")
      .select("title")
      .eq("id", parentSchedule.job_id)
      .maybeSingle();

    const { data: quote } = parentSchedule.quote_id
      ? await supabase
          .from("issued_quotes")
          .select("client_name, client_email, client_phone, client_address")
          .eq("id", parentSchedule.quote_id)
          .maybeSingle()
      : { data: null };

    const { data: allStages } = await supabase
      .from("payment_stages")
      .select("id")
      .eq("schedule_id", stage.schedule_id);
    const totalStages = allStages?.length ?? 1;

    const items: InvoiceItem[] = [{
      description: stage.title,
      quantity: 1,
      unit_price: Number(stage.calculated_amount),
      total: Number(stage.calculated_amount),
    }];

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 14);

    const { data: { user } } = await supabase.auth.getUser();
    const { data: contractorProfile } = await supabase.from("profiles").select("id").eq("user_id", user?.id).maybeSingle();

    const { data: invoiceRow, error: invoiceError } = await supabase
      .from("invoices")
      .insert({
        contractor_id: contractorProfile?.id ?? parentSchedule.contractor_id,
        recipient_id: parentSchedule.customer_id,
        quote_id: parentSchedule.quote_id,
        job_id: parentSchedule.job_id,
        client_name: quote?.client_name || "",
        client_email: quote?.client_email || "",
        client_phone: quote?.client_phone || null,
        client_address: quote?.client_address || null,
        due_date: dueDate.toISOString().slice(0, 10),
        items: items as any,
        subtotal: items[0].total,
        tax_rate: 0,
        tax_amount: 0,
        total: items[0].total,
        notes: `Payment stage ${stage.stage_number} of ${totalStages}: ${stage.title}`,
        status: "draft",
      } as InvoiceInsertNoNumber as Database["public"]["Tables"]["invoices"]["Insert"])
      .select("id")
      .single();

    if (invoiceError || !invoiceRow) {
      toast({ title: "Error", description: "Failed to create invoice", variant: "destructive" });
      throw invoiceError;
    }

    await sendInvoice(invoiceRow.id);

    const { error: updateError } = await supabase
      .from("payment_stages")
      .update({ invoice_id: invoiceRow.id, status: "invoiced" })
      .eq("id", stageId);
    if (updateError) console.error("Failed to link invoice to stage:", updateError);

    await supabase.from("notifications").insert({
      user_id: parentSchedule.customer_id,
      title: "Invoice received",
      message: `Invoice for ${stage.title} — £${Number(stage.calculated_amount).toFixed(2)}`,
      type: "payment_stage_invoiced",
      reference_type: "job",
      reference_id: parentSchedule.job_id,
      is_read: false,
    });

    toast({ title: "Invoice created and sent", description: "The customer has been notified." });
    await fetchSchedule(parentSchedule.job_id);
  }, [toast, sendInvoice, fetchSchedule]);

  // Normally driven automatically by the invoice_paid_marks_stage DB
  // trigger (20260807120000) — exposed as a manual fallback only.
  const markStagePaid = useCallback(async (stageId: string) => {
    const { data: stage, error } = await supabase
      .from("payment_stages")
      .update({ status: "paid" })
      .eq("id", stageId)
      .select("*, payment_schedules(job_id)")
      .single();

    if (error || !stage) {
      toast({ title: "Error", description: "Could not mark stage paid", variant: "destructive" });
      throw error;
    }

    const jobId = (stage as any).payment_schedules?.job_id;
    if (jobId) await fetchSchedule(jobId);
    return stage;
  }, [toast, fetchSchedule]);

  const currentStage = schedule?.stages.find((s) => s.status !== "paid") ?? null;

  const progress = (() => {
    if (!schedule) return { paid: 0, total: 0, percentage: 0 };
    const total = Number(schedule.total_contract_value);
    const paid = schedule.stages
      .filter((s) => s.status === "paid")
      .reduce((sum, s) => sum + Number(s.calculated_amount), 0);
    return { paid, total, percentage: total > 0 ? Math.round((paid / total) * 100) : 0 };
  })();

  return {
    schedule,
    loading,
    hasSchedule: !!schedule,
    currentStage,
    progress,
    fetchSchedule,
    createSchedule,
    markStageReady,
    createStageInvoice,
    markStagePaid,
  };
}
