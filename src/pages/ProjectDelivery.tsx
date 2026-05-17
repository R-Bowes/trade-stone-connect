import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import { ArrowLeft, ExternalLink, FileText, Loader2, Paperclip, Plus, X } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type PhaseJson = {
  title: string;
  description: string | null;
  cost: number;
  duration_days: number;
  start_date: string;
};

type ProjectRow = {
  id: string;
  title: string;
  posted_by: string;
  tender_status: string;
  budget: number | null;
  budget_revised: number | null;
};

type ProposalRow = {
  id: string;
  contractor_id: string;
  total_cost: number | null;
  phases: PhaseJson[] | null;
  timeline_start: string | null;
  timeline_end: string | null;
};

type ProjectJobRow = {
  id: string;
  job_id: string;
  phase_order: number | null;
  phase_title: string | null;
  job: {
    id: string;
    title: string;
    status: string;
    start_date: string | null;
    end_date: string | null;
    contract_value: number | null;
  } | null;
};

type UpdateRow = {
  id: string;
  content: string | null;
  media_url: string | null;
  update_type: string;
  created_at: string;
  posted_by: string;
  poster: { full_name: string | null; company_name: string | null } | null;
};

type ChangeRequestRow = {
  id: string;
  description: string;
  cost_impact: number | null;
  timeline_impact_days: number | null;
  status: string;
  submitted_by: string;
  created_at: string;
  client_response: string | null;
  responded_at: string | null;
  informal_acknowledged: boolean | null;
  submitter: { full_name: string | null; company_name: string | null } | null;
};

type ContractRow = {
  id: string;
  version: number;
  document_url: string | null;
  signed_by_client: boolean;
  signed_by_contractor: boolean;
  created_at: string;
};

type AttachmentRow = {
  id: string;
  file_name: string;
  file_url: string;
};

type MyProfile = {
  id: string;
  full_name: string | null;
  company_name: string | null;
};

type Tab = "overview" | "updates" | "changes" | "documents";

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatGBP(n: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function partyName(p: { full_name: string | null; company_name: string | null } | null) {
  if (!p) return "TradeStone member";
  return p.company_name || p.full_name || "TradeStone member";
}

const JOB_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  in_progress: "In Progress",
  snagging: "Snagging",
  complete: "Complete",
};

const JOB_STYLES: Record<string, string> = {
  scheduled: "bg-muted text-muted-foreground border-border",
  in_progress: "bg-blue-50 text-blue-700 border-blue-200",
  snagging: "bg-amber-50 text-amber-700 border-amber-200",
  complete: "bg-green-50 text-green-700 border-green-200",
};

const CR_STYLES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-green-50 text-green-700 border-green-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
};

const UPD_STYLES: Record<string, string> = {
  Progress: "bg-blue-50 text-blue-700 border-blue-200",
  "Site Note": "bg-muted text-muted-foreground border-border",
  Photo: "bg-purple-50 text-purple-700 border-purple-200",
  Document: "bg-orange-50 text-orange-700 border-orange-200",
};

const UPDATE_TYPES = ["Progress", "Site Note", "Photo", "Document"];

// ── Small components ───────────────────────────────────────────────────────────

function Badge({ label, style }: { label: string; style: string }) {
  return (
    <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium border ${style}`}>
      {label}
    </span>
  );
}

function TenderStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; style: string }> = {
    awarded: { label: "Awarded", style: "bg-green-50 text-green-700 border-green-200" },
    in_delivery: { label: "In Delivery", style: "bg-blue-50 text-blue-700 border-blue-200" },
  };
  const e = map[status] ?? { label: status, style: "bg-muted text-muted-foreground border-border" };
  return <Badge label={e.label} style={e.style} />;
}

// ── Page ───────────────────────────────────────────────────────────────────────

const ProjectDelivery = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [project, setProject] = useState<ProjectRow | null>(null);
  const [proposal, setProposal] = useState<ProposalRow | null>(null);
  const [projectJobs, setProjectJobs] = useState<ProjectJobRow[]>([]);
  const [updates, setUpdates] = useState<UpdateRow[]>([]);
  const [changeRequests, setChangeRequests] = useState<ChangeRequestRow[]>([]);
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [attachments, setAttachments] = useState<AttachmentRow[]>([]);
  const [myProfile, setMyProfile] = useState<MyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");

  const [isClient, setIsClient] = useState(false);
  const [isContractor, setIsContractor] = useState(false);

  // Update form
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [updateType, setUpdateType] = useState("Progress");
  const [updateContent, setUpdateContent] = useState("");
  const [updateFile, setUpdateFile] = useState<File | null>(null);
  const [submittingUpdate, setSubmittingUpdate] = useState(false);

  // Change request form
  const [showCRForm, setShowCRForm] = useState(false);
  const [crDescription, setCRDescription] = useState("");
  const [crCostImpact, setCRCostImpact] = useState("");
  const [crTimelineImpact, setCRTimelineImpact] = useState("");
  const [crInformalAck, setCRInformalAck] = useState(false);
  const [submittingCR, setSubmittingCR] = useState(false);

  // Client CR actions
  const [actioningCR, setActioningCR] = useState<string | null>(null);
  const [rejectCRId, setRejectCRId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // Practical completion
  const [showPCDialog, setShowPCDialog] = useState(false);
  const [submittingPC, setSubmittingPC] = useState(false);

  useEffect(() => {
    if (id) fetchAll(id);
  }, [id]);

  async function fetchAll(projectId: string) {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate("/auth"); return; }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, full_name, company_name")
      .eq("user_id", user.id)
      .single();
    const prof = profile as MyProfile | null;
    setMyProfile(prof);

    const { data: proj, error: projError } = await supabase
      .from("projects")
      .select("id, title, posted_by, tender_status, budget, budget_revised")
      .eq("id", projectId)
      .single();

    if (projError || !proj) { setLoading(false); return; }
    const projRow = proj as ProjectRow;
    setProject(projRow);

    const { data: prop } = await supabase
      .from("project_proposals")
      .select("id, contractor_id, total_cost, phases, timeline_start, timeline_end")
      .eq("project_id", projectId)
      .eq("status", "accepted")
      .maybeSingle();
    const propRow = prop as ProposalRow | null;
    setProposal(propRow);

    // Access control
    const pid = prof?.id;
    const clientFlag = Boolean(pid && pid === projRow.posted_by);
    const contractorFlag = Boolean(pid && propRow && pid === propRow.contractor_id);
    setIsClient(clientFlag);
    setIsContractor(contractorFlag);

    if (!clientFlag && !contractorFlag) {
      navigate(`/projects/${projectId}`);
      return;
    }

    const [pjRes, updRes, crRes, contractRes] = await Promise.all([
      supabase
        .from("project_jobs")
        .select("id, job_id, phase_order, phase_title, job:jobs!job_id(id, title, status, start_date, end_date, contract_value)")
        .eq("project_id", projectId)
        .order("phase_order", { ascending: true }),
      supabase
        .from("project_updates")
        .select("id, content, media_url, update_type, created_at, posted_by, poster:profiles!posted_by(full_name, company_name)")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false }),
      supabase
        .from("project_change_requests")
        .select("id, description, cost_impact, timeline_impact_days, status, submitted_by, created_at, client_response, responded_at, informal_acknowledged, submitter:profiles!submitted_by(full_name, company_name)")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false }),
      supabase
        .from("project_contracts")
        .select("id, version, document_url, signed_by_client, signed_by_contractor, created_at")
        .eq("project_id", projectId)
        .order("version", { ascending: false }),
    ]);

    setProjectJobs((pjRes.data ?? []) as unknown as ProjectJobRow[]);
    setUpdates((updRes.data ?? []) as unknown as UpdateRow[]);
    setChangeRequests((crRes.data ?? []) as unknown as ChangeRequestRow[]);
    setContracts((contractRes.data ?? []) as unknown as ContractRow[]);

    // Fetch snags (not rendered yet)
    await supabase
      .from("project_snags")
      .select("id, description, status, created_at")
      .eq("project_id", projectId);

    if (propRow) {
      const { data: atts } = await supabase
        .from("proposal_attachments")
        .select("id, file_name, file_url")
        .eq("proposal_id", propRow.id);
      setAttachments((atts ?? []) as unknown as AttachmentRow[]);
    }

    setLoading(false);
  }

  async function refreshUpdates() {
    if (!id) return;
    const { data } = await supabase
      .from("project_updates")
      .select("id, content, media_url, update_type, created_at, posted_by, poster:profiles!posted_by(full_name, company_name)")
      .eq("project_id", id)
      .order("created_at", { ascending: false });
    setUpdates((data ?? []) as unknown as UpdateRow[]);
  }

  async function refreshChangeRequests() {
    if (!id) return;
    const { data } = await supabase
      .from("project_change_requests")
      .select("id, description, cost_impact, timeline_impact_days, status, submitted_by, created_at, client_response, responded_at, informal_acknowledged, submitter:profiles!submitted_by(full_name, company_name)")
      .eq("project_id", id)
      .order("created_at", { ascending: false });
    setChangeRequests((data ?? []) as unknown as ChangeRequestRow[]);
  }

  // ── Submit update ─────────────────────────────────────────────────────────────

  async function submitUpdate() {
    if (!id || !myProfile || !updateContent.trim()) return;
    setSubmittingUpdate(true);
    try {
      let mediaUrl: string | null = null;

      if (updateFile && (updateType === "Photo" || updateType === "Document")) {
        const ext = updateFile.name.split(".").pop() ?? "bin";
        const filePath = `${id}/${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("project-updates")
          .upload(filePath, updateFile, { contentType: updateFile.type, upsert: false });
        if (uploadErr) throw uploadErr;
        const { data: urlData } = supabase.storage.from("project-updates").getPublicUrl(filePath);
        mediaUrl = urlData.publicUrl;
      }

      const { error } = await supabase.from("project_updates").insert({
        project_id: id,
        posted_by: myProfile.id,
        update_type: updateType,
        content: updateContent.trim(),
        media_url: mediaUrl,
      });
      if (error) throw error;

      setUpdateType("Progress");
      setUpdateContent("");
      setUpdateFile(null);
      setShowUpdateForm(false);
      await refreshUpdates();
      toast({ title: "Update posted" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to post update";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setSubmittingUpdate(false);
    }
  }

  // ── Submit change request ─────────────────────────────────────────────────────

  async function submitChangeRequest() {
    if (!id || !myProfile || !crDescription.trim()) return;
    setSubmittingCR(true);
    try {
      const { error } = await supabase.from("project_change_requests").insert({
        project_id: id,
        submitted_by: myProfile.id,
        description: crDescription.trim(),
        cost_impact: crCostImpact ? parseFloat(crCostImpact) : null,
        timeline_impact_days: crTimelineImpact ? parseInt(crTimelineImpact, 10) : null,
        informal_acknowledged: crInformalAck,
        status: "pending",
      });
      if (error) throw error;

      setCRDescription("");
      setCRCostImpact("");
      setCRTimelineImpact("");
      setCRInformalAck(false);
      setShowCRForm(false);
      await refreshChangeRequests();
      toast({ title: "Change request submitted" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to submit change request";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setSubmittingCR(false);
    }
  }

  // ── Approve change request ────────────────────────────────────────────────────

  async function approveChangeRequest(cr: ChangeRequestRow) {
    if (!id || !proposal) return;
    setActioningCR(cr.id);
    try {
      const { error: crErr } = await supabase
        .from("project_change_requests")
        .update({ status: "approved", responded_at: new Date().toISOString() })
        .eq("id", cr.id);
      if (crErr) throw crErr;

      if (cr.cost_impact) {
        const current = project?.budget_revised ?? project?.budget ?? 0;
        const updated = current + cr.cost_impact;
        await supabase.from("projects").update({ budget_revised: updated }).eq("id", id);
        setProject(prev => prev ? { ...prev, budget_revised: updated } : prev);
      }

      if (cr.timeline_impact_days) {
        for (const pj of projectJobs) {
          if (!pj.job || pj.job.status === "complete") continue;
          const base = pj.job.end_date ?? pj.job.start_date;
          if (!base) continue;
          const d = new Date(base + "T00:00:00");
          d.setDate(d.getDate() + (cr.timeline_impact_days ?? 0));
          await supabase
            .from("jobs")
            .update({ end_date: d.toISOString().slice(0, 10) })
            .eq("id", pj.job_id);
        }
      }

      const { error: contractErr } = await supabase.functions.invoke("generate-project-contract", {
        body: { proposal_id: proposal.id, project_id: id, triggered_by: "change_request" },
      });

      await refreshChangeRequests();

      const { data: contractRes } = await supabase
        .from("project_contracts")
        .select("id, version, document_url, signed_by_client, signed_by_contractor, created_at")
        .eq("project_id", id)
        .order("version", { ascending: false });
      setContracts((contractRes ?? []) as unknown as ContractRow[]);

      if (contractErr) {
        toast({
          title: "Change request approved",
          description: "Contract generation failed — please contact support.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Change request approved", description: "A revised contract has been generated." });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to approve change request";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setActioningCR(null);
    }
  }

  // ── Reject change request ─────────────────────────────────────────────────────

  async function rejectChangeRequest(crId: string) {
    if (!rejectReason.trim()) return;
    setActioningCR(crId);
    try {
      const { error } = await supabase
        .from("project_change_requests")
        .update({
          status: "rejected",
          client_response: rejectReason.trim(),
          responded_at: new Date().toISOString(),
        })
        .eq("id", crId);
      if (error) throw error;

      setRejectCRId(null);
      setRejectReason("");
      await refreshChangeRequests();
      toast({ title: "Change request rejected" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to reject change request";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setActioningCR(null);
    }
  }

  // ── Practical completion ──────────────────────────────────────────────────────

  async function confirmPracticalCompletion() {
    if (!id || !myProfile) return;
    setSubmittingPC(true);
    try {
      const { error: soErr } = await supabase.from("project_sign_offs").insert({
        project_id: id,
        signed_off_by: myProfile.id,
        stage: "practical_completion",
      });
      if (soErr) throw soErr;

      const { error: projErr } = await supabase
        .from("projects")
        .update({ tender_status: "in_delivery" })
        .eq("id", id);
      if (projErr) throw projErr;

      setProject(prev => prev ? { ...prev, tender_status: "in_delivery" } : prev);
      setShowPCDialog(false);
      toast({
        title: "Practical completion recorded",
        description: "The snag list phase will begin shortly.",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to record practical completion";
      toast({ title: "Error", description: msg, variant: "destructive" });
    } finally {
      setSubmittingPC(false);
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────────

  const jobs = projectJobs.map(pj => pj.job).filter(Boolean);
  const totalJobs = jobs.length;
  const completeCount = jobs.filter(j => j?.status === "complete").length;
  const progressPct = totalJobs > 0 ? Math.round((completeCount / totalJobs) * 100) : 0;
  const allComplete = totalJobs > 0 && completeCount === totalJobs;

  const approvedVariations = changeRequests
    .filter(cr => cr.status === "approved" && cr.cost_impact != null)
    .reduce((sum, cr) => sum + (cr.cost_impact ?? 0), 0);

  const pendingCRCount = changeRequests.filter(cr => cr.status === "pending").length;
  const mediaUpdates = updates.filter(u => u.update_type === "Photo" || u.update_type === "Document");

  // ── Loading ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="py-10 px-4">
          <div className="container mx-auto max-w-5xl">
            <div className="h-4 bg-muted rounded w-36 mb-8 animate-pulse" />
            <div className="h-8 bg-muted rounded w-1/2 mb-4 animate-pulse" />
            <div className="h-10 bg-muted rounded w-full mb-6 animate-pulse" />
            {[1, 2, 3].map(i => <div key={i} className="h-28 bg-muted rounded mb-4 animate-pulse" />)}
          </div>
        </main>
      </div>
    );
  }

  if (!project || !proposal) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="py-16 px-4">
          <div className="container mx-auto max-w-5xl text-center py-24">
            <h2 className="text-2xl font-bold mb-3">Project not found</h2>
            <p className="text-muted-foreground mb-6">
              This project may not exist or you don't have permission to view it.
            </p>
            <Button variant="outline" onClick={() => navigate("/projects")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Projects
            </Button>
          </div>
        </main>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const TAB_LABELS: Record<Tab, string> = {
    overview: "Overview",
    updates: "Updates",
    changes: "Change Requests",
    documents: "Documents",
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="py-8 px-4">
        <div className="container mx-auto max-w-5xl">

          {/* Page header */}
          <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
            <div>
              <button
                onClick={() => navigate(`/projects/${id}`)}
                className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to tender
              </button>
              <div className="flex items-center gap-3 flex-wrap mb-1">
                <h1 className="text-2xl font-bold">{project.title}</h1>
                <TenderStatusBadge status={project.tender_status} />
              </div>
              {proposal.total_cost != null && (
                <p className="text-sm text-muted-foreground">
                  Contract value:{" "}
                  <span className="font-semibold text-foreground">
                    {formatGBP(proposal.total_cost)}
                  </span>
                  {project.budget_revised != null &&
                    project.budget_revised !== proposal.total_cost && (
                      <span className="ml-2 font-medium text-amber-600">
                        Revised: {formatGBP(project.budget_revised)}
                      </span>
                    )}
                </p>
              )}
            </div>

            {isClient && allComplete && project.tender_status !== "in_delivery" && (
              <Button
                className="bg-green-600 hover:bg-green-500 text-white"
                onClick={() => setShowPCDialog(true)}
              >
                Mark Practical Completion
              </Button>
            )}
          </div>

          {/* Tabs */}
          <div className="flex border-b mb-6">
            {(["overview", "updates", "changes", "documents"] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  tab === t
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {TAB_LABELS[t]}
                {t === "changes" && pendingCRCount > 0 && (
                  <span className="ml-2 bg-amber-100 text-amber-700 text-xs rounded-full px-1.5 py-0.5 font-semibold">
                    {pendingCRCount}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* ── Overview ── */}
          {tab === "overview" && (
            <div className="flex flex-col gap-6">

              <Card className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">
                  Progress
                </p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {(["scheduled", "in_progress", "snagging", "complete"] as const).map(s => (
                    <div
                      key={s}
                      className={`text-xs px-3 py-1.5 rounded-full font-medium border ${JOB_STYLES[s]}`}
                    >
                      {JOB_LABELS[s]}: {jobs.filter(j => j?.status === s).length}
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 bg-muted rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-green-500 h-full rounded-full transition-all"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold shrink-0">{progressPct}% complete</span>
                </div>
              </Card>

              <Card className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">
                  Phases
                </p>
                {projectJobs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No phases found.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {projectJobs.map((pj, i) => (
                      <div
                        key={pj.id}
                        className="flex items-center justify-between gap-4 border rounded-md px-4 py-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xs font-semibold text-muted-foreground shrink-0 w-5">
                            {pj.phase_order ?? i + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {pj.phase_title ?? pj.job?.title ?? "—"}
                            </p>
                            {pj.job?.start_date && (
                              <p className="text-xs text-muted-foreground">
                                Starts{" "}
                                {new Date(pj.job.start_date + "T00:00:00").toLocaleDateString(
                                  "en-GB",
                                  { day: "numeric", month: "short", year: "numeric" },
                                )}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {pj.job?.contract_value != null && (
                            <span className="text-sm font-medium text-orange-600">
                              {formatGBP(pj.job.contract_value)}
                            </span>
                          )}
                          {pj.job && (
                            <Badge
                              label={JOB_LABELS[pj.job.status] ?? pj.job.status}
                              style={JOB_STYLES[pj.job.status] ?? "bg-muted text-muted-foreground border-border"}
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              <Card className="p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-4">
                  Budget
                </p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Original contract</p>
                    <p className="text-lg font-bold">
                      {proposal.total_cost != null ? formatGBP(proposal.total_cost) : "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Approved variations</p>
                    <p className={`text-lg font-bold ${approvedVariations > 0 ? "text-amber-600" : ""}`}>
                      {approvedVariations > 0 ? `+${formatGBP(approvedVariations)}` : formatGBP(0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Current total</p>
                    <p className="text-lg font-bold">
                      {project.budget_revised != null
                        ? formatGBP(project.budget_revised)
                        : proposal.total_cost != null
                        ? formatGBP(proposal.total_cost)
                        : "—"}
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* ── Updates ── */}
          {tab === "updates" && (
            <div className="flex flex-col gap-4">
              {isContractor && !showUpdateForm && (
                <Button
                  className="bg-orange-500 text-white hover:bg-orange-400 self-start"
                  onClick={() => setShowUpdateForm(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Post Update
                </Button>
              )}

              {isContractor && showUpdateForm && (
                <Card className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-base">Post an Update</h3>
                    <button
                      onClick={() => {
                        setShowUpdateForm(false);
                        setUpdateType("Progress");
                        setUpdateContent("");
                        setUpdateFile(null);
                      }}
                      className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="flex flex-col gap-4">
                    <div>
                      <label className="text-sm font-medium block mb-1.5">Update type</label>
                      <div className="flex flex-wrap gap-2">
                        {UPDATE_TYPES.map(t => (
                          <button
                            key={t}
                            onClick={() => setUpdateType(t)}
                            className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
                              updateType === t
                                ? "bg-foreground text-background border-foreground"
                                : "border-border text-muted-foreground hover:border-foreground hover:text-foreground"
                            }`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-sm font-medium block mb-1.5">Content</label>
                      <Textarea
                        value={updateContent}
                        onChange={e => setUpdateContent(e.target.value)}
                        placeholder="Describe the update..."
                        rows={3}
                      />
                    </div>

                    {(updateType === "Photo" || updateType === "Document") && (
                      <div>
                        <label className="text-sm font-medium block mb-1.5">
                          {updateType} file (optional)
                        </label>
                        <input
                          key={showUpdateForm ? "open" : "closed"}
                          type="file"
                          accept={updateType === "Photo" ? "image/*" : "*"}
                          onChange={e => setUpdateFile(e.target.files?.[0] ?? null)}
                          className="text-sm text-muted-foreground"
                        />
                      </div>
                    )}

                    <div className="flex gap-3">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowUpdateForm(false);
                          setUpdateType("Progress");
                          setUpdateContent("");
                          setUpdateFile(null);
                        }}
                        disabled={submittingUpdate}
                      >
                        Cancel
                      </Button>
                      <Button
                        className="bg-orange-500 text-white hover:bg-orange-400"
                        onClick={submitUpdate}
                        disabled={submittingUpdate || !updateContent.trim()}
                      >
                        {submittingUpdate && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        Post Update
                      </Button>
                    </div>
                  </div>
                </Card>
              )}

              {updates.length === 0 ? (
                <div className="text-center py-16">
                  <p className="text-muted-foreground text-sm">No updates posted yet.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {updates.map(u => (
                    <Card key={u.id} className="p-4">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className="text-sm font-medium">{partyName(u.poster)}</span>
                        <Badge
                          label={u.update_type}
                          style={UPD_STYLES[u.update_type] ?? "bg-muted text-muted-foreground border-border"}
                        />
                        <span className="text-xs text-muted-foreground ml-auto">
                          {formatDateTime(u.created_at)}
                        </span>
                      </div>
                      {u.content && (
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap mb-2">
                          {u.content}
                        </p>
                      )}
                      {u.media_url && (
                        <a
                          href={u.media_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm text-orange-600 hover:underline"
                        >
                          <Paperclip className="h-3.5 w-3.5" />
                          View {u.update_type === "Photo" ? "photo" : "document"}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Change Requests ── */}
          {tab === "changes" && (
            <div className="flex flex-col gap-4">

              {isContractor && !showCRForm && (
                <Button
                  className="bg-orange-500 text-white hover:bg-orange-400 self-start"
                  onClick={() => setShowCRForm(true)}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Submit Change Request
                </Button>
              )}

              {isContractor && showCRForm && (
                <Card className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-base">Submit Change Request</h3>
                    <button
                      onClick={() => {
                        setShowCRForm(false);
                        setCRDescription("");
                        setCRCostImpact("");
                        setCRTimelineImpact("");
                        setCRInformalAck(false);
                      }}
                      className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="flex flex-col gap-4">
                    <div>
                      <label className="text-sm font-medium block mb-1.5">
                        Description <span className="text-red-500">*</span>
                      </label>
                      <Textarea
                        value={crDescription}
                        onChange={e => setCRDescription(e.target.value)}
                        placeholder="Describe the change required and the reason..."
                        rows={3}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium block mb-1.5">
                          Cost impact (GBP, optional)
                        </label>
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={crCostImpact}
                          onChange={e => setCRCostImpact(e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium block mb-1.5">
                          Timeline impact (days, optional)
                        </label>
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          value={crTimelineImpact}
                          onChange={e => setCRTimelineImpact(e.target.value)}
                          placeholder="0"
                        />
                      </div>
                    </div>

                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={crInformalAck}
                        onChange={e => setCRInformalAck(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span className="text-sm text-muted-foreground">
                        I have discussed this informally with the client
                      </span>
                    </label>

                    <div className="flex gap-3">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowCRForm(false);
                          setCRDescription("");
                          setCRCostImpact("");
                          setCRTimelineImpact("");
                          setCRInformalAck(false);
                        }}
                        disabled={submittingCR}
                      >
                        Cancel
                      </Button>
                      <Button
                        className="bg-orange-500 text-white hover:bg-orange-400"
                        onClick={submitChangeRequest}
                        disabled={submittingCR || !crDescription.trim()}
                      >
                        {submittingCR && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        Submit
                      </Button>
                    </div>
                  </div>
                </Card>
              )}

              {changeRequests.length === 0 ? (
                <div className="text-center py-16">
                  <p className="text-muted-foreground text-sm">No change requests yet.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {changeRequests.map(cr => (
                    <Card key={cr.id} className="p-4">
                      <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            label={cr.status.charAt(0).toUpperCase() + cr.status.slice(1)}
                            style={CR_STYLES[cr.status] ?? "bg-muted text-muted-foreground border-border"}
                          />
                          <span className="text-xs text-muted-foreground">
                            {partyName(cr.submitter)} · {formatDateTime(cr.created_at)}
                          </span>
                        </div>
                        {isClient && cr.status === "pending" && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-500 text-white"
                              onClick={() => approveChangeRequest(cr)}
                              disabled={actioningCR === cr.id}
                            >
                              {actioningCR === cr.id && (
                                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                              )}
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              className="bg-red-600 hover:bg-red-500 text-white"
                              onClick={() => setRejectCRId(cr.id)}
                              disabled={actioningCR === cr.id}
                            >
                              Reject
                            </Button>
                          </div>
                        )}
                      </div>

                      <p className="text-sm mb-3">{cr.description}</p>

                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                        {cr.cost_impact != null && (
                          <div>
                            <span className="text-xs text-muted-foreground">Cost impact</span>
                            <p className="font-medium">+{formatGBP(cr.cost_impact)}</p>
                          </div>
                        )}
                        {cr.timeline_impact_days != null && (
                          <div>
                            <span className="text-xs text-muted-foreground">Timeline impact</span>
                            <p className="font-medium">
                              +{cr.timeline_impact_days} day{cr.timeline_impact_days !== 1 ? "s" : ""}
                            </p>
                          </div>
                        )}
                        {cr.informal_acknowledged && (
                          <div>
                            <span className="text-xs text-muted-foreground">Informal discussion</span>
                            <p className="font-medium">Acknowledged</p>
                          </div>
                        )}
                      </div>

                      {cr.status === "rejected" && cr.client_response && (
                        <div className="mt-3 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                          <p className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-0.5">
                            Rejection reason
                          </p>
                          <p className="text-sm text-red-800">{cr.client_response}</p>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Documents ── */}
          {tab === "documents" && (
            <div className="flex flex-col gap-6">

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                  Contracts
                </p>
                {contracts.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No contracts generated yet.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {contracts.map((c, idx) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between gap-4 border rounded-md px-4 py-3"
                      >
                        <div>
                          <p className="text-sm font-medium">
                            Contract v{c.version}
                            {idx === 0 && (
                              <span className="ml-2 text-xs text-muted-foreground">(current)</span>
                            )}
                          </p>
                          <div className="flex items-center gap-3 mt-0.5 text-xs flex-wrap">
                            <span className="text-muted-foreground">
                              {formatDateTime(c.created_at)}
                            </span>
                            <span className={c.signed_by_client ? "text-green-600 font-medium" : "text-muted-foreground"}>
                              Client: {c.signed_by_client ? "Signed" : "Unsigned"}
                            </span>
                            <span className={c.signed_by_contractor ? "text-green-600 font-medium" : "text-muted-foreground"}>
                              Contractor: {c.signed_by_contractor ? "Signed" : "Unsigned"}
                            </span>
                          </div>
                        </div>
                        {c.document_url && (
                          <a
                            href={c.document_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-sm text-orange-600 hover:underline shrink-0"
                          >
                            <FileText className="h-4 w-4" />
                            Download
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {attachments.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                    Proposal attachments
                  </p>
                  <div className="flex flex-col gap-2">
                    {attachments.map(att => (
                      <a
                        key={att.id}
                        href={att.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2.5 border rounded-md px-3 py-2.5 hover:bg-muted/50 transition-colors"
                      >
                        <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-sm flex-1 min-w-0 truncate">{att.file_name}</span>
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {mediaUpdates.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                    Site photos &amp; documents
                  </p>
                  <div className="flex flex-col gap-2">
                    {mediaUpdates.map(u => (
                      <div
                        key={u.id}
                        className="flex items-center justify-between gap-4 border rounded-md px-3 py-2.5"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Paperclip className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm truncate">
                              {u.content || `${u.update_type} — ${formatDateTime(u.created_at)}`}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {partyName(u.poster)} · {formatDateTime(u.created_at)}
                            </p>
                          </div>
                        </div>
                        {u.media_url && (
                          <a
                            href={u.media_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-sm text-orange-600 hover:underline shrink-0"
                          >
                            View
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {contracts.length === 0 && attachments.length === 0 && mediaUpdates.length === 0 && (
                <div className="text-center py-16">
                  <p className="text-muted-foreground text-sm">No documents yet.</p>
                </div>
              )}
            </div>
          )}

        </div>
      </main>

      {/* Reject CR modal */}
      {rejectCRId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="font-bold text-base">Reject change request</h3>
              <button
                onClick={() => { setRejectCRId(null); setRejectReason(""); }}
                className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-6 py-5">
              <label className="text-sm font-medium block mb-1.5">
                Reason <span className="text-red-500">*</span>
              </label>
              <Textarea
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Explain why this change is not approved..."
                rows={3}
              />
            </div>
            <div className="flex gap-3 px-6 pb-5">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => { setRejectCRId(null); setRejectReason(""); }}
                disabled={actioningCR === rejectCRId}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-500 text-white"
                disabled={!rejectReason.trim() || actioningCR === rejectCRId}
                onClick={() => rejectChangeRequest(rejectCRId)}
              >
                {actioningCR === rejectCRId && (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                )}
                Confirm rejection
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Practical completion dialog */}
      {showPCDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="font-bold text-base">Mark practical completion</h3>
              <button
                onClick={() => setShowPCDialog(false)}
                className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                disabled={submittingPC}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-6 py-5">
              <p className="text-sm text-muted-foreground">
                Mark this project as practically complete? This will begin the snag list phase.
              </p>
            </div>
            <div className="flex gap-3 px-6 pb-5">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowPCDialog(false)}
                disabled={submittingPC}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-green-600 hover:bg-green-500 text-white"
                onClick={confirmPracticalCompletion}
                disabled={submittingPC}
              >
                {submittingPC && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Confirm
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProjectDelivery;
