import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Job } from "@/hooks/useJobs";

export interface CoolingOffRecord {
  id: string;
  job_id: string;
  quote_id: string;
  consumer_id: string;
  contractor_id: string;
  prescribed_info_sent_at: string;
  cooling_off_start: string;
  cooling_off_end: string;
  early_start_consent: boolean;
  early_start_consented_at: string | null;
  early_start_acknowledged_loss_of_right: boolean;
  cancelled: boolean;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  cooling_off_elapsed: boolean;
  cooling_off_elapsed_at: string | null;
  created_at: string;
  updated_at: string;
}

// company_id IS NULL identifies a homeowner (consumer) job — B2B jobs
// always carry a company_id via their originating enquiry (see
// mint_job_from_quote / CLAUDE.md's B2B foundation section).
export function isConsumerJob(job: Pick<Job, "company_id">): boolean {
  return job.company_id == null;
}

export function useCoolingOff() {
  const [coolingOff, setCoolingOff] = useState<CoolingOffRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchCoolingOff = useCallback(async (jobId: string) => {
    setLoading(true);
    const { data, error } = await supabase
      .from("cooling_off_records")
      .select("*")
      .eq("job_id", jobId)
      .maybeSingle();

    if (error) {
      console.error("Error loading cooling-off record:", error);
      setCoolingOff(null);
    } else {
      setCoolingOff(data as CoolingOffRecord | null);
    }
    setLoading(false);
    return data as CoolingOffRecord | null;
  }, []);

  const giveEarlyStartConsent = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from("cooling_off_records")
      .update({
        early_start_consent: true,
        early_start_acknowledged_loss_of_right: true,
        early_start_consented_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      toast({ title: "Error", description: "Could not save your consent. Please try again.", variant: "destructive" });
      throw error;
    }

    const record = data as CoolingOffRecord;
    setCoolingOff(record);

    await supabase.from("notifications").insert({
      user_id: record.contractor_id,
      title: "Early commencement consent given",
      message: "The customer has now consented to early commencement. You may begin work.",
      type: "cooling_off_early_consent",
      reference_type: "job",
      reference_id: record.job_id,
      is_read: false,
    });

    toast({ title: "Consent given", description: "You've consented to work starting before the cooling-off period ends." });
    return record;
  }, [toast]);

  const cancelWithinCoolingOff = useCallback(async (id: string, reason?: string) => {
    const { data, error } = await supabase
      .from("cooling_off_records")
      .update({
        cancelled: true,
        cancelled_at: new Date().toISOString(),
        cancellation_reason: reason ?? null,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      toast({ title: "Error", description: "Could not cancel this job. Please try again.", variant: "destructive" });
      throw error;
    }

    const record = data as CoolingOffRecord;
    setCoolingOff(record);

    const { error: jobError } = await supabase
      .from("jobs")
      .update({ status: "cancelled" })
      .eq("id", record.job_id);
    if (jobError) console.error("Failed to cancel job after cooling-off cancellation:", jobError);

    const { error: quoteError } = await supabase
      .from("issued_quotes")
      .update({ status: "cancelled" })
      .eq("id", record.quote_id);
    if (quoteError) console.error("Failed to cancel quote after cooling-off cancellation:", quoteError);

    await supabase.from("notifications").insert({
      user_id: record.contractor_id,
      title: "Job cancelled — cooling-off period",
      message: "The customer has exercised their right to cancel within the cooling-off period. Job cancelled.",
      type: "cooling_off_cancelled",
      reference_type: "job",
      reference_id: record.job_id,
      is_read: false,
    });

    toast({ title: "Job cancelled", description: "This job has been cancelled within your cooling-off period." });
    return record;
  }, [toast]);

  const now = Date.now();
  const coolingOffEndMs = coolingOff ? new Date(coolingOff.cooling_off_end).getTime() : null;
  const isInCoolingOff = !!coolingOff && !coolingOff.cancelled && !coolingOff.cooling_off_elapsed && coolingOffEndMs !== null && coolingOffEndMs > now;
  const daysRemaining = coolingOffEndMs !== null ? Math.max(0, Math.ceil((coolingOffEndMs - now) / (24 * 60 * 60 * 1000))) : 0;
  const canCancel = isInCoolingOff && !coolingOff?.cancelled;
  const hasEarlyStartConsent = !!coolingOff?.early_start_consent;

  return {
    coolingOff,
    loading,
    isInCoolingOff,
    daysRemaining,
    canCancel,
    hasEarlyStartConsent,
    fetchCoolingOff,
    giveEarlyStartConsent,
    cancelWithinCoolingOff,
  };
}
