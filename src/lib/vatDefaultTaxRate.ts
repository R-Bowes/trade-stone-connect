import { supabase } from "@/integrations/supabase/client";

/** finance_settings.vat_status is canonical (profiles.vat_registered is deprecated). */
export function isVatRegistered(vatStatus: string | null | undefined): boolean {
  return vatStatus === "standard" || vatStatus === "flat_rate";
}

/** 20 if the contractor is VAT registered (standard or flat_rate), 0 otherwise. */
export function defaultTaxRateForVatStatus(vatStatus: string | null | undefined): number {
  return isVatRegistered(vatStatus) ? 20 : 0;
}

/** Looks up a contractor's own default tax rate from finance_settings.vat_status. */
export async function fetchDefaultTaxRate(contractorId: string): Promise<number> {
  const { data } = await supabase
    .from("finance_settings")
    .select("vat_status")
    .eq("contractor_id", contractorId)
    .maybeSingle() as { data: { vat_status?: string } | null };
  return defaultTaxRateForVatStatus(data?.vat_status);
}
