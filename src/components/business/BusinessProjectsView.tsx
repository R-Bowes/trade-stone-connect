import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState, LoadingState } from "@/components/AsyncState";
import { useCompanyProjects, type BusinessProject } from "@/hooks/useCompanyProjects";
import { projectDisplayStatus, PROJECT_STATUS_CHIP, type ProjectDisplayStatus } from "@/lib/projectStatus";
import { formatGBP } from "@/lib/formatGBP";
import { formatDate } from "@/lib/formatDate";
import { CreateProjectDialog, type ProjectSiteOption } from "@/components/projects/CreateProjectDialog";

const projectPath = (id: string) => `/dashboard/business?view=projects&project=${id}`;

interface SiteGroupOption {
  id: string;
  name: string;
}

/**
 * Company-wide projects overview. RLS narrows the list to whatever the
 * caller's coverage reaches; the site/group filters below only affect
 * what's shown of that already-narrowed list, not what's fetched.
 */
interface ProjectMoneyTotal {
  agreed: number;
  paid: number;
}

export function BusinessProjectsView({ companyId }: { companyId: string }) {
  const navigate = useNavigate();
  const { projects, attachedJobCounts, loading, error, refetch, createProject } = useCompanyProjects(companyId);
  const [creating, setCreating] = useState(false);
  const [createWarning, setCreateWarning] = useState<string | null>(null);

  const [moneyTotals, setMoneyTotals] = useState<Record<string, ProjectMoneyTotal>>({});
  const [moneyError, setMoneyError] = useState<string | null>(null);

  const [sites, setSites] = useState<ProjectSiteOption[]>([]);
  const [siteGroups, setSiteGroups] = useState<SiteGroupOption[]>([]);
  const [groupSiteIds, setGroupSiteIds] = useState<Record<string, string[]>>({});
  const [filtersLoading, setFiltersLoading] = useState(true);
  const [filtersError, setFiltersError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<ProjectDisplayStatus | "all">("all");
  const [groupFilter, setGroupFilter] = useState<string>("all");
  const [siteFilter, setSiteFilter] = useState<string>("all");

  useEffect(() => {
    const loadFilters = async () => {
      setFiltersLoading(true);
      setFiltersError(null);
      try {
        const [sitesRes, groupsRes, membersRes] = await Promise.all([
          supabase.from("sites").select("id, name").eq("company_id", companyId).order("name"),
          supabase.from("site_groups").select("id, name").eq("company_id", companyId).order("name"),
          supabase.from("site_group_members").select("group_id, site_id"),
        ]);
        if (sitesRes.error) throw sitesRes.error;
        if (groupsRes.error) throw groupsRes.error;
        if (membersRes.error) throw membersRes.error;

        setSites(sitesRes.data ?? []);
        setSiteGroups(groupsRes.data ?? []);

        const byGroup: Record<string, string[]> = {};
        for (const row of membersRes.data ?? []) {
          (byGroup[row.group_id] ??= []).push(row.site_id);
        }
        setGroupSiteIds(byGroup);
      } catch (err) {
        console.error("Error loading site/group filters:", err);
        setFiltersError(err instanceof Error ? err.message : "Could not load sites and site groups.");
      } finally {
        setFiltersLoading(false);
      }
    };
    void loadFilters();
  }, [companyId]);

  const projectIds = useMemo(() => projects.map((p) => p.id), [projects]);

  useEffect(() => {
    if (projectIds.length === 0) {
      setMoneyTotals({});
      return;
    }
    const loadMoney = async () => {
      setMoneyError(null);
      const { data, error: rpcError } = await supabase.rpc("project_money_totals", { p_project_ids: projectIds });
      if (rpcError) {
        setMoneyError(rpcError.message);
        return;
      }
      setMoneyTotals(Object.fromEntries((data ?? []).map((r) => [r.project_id, { agreed: r.agreed, paid: r.paid }])));
    };
    void loadMoney();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectIds.join(",")]);

  const withStatus = useMemo(
    () =>
      projects.map((p) => ({
        project: p,
        status: projectDisplayStatus(p.status, attachedJobCounts[p.id] ?? 0),
      })),
    [projects, attachedJobCounts]
  );

  const filtered = useMemo(() => {
    return withStatus.filter(({ project, status }) => {
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (siteFilter !== "all" && !project.siteIds.includes(siteFilter)) return false;
      if (groupFilter !== "all") {
        const groupSites = groupSiteIds[groupFilter] ?? [];
        if (!project.siteIds.some((id) => groupSites.includes(id))) return false;
      }
      return true;
    });
  }, [withStatus, statusFilter, siteFilter, groupFilter, groupSiteIds]);

  const tiles = useMemo(() => {
    let planning = 0, inProgress = 0, completed = 0, totalBudget = 0, committed = 0, paid = 0;
    for (const { project, status } of filtered) {
      if (status === "Planning") planning++;
      else if (status === "In progress") inProgress++;
      else completed++;
      totalBudget += project.budget ?? 0;
      committed += moneyTotals[project.id]?.agreed ?? 0;
      paid += moneyTotals[project.id]?.paid ?? 0;
    }
    return { planning, inProgress, completed, totalBudget, committed, paid };
  }, [filtered, moneyTotals]);

  if (loading) return <LoadingState message="Loading projects..." />;
  if (error) return <ErrorState message={error} onRetry={() => void refetch()} />;

  const newProjectButton = (
    <Button onClick={() => { setCreateWarning(null); setCreating(true); }}>
      <i className="ti ti-plus mr-2" aria-hidden="true" />
      New project
    </Button>
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex justify-end">{newProjectButton}</div>

      {createWarning && (
        <div className="rounded-md border border-amber-300 bg-amber-50 text-amber-800 text-sm p-3">
          {createWarning}
        </div>
      )}

      {projects.length === 0 ? (
        <EmptyState
          icon={<i className="ti ti-layout-kanban text-4xl" aria-hidden="true" />}
          message="Group the jobs for one piece of work across your sites, and see the dates and costs together."
          action={newProjectButton}
        />
      ) : (
        <>
          {/* ── Tiles ──────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <Tile label="Planning" value={String(tiles.planning)} />
            <Tile label="In progress" value={String(tiles.inProgress)} />
            <Tile label="Completed" value={String(tiles.completed)} />
            <Tile label="Total budget" value={formatGBP(tiles.totalBudget)} mono />
            <Tile label="Committed" value={formatGBP(tiles.committed)} mono />
            <Tile label="Paid" value={formatGBP(tiles.paid)} mono />
          </div>
          {moneyError && <p className="text-sm text-destructive">{moneyError}</p>}

          {/* ── Filters ────────────────────────────────────────────────── */}
          <div className="flex flex-wrap gap-3">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ProjectDisplayStatus | "all")}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="Planning">Planning</SelectItem>
                <SelectItem value="In progress">In progress</SelectItem>
                <SelectItem value="Completed">Completed</SelectItem>
              </SelectContent>
            </Select>

            <Select value={groupFilter} onValueChange={setGroupFilter} disabled={filtersLoading}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Site group" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All site groups</SelectItem>
                {siteGroups.map((g) => (
                  <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={siteFilter} onValueChange={setSiteFilter} disabled={filtersLoading}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="Site" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sites</SelectItem>
                {sites.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {filtersError && <p className="text-sm text-destructive">{filtersError}</p>}

          {/* ── List ───────────────────────────────────────────────────── */}
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No projects match these filters.</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {filtered.map(({ project, status }) => (
                <ProjectCard
                  key={project.id}
                  project={project}
                  status={status}
                  money={moneyTotals[project.id]}
                  onOpen={() => navigate(projectPath(project.id))}
                />
              ))}
            </div>
          )}
        </>
      )}

      <CreateProjectDialog
        open={creating}
        sites={sites}
        onClose={() => setCreating(false)}
        onSave={async (values) => {
          const { project: created, sitesError } = await createProject(values);
          if (sitesError) {
            setCreateWarning(sitesError);
            navigate(projectPath(created.id));
          } else {
            navigate(projectPath(created.id));
          }
        }}
      />
    </div>
  );
}

function Tile({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-2xl font-heading font-bold ${mono ? "font-mono" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function ProjectCard({ project, status, money, onOpen }: { project: BusinessProject; status: ProjectDisplayStatus; money: ProjectMoneyTotal | undefined; onOpen: () => void }) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="cursor-pointer transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <CardContent className="p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-heading text-lg font-semibold leading-tight">{project.title}</h3>
          <Badge className={PROJECT_STATUS_CHIP[status]}>{status}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {project.siteNames.length > 0 ? project.siteNames.join(", ") : "No sites"}
        </p>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Start</dt>
          <dd>{project.target_start ? formatDate(project.target_start) : "Not set"}</dd>
          <dt className="text-muted-foreground">Finish</dt>
          <dd>{project.target_end ? formatDate(project.target_end) : "Not set"}</dd>
          <dt className="text-muted-foreground">Budget</dt>
          <dd className="font-mono">{project.budget != null ? formatGBP(project.budget) : "Not set"}</dd>
          <dt className="text-muted-foreground">Agreed</dt>
          <dd className="font-mono">{formatGBP(money?.agreed ?? 0)}</dd>
          <dt className="text-muted-foreground">Paid</dt>
          <dd className="font-mono">{formatGBP(money?.paid ?? 0)}</dd>
        </dl>
      </CardContent>
    </Card>
  );
}
