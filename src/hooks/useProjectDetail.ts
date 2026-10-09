import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
type PackageRow = Database["public"]["Tables"]["project_packages"]["Row"];
type SnagRow = Database["public"]["Tables"]["project_snags"]["Row"];
type SignOffRow = Database["public"]["Tables"]["project_sign_offs"]["Row"];

export type ProjectSnag = Pick<SnagRow, "id" | "description" | "status" | "package_id" | "created_at" | "resolved_at">;
export type ProjectSignOff = Pick<SignOffRow, "id" | "stage" | "signed_at">;

export type ProjectDetail = Pick<
  ProjectRow,
  "id" | "title" | "description" | "budget" | "status" | "target_start" | "target_end" | "created_at" | "updated_at"
>;

export type ProjectPackage = Pick<
  PackageRow,
  "id" | "project_id" | "title" | "trade" | "sort_order" | "allowance" | "needed_from" | "needed_to" | "job_id" | "site_id" | "created_at"
>;

export interface ProjectJob {
  id: string;
  job_number: number;
  title: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  contract_value: number | null;
  contractor_id: string;
  issued_quote_id: string | null;
  project_id: string | null;
  site_id: string | null;
}

export interface ProjectSite {
  id: string;
  name: string;
}

/** One package's money, from the project_money RPC. Totals only — no invoice rows ever reach the client. */
export interface PackageMoney {
  agreed: number | null;
  paid: number;
  still_to_pay: number;
  due_now: number;
}

export interface ContractorSummary {
  id: string;
  name: string;
  tsCode: string | null;
}

/** Package fields the caller edits. site_id and allowance are business-only — omitted entirely, they are not touched. */
export interface PackageFormValues {
  title: string;
  trade: string | null;
  needed_from: string | null;
  needed_to: string | null;
  /** Business only. undefined leaves the column untouched. */
  site_id?: string | null;
  /** Business only. undefined leaves the column untouched. */
  allowance?: number | null;
}

const PROJECT_SELECT =
  "id, title, description, budget, status, target_start, target_end, created_at, updated_at" as const;
const PACKAGE_SELECT =
  "id, project_id, title, trade, sort_order, allowance, needed_from, needed_to, job_id, site_id, created_at" as const;
const JOB_SELECT =
  "id, job_number, title, status, start_date, end_date, contract_value, contractor_id, issued_quote_id, project_id, site_id" as const;
const SNAG_SELECT = "id, description, status, package_id, created_at, resolved_at" as const;
const SIGN_OFF_SELECT = "id, stage, signed_at" as const;

// A zero-row write blocked by RLS comes back as success; every write reads
// its row back and treats "no row" as a failure (CLAUDE.md RLS failure modes).
const NOT_CHANGED = "The package was not changed. It may have been removed, or you may not have access to it.";

/** Contractor names and TS codes from public_pro_profiles (the public view). */
export async function loadContractors(ids: string[]): Promise<Record<string, ContractorSummary>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return {};
  const { data, error } = await supabase
    .from("public_pro_profiles")
    .select("id, full_name, company_name, ts_profile_code")
    .in("id", unique);
  if (error) throw error;
  const map: Record<string, ContractorSummary> = {};
  for (const row of data ?? []) {
    if (!row.id) continue;
    map[row.id] = {
      id: row.id,
      name: row.company_name || row.full_name || "Contractor",
      tsCode: row.ts_profile_code ?? null,
    };
  }
  return map;
}

export interface UseProjectDetailOptions {
  /** 'personal' (default) is unchanged. 'business' loads project sites and scopes attachable jobs to the company. */
  viewer?: "personal" | "business";
  /** Required when viewer is 'business'. */
  companyId?: string;
}

/**
 * One project with its packages, the jobs attached to them, each filled
 * package's money (via the project_money RPC — see
 * 20261009120000_project_money.sql, drafted but not yet pushed) and the
 * contractors' names. Read-only over money: the only job writes are
 * attach and detach, through attach_job_to_package / detach_job_from_package.
 *
 * Money is server-computed rather than read from the client's own
 * `invoices` query, because a business team member can only read
 * invoices.recipient_id = themselves under RLS — a colleague's
 * deposit-paid invoice on the same project would otherwise silently drop
 * out of a client-side figure. project_money is SECURITY DEFINER and
 * returns totals only, never an invoice row, so this applies to the
 * personal viewer too (same function, same figures as before).
 *
 * In 'business' mode the project's sites are also loaded (for the Sites
 * card and the package site picker), and attachable jobs are the
 * company's own rather than the caller's personally.
 */
export function useProjectDetail(projectId: string, options: UseProjectDetailOptions = {}) {
  const { viewer = "personal", companyId } = options;
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [packages, setPackages] = useState<ProjectPackage[]>([]);
  const [jobs, setJobs] = useState<Record<string, ProjectJob>>({});
  const [money, setMoney] = useState<Record<string, PackageMoney>>({});
  const [contractors, setContractors] = useState<Record<string, ContractorSummary>>({});
  const [snags, setSnags] = useState<ProjectSnag[]>([]);
  const [signOffs, setSignOffs] = useState<ProjectSignOff[]>([]);
  const [projectSites, setProjectSites] = useState<ProjectSite[]>([]);
  const [siteNames, setSiteNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: projectRow, error: projectError } = await supabase
        .from("projects")
        .select(PROJECT_SELECT)
        .eq("id", projectId)
        .maybeSingle();
      if (projectError) throw projectError;
      setProject((projectRow as ProjectDetail | null) ?? null);
      if (!projectRow) {
        setPackages([]);
        setJobs({});
        setMoney({});
        setSnags([]);
        setSignOffs([]);
        setContractors({});
        setProjectSites([]);
        setSiteNames({});
        return;
      }

      const { data: packageRows, error: packagesError } = await supabase
        .from("project_packages")
        .select(PACKAGE_SELECT)
        .eq("project_id", projectId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (packagesError) throw packagesError;
      const pkgs = (packageRows ?? []) as ProjectPackage[];
      setPackages(pkgs);

      const jobIds = pkgs.map((p) => p.job_id).filter((id): id is string => !!id);
      let jobMap: Record<string, ProjectJob> = {};
      if (jobIds.length > 0) {
        const { data: jobRows, error: jobsError } = await supabase
          .from("jobs")
          .select(JOB_SELECT)
          .in("id", jobIds);
        if (jobsError) throw jobsError;
        jobMap = Object.fromEntries(((jobRows ?? []) as ProjectJob[]).map((j) => [j.id, j]));
      }
      setJobs(jobMap);
      setContractors(await loadContractors(Object.values(jobMap).map((j) => j.contractor_id)));

      // Server-computed money for every package the caller may see —
      // see project_money's own comment block for why this replaces a
      // client-side invoices query for both viewers.
      const { data: moneyRows, error: moneyError } = await supabase.rpc("project_money", {
        p_project_id: projectId,
      });
      if (moneyError) throw moneyError;
      setMoney(
        Object.fromEntries(
          (moneyRows ?? []).map((r) => [
            r.package_id,
            { agreed: r.agreed, paid: r.paid, still_to_pay: r.still_to_pay, due_now: r.due_now } as PackageMoney,
          ])
        )
      );

      if (viewer === "business") {
        const { data: siteLinkRows, error: sitesError } = await supabase
          .from("project_sites")
          .select("site_id, sites(name)")
          .eq("project_id", projectId);
        if (sitesError) throw sitesError;
        const linked = (siteLinkRows ?? []) as unknown as { site_id: string; sites: { name: string } | null }[];
        setProjectSites(linked.map((r) => ({ id: r.site_id, name: r.sites?.name ?? "Unknown site" })));

        // Names for any site referenced by a package or a job, which may
        // include sites not (or no longer) linked to the project.
        const siteIds = [
          ...new Set([
            ...linked.map((r) => r.site_id),
            ...pkgs.map((p) => p.site_id).filter((id): id is string => !!id),
            ...Object.values(jobMap).map((j) => j.site_id).filter((id): id is string => !!id),
          ]),
        ];
        if (siteIds.length > 0) {
          const { data: siteRows, error: siteNamesError } = await supabase
            .from("sites")
            .select("id, name")
            .in("id", siteIds);
          if (siteNamesError) throw siteNamesError;
          setSiteNames(Object.fromEntries((siteRows ?? []).map((s) => [s.id, s.name])));
        } else {
          setSiteNames({});
        }
      } else {
        setProjectSites([]);
        setSiteNames({});
      }

      const { data: snagRows, error: snagsError } = await supabase
        .from("project_snags")
        .select(SNAG_SELECT)
        .eq("project_id", projectId)
        .order("created_at", { ascending: false });
      if (snagsError) throw snagsError;
      setSnags((snagRows ?? []) as ProjectSnag[]);

      const { data: signOffRows, error: signOffsError } = await supabase
        .from("project_sign_offs")
        .select(SIGN_OFF_SELECT)
        .eq("project_id", projectId)
        .order("signed_at", { ascending: false });
      if (signOffsError) throw signOffsError;
      setSignOffs((signOffRows ?? []) as ProjectSignOff[]);
    } catch (err) {
      console.error("Error loading project:", err);
      setError(err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : "Could not load this project.");
    } finally {
      setLoading(false);
    }
  }, [projectId, viewer]);

  useEffect(() => {
    void load();
  }, [load]);

  const addPackage = useCallback(async (values: PackageFormValues) => {
    const nextOrder = packages.reduce((max, p) => Math.max(max, p.sort_order), -1) + 1;
    const { data, error: insertError } = await supabase
      .from("project_packages")
      .insert({
        project_id: projectId,
        title: values.title,
        trade: values.trade,
        needed_from: values.needed_from,
        needed_to: values.needed_to,
        sort_order: nextOrder,
        // Business-only fields — omitted entirely (not written as null)
        // when the caller (the homeowner dialog) never supplies them.
        ...(values.site_id !== undefined ? { site_id: values.site_id } : {}),
        ...(values.allowance !== undefined ? { allowance: values.allowance } : {}),
      })
      .select(PACKAGE_SELECT)
      .single();
    if (insertError) throw insertError;
    setPackages((prev) => [...prev, data as ProjectPackage]);
  }, [packages, projectId]);

  const updatePackage = useCallback(async (packageId: string, values: PackageFormValues) => {
    const { data, error: updateError } = await supabase
      .from("project_packages")
      .update({
        title: values.title,
        trade: values.trade,
        needed_from: values.needed_from,
        needed_to: values.needed_to,
        ...(values.site_id !== undefined ? { site_id: values.site_id } : {}),
        ...(values.allowance !== undefined ? { allowance: values.allowance } : {}),
      })
      .eq("id", packageId)
      .select(PACKAGE_SELECT);
    if (updateError) throw updateError;
    if (!data || data.length === 0) throw new Error(NOT_CHANGED);
    const updated = data[0] as ProjectPackage;
    setPackages((prev) => prev.map((p) => (p.id === packageId ? updated : p)));
  }, []);

  const deletePackage = useCallback(async (pkg: ProjectPackage) => {
    if (pkg.job_id) throw new Error("Detach the job before deleting this package.");
    const { data, error: deleteError } = await supabase
      .from("project_packages")
      .delete()
      .eq("id", pkg.id)
      .select("id");
    if (deleteError) throw deleteError;
    if (!data || data.length === 0) throw new Error(NOT_CHANGED);
    setPackages((prev) => prev.filter((p) => p.id !== pkg.id));
  }, []);

  /** attach_job_to_package sets jobs.project_id and the package's job_id together. */
  const attachJob = useCallback(async (packageId: string, jobId: string) => {
    const { error: rpcError } = await supabase.rpc("attach_job_to_package", {
      p_package_id: packageId,
      p_job_id: jobId,
    });
    if (rpcError) throw rpcError;
    await load();
  }, [load]);

  /** detach_job_from_package clears both links. */
  const detachJob = useCallback(async (packageId: string) => {
    const { error: rpcError } = await supabase.rpc("detach_job_from_package", { p_package_id: packageId });
    if (rpcError) throw rpcError;
    await load();
  }, [load]);

  /**
   * Personal mode: my jobs that can be attached — not in any project, not
   * cancelled. Business mode: the project's company's jobs, same two
   * conditions; RLS narrows these by the caller's coverage.
   * (attach_job_to_package re-checks this, and ownership, either way.)
   */
  const loadAttachableJobs = useCallback(async (): Promise<{ jobs: ProjectJob[]; contractors: Record<string, ContractorSummary> }> => {
    let query = supabase
      .from("jobs")
      .select(JOB_SELECT)
      .is("project_id", null)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false });

    if (viewer === "business") {
      if (!companyId) throw new Error("No company to load jobs for.");
      query = query.eq("company_id", companyId);
    } else {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error("You are not signed in.");
      query = query.eq("customer_id", user.id);
    }

    const { data, error: jobsError } = await query;
    if (jobsError) throw jobsError;
    const list = (data ?? []) as ProjectJob[];
    return { jobs: list, contractors: await loadContractors(list.map((j) => j.contractor_id)) };
  }, [viewer, companyId]);

  /** Links a site the caller can access to the project (business only). */
  const addSite = useCallback(async (siteId: string) => {
    const { error: insertError } = await supabase
      .from("project_sites")
      .insert({ project_id: projectId, site_id: siteId });
    if (insertError) throw insertError;
    await load();
  }, [projectId, load]);

  /**
   * Unlinks a site from the project. Refused here, before any write, while
   * a package is still pinned to it — packages.site_id points at the site
   * directly, so removing the link wouldn't itself be blocked by the
   * database, and would leave that package's site dangling.
   */
  const removeSite = useCallback(async (siteId: string) => {
    if (packages.some((p) => p.site_id === siteId)) {
      throw new Error("A package is pinned to this site. Move or clear that package's site first.");
    }
    const { data, error: deleteError } = await supabase
      .from("project_sites")
      .delete()
      .eq("project_id", projectId)
      .eq("site_id", siteId)
      .select("id");
    if (deleteError) throw deleteError;
    if (!data || data.length === 0) throw new Error(NOT_CHANGED);
    await load();
  }, [projectId, packages, load]);

  /** Raises a snag, optionally against one package. */
  const addSnag = useCallback(async (description: string, packageId: string | null) => {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!user) throw new Error("You are not signed in.");
    const { data, error: insertError } = await supabase
      .from("project_snags")
      .insert({ project_id: projectId, package_id: packageId, raised_by: user.id, description })
      .select(SNAG_SELECT)
      .single();
    if (insertError) throw insertError;
    setSnags((prev) => [data as ProjectSnag, ...prev]);
  }, [projectId]);

  const resolveSnag = useCallback(async (snagId: string) => {
    const { data, error: updateError } = await supabase
      .from("project_snags")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("id", snagId)
      .select(SNAG_SELECT);
    if (updateError) throw updateError;
    if (!data || data.length === 0) throw new Error("The snag was not changed. It may have been removed, or you may not have access to it.");
    const updated = data[0] as ProjectSnag;
    setSnags((prev) => prev.map((s) => (s.id === snagId ? updated : s)));
  }, []);

  /** sign_off_project checks every condition, then records the sign-off and completes the project. */
  const signOff = useCallback(async () => {
    const { error: rpcError } = await supabase.rpc("sign_off_project", { p_project_id: projectId });
    if (rpcError) throw rpcError;
    await load();
  }, [projectId, load]);

  const attachedJobCount = packages.filter((p) => !!p.job_id).length;

  return {
    project, packages, jobs, money, contractors, snags, signOffs, attachedJobCount,
    projectSites, siteNames,
    loading, error, refetch: load,
    addPackage, updatePackage, deletePackage, attachJob, detachJob, loadAttachableJobs,
    addSnag, resolveSnag, signOff, addSite, removeSite,
  };
}
