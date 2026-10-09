import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];

const PROJECT_SELECT =
  "id, title, description, budget, status, target_start, target_end, created_at, updated_at" as const;

export interface BusinessProject
  extends Pick<
    ProjectRow,
    "id" | "title" | "description" | "budget" | "status" | "target_start" | "target_end" | "created_at" | "updated_at"
  > {
  siteIds: string[];
  siteNames: string[];
}

export interface BusinessProjectFormValues {
  title: string;
  description: string | null;
  budget: number | null;
  target_start: string | null;
  target_end: string | null;
  /** Required (at least one) when creating; ignored by updateProject. */
  siteIds?: string[];
}

const NOT_CHANGED = "The project was not changed. It may have been removed, or you may not have access to it.";

/**
 * A company's business projects, newest first. RLS (project_access_rule /
 * can_access_project) narrows this to whatever the caller's coverage
 * allows — a site- or group-scoped member only ever sees projects their
 * coverage reaches, even though the query itself only filters by
 * company_id.
 */
export function useCompanyProjects(companyId: string | null) {
  const [projects, setProjects] = useState<BusinessProject[]>([]);
  const [attachedJobCounts, setAttachedJobCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProjects = useCallback(async () => {
    if (!companyId) {
      setProjects([]);
      setAttachedJobCounts({});
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .from("projects")
        .select(PROJECT_SELECT)
        .eq("company_id", companyId)
        .eq("account_type", "business")
        .order("created_at", { ascending: false });
      if (queryError) throw queryError;

      const base = (data ?? []) as Omit<BusinessProject, "siteIds" | "siteNames">[];
      const ids = base.map((p) => p.id);

      const siteIdsByProject: Record<string, string[]> = {};
      const siteNamesByProject: Record<string, string[]> = {};
      const counts: Record<string, number> = {};

      if (ids.length > 0) {
        const [sitesRes, packagesRes] = await Promise.all([
          supabase
            .from("project_sites")
            .select("project_id, site_id, sites(name)")
            .in("project_id", ids),
          supabase
            .from("project_packages")
            .select("project_id")
            .in("project_id", ids)
            .not("job_id", "is", null),
        ]);
        if (sitesRes.error) throw sitesRes.error;
        if (packagesRes.error) throw packagesRes.error;

        for (const row of sitesRes.data ?? []) {
          const site = row as unknown as { project_id: string; site_id: string; sites: { name: string } | null };
          (siteIdsByProject[site.project_id] ??= []).push(site.site_id);
          if (site.sites?.name) (siteNamesByProject[site.project_id] ??= []).push(site.sites.name);
        }
        for (const row of packagesRes.data ?? []) {
          counts[row.project_id] = (counts[row.project_id] ?? 0) + 1;
        }
      }

      const list: BusinessProject[] = base.map((p) => ({
        ...p,
        siteIds: siteIdsByProject[p.id] ?? [],
        siteNames: siteNamesByProject[p.id] ?? [],
      }));

      setProjects(list);
      setAttachedJobCounts(counts);
    } catch (err) {
      console.error("Error loading business projects:", err);
      setError(err instanceof Error ? err.message : "Could not load projects.");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void fetchProjects();
  }, [fetchProjects]);

  /**
   * Creates a business project owned by the company, then attaches its
   * sites. The project insert throws on failure (nothing was created).
   * The sites insert, if it fails, does NOT throw — the project already
   * exists, so the caller gets it back along with the site error so it
   * can say the project was created without sites.
   */
  const createProject = useCallback(
    async (
      values: BusinessProjectFormValues
    ): Promise<{ project: BusinessProject; sitesError: string | null }> => {
      if (!companyId) throw new Error("No company to create this project under.");

      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error("You are not signed in.");

      const { data, error: insertError } = await supabase
        .from("projects")
        .insert({
          posted_by: user.id,
          account_type: "business",
          company_id: companyId,
          title: values.title,
          description: values.description,
          budget: values.budget,
          target_start: values.target_start,
          target_end: values.target_end,
        })
        .select(PROJECT_SELECT)
        .single();
      if (insertError) throw insertError;

      const siteIds = values.siteIds ?? [];
      let sitesError: string | null = null;
      let siteNames: string[] = [];

      if (siteIds.length > 0) {
        const { data: siteRows, error: sitesInsertError } = await supabase
          .from("project_sites")
          .insert(siteIds.map((site_id) => ({ project_id: data.id, site_id })))
          .select("site_id, sites(name)");
        if (sitesInsertError) {
          console.error("Error attaching sites to new project:", sitesInsertError);
          sitesError = `The project was created without sites: ${sitesInsertError.message}`;
        } else {
          siteNames = (siteRows ?? [])
            .map((r) => (r as unknown as { sites: { name: string } | null }).sites?.name)
            .filter((n): n is string => !!n);
        }
      }

      const created: BusinessProject = {
        ...(data as Omit<BusinessProject, "siteIds" | "siteNames">),
        siteIds: sitesError ? [] : siteIds,
        siteNames,
      };
      setProjects((prev) => [created, ...prev]);
      return { project: created, sitesError };
    },
    [companyId]
  );

  /** Updates title, description, budget and target dates only. Sites are not touched here. */
  const updateProject = useCallback(async (id: string, values: BusinessProjectFormValues): Promise<BusinessProject> => {
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
      .select(PROJECT_SELECT);
    if (updateError) throw updateError;
    if (!data || data.length === 0) throw new Error(NOT_CHANGED);

    const updatedRow = data[0] as Omit<BusinessProject, "siteIds" | "siteNames">;
    let updated: BusinessProject;
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        updated = { ...updatedRow, siteIds: p.siteIds, siteNames: p.siteNames };
        return updated;
      })
    );
    return updated!;
  }, []);

  /** Deletes the project. The database refuses this while jobs are attached. */
  const deleteProject = useCallback(async (id: string): Promise<void> => {
    const { data, error: deleteError } = await supabase
      .from("projects")
      .delete()
      .eq("id", id)
      .select("id");
    if (deleteError) throw deleteError;
    if (!data || data.length === 0) throw new Error(NOT_CHANGED);

    setProjects((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return { projects, attachedJobCounts, loading, error, refetch: fetchProjects, createProject, updateProject, deleteProject };
}
