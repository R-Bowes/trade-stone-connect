import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

// Deliberately NOT named useContractorProjects — that name is already
// taken by src/hooks/useContractorProjects.ts, the unrelated public-
// profile "portfolio" showcase (contractor_projects TABLE, up to 3
// photo items). This hook is for projects/slice 4: contractor_projects()/
// contractor_project_view()/contractor_project_snags() (migration
// 20261010120000, live) plus the contractor-owned write path added in
// 20261010130000 (drafted, not yet pushed) — projects_insert/_update now
// also allow account_type 'contractor'.

export interface ContractorProjectSummary {
  project_id: string;
  title: string;
  status: string;
  attached_job_count: number;
  target_start: string | null;
  target_end: string | null;
  owner_name: string | null;
  my_package_count: number;
  /**
   * 'owner': the caller posted this project. 'participant': one of
   * their jobs is merely attached to it. Typed as `string` (not a
   * literal union) because the RPC column is Postgres `text`, not an
   * enum — matches the generated Supabase type exactly.
   */
  relationship: string;
  /** Owned projects only, once a job is attached — resolved client-side (not an RPC column), same customer for every job by the one-customer-per-contractor-project rule. */
  customerName?: string;
}

export interface ContractorProjectPackageRow {
  package_id: string;
  title: string;
  trade: string | null;
  needed_from: string | null;
  needed_to: string | null;
  is_mine: boolean;
  job_status: string | null;
  job_start_date: string | null;
  job_end_date: string | null;
  /** Only set when is_mine — never another contractor's job id. */
  job_id: string | null;
  /** Only set when is_mine. */
  job_number: number | null;
  /** Set for every filled package, mine or not — the public company name, else the full name. Never money, never a site id. */
  contractor_name: string | null;
}

/** Title/description/budget/dates a contractor edits on their own project. */
export interface ContractorOwnedProjectFormValues {
  title: string;
  description: string | null;
  budget: number | null;
  target_start: string | null;
  target_end: string | null;
}

const NOT_CHANGED = "The project was not changed. It may have been removed, or you may not have access to it.";

export interface ContractorProjectSnag {
  snag_id: string;
  description: string;
  status: string;
  raised_at: string;
  resolved_at: string | null;
}

/** Every project the caller takes part in — a package whose job is theirs. */
export function useContractorProjectsList() {
  const [projects, setProjects] = useState<ContractorProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc("contractor_projects");
      if (rpcError) throw rpcError;
      const list = (data ?? []) as ContractorProjectSummary[];

      // Customer name for owned projects with at least one job attached
      // — no RPC column for this, so resolved here: the project's own
      // packages/jobs the caller already owns, then the same profiles
      // columns JobManagement.tsx already reads off jobs.customer_id.
      const ownedWithJobs = list.filter((p) => p.relationship === "owner" && p.attached_job_count > 0).map((p) => p.project_id);
      if (ownedWithJobs.length > 0) {
        const { data: pkgRows, error: pkgError } = await supabase
          .from("project_packages")
          .select("project_id, job_id")
          .in("project_id", ownedWithJobs)
          .not("job_id", "is", null);
        if (pkgError) throw pkgError;

        const jobIds = [...new Set((pkgRows ?? []).map((r) => r.job_id).filter((id): id is string => !!id))];
        const projectByJobId = Object.fromEntries((pkgRows ?? []).map((r) => [r.job_id, r.project_id]));

        if (jobIds.length > 0) {
          const { data: jobRows, error: jobError } = await supabase.from("jobs").select("id, customer_id").in("id", jobIds);
          if (jobError) throw jobError;

          const customerIds = [...new Set((jobRows ?? []).map((j) => j.customer_id).filter((id): id is string => !!id))];
          const { data: customerRows, error: customerError } = await supabase
            .from("profiles")
            .select("id, full_name, company_name")
            .in("id", customerIds);
          if (customerError) throw customerError;
          const nameByCustomerId = Object.fromEntries((customerRows ?? []).map((c) => [c.id, c.company_name || c.full_name || "Customer"]));

          const nameByProjectId: Record<string, string> = {};
          for (const j of jobRows ?? []) {
            const projectId = projectByJobId[j.id];
            if (projectId && !nameByProjectId[projectId] && j.customer_id) {
              nameByProjectId[projectId] = nameByCustomerId[j.customer_id];
            }
          }
          for (const p of list) {
            if (nameByProjectId[p.project_id]) p.customerName = nameByProjectId[p.project_id];
          }
        }
      }

      setProjects(list);
    } catch (err) {
      console.error("Error loading contractor projects:", err);
      setError(err instanceof Error ? err.message : "Could not load your projects.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  /** Creates a project the caller owns (account_type 'contractor'). Returns the new project's id. */
  const createProject = useCallback(async (values: ContractorOwnedProjectFormValues): Promise<string> => {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!user) throw new Error("You are not signed in.");

    const { data, error: insertError } = await supabase
      .from("projects")
      .insert({
        posted_by: user.id,
        account_type: "contractor",
        title: values.title,
        description: values.description,
        budget: values.budget,
        target_start: values.target_start,
        target_end: values.target_end,
      })
      .select("id")
      .single();
    if (insertError) throw insertError;

    await fetchProjects();
    return data.id;
  }, [fetchProjects]);

  /** Updates title, description, budget and target dates on a project the caller owns. */
  const updateProject = useCallback(async (id: string, values: ContractorOwnedProjectFormValues): Promise<void> => {
    const { data, error: updateError } = await supabase
      .from("projects")
      .update({
        title: values.title,
        description: values.description,
        budget: values.budget,
        target_start: values.target_start,
        target_end: values.target_end,
      })
      .eq("id", id)
      .select("id");
    if (updateError) throw updateError;
    if (!data || data.length === 0) throw new Error(NOT_CHANGED);
    await fetchProjects();
  }, [fetchProjects]);

  /** Deletes a project the caller owns. */
  const deleteProject = useCallback(async (id: string): Promise<void> => {
    const { data, error: deleteError } = await supabase
      .from("projects")
      .delete()
      .eq("id", id)
      .select("id");
    if (deleteError) throw deleteError;
    if (!data || data.length === 0) throw new Error(NOT_CHANGED);
    await fetchProjects();
  }, [fetchProjects]);

  return { projects, loading, error, refetch: fetchProjects, createProject, updateProject, deleteProject };
}

/**
 * One project's packages (as the caller may see them — never budget,
 * allowance, or another contractor's identity) and snags raised against
 * the caller's own packages. Read-only: no write functions are exposed.
 */
export function useContractorProjectDetail(projectId: string) {
  const [packages, setPackages] = useState<ContractorProjectPackageRow[]>([]);
  const [snags, setSnags] = useState<ContractorProjectSnag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [viewRes, snagsRes] = await Promise.all([
        supabase.rpc("contractor_project_view", { p_project_id: projectId }),
        supabase.rpc("contractor_project_snags", { p_project_id: projectId }),
      ]);
      if (viewRes.error) throw viewRes.error;
      if (snagsRes.error) throw snagsRes.error;
      setPackages(viewRes.data ?? []);
      setSnags(snagsRes.data ?? []);
    } catch (err) {
      console.error("Error loading contractor project detail:", err);
      setError(err instanceof Error ? err.message : "Could not load this project.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { packages, snags, loading, error, refetch: load };
}
