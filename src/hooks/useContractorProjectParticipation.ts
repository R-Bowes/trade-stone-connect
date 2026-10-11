import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Hazard, MethodStep } from "@/hooks/useRams";
import type { Json } from "@/integrations/supabase/types";

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

// ============================================================
// Slice 4 step 3a -- sub-contracting (coordination only)
// ============================================================

export interface PackageSubcontractorRow {
  package_id: string;
  subcontract_id: string;
  subcontractor_name: string | null;
  subcontractor_ts_code: string | null;
  scope: string;
  starts_on: string | null;
  ends_on: string | null;
  status: string;
  response_note: string | null;
}

export interface SubcontractWorkRow {
  id: string;
  status: string;
  project_title: string;
  phase_title: string;
  trade: string | null;
  main_contractor_name: string | null;
  scope: string;
  starts_on: string | null;
  ends_on: string | null;
}

export interface SubcontractDetail {
  id: string;
  status: string;
  project_title: string;
  phase_title: string;
  trade: string | null;
  main_contractor_name: string | null;
  scope: string;
  starts_on: string | null;
  ends_on: string | null;
  needed_from: string | null;
  needed_to: string | null;
  job_status: string | null;
  job_start_date: string | null;
  job_end_date: string | null;
  site_addr_line1: string | null;
  site_addr_line2: string | null;
  site_addr_city: string | null;
  site_addr_region: string | null;
  site_addr_postcode: string | null;
  site_addr_country: string | null;
  customer_name: string | null;
  rams_id: string | null;
  rams_version: number | null;
  rams_signed_off_at: string | null;
}

export interface SubcontractProjectPhaseRow {
  package_id: string;
  title: string;
  trade: string | null;
  needed_from: string | null;
  needed_to: string | null;
  job_status: string | null;
  main_contractor_name: string | null;
  subcontractor_names: string | null;
}

/** Sub-contractors invited/accepted/declined/cancelled on each package of a project the caller owns. */
export function usePackageSubcontractors(projectId: string) {
  const [rows, setRows] = useState<PackageSubcontractorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc("package_subcontractors", { p_project_id: projectId });
      if (rpcError) throw rpcError;
      setRows((data ?? []) as PackageSubcontractorRow[]);
    } catch (err) {
      console.error("Error loading package subcontractors:", err);
      setError(err instanceof Error ? err.message : "Could not load sub-contractors.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const inviteSubcontractor = useCallback(async (
    packageId: string,
    tsCode: string,
    scope: string,
    startsOn: string | null,
    endsOn: string | null
  ): Promise<void> => {
    const { error: rpcError } = await supabase.rpc("invite_subcontractor", {
      p_package_id: packageId,
      p_ts_code: tsCode,
      p_scope: scope,
      p_starts_on: startsOn,
      p_ends_on: endsOn,
    });
    if (rpcError) throw new Error(rpcError.message);
    await load();
  }, [load]);

  const cancelSubcontract = useCallback(async (id: string): Promise<void> => {
    const { error: rpcError } = await supabase.rpc("cancel_project_subcontract", { p_id: id });
    if (rpcError) throw new Error(rpcError.message);
    await load();
  }, [load]);

  return { rows, loading, error, refetch: load, inviteSubcontractor, cancelSubcontract };
}

/** Looks up a contractor's display name by TS-C code, for the invite dialog's confirm step. Returns null if not found. */
export async function lookupContractorByTsCode(tsCode: string): Promise<{ name: string } | null> {
  const { data, error } = await supabase.rpc("find_contractor_by_ts_code", { p_ts_code: tsCode.trim() });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { display_name: string; ts_code: string }[];
  const row = rows[0];
  return row ? { name: row.display_name } : null;
}

/** Sub-contract work invited to, or accepted by, the caller. */
export function useMySubcontractWork() {
  const [rows, setRows] = useState<SubcontractWorkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc("my_subcontract_work");
      if (rpcError) throw rpcError;
      setRows((data ?? []) as SubcontractWorkRow[]);
    } catch (err) {
      console.error("Error loading sub-contract work:", err);
      setError(err instanceof Error ? err.message : "Could not load your sub-contract work.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const respond = useCallback(async (id: string, accept: boolean, note: string | null): Promise<void> => {
    const { error: rpcError } = await supabase.rpc("respond_to_subcontract_invite", { p_id: id, p_accept: accept, p_note: note });
    if (rpcError) throw new Error(rpcError.message);
    await load();
  }, [load]);

  return { rows, loading, error, refetch: load, respond };
}

/** One accepted sub-contract's detail, plus the other phases on its project. Accepted-only; the RPC raises otherwise. */
export function useSubcontractDetail(subcontractId: string) {
  const [detail, setDetail] = useState<SubcontractDetail | null>(null);
  const [phases, setPhases] = useState<SubcontractProjectPhaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [detailRes, phasesRes] = await Promise.all([
        supabase.rpc("subcontract_detail", { p_id: subcontractId }),
        supabase.rpc("subcontract_project_phases", { p_id: subcontractId }),
      ]);
      if (detailRes.error) throw detailRes.error;
      if (phasesRes.error) throw phasesRes.error;
      const detailRows = (detailRes.data ?? []) as SubcontractDetail[];
      setDetail(detailRows[0] ?? null);
      setPhases((phasesRes.data ?? []) as SubcontractProjectPhaseRow[]);
    } catch (err) {
      console.error("Error loading sub-contract detail:", err);
      setError(err instanceof Error ? err.message : "Could not load this sub-contract.");
    } finally {
      setLoading(false);
    }
  }, [subcontractId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { detail, phases, loading, error, refetch: load };
}

// ============================================================
// Slice 4 step 3b -- the subcontractor's own RAMS, submitted to the
// main contractor. Never job_rams; a separate table and lifecycle.
// ============================================================

const SUBCONTRACT_RAMS_SELECT =
  "id, subcontract_id, author_id, version, supersedes_id, template_id, job_description, hazards, method_steps, ppe_requirements, emergency_procedures, additional_notes, status, submitted_at, submitted_by_name, reviewed_at, reviewed_by, review_note, created_at, updated_at";

export interface SubcontractRamsRow {
  id: string;
  subcontract_id: string;
  author_id: string;
  version: number;
  supersedes_id: string | null;
  template_id: string | null;
  job_description: string | null;
  hazards: Hazard[];
  method_steps: MethodStep[];
  ppe_requirements: string[];
  emergency_procedures: string | null;
  additional_notes: string | null;
  status: string;
  submitted_at: string | null;
  submitted_by_name: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface PackageSubcontractorRamsRow {
  subcontract_id: string;
  rams_id: string | null;
  rams_status: string | null;
  rams_version: number | null;
  submitted_at: string | null;
  /** The version currently in force (status 'accepted'), or null. An
   * accepted version stays in force while a later revision is drafted
   * or submitted, so this can be set alongside a 'submitted'/'returned' rams_status. */
  in_force_version: number | null;
}

/**
 * All RAMS versions for one sub-contract, readable by the author (any
 * status) or the main contractor (non-draft only) -- the table's own
 * RLS already enforces this, so this reads it directly, no RPC.
 */
export function useSubcontractRams(subcontractId: string) {
  const [rows, setRows] = useState<SubcontractRamsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: selectError } = await supabase
        .from("subcontract_rams" as never)
        .select(SUBCONTRACT_RAMS_SELECT)
        .eq("subcontract_id", subcontractId)
        .order("version", { ascending: false });
      if (selectError) throw selectError;
      setRows((data ?? []) as unknown as SubcontractRamsRow[]);
    } catch (err) {
      console.error("Error loading sub-contract RAMS:", err);
      setError(err instanceof Error ? err.message : "Could not load this RAMS.");
    } finally {
      setLoading(false);
    }
  }, [subcontractId]);

  useEffect(() => {
    void load();
  }, [load]);

  // The newest version is always the live one -- older versions only
  // ever move to 'superseded', never coexist non-superseded alongside a
  // newer one (enforced by subcontract_rams_live_uidx).
  const current = rows[0] ?? null;
  const earlier = rows.slice(1);

  const start = useCallback(async (templateId: string | null): Promise<void> => {
    const { error: rpcError } = await supabase.rpc("start_subcontract_rams", {
      p_subcontract_id: subcontractId,
      p_template_id: templateId,
    });
    if (rpcError) throw new Error(rpcError.message);
    await load();
  }, [subcontractId, load]);

  const save = useCallback(async (fields: {
    jobDescription: string | null;
    hazards: Hazard[];
    methodSteps: MethodStep[];
    ppeRequirements: string[];
    emergencyProcedures: string | null;
    additionalNotes: string | null;
  }): Promise<void> => {
    if (!current) throw new Error("No draft to save.");
    const { error: rpcError } = await supabase.rpc("save_subcontract_rams", {
      p_id: current.id,
      p_job_description: fields.jobDescription,
      p_hazards: fields.hazards as unknown as Json,
      p_method_steps: fields.methodSteps as unknown as Json,
      p_ppe_requirements: fields.ppeRequirements as unknown as Json,
      p_emergency_procedures: fields.emergencyProcedures,
      p_additional_notes: fields.additionalNotes,
    });
    if (rpcError) throw new Error(rpcError.message);
    await load();
  }, [current, load]);

  const submit = useCallback(async (name: string): Promise<void> => {
    if (!current) throw new Error("No draft to submit.");
    const { error: rpcError } = await supabase.rpc("submit_subcontract_rams", { p_id: current.id, p_name: name });
    if (rpcError) throw new Error(rpcError.message);
    await load();
  }, [current, load]);

  const revise = useCallback(async (): Promise<void> => {
    if (!current) throw new Error("Nothing to revise.");
    const { error: rpcError } = await supabase.rpc("revise_subcontract_rams", { p_id: current.id });
    if (rpcError) throw new Error(rpcError.message);
    await load();
  }, [current, load]);

  return { current, earlier, loading, error, refetch: load, start, save, submit, revise };
}

/** Review (accept/return) a submitted subcontract RAMS. Main contractor side. */
export async function reviewSubcontractRams(id: string, accept: boolean, note: string | null): Promise<void> {
  const { error } = await supabase.rpc("review_subcontract_rams", { p_id: id, p_accept: accept, p_note: note });
  if (error) throw new Error(error.message);
}

/** One subcontract RAMS row, read directly -- for the main contractor's "View RAMS" dialog. */
export async function fetchSubcontractRams(id: string): Promise<SubcontractRamsRow | null> {
  const { data, error } = await supabase
    .from("subcontract_rams" as never)
    .select(SUBCONTRACT_RAMS_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as SubcontractRamsRow) ?? null;
}

/** Per sub-contract RAMS status on every package of a project the caller owns. A draft is never reported. */
export function usePackageSubcontractorRams(projectId: string) {
  const [rows, setRows] = useState<PackageSubcontractorRamsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc("package_subcontractor_rams", { p_project_id: projectId });
      if (rpcError) throw rpcError;
      setRows((data ?? []) as PackageSubcontractorRamsRow[]);
    } catch (err) {
      console.error("Error loading package sub-contractor RAMS:", err);
      setError(err instanceof Error ? err.message : "Could not load sub-contractor RAMS.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { rows, loading, error, refetch: load };
}
