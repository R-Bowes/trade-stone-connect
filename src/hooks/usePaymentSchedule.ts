import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type PaymentStage = Database["public"]["Tables"]["payment_stages"]["Row"];
export type PaymentSchedule = Database["public"]["Tables"]["payment_schedules"]["Row"] & {
  stages: PaymentStage[];
};

// Read-only. Stage invoicing is retired (CLAUDE.md invoice invariants: one
// live invoice per quote), so nothing in the app writes payment_schedules
// or payment_stages any more. Schedules are created by mint_job_from_quote
// for quotes that carry one, and a stage changes status only through the
// server: invoice_paid_marks_stage when its invoice is paid, void_invoice
// when its invoice is voided.
export function usePaymentSchedule() {
  const [schedule, setSchedule] = useState<PaymentSchedule | null>(null);
  const [loading, setLoading] = useState(false);

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
  };
}
