import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type {
  ProjectPackage, ProjectJob, ContractorSummary, PackageMoney, ProjectSnag, ProjectSignOff,
} from "@/hooks/useProjectDetail";
import { formatJobRef } from "@/lib/documentRefs";
import { projectDisplayStatus, type ProjectDisplayStatus } from "@/lib/projectStatus";

export interface CustomerContractorProjectSummary {
  project_id: string;
  title: string;
  status: string;
  target_start: string | null;
  target_end: string | null;
  contractor_name: string | null;
  phase_count: number;
  complete_phase_count: number;
}

/**
 * Single shared status derivation for every contractor-run-project
 * screen (the homeowner list card and CustomerContractorProjectPage's
 * header) -- phase_count is always >= 1 here, since
 * is_contractor_project_customer requires the caller's own attached
 * job to exist, so this agrees with the page's own
 * packages.some(has a job) check in every real case.
 */
export function customerContractorProjectDisplayStatus(summary: CustomerContractorProjectSummary): ProjectDisplayStatus {
  return projectDisplayStatus(summary.status, summary.phase_count);
}

export interface CustomerContractorPackageRow {
  package_id: string;
  title: string;
  trade: string | null;
  needed_from: string | null;
  needed_to: string | null;
  job_id: string | null;
  job_number: number | null;
  job_status: string | null;
  job_start_date: string | null;
  job_end_date: string | null;
  contractor_name: string | null;
  contractor_ts_code: string | null;
  subcontractor_names: string | null;
}

/** Every contractor-owned project the signed-in personal account is the customer of. */
export function useCustomerContractorProjects() {
  const [projects, setProjects] = useState<CustomerContractorProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc("customer_contractor_projects");
      if (rpcError) throw rpcError;
      setProjects((data ?? []) as CustomerContractorProjectSummary[]);
    } catch (err) {
      console.error("Error loading contractor-run projects:", err);
      setError(err instanceof Error ? err.message : "Could not load your projects.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { projects, loading, error, refetch: load };
}

/**
 * One contractor-owned project, read-only except snags and sign-off.
 * Shapes its RPC rows into the same ProjectPackage/ProjectJob/
 * ContractorSummary/PackageMoney types useProjectDetail.ts uses, so
 * BudgetBand/ProjectTimeline/SnagListCard/SignOffCard/NeedsYouCard can
 * all be reused unchanged.
 */
export function useCustomerContractorProjectDetail(projectId: string) {
  const [packages, setPackages] = useState<ProjectPackage[]>([]);
  const [jobs, setJobs] = useState<Record<string, ProjectJob>>({});
  const [contractors, setContractors] = useState<Record<string, ContractorSummary>>({});
  const [money, setMoney] = useState<Record<string, PackageMoney>>({});
  const [snags, setSnags] = useState<ProjectSnag[]>([]);
  const [signOffs, setSignOffs] = useState<ProjectSignOff[]>([]);
  /** job_id -> full customer-facing reference (e.g. "J-4AE203-0014"). */
  const [jobRefs, setJobRefs] = useState<Record<string, string>>({});
  /** package_id -> accepted subcontractor names, comma separated. */
  const [subcontractorNames, setSubcontractorNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [viewRes, moneyRes, snagsRes, signOffsRes] = await Promise.all([
        supabase.rpc("customer_contractor_project_view", { p_project_id: projectId }),
        supabase.rpc("customer_contractor_project_money", { p_project_id: projectId }),
        supabase.from("project_snags").select("id, description, status, package_id, created_at, resolved_at").eq("project_id", projectId),
        supabase.from("project_sign_offs").select("id, stage, signed_at").eq("project_id", projectId).order("signed_at", { ascending: false }),
      ]);
      if (viewRes.error) throw viewRes.error;
      if (moneyRes.error) throw moneyRes.error;
      if (snagsRes.error) throw snagsRes.error;
      if (signOffsRes.error) throw signOffsRes.error;

      const rows = (viewRes.data ?? []) as CustomerContractorPackageRow[];

      const pkgs: ProjectPackage[] = rows.map((r, i) => ({
        id: r.package_id,
        project_id: projectId,
        title: r.title,
        trade: r.trade,
        sort_order: i,
        allowance: null,
        needed_from: r.needed_from,
        needed_to: r.needed_to,
        job_id: r.job_id,
        site_id: null,
        created_at: new Date(0).toISOString(),
      }));

      const jobMap: Record<string, ProjectJob> = {};
      const contractorMap: Record<string, ContractorSummary> = {};
      const refMap: Record<string, string> = {};
      for (const r of rows) {
        if (!r.job_id) continue;
        jobMap[r.job_id] = {
          id: r.job_id,
          job_number: r.job_number ?? 0,
          title: r.title,
          status: r.job_status ?? "scheduled",
          start_date: r.job_start_date,
          end_date: r.job_end_date,
          contract_value: null,
          contractor_id: r.job_id,
          issued_quote_id: null,
          project_id: projectId,
          site_id: null,
          customer_id: null,
        };
        if (r.contractor_name) {
          contractorMap[r.job_id] = { id: r.job_id, name: r.contractor_name, tsCode: r.contractor_ts_code };
        }
        if (r.job_number != null) {
          refMap[r.job_id] = formatJobRef(r.job_number, r.contractor_ts_code ? { contractorCode: r.contractor_ts_code } : undefined);
        }
      }

      const moneyRows = (moneyRes.data ?? []) as { package_id: string; agreed: number | null; paid: number; still_to_pay: number; due_now: number }[];
      const moneyMap: Record<string, PackageMoney> = {};
      for (const m of moneyRows) {
        moneyMap[m.package_id] = { agreed: m.agreed, paid: m.paid, still_to_pay: m.still_to_pay, due_now: m.due_now };
      }

      setPackages(pkgs);
      setJobs(jobMap);
      setContractors(contractorMap);
      setMoney(moneyMap);
      setSnags((snagsRes.data ?? []) as ProjectSnag[]);
      setSignOffs((signOffsRes.data ?? []) as ProjectSignOff[]);
      setJobRefs(refMap);
      setSubcontractorNames(Object.fromEntries(rows.filter((r) => r.subcontractor_names).map((r) => [r.package_id, r.subcontractor_names as string])));
    } catch (err) {
      console.error("Error loading contractor-run project detail:", err);
      setError(err instanceof Error ? err.message : "Could not load this project.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const addSnag = useCallback(async (description: string, packageId: string | null): Promise<void> => {
    const { error: rpcError } = await supabase.rpc("raise_contractor_project_snag", {
      p_project_id: projectId,
      p_package_id: packageId,
      p_description: description,
    });
    if (rpcError) throw new Error(rpcError.message);
    await load();
  }, [projectId, load]);

  const resolveSnag = useCallback(async (snagId: string): Promise<void> => {
    const { error: rpcError } = await supabase.rpc("set_contractor_project_snag_status", {
      p_snag_id: snagId,
      p_resolved: true,
    });
    if (rpcError) throw new Error(rpcError.message);
    await load();
  }, [load]);

  const signOff = useCallback(async (): Promise<void> => {
    const { error: rpcError } = await supabase.rpc("sign_off_project", { p_project_id: projectId });
    if (rpcError) throw rpcError;
    await load();
  }, [projectId, load]);

  return {
    packages, jobs, contractors, money, snags, signOffs, jobRefs, subcontractorNames,
    loading, error, refetch: load, addSnag, resolveSnag, signOff,
  };
}
