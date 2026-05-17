import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import Header from "@/components/Header";
import { SubmitProposalForm } from "@/components/projects/SubmitProposalForm";
import { ArrowLeft, Calendar, MapPin, User, X } from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────────

type ScoringCriterion = { label: string; weight: number };

type TenderDetail = {
  id: string;
  title: string;
  description: string | null;
  city: string | null;
  postcode: string | null;
  trade_categories: string[] | null;
  budget: number | null;
  budget_visible_to_contractors: boolean | null;
  proposal_deadline: string | null;
  deposit_required: boolean | null;
  deposit_percentage: number | null;
  retention_percentage: number | null;
  scoring_criteria: ScoringCriterion[] | null;
  posted_by: string;
  created_at: string;
  poster: { full_name: string | null; company_name: string | null } | null;
};

type QandAItem = {
  id: string;
  question: string;
  answer: string | null;
  answered_at: string | null;
  asked_at: string;
  asked_by: string;
  is_public: boolean;
  asker: { full_name: string | null; company_name: string | null } | null;
};

type MyProfile = {
  id: string;
  user_type: string;
  full_name: string | null;
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

function daysRemaining(iso: string): number {
  const deadline = new Date(iso + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function posterName(poster: TenderDetail["poster"]) {
  if (!poster) return "TradeStone member";
  return poster.company_name || poster.full_name || "TradeStone member";
}

function askerName(asker: QandAItem["asker"]) {
  if (!asker) return "Member";
  return asker.company_name || asker.full_name || "Member";
}

// ── Page ───────────────────────────────────────────────────────────────────────

const TenderDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [tender, setTender] = useState<TenderDetail | null>(null);
  const [qanda, setQanda] = useState<QandAItem[]>([]);
  const [proposalCount, setProposalCount] = useState<number>(0);
  const [myProfile, setMyProfile] = useState<MyProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [showProposalForm, setShowProposalForm] = useState(false);

  const [questionText, setQuestionText] = useState("");
  const [submittingQ, setSubmittingQ] = useState(false);
  const [answeringId, setAnsweringId] = useState<string | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [answerPublic, setAnswerPublic] = useState(false);
  const [submittingA, setSubmittingA] = useState(false);

  useEffect(() => {
    if (id) fetchAll(id);
  }, [id]);

  async function fetchAll(projectId: string) {
    setLoading(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: p } = await supabase
        .from("profiles")
        .select("id, user_type, full_name")
        .eq("user_id", user.id)
        .single();
      setMyProfile(p as MyProfile | null);
    }

    const { data, error } = await supabase
      .from("projects")
      .select(
        `id, title, description, city, postcode, trade_categories,
         budget, budget_visible_to_contractors, proposal_deadline,
         deposit_required, deposit_percentage, retention_percentage,
         scoring_criteria, posted_by, created_at,
         poster:profiles!posted_by(full_name, company_name)`,
      )
      .eq("id", projectId)
      .single();

    if (error || !data) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setTender(data as unknown as TenderDetail);

    const { data: qa } = await supabase
      .from("project_qanda")
      .select(
        `id, question, answer, answered_at, asked_at, asked_by, is_public,
         asker:profiles!asked_by(full_name, company_name)`,
      )
      .eq("project_id", projectId)
      .order("asked_at", { ascending: true });
    setQanda((qa ?? []) as unknown as QandAItem[]);

    const { count } = await supabase
      .from("project_proposals")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId);
    setProposalCount(count ?? 0);

    setLoading(false);
  }

  async function refreshQanda() {
    if (!id) return;
    const { data } = await supabase
      .from("project_qanda")
      .select(
        `id, question, answer, answered_at, asked_at, asked_by, is_public,
         asker:profiles!asked_by(full_name, company_name)`,
      )
      .eq("project_id", id)
      .order("asked_at", { ascending: true });
    setQanda((data ?? []) as unknown as QandAItem[]);
  }

  async function submitQuestion() {
    if (!myProfile || !questionText.trim() || !id) return;
    setSubmittingQ(true);
    const { error } = await supabase.from("project_qanda").insert({
      project_id: id,
      asked_by: myProfile.id,
      question: questionText.trim(),
      is_public: false,
    });
    if (error) {
      toast({ title: "Failed to submit question", description: error.message, variant: "destructive" });
    } else {
      setQuestionText("");
      await refreshQanda();
    }
    setSubmittingQ(false);
  }

  async function submitAnswer(qandaItemId: string) {
    if (!answerText.trim()) return;
    setSubmittingA(true);
    const { error } = await supabase
      .from("project_qanda")
      .update({
        answer: answerText.trim(),
        answered_at: new Date().toISOString(),
        is_public: answerPublic,
      })
      .eq("id", qandaItemId);
    if (error) {
      toast({ title: "Failed to post answer", description: error.message, variant: "destructive" });
    } else {
      setAnsweringId(null);
      setAnswerText("");
      setAnswerPublic(false);
      await refreshQanda();
    }
    setSubmittingA(false);
  }

  async function togglePublic(item: QandAItem) {
    const { error } = await supabase
      .from("project_qanda")
      .update({ is_public: !item.is_public })
      .eq("id", item.id);
    if (!error) await refreshQanda();
  }

  async function refreshProposalCount() {
    if (!id) return;
    const { count } = await supabase
      .from("project_proposals")
      .select("id", { count: "exact", head: true })
      .eq("project_id", id);
    setProposalCount(count ?? 0);
  }

  function handleProposalSuccess() {
    setShowProposalForm(false);
    toast({ title: "Proposal submitted", description: "Your proposal has been sent to the client." });
    refreshProposalCount();
  }

  const isPoster = Boolean(myProfile && tender && myProfile.id === tender.posted_by);
  const isContractor = myProfile?.user_type === "contractor";

  function visibleQanda(): QandAItem[] {
    if (isPoster) return qanda;
    if (!myProfile) return qanda.filter(q => q.is_public);
    return qanda.filter(q => q.is_public || q.asked_by === myProfile.id);
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="py-10 px-4">
          <div className="container mx-auto max-w-6xl">
            <div className="h-4 bg-muted rounded w-28 mb-8 animate-pulse" />
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              <div className="lg:col-span-2 flex flex-col gap-5">
                <div className="h-9 bg-muted rounded w-2/3 animate-pulse" />
                <div className="h-4 bg-muted rounded w-1/3 animate-pulse" />
                <div className="flex gap-2">
                  <div className="h-6 bg-muted rounded-full w-20 animate-pulse" />
                  <div className="h-6 bg-muted rounded-full w-16 animate-pulse" />
                </div>
                <div className="h-32 bg-muted rounded animate-pulse" />
              </div>
              <div className="h-72 bg-muted rounded animate-pulse" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ── Not found ──────────────────────────────────────────────────────────────

  if (notFound || !tender) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="py-16 px-4">
          <div className="container mx-auto max-w-6xl text-center py-24">
            <h2 className="text-2xl font-bold mb-3">Tender not found</h2>
            <p className="text-muted-foreground mb-6">
              This tender may have been removed or you don't have permission to view it.
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

  // ── Derived values ─────────────────────────────────────────────────────────

  const categories = tender.trade_categories ?? [];
  const location = [tender.city, tender.postcode].filter(Boolean).join(", ");
  const scoringCriteria = (tender.scoring_criteria as unknown as ScoringCriterion[]) ?? [];
  const deadlineDays = tender.proposal_deadline ? daysRemaining(tender.proposal_deadline) : null;
  const shown = visibleQanda();

  const budgetLabel =
    tender.budget != null && tender.budget_visible_to_contractors
      ? formatGBP(tender.budget)
      : "Budget on request";

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
    {showProposalForm && (
      <ProposalOverlay
        projectId={tender.id}
        scoringCriteria={scoringCriteria}
        onSuccess={handleProposalSuccess}
        onClose={() => setShowProposalForm(false)}
      />
    )}
    <div className="min-h-screen bg-background">
      <Header />

      <main className="py-10 px-4">
        <div className="container mx-auto max-w-6xl">

          {/* Back navigation */}
          <button
            onClick={() => navigate("/projects")}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Projects
          </button>

          {/* Two-column layout */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">

            {/* ── Left column (2/3) ── */}
            <div className="lg:col-span-2 flex flex-col gap-8">

              {/* Title + meta */}
              <div>
                <h1 className="text-3xl font-bold mb-3 leading-snug">{tender.title}</h1>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 shrink-0" />
                    <span>Posted by {posterName(tender.poster)}</span>
                  </div>
                  {location && (
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      <span>{location}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Trade chips */}
              {categories.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {categories.map(cat => (
                    <span
                      key={cat}
                      className="bg-primary/10 text-primary border border-primary/20 text-xs px-3 py-1 rounded-full font-medium"
                    >
                      {cat}
                    </span>
                  ))}
                </div>
              )}

              {/* Description */}
              {tender.description && (
                <div>
                  <h2 className="text-base font-semibold mb-2">Description</h2>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                    {tender.description}
                  </p>
                </div>
              )}

              {/* Q&A thread */}
              <div>
                <h2 className="text-base font-semibold mb-4">Questions &amp; Answers</h2>

                {shown.length === 0 && (
                  <p className="text-sm text-muted-foreground mb-4">No questions yet.</p>
                )}

                <div className="flex flex-col gap-3">
                  {shown.map(item => (
                    <Card key={item.id} className="p-4">
                      {/* Question header */}
                      <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground/80">{askerName(item.asker)}</span>
                        <span>·</span>
                        <span>{formatDateTime(item.asked_at)}</span>
                        {!isPoster && (
                          <span
                            className={`ml-auto px-2 py-0.5 rounded-full font-medium border ${
                              item.is_public
                                ? "bg-green-50 text-green-700 border-green-200"
                                : "bg-muted text-muted-foreground border-border"
                            }`}
                          >
                            {item.is_public ? "Public" : "Private"}
                          </span>
                        )}
                      </div>

                      {/* Question text */}
                      <p className="text-sm font-medium mb-3">{item.question}</p>

                      {/* Answer */}
                      {item.answer ? (
                        <div className="bg-muted/40 border border-border rounded-md p-3">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                              Answer
                            </span>
                            {isPoster ? (
                              <button
                                onClick={() => togglePublic(item)}
                                className={`text-xs px-2.5 py-0.5 rounded-full font-medium border transition-colors ${
                                  item.is_public
                                    ? "bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                                    : "bg-muted text-muted-foreground border-border hover:bg-muted/80"
                                }`}
                              >
                                {item.is_public ? "Public" : "Private"}
                              </button>
                            ) : (
                              <span
                                className={`text-xs px-2.5 py-0.5 rounded-full font-medium border ${
                                  item.is_public
                                    ? "bg-green-50 text-green-700 border-green-200"
                                    : "bg-muted text-muted-foreground border-border"
                                }`}
                              >
                                {item.is_public ? "Public" : "Private"}
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                            {item.answer}
                          </p>
                        </div>
                      ) : isPoster ? (
                        answeringId === item.id ? (
                          <div className="mt-2 flex flex-col gap-2">
                            <Textarea
                              value={answerText}
                              onChange={e => setAnswerText(e.target.value)}
                              placeholder="Type your answer..."
                              rows={3}
                              className="text-sm"
                            />
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={answerPublic}
                                  onCheckedChange={setAnswerPublic}
                                  id={`public-${item.id}`}
                                />
                                <label
                                  htmlFor={`public-${item.id}`}
                                  className="text-sm text-muted-foreground cursor-pointer select-none"
                                >
                                  Make public
                                </label>
                              </div>
                              <div className="flex gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setAnsweringId(null);
                                    setAnswerText("");
                                    setAnswerPublic(false);
                                  }}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  size="sm"
                                  className="bg-orange-500 text-white hover:bg-orange-400"
                                  onClick={() => submitAnswer(item.id)}
                                  disabled={submittingA || !answerText.trim()}
                                >
                                  {submittingA ? "Posting..." : "Post answer"}
                                </Button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-1"
                            onClick={() => {
                              setAnsweringId(item.id);
                              setAnswerText("");
                              setAnswerPublic(false);
                            }}
                          >
                            Answer
                          </Button>
                        )
                      ) : (
                        <p className="text-xs text-muted-foreground italic">Awaiting answer</p>
                      )}
                    </Card>
                  ))}
                </div>

                {/* Ask a question (logged-in users only) */}
                {myProfile && (
                  <div className="mt-6">
                    <h3 className="text-sm font-semibold mb-2">Ask a question</h3>
                    <Textarea
                      value={questionText}
                      onChange={e => setQuestionText(e.target.value)}
                      placeholder="Type your question..."
                      rows={3}
                      className="mb-2 text-sm"
                    />
                    <Button
                      size="sm"
                      className="bg-orange-500 text-white hover:bg-orange-400"
                      onClick={submitQuestion}
                      disabled={submittingQ || !questionText.trim()}
                    >
                      {submittingQ ? "Submitting..." : "Submit question"}
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* ── Right column (1/3, sticky) ── */}
            <div className="sticky top-6 self-start">
              <Card className="p-6 flex flex-col gap-5">

                {/* Budget */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                    Budget
                  </p>
                  <p className="text-2xl font-bold">{budgetLabel}</p>
                </div>

                {/* Proposal deadline + countdown */}
                {tender.proposal_deadline && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                      Proposal deadline
                    </p>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium">
                        {formatDate(tender.proposal_deadline)}
                      </span>
                    </div>
                    {deadlineDays !== null && (
                      <p
                        className={`text-xs ${
                          deadlineDays <= 0
                            ? "text-destructive"
                            : deadlineDays <= 3
                            ? "text-orange-500"
                            : "text-muted-foreground"
                        }`}
                      >
                        {deadlineDays > 0
                          ? `${deadlineDays} day${deadlineDays !== 1 ? "s" : ""} remaining`
                          : deadlineDays === 0
                          ? "Closes today"
                          : "Deadline passed"}
                      </p>
                    )}
                  </div>
                )}

                {/* Deposit */}
                {tender.deposit_required && tender.deposit_percentage != null && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                      Deposit required
                    </p>
                    <p className="text-sm">
                      {tender.deposit_percentage}%
                      {tender.budget != null && (
                        <span className="text-muted-foreground ml-1">
                          ({formatGBP((tender.deposit_percentage / 100) * tender.budget)})
                        </span>
                      )}
                    </p>
                  </div>
                )}

                {/* Retention */}
                {tender.retention_percentage != null && tender.retention_percentage > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                      Retention
                    </p>
                    <p className="text-sm">
                      {tender.retention_percentage}% until practical completion
                    </p>
                  </div>
                )}

                {/* Scoring criteria */}
                {scoringCriteria.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                      Scoring criteria
                    </p>
                    <div className="flex flex-col gap-1.5">
                      {scoringCriteria.map((c, i) => (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">{c.label}</span>
                          <span className="font-semibold">{c.weight}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Proposal count — poster only */}
                {isPoster && (
                  <div className="border-t pt-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                      Proposals received
                    </p>
                    <p className="text-2xl font-bold">{proposalCount}</p>
                  </div>
                )}

                {/* Action buttons */}
                {(isContractor || isPoster) && (
                  <div className="border-t pt-4 flex flex-col gap-2">
                    {isContractor && !isPoster && (
                      <Button
                        className="bg-orange-500 text-white hover:bg-orange-400 w-full"
                        onClick={() => setShowProposalForm(true)}
                      >
                        Submit Proposal
                      </Button>
                    )}
                    {isPoster && (
                      <Button variant="outline" className="w-full">
                        Edit Tender
                      </Button>
                    )}
                  </div>
                )}

              </Card>
            </div>

          </div>
        </div>
      </main>
    </div>
    </>
  );
};

export default TenderDetail;

// ── Proposal form overlay — rendered outside the page tree so it sits above Header ──

function ProposalOverlay({
  projectId,
  scoringCriteria,
  onSuccess,
  onClose,
}: {
  projectId: string;
  scoringCriteria: { label: string; weight: number }[];
  onSuccess: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: "#0f1b2d" }}>
      <button
        onClick={onClose}
        style={{
          position: "fixed",
          top: 16,
          right: 20,
          zIndex: 51,
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 8,
          padding: "6px 10px",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 6,
          color: "rgba(255,255,255,0.7)",
          fontSize: 13,
        }}
        onMouseEnter={e =>
          ((e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.14)")
        }
        onMouseLeave={e =>
          ((e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.08)")
        }
      >
        <X size={14} />
        Close
      </button>
      <SubmitProposalForm
        projectId={projectId}
        scoringCriteria={scoringCriteria}
        onSuccess={onSuccess}
        onCancel={onClose}
      />
    </div>
  );
}
