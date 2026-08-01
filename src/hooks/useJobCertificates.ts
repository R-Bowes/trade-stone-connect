import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const DOCUMENTS_BUCKET = "documents";

export type CertificateType =
  | "gas_safety"
  | "electrical_eic"
  | "electrical_minor_works"
  | "fgas"
  | "building_regs"
  | "fire_alarm"
  | "pat_testing"
  | "pressure_test"
  | "commissioning"
  | "manufacturer_warranty"
  | "workmanship_warranty"
  | "other";

export const CERTIFICATE_TYPE_LABELS: Record<CertificateType, string> = {
  gas_safety: "Gas Safety Certificate (CP12)",
  electrical_eic: "Electrical Installation Certificate",
  electrical_minor_works: "Minor Electrical Works Certificate",
  fgas: "FGAS Certificate",
  building_regs: "Building Regulations Sign-off",
  fire_alarm: "Fire Alarm Certificate",
  pat_testing: "PAT Testing Certificate",
  pressure_test: "Pressure Test Certificate",
  commissioning: "Commissioning Certificate",
  manufacturer_warranty: "Manufacturer Warranty",
  workmanship_warranty: "Workmanship Warranty",
  other: "Other Certificate",
};

export interface JobCertificate {
  id: string;
  job_id: string;
  contractor_id: string;
  certificate_type: CertificateType;
  certificate_name: string;
  certificate_number: string | null;
  issuer: string | null;
  issued_date: string;
  expiry_date: string | null;
  warranty_duration_months: number | null;
  warranty_terms: string | null;
  document_path: string | null;
  asset_id: string | null;
  verified: boolean;
  verified_at: string | null;
  verified_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type JobCertificateInsert = Omit<
  JobCertificate,
  "id" | "created_at" | "updated_at" | "verified" | "verified_at" | "verified_by"
>;

export function useJobCertificates(jobId?: string) {
  const [certificates, setCertificates] = useState<JobCertificate[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchCertificates = useCallback(async (forJobId: string) => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("job_certificates")
      .select("*")
      .eq("job_id", forJobId)
      .order("issued_date", { ascending: false });

    if (error) {
      console.error("Error fetching job certificates:", error);
      setLoading(false);
      return;
    }
    setCertificates((data ?? []) as JobCertificate[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!jobId) { setLoading(false); return; }
    fetchCertificates(jobId);
  }, [jobId, fetchCertificates]);

  const uploadCertificateDocument = async (file: File, forJobId: string): Promise<string> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const fileExt = file.name.split(".").pop();
    const filePath = `certificates/${user.id}/${forJobId}/${Date.now()}.${fileExt}`;

    const { error } = await supabase.storage.from(DOCUMENTS_BUCKET).upload(filePath, file);
    if (error) throw error;

    return filePath;
  };

  const getSignedDocumentUrl = async (path: string): Promise<string> => {
    const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrl(path, 3600);
    if (error) {
      console.error("Error creating signed document URL:", error);
      throw error;
    }
    return data.signedUrl;
  };

  const addCertificate = async (data: JobCertificateInsert) => {
    const { data: inserted, error } = await (supabase as any)
      .from("job_certificates")
      .insert(data)
      .select("*")
      .single();

    if (error) {
      toast({ title: "Error", description: "Failed to add certificate", variant: "destructive" });
      throw error;
    }

    toast({ title: "Certificate added" });
    setCertificates((cur) => [inserted as JobCertificate, ...cur]);
    return inserted as JobCertificate;
  };

  const updateCertificate = async (id: string, updates: Partial<JobCertificateInsert>) => {
    const { data, error } = await (supabase as any)
      .from("job_certificates")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      toast({ title: "Error", description: "Failed to update certificate", variant: "destructive" });
      throw error;
    }

    toast({ title: "Certificate updated" });
    setCertificates((cur) => cur.map((c) => (c.id === id ? (data as JobCertificate) : c)));
    return data as JobCertificate;
  };

  return {
    certificates,
    loading,
    addCertificate,
    updateCertificate,
    uploadCertificateDocument,
    getSignedDocumentUrl,
    fetchCertificates,
  };
}
