import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export type RiskLevel = "low" | "medium" | "high";

export interface Hazard {
  hazard: string;
  risk_level: RiskLevel;
  control_measures: string;
  residual_risk: RiskLevel;
}

export interface MethodStep {
  step_number: number;
  description: string;
  responsible: string;
  hazards_addressed: string[];
}

export type RamsStatus = "draft" | "tailored" | "signed" | "superseded";

export interface RamsTemplate {
  id: string;
  owner_contractor_id: string | null;
  name: string;
  description: string | null;
  trade_category: string | null;
  hazards: Hazard[];
  method_steps: MethodStep[];
  ppe_requirements: string[];
  emergency_procedures: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface JobRams {
  id: string;
  job_id: string;
  contractor_id: string;
  template_id: string | null;
  site_address: string | null;
  // Structured address fields (20260817150000_structured_address_schema.sql).
  // site_address above is the legacy free-text mirror, kept in sync by
  // RamsEditor's save handler — never read back from here.
  addr_line1: string | null;
  addr_line2: string | null;
  addr_city: string | null;
  addr_region: string | null;
  addr_postcode: string | null;
  addr_country: string | null;
  job_description: string | null;
  hazards: Hazard[];
  method_steps: MethodStep[];
  ppe_requirements: string[];
  emergency_procedures: string | null;
  additional_notes: string | null;
  tailored_for_job: boolean;
  tailored_at: string | null;
  tailored_by: string | null;
  status: RamsStatus;
  // Revision chain (20261003100000_rams_record_fixes.sql). At most one
  // non-superseded row per job (partial unique index); older versions are
  // 'superseded' and read-only.
  version: number;
  supersedes_id: string | null;
  // signed_off_at / signed_off_by are set by the job_rams_guard trigger on
  // the move into 'signed' — never written from the client.
  signed_off_at: string | null;
  signed_off_by: string | null;
  signed_off_by_name: string | null;
  signed_off_by_role: string | null;
  pdf_storage_path: string | null;
  pdf_generated_at: string | null;
  created_at: string;
  updated_at: string;
}

/** A superseded earlier version, listed for PDF download only. */
export interface JobRamsVersionSummary {
  id: string;
  version: number;
  status: RamsStatus;
  signed_off_at: string | null;
}

// The DB stores these as jsonb — cast through unknown at the read boundary
// rather than threading `as any` through every call site.
function rowToTemplate(row: Record<string, unknown>): RamsTemplate {
  return {
    ...(row as unknown as RamsTemplate),
    hazards: (row.hazards as unknown as Hazard[]) ?? [],
    method_steps: (row.method_steps as unknown as MethodStep[]) ?? [],
    ppe_requirements: (row.ppe_requirements as unknown as string[]) ?? [],
  };
}

function rowToJobRams(row: Record<string, unknown>): JobRams {
  return {
    ...(row as unknown as JobRams),
    hazards: (row.hazards as unknown as Hazard[]) ?? [],
    method_steps: (row.method_steps as unknown as MethodStep[]) ?? [],
    ppe_requirements: (row.ppe_requirements as unknown as string[]) ?? [],
  };
}

const JOB_RAMS_VERSION_SELECT = "id, version, status, signed_off_at" as const;

// The contractor a RAMS belongs to is the JOB's contractor, never the
// caller's own id or a team membership: a team member can be active for
// more than one contractor, and job_rams_insert requires
// contractor_id = jobs.contractor_id. For the owner this is their own id.
async function fetchJobForRams(forJobId: string) {
  const { data, error } = await supabase
    .from("jobs")
    .select("contractor_id, location, description")
    .eq("id", forJobId)
    .maybeSingle();
  if (error) console.error("Error fetching job for RAMS:", error);
  return data;
}

export function useRams(jobId?: string) {
  const [templates, setTemplates] = useState<RamsTemplate[]>([]);
  const [jobRams, setJobRams] = useState<JobRams | null>(null);
  const [previousVersions, setPreviousVersions] = useState<JobRamsVersionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // System templates plus those owned by `ownerContractorId` — the job's
  // contractor in job mode, the signed-in contractor in library mode.
  const fetchTemplates = useCallback(async (ownerContractorId?: string) => {
    let owner = ownerContractorId;
    if (!owner) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // profiles.id == profiles.user_id == auth.uid() by construction (see
      // CLAUDE.md RLS section).
      owner = user.id;
    }

    const { data, error } = await (supabase as any)
      .from("rams_templates")
      .select("*")
      .eq("is_active", true)
      .or(`owner_contractor_id.is.null,owner_contractor_id.eq.${owner}`)
      .order("name", { ascending: true });

    if (error) {
      console.error("Error fetching RAMS templates:", error);
      return;
    }
    setTemplates((data ?? []).map(rowToTemplate));
  }, []);

  // The live RAMS for a job: the one non-superseded row (the partial unique
  // index job_rams_one_live_per_job guarantees at most one), so
  // maybeSingle() is safe once filtered. Superseded versions are listed
  // separately for download only.
  const fetchJobRams = useCallback(async (forJobId: string) => {
    const [{ data, error }, { data: older, error: olderError }] = await Promise.all([
      (supabase as any)
        .from("job_rams")
        .select("*")
        .eq("job_id", forJobId)
        .neq("status", "superseded")
        .maybeSingle(),
      supabase
        .from("job_rams")
        .select(JOB_RAMS_VERSION_SELECT)
        .eq("job_id", forJobId)
        .eq("status", "superseded")
        .order("version", { ascending: false }),
    ]);

    if (error) {
      console.error("Error fetching job RAMS:", error);
      setJobRams(null);
    } else {
      setJobRams(data ? rowToJobRams(data) : null);
    }
    if (olderError) {
      console.error("Error fetching earlier RAMS versions:", olderError);
      setPreviousVersions([]);
    } else {
      setPreviousVersions((older ?? []) as JobRamsVersionSummary[]);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      if (jobId) {
        const job = await fetchJobForRams(jobId);
        await Promise.all([
          job?.contractor_id ? fetchTemplates(job.contractor_id) : Promise.resolve(),
          fetchJobRams(jobId),
        ]);
      } else {
        await fetchTemplates();
      }
      setLoading(false);
    };
    load();
  }, [jobId, fetchTemplates, fetchJobRams]);

  const createFromTemplate = async (forJobId: string, templateId: string): Promise<JobRams | null> => {
    const template = templates.find((t) => t.id === templateId);
    if (!template) {
      toast({ title: "Error", description: "Template not found", variant: "destructive" });
      return null;
    }

    const job = await fetchJobForRams(forJobId);
    if (!job) {
      toast({ title: "Error", description: "Job not found", variant: "destructive" });
      return null;
    }

    const { data, error } = await (supabase as any)
      .from("job_rams")
      .insert({
        job_id: forJobId,
        contractor_id: job.contractor_id,
        template_id: templateId,
        site_address: job?.location ?? null,
        job_description: job?.description ?? null,
        hazards: template.hazards,
        method_steps: template.method_steps,
        ppe_requirements: template.ppe_requirements,
        emergency_procedures: template.emergency_procedures,
        status: "draft",
      })
      .select("*")
      .single();

    if (error) {
      toast({ title: "Error", description: "Failed to create RAMS from template", variant: "destructive" });
      throw error;
    }

    const created = rowToJobRams(data);
    setJobRams(created);
    return created;
  };

  const createBlank = async (forJobId: string): Promise<JobRams | null> => {
    const job = await fetchJobForRams(forJobId);
    if (!job) {
      toast({ title: "Error", description: "Job not found", variant: "destructive" });
      return null;
    }

    const { data, error } = await (supabase as any)
      .from("job_rams")
      .insert({
        job_id: forJobId,
        contractor_id: job.contractor_id,
        template_id: null,
        site_address: job?.location ?? null,
        job_description: job?.description ?? null,
        hazards: [],
        method_steps: [],
        ppe_requirements: [],
        emergency_procedures: null,
        status: "draft",
      })
      .select("*")
      .single();

    if (error) {
      toast({ title: "Error", description: "Failed to create RAMS", variant: "destructive" });
      throw error;
    }

    const created = rowToJobRams(data);
    setJobRams(created);
    return created;
  };

  const updateJobRams = async (id: string, updates: Partial<JobRams>) => {
    const { data, error } = await (supabase as any)
      .from("job_rams")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      toast({ title: "Error", description: "Failed to save RAMS", variant: "destructive" });
      throw error;
    }
    const updated = rowToJobRams(data);
    setJobRams(updated);
    return updated;
  };

  const confirmTailoring = async (id: string, name: string) => {
    return updateJobRams(id, {
      tailored_for_job: true,
      tailored_at: new Date().toISOString(),
      tailored_by: name,
      status: "tailored",
    });
  };

  // signed_off_at / signed_off_by are deliberately not sent: the
  // job_rams_guard trigger stamps both on the move into 'signed' (and
  // rejects a sign-off from anything but 'tailored').
  const signOff = async (id: string, name: string, role: string) => {
    return updateJobRams(id, {
      signed_off_by_name: name,
      signed_off_by_role: role,
      status: "signed",
    });
  };

  // Supersedes a signed RAMS and opens the new draft (version + 1,
  // untailored) that revise_job_rams returns.
  const reviseJobRams = async (id: string): Promise<string | null> => {
    const { data, error } = await supabase.rpc("revise_job_rams", { p_job_rams_id: id });
    if (error) {
      toast({ title: "Error", description: error.message || "Failed to revise RAMS", variant: "destructive" });
      throw error;
    }
    if (jobId) await fetchJobRams(jobId);
    return (data as string | null) ?? null;
  };

  const saveAsTemplate = async (source: JobRams, name: string): Promise<RamsTemplate | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await (supabase as any)
      .from("rams_templates")
      .insert({
        owner_contractor_id: user.id,
        name,
        description: source.job_description,
        hazards: source.hazards,
        method_steps: source.method_steps,
        ppe_requirements: source.ppe_requirements,
        emergency_procedures: source.emergency_procedures,
        is_active: true,
      })
      .select("*")
      .single();

    if (error) {
      toast({ title: "Error", description: "Failed to save template", variant: "destructive" });
      throw error;
    }

    const created = rowToTemplate(data);
    setTemplates((cur) => [...cur, created].sort((a, b) => a.name.localeCompare(b.name)));
    toast({ title: "Template saved", description: `"${name}" added to My Templates.` });
    return created;
  };

  type TemplateContent = Pick<
    RamsTemplate,
    "name" | "description" | "trade_category" | "hazards" | "method_steps" | "ppe_requirements" | "emergency_procedures"
  >;

  const createTemplate = async (content: TemplateContent): Promise<RamsTemplate | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data, error } = await (supabase as any)
      .from("rams_templates")
      .insert({ ...content, owner_contractor_id: user.id, is_active: true })
      .select("*")
      .single();

    if (error) {
      toast({ title: "Error", description: "Failed to create template", variant: "destructive" });
      throw error;
    }
    const created = rowToTemplate(data);
    setTemplates((cur) => [...cur, created].sort((a, b) => a.name.localeCompare(b.name)));
    return created;
  };

  const updateTemplate = async (id: string, updates: Partial<TemplateContent>): Promise<RamsTemplate | null> => {
    const { data, error } = await (supabase as any)
      .from("rams_templates")
      .update(updates)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      toast({ title: "Error", description: "Failed to update template", variant: "destructive" });
      throw error;
    }
    const updated = rowToTemplate(data);
    setTemplates((cur) => cur.map((t) => (t.id === id ? updated : t)));
    return updated;
  };

  const deleteTemplate = async (id: string) => {
    const { error } = await (supabase as any).from("rams_templates").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: "Failed to delete template", variant: "destructive" });
      throw error;
    }
    setTemplates((cur) => cur.filter((t) => t.id !== id));
  };

  return {
    templates,
    jobRams,
    previousVersions,
    loading,
    createFromTemplate,
    createBlank,
    updateJobRams,
    confirmTailoring,
    signOff,
    reviseJobRams,
    saveAsTemplate,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    fetchTemplates,
    fetchJobRams,
  };
}
