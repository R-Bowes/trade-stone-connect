import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState, ErrorState } from "@/components/AsyncState";
import { isSnagOpen, signOffBlockers } from "@/lib/projectSignOff";
import { chooseBy } from "@/lib/chooseByDate";
import { formatGBP } from "@/lib/formatGBP";
import { formatDate } from "@/lib/formatDate";

interface PanelProject {
  id: string;
  title: string;
  status: string;
}

interface PackageRow {
  id: string;
  project_id: string;
  title: string;
  job_id: string | null;
  needed_from: string | null;
  trade: string | null;
  sort_order: number;
  created_at: string;
}

interface JobRow {
  id: string;
  status: string;
}

interface SnagRow {
  id: string;
  project_id: string;
  status: string;
}

interface ProjectGroup {
  project: PanelProject;
  items: { key: string; node: React.ReactNode }[];
}

const projectPath = (id: string) => `/dashboard/business?view=projects&project=${id}`;

/**
 * Needs you, across every listed project, grouped by project. Same four
 * kinds of item as NeedsYouCard (amounts due now, unfilled packages with
 * their choose-by date, open snags, ready to sign off) — just summed per
 * project rather than shown against one project's own jobs.
 *
 * Request shape for N projects: 3 batched queries (packages, jobs,
 * snags) plus one project_money call per project — N + 3 total. There is
 * no batched "money for several projects with line-item detail" RPC;
 * project_money_totals gives agreed/paid only, not due_now, so it can't
 * be substituted here without a new migration.
 */
export function ProjectsNeedsYouPanel({ projects }: { projects: PanelProject[] }) {
  const navigate = useNavigate();
  const [groups, setGroups] = useState<ProjectGroup[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const projectIds = projects.map((p) => p.id);

  const load = useCallback(async () => {
    if (projectIds.length === 0) {
      setGroups([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [packagesRes, snagsRes] = await Promise.all([
        supabase
          .from("project_packages")
          .select("id, project_id, title, job_id, needed_from, trade, sort_order, created_at")
          .in("project_id", projectIds),
        supabase.from("project_snags").select("id, project_id, status").in("project_id", projectIds),
      ]);
      if (packagesRes.error) throw packagesRes.error;
      if (snagsRes.error) throw snagsRes.error;
      const packages = (packagesRes.data ?? []) as PackageRow[];
      const snags = (snagsRes.data ?? []) as SnagRow[];

      const jobIds = packages.map((p) => p.job_id).filter((id): id is string => !!id);
      let jobsById: Record<string, JobRow> = {};
      if (jobIds.length > 0) {
        const { data: jobRows, error: jobsError } = await supabase.from("jobs").select("id, status").in("id", jobIds);
        if (jobsError) throw jobsError;
        jobsById = Object.fromEntries((jobRows ?? []).map((j) => [j.id, j as JobRow]));
      }

      // One project_money call per project — see the request-count note above.
      const moneyByProject = await Promise.all(
        projectIds.map(async (id) => {
          const { data, error: moneyError } = await supabase.rpc("project_money", { p_project_id: id });
          if (moneyError) throw moneyError;
          return [id, data ?? []] as const;
        })
      );
      const moneyMap = new Map(moneyByProject);

      const result: ProjectGroup[] = [];
      for (const project of projects) {
        const pkgs = packages.filter((p) => p.project_id === project.id);
        const projectSnags = snags.filter((s) => s.project_id === project.id);
        const money = moneyMap.get(project.id) ?? [];
        const dueByPackage = Object.fromEntries(money.map((m) => [m.package_id, m.due_now]));

        const items: { key: string; node: React.ReactNode }[] = [];

        const dueTotal = pkgs.reduce((sum, p) => sum + (dueByPackage[p.id] ?? 0), 0);
        if (dueTotal > 0) {
          items.push({
            key: "pay",
            node: (
              <>
                <i className="ti ti-receipt mr-1 text-[#f07820]" aria-hidden="true" />
                Pay <span className="font-mono font-semibold">{formatGBP(dueTotal)}</span>
              </>
            ),
          });
        }

        for (const pkg of pkgs.filter((p) => !p.job_id)) {
          const due = pkg.needed_from ? chooseBy(pkg.needed_from) : null;
          items.push({
            key: `fill-${pkg.id}`,
            node: (
              <>
                <i className="ti ti-user-search mr-1 text-[#1e3a5f]" aria-hidden="true" />
                Find a contractor for {pkg.title}
                {due && (
                  <span className="block text-xs text-muted-foreground">
                    {due.overdue ? (
                      <span className="font-semibold text-red-700">Overdue: choose by {formatDate(due.date)}</span>
                    ) : (
                      <>Choose by {formatDate(due.date)}</>
                    )}
                  </span>
                )}
              </>
            ),
          });
        }

        const openSnags = projectSnags.filter(isSnagOpen).length;
        if (openSnags > 0) {
          items.push({
            key: "snags",
            node: (
              <>
                <i className="ti ti-alert-circle mr-1 text-amber-600" aria-hidden="true" />
                {openSnags === 1 ? "1 open snag" : `${openSnags} open snags`}
              </>
            ),
          });
        }

        const blockers = signOffBlockers(project.status, pkgs, jobsById, projectSnags);
        if (project.status !== "completed" && blockers.length === 0 && pkgs.length > 0) {
          items.push({
            key: "signoff",
            node: (
              <span className="font-medium text-green-700">
                <i className="ti ti-circle-check mr-1" aria-hidden="true" />
                Ready to sign off
              </span>
            ),
          });
        }

        if (items.length > 0) result.push({ project, items });
      }

      setGroups(result);
    } catch (err) {
      console.error("Error loading the needs-you panel:", err);
      setError(err instanceof Error ? err.message : "Could not load what needs you.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectIds.join(",")]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingState message="Loading what needs you..." />;
  if (error) return <ErrorState message={error} onRetry={() => void load()} />;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="font-heading text-lg">Needs you</CardTitle>
      </CardHeader>
      <CardContent>
        {!groups || groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing needs you right now.</p>
        ) : (
          <div className="space-y-4">
            {groups.map(({ project, items }) => (
              <div key={project.id}>
                <button
                  className="font-heading text-sm font-semibold hover:underline"
                  onClick={() => navigate(projectPath(project.id))}
                >
                  {project.title}
                </button>
                <ul className="mt-1 space-y-2 text-sm">
                  {items.map((item) => (
                    <li key={item.key}>{item.node}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
