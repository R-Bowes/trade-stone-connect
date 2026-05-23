import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import { ContractSigning } from "@/components/projects/ContractSigning";
import {
  ArrowLeft,
  ExternalLink,
  LayoutList,
  Columns,
  Loader2,
  Paperclip,
  X,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type ScoringCriterion = { label: string; weight: number };

type PhaseJson = {
  title: string;
  description: string | null;
  cost: number;
  duration_days: number;
  start_date: string;
};

type AttachmentRow = {
  id: string;
  proposal_id: string;
  file_name: string;
  file_url: string;
};

type ProposalRow = {
  id: string;
  contractor_id: string;
  total_cost: number | null;
  timeline_start: string | null;
  timeline_end: string | null;
  materials_responsibility: string | null;
  payment_terms: string | null;
  weighted_score: number | null;
  status: string;
  phases: PhaseJson[] | null;
  submitted_at: string | null;
  rejection_reason: string | null;
  rejection_scores: { criterion: string; score: number }[] | null;
  contractor: {
    full_name: string | null;
    company_name: string | null;
    stripe_account_id: string | null;
  } | null;
  attachments: AttachmentRow[];
};

type ProjectRow = {
  id: string;
  title: string;
  posted_by: string;
  scoring_criteria: ScoringCriterion[] | null;
  tender_status: string;
  deposit_required: boolean | null;
  deposit_amount: number | null;
};

type MyProfile = {
  id: string;
  full_name: string | null;
  company_name: string | null;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatGBP(n: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(n);
}

function formatDate(iso: string) {
  return new Date(iso + "T00:00:00").toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function daysBetween(start: string, end: string): number {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  return Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24));
}

function contractorName(p: ProposalRow): string {
  if (!p.contractor) return "Unknown contractor";
  return p.contractor.company_name || p.contractor.full_name || "Unknown contractor";
}

function materialsLabel(m: string | null): string {
  if (!m) return "—";
  const map: Record<string, string> = {
    contractor: "Contractor supplied",
    client: "Client supplied",
    mixed: "Mixed",
  };
  return map[m] ?? m;
}

// ── Status badge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    submitted: "bg-blue-50 text-blue-700 border-blue-200",
    accepted: "bg-green-50 text-green-700 border-green-200",
    rejected: "bg-red-50 text-red-700 border-red-200",
  };
  return (
    <span
      className={`text-xs px-2.5 py-0.5 rounded-full font-medium border capitalize ${
        styles[status] ?? "bg-muted text-muted-foreground border-border"
      }`}
    >
      {status}
    </span>
  );
}

// ── Compare table rows config ──────────────────────────────────────────────────

const COMPARE_ROWS: { label: string; getValue: (p: ProposalRow) => string }[] = [
  {
    label: "Total cost",
    getValue: p => (p.total_cost != null ? formatGBP(p.total_cost) : "—"),
  },
  {
    label: "Timeline start",
    getValue: p => (p.timeline_start ? formatDate(p.timeline_start) : "—"),
  },
  {
    label: "Timeline end",
    getValue: p => (p.timeline_end ? formatDate(p.timeline_end) : "—"),
  },
  {
    label: "Duration",
    getValue: p =>
      p.timeline_start && p.timeline_end
        ? `${daysBetween(p.timeline_start, p.timeline_end)} days`
        : "—",
  },
  { label: "Materials", getValue: p => materialsLabel(p.materials_responsibility) },
  { label: "Payment terms", getValue: p => p.payment_terms || "—" },
  {
    label: "Weighted score",
    getValue: p =>
      p.weighted_score != null ? `${p.weighted_score.toFixed(2)} / 10` : "Not scored",
  },
];

// ── Page ───────────────────────────────────────────────────────────────────────

const ProposalReview = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [project, setProject] = useState<ProjectRow | null>(null);
  const [proposals, setProposals] = useState<ProposalRow[]>([]);
  const [myProfile, setMyProfile] = useState<MyProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const [view, setView] = useState<"list" | "compare">("list");

  // Slide-out panel
  const [panelId, setPanelId] = useState<string | null>(null);
  const [panelScores, setPanelScores] = useState<Record<string, string>>({});

  // Reject modal
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  // Loading state for DB operations
  const [actioning, setActioning] = useState(false);

  // Contract signing overlay
  const [contractSigning, setContractSigning] = useState<{
    contractId: string;
    documentUrl: string;
    proposal: ProposalRow;
  } | null>(null);

  useEffect(() => {
    if (id) fetchAll(id);
  }, [id]);

  async function fetchAll(projectId: string) {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      navigate("/auth");
      return;
    }

    // Two-step profile lookup
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, full_name, company_name")
      .eq("user_id", user.id)
      .single();
    setMyProfile(profile as MyProfile | null);

    // Fetch project
    const { data: proj, error: projError } = await supabase
      .from("projects")
      .select("id, title, posted_by, scoring_criteria, tender_status, deposit_required, deposit_amount")
      .eq("id", projectId)
      .single();

    if (projError || !proj) {
      setLoading(false);
      return;
    }
    setProject(proj as unknown as ProjectRow);

    // Access check — only the poster may view this page
    if (profile && (proj as unknown as ProjectRow).posted_by !== profile.id) {
      navigate(`/projects/${projectId}`);
      return;
    }

    await loadProposals(projectId);
    setLoading(false);
  }

  async function loadProposals(projectId: string) {
    const { data: propsData } = await supabase
      .from("project_proposals")
      .select(`*, contractor:profiles!contractor_id(full_name, company_name, stripe_account_id)`)
      .eq("project_id", projectId)
      .order("submitted_at", { ascending: true });

    const rawProposals = (propsData ?? []) as unknown as ProposalRow[];

    // Batch-fetch attachments
    const propIds = rawProposals.map(p => p.id);
    const attMap: Record<string, AttachmentRow[]> = {};

    if (propIds.length > 0) {
      const { data: atts } = await supabase
        .from("proposal_attachments")
        .select("id, proposal_id, file_name, file_url")
        .in("proposal_id", propIds);

      for (const att of atts ?? []) {
        const a = att as unknown as AttachmentRow;
        if (!attMap[a.proposal_id]) attMap[a.proposal_id] = [];
        attMap[a.proposal_id].push(a);
      }
    }

    setProposals(
      rawProposals.map(p => ({ ...p, attachments: attMap[p.id] ?? [] })),
    );
  }

  // ── Panel helpers ─────────────────────────────────────────────────────────────

  function openPanel(proposalId: string) {
    const initial: Record<string, string> = {};
    for (const c of scoringCriteria) initial[c.label] = "";
    setPanelScores(initial);
    setShowRejectModal(false);
    setRejectReason("");
    setPanelId(proposalId);
  }

  function closePanel() {
    setPanelId(null);
    setShowRejectModal(false);
    setRejectReason("");
  }

  // ── Accept ────────────────────────────────────────────────────────────────────

  async function handleAccept(proposal: ProposalRow) {
    if (!project || !id || !myProfile) return;
    setActioning(true);
    try {
      // Step 1 — Accept the proposal, reject others, award project, seed jobs

      const { error: acceptError } = await supabase
        .from("project_proposals")
        .update({ status: "accepted" })
        .eq("id", proposal.id);
      if (acceptError) throw acceptError;

      await supabase
        .from("project_proposals")
        .update({ status: "rejected", rejection_reason: "Another proposal was selected" })
        .eq("project_id", id)
        .neq("id", proposal.id)
        .eq("status", "submitted");

      await supabase
        .from("projects")
        .update({ tender_status: "awarded" })
        .eq("id", id);

      const phases = (proposal.phases as unknown as PhaseJson[]) ?? [];
      for (let i = 0; i < phases.length; i++) {
        const phase = phases[i];
        const { data: job, error: jobError } = await supabase
          .from("jobs")
          .insert({
            title: phase.title,
            contractor_id: proposal.contractor_id,
            customer_id: project.posted_by,
            status: "scheduled",
            contract_value: phase.cost,
            start_date: phase.start_date,
            description: phase.description ?? null,
            project_id: id,
          })
          .select("id")
          .single();

        if (jobError || !job) continue;

        await supabase.from("project_jobs").insert({
          project_id: id,
          job_id: job.id,
          phase_order: i + 1,
          phase_title: phase.title,
        });
      }

      // Step 2 — Generate contract document
      const { data: contractData, error: contractError } =
        await supabase.functions.invoke("generate-project-contract", {
          body: { proposal_id: proposal.id, project_id: id },
        });

      closePanel();
      await loadProposals(id);

      if (contractError || !contractData?.contract_id) {
        toast({
          title: "Proposal accepted",
          description: "Contract generation failed — please contact support.",
          variant: "destructive",
        });
        return;
      }

      // Show contract signing overlay for the client
      setContractSigning({
        contractId: contractData.contract_id as string,
        documentUrl: contractData.document_url as string,
        proposal,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An error occurred";
      toast({ title: "Failed to accept proposal", description: msg, variant: "destructive" });
    } finally {
      setActioning(false);
    }
  }

  // ── Client signed ─────────────────────────────────────────────────────────────

  async function handleClientSigned() {
    if (!id || !contractSigning || !project) return;
    setContractSigning(null);

    toast({
      title: "Contract signed",
      description: "The contractor has been notified to review and sign.",
    });

    if (project.deposit_required && project.deposit_amount) {
      try {
        const { data: depositData, error: depositError } =
          await supabase.functions.invoke("create-deposit-checkout", {
            body: {
              project_id: id,
              proposal_id: contractSigning.proposal.id,
              amount: project.deposit_amount,
              contractor_stripe_account:
                contractSigning.proposal.contractor?.stripe_account_id,
            },
          });

        if (depositError || !depositData?.checkout_url) {
          throw depositError ?? new Error("Failed to create checkout session");
        }

        window.location.href = depositData.checkout_url as string;
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : "Failed to start deposit payment";
        toast({
          title: "Payment error",
          description: msg,
          variant: "destructive",
        });
        navigate(`/projects/${id}`);
      }
    } else {
      navigate(`/projects/${id}`);
    }
  }

  // ── Reject ────────────────────────────────────────────────────────────────────

  async function handleReject(proposal: ProposalRow) {
    if (!id) return;
    setActioning(true);
    try {
      const rejectionScores = scoringCriteria.map(c => ({
        criterion: c.label,
        score: parseFloat(panelScores[c.label] ?? "0") || 0,
      }));

      const weightedScore =
        Math.round(
          scoringCriteria.reduce((sum, c) => {
            const s = parseFloat(panelScores[c.label] ?? "0") || 0;
            return sum + (Math.min(10, Math.max(0, s)) * c.weight) / 100;
          }, 0) * 100,
        ) / 100;

      const { error } = await supabase
        .from("project_proposals")
        .update({
          status: "rejected",
          rejection_reason: rejectReason.trim(),
          rejection_scores: rejectionScores,
          weighted_score: weightedScore,
        })
        .eq("id", proposal.id);

      if (error) throw error;

      toast({ title: "Proposal rejected" });
      closePanel();
      await loadProposals(id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "An error occurred";
      toast({ title: "Failed to reject proposal", description: msg, variant: "destructive" });
    } finally {
      setActioning(false);
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────────

  const scoringCriteria = (project?.scoring_criteria as unknown as ScoringCriterion[] | null) ?? [];
  const selectedProposal = proposals.find(p => p.id === panelId) ?? null;
  const submittedProposals = proposals.filter(p => p.status === "submitted");

  const liveWeightedScore =
    Math.round(
      scoringCriteria.reduce((sum, c) => {
        const s = parseFloat(panelScores[c.label] ?? "");
        return sum + (isNaN(s) ? 0 : Math.min(10, Math.max(0, s)) * c.weight) / 100;
      }, 0) * 100,
    ) / 100;

  const scoresAllFilled = scoringCriteria.every(c => {
    const s = parseFloat(panelScores[c.label] ?? "");
    return !isNaN(s) && s >= 0 && s <= 10;
  });

  // ── Loading ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="py-10 px-4">
          <div className="container mx-auto max-w-7xl">
            <div className="h-4 bg-muted rounded w-36 mb-8 animate-pulse" />
            <div className="h-8 bg-muted rounded w-1/2 mb-4 animate-pulse" />
            <div className="flex flex-col gap-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-28 bg-muted rounded animate-pulse" />
              ))}
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="py-16 px-4">
          <div className="container mx-auto max-w-7xl text-center py-24">
            <h2 className="font-heading text-2xl font-bold mb-3">Project not found</h2>
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

  return (
    <>
      <div className="min-h-screen bg-background">
        <Header />

        <main className="py-10 px-4">
          <div className="container mx-auto max-w-7xl">

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
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="font-heading text-2xl font-bold">{project.title}</h1>
                  <span className="bg-muted text-muted-foreground text-xs font-semibold px-2.5 py-0.5 rounded-full border">
                    {proposals.length} proposal{proposals.length !== 1 ? "s" : ""}
                  </span>
                  {project.tender_status === "awarded" && (
                    <span className="bg-green-50 text-green-700 border-green-200 text-xs font-semibold px-2.5 py-0.5 rounded-full border">
                      Awarded
                    </span>
                  )}
                </div>
              </div>

              {/* View toggle */}
              <div className="flex items-center gap-2 border rounded-lg p-1">
                <button
                  onClick={() => setView("list")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    view === "list"
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <LayoutList className="h-3.5 w-3.5" />
                  List
                </button>
                <button
                  onClick={() => setView("compare")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                    view === "compare"
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Columns className="h-3.5 w-3.5" />
                  Compare
                </button>
              </div>
            </div>

            {/* Empty state */}
            {proposals.length === 0 && (
              <div className="text-center py-24">
                <p className="text-lg font-semibold mb-2">No proposals yet</p>
                <p className="text-muted-foreground text-sm">
                  Proposals from contractors will appear here once submitted.
                </p>
              </div>
            )}

            {/* ── List view ── */}
            {view === "list" && proposals.length > 0 && (
              <div className="flex flex-col gap-4">
                {proposals.map(p => (
                  <Card key={p.id} className="p-5">
                    <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <h3 className="font-semibold text-base">{contractorName(p)}</h3>
                          <StatusBadge status={p.status} />
                        </div>
                        {p.submitted_at && (
                          <p className="text-xs text-muted-foreground">
                            Submitted {formatDateTime(p.submitted_at)}
                          </p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openPanel(p.id)}
                      >
                        Review
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">
                          Total cost
                        </p>
                        <p className="text-sm font-semibold">
                          {p.total_cost != null ? formatGBP(p.total_cost) : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">
                          Timeline
                        </p>
                        <p className="text-sm">
                          {p.timeline_start && p.timeline_end
                            ? `${formatDate(p.timeline_start)} – ${formatDate(p.timeline_end)}`
                            : "—"}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">
                          Materials
                        </p>
                        <p className="text-sm">{materialsLabel(p.materials_responsibility)}</p>
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">
                          Weighted score
                        </p>
                        <p className="text-sm">
                          {p.weighted_score != null
                            ? `${p.weighted_score.toFixed(2)} / 10`
                            : "Not scored"}
                        </p>
                      </div>
                    </div>

                    {p.status === "rejected" && p.rejection_reason && (
                      <div className="mt-4 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                        <p className="text-xs font-semibold text-red-700 uppercase tracking-wide mb-0.5">
                          Rejection reason
                        </p>
                        <p className="text-sm text-red-800">{p.rejection_reason}</p>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}

            {/* ── Compare view ── */}
            {view === "compare" && (
              <>
                {submittedProposals.length === 0 ? (
                  <div className="text-center py-16">
                    <p className="text-muted-foreground text-sm">
                      No submitted proposals to compare.
                      {proposals.length > 0 && " All proposals have already been actioned."}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b">
                          <th className="sticky left-0 bg-background p-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground w-44 border-r">
                            Criterion
                          </th>
                          {submittedProposals.map(p => (
                            <th
                              key={p.id}
                              className="p-4 text-left min-w-[210px] border-r last:border-r-0"
                            >
                              <p className="font-semibold text-sm mb-1">{contractorName(p)}</p>
                              <div className="flex items-center gap-2">
                                <StatusBadge status={p.status} />
                                <button
                                  onClick={() => openPanel(p.id)}
                                  className="text-xs text-muted-foreground hover:text-foreground underline"
                                >
                                  Review
                                </button>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {COMPARE_ROWS.map((row, ri) => (
                          <tr
                            key={row.label}
                            className={ri % 2 === 0 ? "bg-muted/20" : "bg-background"}
                          >
                            <td className="sticky left-0 p-4 text-sm font-medium text-muted-foreground border-r bg-inherit">
                              {row.label}
                            </td>
                            {submittedProposals.map(p => (
                              <td
                                key={p.id}
                                className="p-4 text-sm border-r last:border-r-0"
                              >
                                {row.getValue(p)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </main>
      </div>

      {/* ── Slide-out panel ── */}
      {selectedProposal && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/25"
            onClick={closePanel}
          />

          {/* Panel */}
          <div className="fixed right-0 top-0 z-50 h-screen w-full max-w-[520px] bg-background border-l shadow-2xl flex flex-col overflow-hidden">

            {/* Panel header */}
            <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
              <div>
                <h2 className="font-heading font-bold text-lg leading-tight">
                  {contractorName(selectedProposal)}
                </h2>
                <div className="flex items-center gap-2 mt-0.5">
                  <StatusBadge status={selectedProposal.status} />
                  {selectedProposal.total_cost != null && (
                    <span className="text-sm text-muted-foreground">
                      {formatGBP(selectedProposal.total_cost)} total
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={closePanel}
                className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Panel body — scrollable */}
            <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-6">

              {/* Phases */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                  Project phases
                </p>
                {(selectedProposal.phases as unknown as PhaseJson[] ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No phases provided.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {(selectedProposal.phases as unknown as PhaseJson[]).map((phase, i) => (
                      <div
                        key={i}
                        className="border rounded-md p-3"
                      >
                        <div className="flex items-baseline justify-between gap-2 mb-1">
                          <span className="text-sm font-semibold">
                            {i + 1}. {phase.title}
                          </span>
                          <span className="text-sm font-bold text-orange-600 shrink-0">
                            {formatGBP(phase.cost)}
                          </span>
                        </div>
                        {phase.description && (
                          <p className="text-xs text-muted-foreground mb-1">{phase.description}</p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {phase.duration_days} day{phase.duration_days !== 1 ? "s" : ""} · Starts{" "}
                          {formatDate(phase.start_date)}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Timeline summary */}
              {(selectedProposal.timeline_start || selectedProposal.timeline_end) && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Timeline
                  </p>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Start</span>
                      <p className="font-medium">
                        {selectedProposal.timeline_start
                          ? formatDate(selectedProposal.timeline_start)
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">End</span>
                      <p className="font-medium">
                        {selectedProposal.timeline_end
                          ? formatDate(selectedProposal.timeline_end)
                          : "—"}
                      </p>
                    </div>
                    {selectedProposal.timeline_start && selectedProposal.timeline_end && (
                      <div>
                        <span className="text-muted-foreground">Duration</span>
                        <p className="font-medium">
                          {daysBetween(
                            selectedProposal.timeline_start,
                            selectedProposal.timeline_end,
                          )}{" "}
                          days
                        </p>
                      </div>
                    )}
                    <div>
                      <span className="text-muted-foreground">Materials</span>
                      <p className="font-medium">
                        {materialsLabel(selectedProposal.materials_responsibility)}
                      </p>
                    </div>
                  </div>
                  {selectedProposal.payment_terms && (
                    <div className="mt-3">
                      <span className="text-xs text-muted-foreground">Payment terms</span>
                      <p className="text-sm mt-0.5">{selectedProposal.payment_terms}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Attachments */}
              {selectedProposal.attachments.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Attachments
                  </p>
                  <div className="flex flex-col gap-2">
                    {selectedProposal.attachments.map(att => (
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

              {/* Scoring form — only for submitted proposals */}
              {selectedProposal.status === "submitted" && scoringCriteria.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Scoring (0 – 10 per criterion)
                    </p>
                    {scoresAllFilled && (
                      <span className="text-xs font-semibold text-orange-600">
                        Weighted: {liveWeightedScore.toFixed(2)} / 10
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-2.5">
                    {scoringCriteria.map(c => (
                      <div key={c.label} className="flex items-center gap-3">
                        <label className="text-sm flex-1 min-w-0">
                          {c.label}
                          <span className="text-muted-foreground ml-1 text-xs">({c.weight}%)</span>
                        </label>
                        <Input
                          type="number"
                          min={0}
                          max={10}
                          step={0.1}
                          value={panelScores[c.label] ?? ""}
                          onChange={e =>
                            setPanelScores(prev => ({ ...prev, [c.label]: e.target.value }))
                          }
                          className="w-20 text-right"
                          placeholder="—"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Rejection details — if already rejected */}
              {selectedProposal.status === "rejected" && selectedProposal.rejection_reason && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Rejection details
                  </p>
                  <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-3">
                    <p className="text-sm text-red-800">{selectedProposal.rejection_reason}</p>
                  </div>
                  {selectedProposal.weighted_score != null && (
                    <p className="text-sm text-muted-foreground">
                      Weighted score: <span className="font-semibold">{selectedProposal.weighted_score.toFixed(2)} / 10</span>
                    </p>
                  )}
                </div>
              )}

            </div>

            {/* Panel footer — action buttons (submitted only) */}
            {selectedProposal.status === "submitted" &&
              project.tender_status !== "awarded" && (
                <div className="shrink-0 border-t px-6 py-4 flex gap-3">
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-500 text-white"
                    onClick={() => handleAccept(selectedProposal)}
                    disabled={actioning}
                  >
                    {actioning ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    Accept
                  </Button>
                  <Button
                    className="flex-1 bg-red-600 hover:bg-red-500 text-white"
                    onClick={() => setShowRejectModal(true)}
                    disabled={actioning}
                  >
                    Reject
                  </Button>
                </div>
              )}

            {project.tender_status === "awarded" &&
              selectedProposal.status === "submitted" && (
                <div className="shrink-0 border-t px-6 py-4">
                  <p className="text-xs text-muted-foreground text-center">
                    This project has been awarded. No further proposals can be actioned.
                  </p>
                </div>
              )}
          </div>
        </>
      )}

      {/* ── Contract signing overlay ── */}
      {contractSigning && myProfile && (
        <ContractSigning
          contractId={contractSigning.contractId}
          documentUrl={contractSigning.documentUrl}
          partyName={myProfile.company_name || myProfile.full_name || ""}
          role="client"
          onSigned={handleClientSigned}
          onCancel={() => setContractSigning(null)}
        />
      )}

      {/* ── Reject modal ── */}
      {showRejectModal && selectedProposal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 px-4">
          <div className="bg-background rounded-xl shadow-2xl w-full max-w-md">

            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="font-bold text-base">Reject proposal</h3>
              <button
                onClick={() => setShowRejectModal(false)}
                className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-6 py-5 flex flex-col gap-5">
              {/* Reason */}
              <div>
                <label className="text-sm font-medium block mb-1.5">
                  Rejection reason <span className="text-red-500">*</span>
                </label>
                <Textarea
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  placeholder="Explain why this proposal was not selected..."
                  rows={3}
                />
              </div>

              {/* Scores */}
              {scoringCriteria.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium">
                      Scores (0–10) <span className="text-red-500">*</span>
                    </label>
                    {scoresAllFilled && (
                      <span className="text-xs font-semibold text-orange-600">
                        Weighted: {liveWeightedScore.toFixed(2)} / 10
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-2">
                    {scoringCriteria.map(c => (
                      <div key={c.label} className="flex items-center gap-3">
                        <span className="text-sm flex-1 min-w-0">
                          {c.label}
                          <span className="text-muted-foreground ml-1 text-xs">({c.weight}%)</span>
                        </span>
                        <Input
                          type="number"
                          min={0}
                          max={10}
                          step={0.1}
                          value={panelScores[c.label] ?? ""}
                          onChange={e =>
                            setPanelScores(prev => ({ ...prev, [c.label]: e.target.value }))
                          }
                          className="w-20 text-right"
                          placeholder="—"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 px-6 pb-5">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowRejectModal(false)}
                disabled={actioning}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-500 text-white"
                disabled={
                  actioning ||
                  !rejectReason.trim() ||
                  (scoringCriteria.length > 0 && !scoresAllFilled)
                }
                onClick={() => handleReject(selectedProposal)}
              >
                {actioning ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Confirm rejection
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ProposalReview;
