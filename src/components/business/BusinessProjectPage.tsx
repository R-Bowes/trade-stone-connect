import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2 } from "lucide-react";
import { ErrorState, LoadingState } from "@/components/AsyncState";
import { useCompanyProjects } from "@/hooks/useCompanyProjects";
import { useProjectDetail } from "@/hooks/useProjectDetail";
import { projectDisplayStatus, PROJECT_STATUS_CHIP } from "@/lib/projectStatus";
import { formatGBP } from "@/lib/formatGBP";
import { formatDate } from "@/lib/formatDate";
import { CreateProjectDialog } from "@/components/projects/CreateProjectDialog";
import { BudgetBand } from "@/components/projects/BudgetBand";
import { PackagesSection } from "@/components/projects/PackagesSection";
import { ProjectTimeline } from "@/components/projects/ProjectTimeline";
import { SnagListCard } from "@/components/projects/SnagListCard";
import { NeedsYouCard } from "@/components/projects/NeedsYouCard";
import { SignOffCard } from "@/components/projects/SignOffCard";
import { signOffBlockers } from "@/lib/projectSignOff";
import { WhoCanSeeCard } from "@/components/business/WhoCanSeeCard";
import { messageOf } from "@/components/projects/projectErrors";

const LIST_PATH = "/dashboard/business?view=projects";
/** Find-a-contractor for a business package goes to Requests — raising an enquiry/quote request to a panel contractor is the closest business equivalent of the homeowner "hire" flow. */
const FIND_CONTRACTOR_PATH = "/dashboard/business?view=requests";
const INVOICES_PATH = "/dashboard/business?view=invoices";

interface AvailableSite {
  id: string;
  name: string;
}

/**
 * One business project: header, edit/delete, budget, packages, timeline,
 * and the right column (sites, needs you, snags, sign-off, who can see
 * this). Mirrors ProjectPage.tsx's shape but reads via useProjectDetail in
 * 'business' mode, and adds the Sites and "Who can see this" cards the
 * homeowner page has no equivalent of.
 */
export function BusinessProjectPage({ companyId, projectId }: { companyId: string; projectId: string }) {
  const navigate = useNavigate();
  const { projects, loading: listLoading, error: listError, refetch: refetchList, updateProject, deleteProject } =
    useCompanyProjects(companyId);
  const detail = useProjectDetail(projectId, { viewer: "business", companyId });

  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [availableSites, setAvailableSites] = useState<AvailableSite[]>([]);
  const [sitesLoading, setSitesLoading] = useState(true);
  const [sitesError, setSitesError] = useState<string | null>(null);
  const [addingSiteId, setAddingSiteId] = useState<string>("");
  const [siteActionError, setSiteActionError] = useState<string | null>(null);
  const [siteActionBusy, setSiteActionBusy] = useState(false);
  const [removingSite, setRemovingSite] = useState<AvailableSite | null>(null);

  const loadAvailableSites = useCallback(async () => {
    setSitesLoading(true);
    setSitesError(null);
    try {
      const { data, error } = await supabase.from("sites").select("id, name").eq("company_id", companyId).order("name");
      if (error) throw error;
      setAvailableSites(data ?? []);
    } catch (err) {
      setSitesError(messageOf(err));
    } finally {
      setSitesLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void loadAvailableSites();
  }, [loadAvailableSites]);

  if (listLoading || detail.loading) return <LoadingState message="Loading project..." />;
  if (listError) return <ErrorState message={listError} onRetry={() => void refetchList()} />;
  if (detail.error) return <ErrorState message={detail.error} onRetry={() => void detail.refetch()} />;

  const summary = projects.find((p) => p.id === projectId);
  const project = detail.project;

  const backLink = (
    <Button variant="link" className="px-0 text-muted-foreground" onClick={() => navigate(LIST_PATH)}>
      <i className="ti ti-arrow-left mr-1" aria-hidden="true" />
      All projects
    </Button>
  );

  if (!project) {
    return (
      <div className="space-y-4 p-6">
        {backLink}
        <ErrorState message="This project could not be found. It may have been deleted, or you may not have access to it." />
      </div>
    );
  }

  const status = projectDisplayStatus(project.status, detail.attachedJobCount);
  const readOnly = project.status === "completed";
  const blockers = signOffBlockers(project.status, detail.packages, detail.jobs, detail.snags);
  const stillToPay = detail.packages
    .filter((p) => !!p.job_id)
    .reduce((sum, p) => sum + (detail.money[p.id]?.still_to_pay ?? 0), 0);

  const linkedSiteIds = new Set(detail.projectSites.map((s) => s.id));
  const unlinkedSites = availableSites.filter((s) => !linkedSiteIds.has(s.id));
  const packagesPinnedToSite = (siteId: string) => detail.packages.filter((p) => p.site_id === siteId);

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteProject(project.id);
      setConfirmingDelete(false);
      navigate(LIST_PATH);
    } catch (err) {
      setDeleteError(messageOf(err));
    } finally {
      setDeleting(false);
    }
  };

  const handleAddSite = async () => {
    if (!addingSiteId) return;
    setSiteActionBusy(true);
    setSiteActionError(null);
    try {
      await detail.addSite(addingSiteId);
      setAddingSiteId("");
    } catch (err) {
      setSiteActionError(messageOf(err));
    } finally {
      setSiteActionBusy(false);
    }
  };

  const handleRemoveSite = async () => {
    if (!removingSite) return;
    setSiteActionBusy(true);
    setSiteActionError(null);
    try {
      await detail.removeSite(removingSite.id);
      setRemovingSite(null);
    } catch (err) {
      // Shown inline on the card, not in the confirm dialog — the dialog
      // closes either way so the message is visible against the list.
      setRemovingSite(null);
      setSiteActionError(messageOf(err));
    } finally {
      setSiteActionBusy(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      {backLink}

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-heading text-2xl font-bold">{project.title}</h2>
            <Badge className={PROJECT_STATUS_CHIP[status]}>{status}</Badge>
          </div>
          {project.description && <p className="text-muted-foreground max-w-2xl">{project.description}</p>}
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span>
              <span className="text-muted-foreground">Sites: </span>
              {detail.projectSites.length > 0 ? detail.projectSites.map((s) => s.name).join(", ") : "None"}
            </span>
            <span>
              <span className="text-muted-foreground">Start: </span>
              {project.target_start ? formatDate(project.target_start) : "Not set"}
            </span>
            <span>
              <span className="text-muted-foreground">Finish: </span>
              {project.target_end ? formatDate(project.target_end) : "Not set"}
            </span>
            <span>
              <span className="text-muted-foreground">Budget: </span>
              <span className="font-mono">{project.budget != null ? formatGBP(project.budget) : "Not set"}</span>
            </span>
          </div>
        </div>
        {!readOnly && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setEditing(true)}>
              <i className="ti ti-pencil mr-2" aria-hidden="true" />
              Edit
            </Button>
            <Button
              variant="outline"
              className="text-destructive hover:text-destructive"
              onClick={() => { setDeleteError(null); setConfirmingDelete(true); }}
            >
              <i className="ti ti-trash mr-2" aria-hidden="true" />
              Delete
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <BudgetBand
            budget={project.budget}
            packages={detail.packages}
            money={detail.money}
            onEditProject={() => setEditing(true)}
            readOnly={readOnly}
            viewer="business"
          />

          <PackagesSection
            packages={detail.packages}
            jobs={detail.jobs}
            money={detail.money}
            contractors={detail.contractors}
            addPackage={detail.addPackage}
            updatePackage={detail.updatePackage}
            deletePackage={detail.deletePackage}
            attachJob={detail.attachJob}
            detachJob={detail.detachJob}
            loadAttachableJobs={detail.loadAttachableJobs}
            readOnly={readOnly}
            viewer="business"
            findContractorPath={FIND_CONTRACTOR_PATH}
            siteNames={detail.siteNames}
            projectSites={detail.projectSites}
          />

          <ProjectTimeline
            targetStart={project.target_start}
            targetEnd={project.target_end}
            packages={detail.packages}
            jobs={detail.jobs}
            contractors={detail.contractors}
          />
        </div>

        <div className="min-w-0 space-y-6">
          {/* ── Sites ──────────────────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="font-heading text-lg">Sites</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {detail.projectSites.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sites linked yet.</p>
              ) : (
                <ul className="divide-y rounded-md border text-sm">
                  {detail.projectSites.map((site) => {
                    const pinned = packagesPinnedToSite(site.id);
                    return (
                      <li key={site.id} className="flex items-center justify-between gap-3 p-2.5">
                        <span>{site.name}</span>
                        {!readOnly && (
                          pinned.length > 0 ? (
                            <span className="text-xs text-muted-foreground">
                              {pinned.map((p) => p.title).join(", ")}{" "}
                              {pinned.length === 1 ? "is" : "are"} pinned to this site. Move or clear{" "}
                              {pinned.length === 1 ? "its" : "their"} site first.
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive hover:text-destructive"
                              onClick={() => { setSiteActionError(null); setRemovingSite(site); }}
                            >
                              Remove
                            </Button>
                          )
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              {!readOnly && (
                <div className="flex gap-2">
                  <Select value={addingSiteId} onValueChange={setAddingSiteId} disabled={sitesLoading || unlinkedSites.length === 0}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder={unlinkedSites.length === 0 ? "No more sites to add" : "Choose a site"} />
                    </SelectTrigger>
                    <SelectContent>
                      {unlinkedSites.map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" disabled={!addingSiteId || siteActionBusy} onClick={() => void handleAddSite()}>
                    {siteActionBusy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Add
                  </Button>
                </div>
              )}
              {sitesError && <p className="text-sm text-destructive">{sitesError}</p>}
              {siteActionError && <p className="text-sm text-destructive">{siteActionError}</p>}
            </CardContent>
          </Card>

          <NeedsYouCard
            packages={detail.packages}
            jobs={detail.jobs}
            money={detail.money}
            contractors={detail.contractors}
            snags={detail.snags}
            readyToSignOff={!readOnly && blockers.length === 0}
            invoicesPath={INVOICES_PATH}
            findContractorPath={FIND_CONTRACTOR_PATH}
          />

          <SnagListCard
            snags={detail.snags}
            packages={detail.packages}
            readOnly={readOnly}
            addSnag={detail.addSnag}
            resolveSnag={detail.resolveSnag}
          />

          <SignOffCard
            projectStatus={project.status}
            signOffs={detail.signOffs}
            blockers={blockers}
            stillToPay={stillToPay}
            onSignOff={detail.signOff}
          />

          <WhoCanSeeCard companyId={companyId} projectSites={detail.projectSites} />
        </div>
      </div>

      <CreateProjectDialog
        open={editing}
        project={summary}
        onClose={() => setEditing(false)}
        onSave={async (values) => {
          await updateProject(project.id, values);
          await detail.refetch();
        }}
      />

      <AlertDialog open={confirmingDelete} onOpenChange={(v) => !deleting && setConfirmingDelete(v)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this project?</AlertDialogTitle>
            <AlertDialogDescription>
              "{project.title}" will be removed. Your jobs, quotes and invoices are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void handleDelete();
              }}
            >
              {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!removingSite} onOpenChange={(v) => !siteActionBusy && !v && setRemovingSite(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this site from the project?</AlertDialogTitle>
            <AlertDialogDescription>
              "{removingSite?.name}" will no longer be linked to this project.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={siteActionBusy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={siteActionBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void handleRemoveSite();
              }}
            >
              {siteActionBusy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Remove site
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
