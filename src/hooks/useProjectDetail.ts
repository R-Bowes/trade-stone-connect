import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import type { ProjectInvoice } from "@/lib/projectMoney";

type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
type PackageRow = Database["public"]["Tables"]["project_packages"]["Row"];

export type ProjectDetail = Pick<
  ProjectRow,
  "id" | "title" | "description" | "budget" | "status" | "target_start" | "target_end" | "created_at" | "updated_at"
>;

export type ProjectPackage = Pick<
  PackageRow,
  "id" | "project_id" | "title" | "trade" | "sort_order" | "allowance" | "needed_from" | "needed_to" | "job_id" | "created_at"
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
}

export interface ContractorSummary {
  id: string;
  name: string;
  tsCode: string | null;
}

/** Package fields the homeowner edits. */
export interface PackageFormValues {
  title: string;
  trade: string | null;
  needed_from: string | null;
  needed_to: string | null;
}

const PROJECT_SELECT =
  "id, title, description, budget, status, target_start, target_end, created_at, updated_at" as const;
const PACKAGE_SELECT =
  "id, project_id, title, trade, sort_order, allowance, needed_from, needed_to, job_id, created_at" as const;
const JOB_SELECT =
  "id, job_number, title, status, start_date, end_date, contract_value, contractor_id, issued_quote_id, project_id" as const;
const INVOICE_SELECT =
  "status, total, due_date, deposit_amount, deposit_deducted, deposit_paid, job_id, quote_id" as const;

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

/**
 * One homeowner project with its packages, the jobs attached to them, those
 * jobs' invoices (as the customer sees them) and the contractors' names.
 * Read-only over money: the only job writes are attach and detach, through
 * attach_job_to_package / detach_job_from_package.
 */
export function useProjectDetail(projectId: string) {
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [packages, setPackages] = useState<ProjectPackage[]>([]);
  const [jobs, setJobs] = useState<Record<string, ProjectJob>>({});
  const [invoices, setInvoices] = useState<ProjectInvoice[]>([]);
  const [contractors, setContractors] = useState<Record<string, ContractorSummary>>({});
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
        setInvoices([]);
        setContractors({});
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
      let jobInvoices: ProjectInvoice[] = [];
      if (jobIds.length > 0) {
        const { data: jobRows, error: jobsError } = await supabase
          .from("jobs")
          .select(JOB_SELECT)
          .in("id", jobIds);
        if (jobsError) throw jobsError;
        jobMap = Object.fromEntries(((jobRows ?? []) as ProjectJob[]).map((j) => [j.id, j]));

        // The customer's invoices for these jobs: by job_id, or by quote_id
        // for older invoices raised before job_id was recorded.
        const quoteIds = Object.values(jobMap).map((j) => j.issued_quote_id).filter((id): id is string => !!id);
        const orFilter = [`job_id.in.(${jobIds.join(",")})`, ...(quoteIds.length > 0 ? [`quote_id.in.(${quoteIds.join(",")})`] : [])].join(",");
        const { data: invoiceRows, error: invoicesError } = await supabase
          .from("invoices")
          .select(INVOICE_SELECT)
          .or(orFilter);
        if (invoicesError) throw invoicesError;
        jobInvoices = (invoiceRows ?? []) as ProjectInvoice[];
      }
      setJobs(jobMap);
      setInvoices(jobInvoices);
      setContractors(await loadContractors(Object.values(jobMap).map((j) => j.contractor_id)));
    } catch (err) {
      console.error("Error loading project:", err);
      setError(err && typeof err === "object" && "message" in err ? String((err as { message: unknown }).message) : "Could not load this project.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

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
   * My jobs that can be attached: not in any project and not cancelled.
   * (attach_job_to_package re-checks this, and that I am the job's customer.)
   */
  const loadAttachableJobs = useCallback(async (): Promise<{ jobs: ProjectJob[]; contractors: Record<string, ContractorSummary> }> => {
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!user) throw new Error("You are not signed in.");
    const { data, error: jobsError } = await supabase
      .from("jobs")
      .select(JOB_SELECT)
      .eq("customer_id", user.id)
      .is("project_id", null)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false });
    if (jobsError) throw jobsError;
    const list = (data ?? []) as ProjectJob[];
    return { jobs: list, contractors: await loadContractors(list.map((j) => j.contractor_id)) };
  }, []);

  const attachedJobCount = packages.filter((p) => !!p.job_id).length;

  return {
    project, packages, jobs, invoices, contractors, attachedJobCount,
    loading, error, refetch: load,
    addPackage, updatePackage, deletePackage, attachJob, detachJob, loadAttachableJobs,
  };
}
