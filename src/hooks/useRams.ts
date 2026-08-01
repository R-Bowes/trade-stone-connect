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
  signed_off_at: string | null;
  signed_off_by_name: string | null;
  signed_off_by_role: string | null;
  pdf_storage_path: string | null;
  pdf_generated_at: string | null;
  created_at: string;
  updated_at: string;
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

export function useRams(jobId?: string) {
  const [templates, setTemplates] = useState<RamsTemplate[]>([]);
  const [jobRams, setJobRams] = useState<JobRams | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchTemplates = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // profiles.id == profiles.user_id == auth.uid() by construction (see
    // CLAUDE.md RLS section) — auth.uid() is used directly as the
    // contractor id throughout, matching the house pattern.
    const { data, error } = await (supabase as any)
      .from("rams_templates")
      .select("*")
      .eq("is_active", true)
      .or(`owner_contractor_id.is.null,owner_contractor_id.eq.${user.id}`)
      .order("name", { ascending: true });

    if (error) {
      console.error("Error fetching RAMS templates:", error);
      return;
    }
    setTemplates((data ?? []).map(rowToTemplate));
  }, []);

  const fetchJobRams = useCallback(async (forJobId: string) => {
    const { data, error } = await (supabase as any)
      .from("job_rams")
      .select("*")
      .eq("job_id", forJobId)
      .maybeSingle();

    if (error) {
      console.error("Error fetching job RAMS:", error);
      setJobRams(null);
      return;
    }
    setJobRams(data ? rowToJobRams(data) : null);
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await fetchTemplates();
      if (jobId) await fetchJobRams(jobId);
      setLoading(false);
    };
    load();
  }, [jobId, fetchTemplates, fetchJobRams]);

  const createFromTemplate = async (forJobId: string, templateId: string): Promise<JobRams | null> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const template = templates.find((t) => t.id === templateId);
    if (!template) {
      toast({ title: "Error", description: "Template not found", variant: "destructive" });
      return null;
    }

    const { data: job } = await supabase
      .from("jobs")
      .select("location, description")
      .eq("id", forJobId)
      .maybeSingle();

    const { data, error } = await (supabase as any)
      .from("job_rams")
      .insert({
        job_id: forJobId,
        contractor_id: user.id,
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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: job } = await supabase
      .from("jobs")
      .select("location, description")
      .eq("id", forJobId)
      .maybeSingle();

    const { data, error } = await (supabase as any)
      .from("job_rams")
      .insert({
        job_id: forJobId,
        contractor_id: user.id,
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

  const signOff = async (id: string, name: string, role: string) => {
    return updateJobRams(id, {
      signed_off_at: new Date().toISOString(),
      signed_off_by_name: name,
      signed_off_by_role: role,
      status: "signed",
    });
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
    loading,
    createFromTemplate,
    createBlank,
    updateJobRams,
    confirmTailoring,
    signOff,
    saveAsTemplate,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    fetchTemplates,
    fetchJobRams,
  };
}
