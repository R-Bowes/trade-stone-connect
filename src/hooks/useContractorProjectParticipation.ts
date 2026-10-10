import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

// Deliberately NOT named useContractorProjects — that name is already
// taken by src/hooks/useContractorProjects.ts, the unrelated public-
// profile "portfolio" showcase (contractor_projects TABLE, up to 3
// photo items). This hook is for projects/slice 4: a contractor's
// read-only view of real projects (projects/project_packages) they take
// part in, via the contractor_projects()/contractor_project_view()/
// contractor_project_snags() RPCs (migration 20261010120000, drafted,
// not yet pushed).

export interface ContractorProjectSummary {
  project_id: string;
  title: string;
  status: string;
  attached_job_count: number;
  target_start: string | null;
  target_end: string | null;
  owner_name: string | null;
  my_package_count: number;
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
}

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
      setProjects(data ?? []);
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

  return { projects, loading, error, refetch: fetchProjects };
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
