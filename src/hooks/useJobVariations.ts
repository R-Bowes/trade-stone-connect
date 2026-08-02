import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

export type JobVariation = Database["public"]["Tables"]["job_variations"]["Row"];

export interface VariationLineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface SubmitVariationInput {
  jobId: string;
  contractorId: string;
  customerId: string;
  title: string;
  description: string;
  reason: JobVariation["reason"];
  items: VariationLineItem[];
  amount: number;
  currentContractValue: number;
  supportingDocuments?: string[];
}

// variation_number is assigned by a BEFORE INSERT trigger
// (assign_variation_number, per-job sequential) — never generated
// client-side, same convention as quote_number/job_number/invoice_number.
type VariationInsertNoNumber = Omit<
  Database["public"]["Tables"]["job_variations"]["Insert"],
  "variation_number"
>;

export function useJobVariations() {
  const [variations, setVariations] = useState<JobVariation[]>([]);
  const [loading, setLoading] = useState(false);
  const [jobTitle, setJobTitle] = useState<string>("");
  const { toast } = useToast();

  const fetchVariations = useCallback(async (jobId: string) => {
    setLoading(true);
    const [{ data, error }, { data: job }] = await Promise.all([
      supabase
        .from("job_variations")
        .select("*")
        .eq("job_id", jobId)
        .order("variation_number", { ascending: true }),
      supabase.from("jobs").select("title").eq("id", jobId).maybeSingle(),
    ]);

    if (error) {
      console.error("Error loading job variations:", error);
      setVariations([]);
    } else {
      setVariations((data ?? []) as JobVariation[]);
    }
    setJobTitle(job?.title ?? "");
    setLoading(false);
    return data;
  }, []);

  const submitVariation = useCallback(async (input: SubmitVariationInput) => {
    const revisedContractValue = input.currentContractValue + input.amount;

    const { data: variation, error } = await supabase
      .from("job_variations")
      .insert({
        job_id: input.jobId,
        contractor_id: input.contractorId,
        customer_id: input.customerId,
        title: input.title,
        description: input.description,
        reason: input.reason,
        items: input.items as any,
        amount: input.amount,
        original_contract_value: input.currentContractValue,
        revised_contract_value: revisedContractValue,
        supporting_documents: (input.supportingDocuments ?? []) as any,
        status: "pending",
      } as VariationInsertNoNumber as Database["public"]["Tables"]["job_variations"]["Insert"])
      .select()
      .single();

    if (error || !variation) {
      toast({ title: "Error", description: "Failed to submit variation", variant: "destructive" });
      throw error;
    }

    const { data: job } = await supabase.from("jobs").select("title").eq("id", input.jobId).maybeSingle();

    await supabase.from("notifications").insert({
      user_id: input.customerId,
      title: "Variation request",
      message: `Variation request on ${job?.title ?? "your job"}: ${input.title} — £${input.amount >= 0 ? "+" : ""}${input.amount.toFixed(2)}`,
      type: "variation_submitted",
      reference_type: "job",
      reference_id: input.jobId,
      is_read: false,
    });

    toast({ title: "Variation submitted", description: "The customer has been notified." });
    await fetchVariations(input.jobId);
    return variation as JobVariation;
  }, [toast, fetchVariations]);

  const updateVariation = useCallback(async (
    id: string,
    updates: Partial<Pick<JobVariation, "title" | "description" | "reason" | "items" | "amount" | "revised_contract_value" | "supporting_documents">>,
  ) => {
    const { data, error } = await supabase
      .from("job_variations")
      .update(updates as any)
      .eq("id", id)
      .eq("status", "pending")
      .select()
      .single();

    if (error || !data) {
      toast({ title: "Error", description: "Could not update variation — it may no longer be pending", variant: "destructive" });
      throw error;
    }

    toast({ title: "Variation updated" });
    await fetchVariations(data.job_id);
    return data as JobVariation;
  }, [toast, fetchVariations]);

  const withdrawVariation = useCallback(async (id: string) => {
    const { data, error } = await supabase
      .from("job_variations")
      .update({ status: "withdrawn" })
      .eq("id", id)
      .select()
      .single();

    if (error || !data) {
      toast({ title: "Error", description: "Could not withdraw variation", variant: "destructive" });
      throw error;
    }

    toast({ title: "Variation withdrawn" });
    await fetchVariations(data.job_id);
    return data as JobVariation;
  }, [toast, fetchVariations]);

  const respondToVariation = useCallback(async (id: string, approved: boolean, note?: string) => {
    const { data, error } = await supabase
      .from("job_variations")
      .update({
        status: approved ? "approved" : "rejected",
        responded_at: new Date().toISOString(),
        response_note: note ?? null,
      })
      .eq("id", id)
      .select()
      .single();

    if (error || !data) {
      toast({ title: "Error", description: "Could not respond to variation", variant: "destructive" });
      throw error;
    }

    // variation_status_change (DB trigger) updates jobs.contract_value and
    // notifies the contractor — nothing else to do here.
    toast({
      title: approved ? "Variation approved" : "Variation rejected",
      description: approved ? "The contract value has been updated." : "The contractor has been notified.",
    });
    await fetchVariations(data.job_id);
    return data as JobVariation;
  }, [toast, fetchVariations]);

  const totalApprovedVariations = variations
    .filter((v) => v.status === "approved")
    .reduce((sum, v) => sum + Number(v.amount), 0);

  const originalContractValue = variations[0] ? Number(variations[0].original_contract_value) : 0;
  const adjustedContractValue = originalContractValue + totalApprovedVariations;
  const pendingCount = variations.filter((v) => v.status === "pending").length;

  return {
    variations,
    loading,
    jobTitle,
    totalApprovedVariations,
    adjustedContractValue,
    pendingCount,
    fetchVariations,
    submitVariation,
    updateVariation,
    withdrawVariation,
    respondToVariation,
  };
}
