import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  DollarSign, Users, FileText, Clock, Plus, Eye, Edit, Send,
  Filter, MessageCircle, Star, Loader2,
  XCircle, MessageSquare, Calendar,
  AlertTriangle, Wrench, UserCheck,
} from "lucide-react";
import { useOnboardingTour, type TourStep } from "@/hooks/useOnboardingTour";
import { OnboardingTour } from "@/components/OnboardingTour";
import type { User } from "@supabase/supabase-js";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BusinessMessageInbox } from "@/components/business/BusinessMessageInbox";
import ContractorLayout from "@/components/ContractorLayout";
import { HelpSystemProvider } from "@/components/help/HelpSystemProvider";
import { ProfileManagement } from "@/components/management/ProfileManagement";
import { ProfileEditor } from "@/components/management/ProfileEditor";
import { CanvasEditor } from "@/components/profile/CanvasEditor";
import { PhotoGallery } from "@/components/management/PhotoGallery";
import { TeamManagement } from "@/components/management/TeamManagement";
import { TimesheetManagement } from "@/components/management/TimesheetManagement";
import { ContractManagement } from "@/components/management/ContractManagement";
import { ScheduleManagement } from "@/components/management/ScheduleManagement";
import { CRMManagement } from "@/components/management/CRMManagement";
import { FinancialsManagement } from "@/components/management/FinancialsManagement";
import { InvoiceManagement } from "@/components/management/InvoiceManagement";
import { DocumentManagement } from "@/components/management/DocumentManagement";
import { JobManagement } from "@/components/management/JobManagement";
import { IssuedQuotes } from "@/components/management/IssuedQuotes";
import { SendQuoteDialog } from "@/components/management/SendQuoteDialog";
import { StripeConnect } from "@/components/management/StripeConnect";
import { RejectDialog } from "@/components/management/RejectDialog";
import { RespondDialog } from "@/components/management/RespondDialog";
import { ProposeSiteVisitDialog } from "@/components/management/ProposeSiteVisitDialog";
import { PanelInvites } from "@/components/business/PanelInvites";
import { ContractorPrequalStatus } from "@/components/contractor/ContractorPrequalStatus";
import { ContractorTendersView } from "@/components/contractor/tenders/ContractorTendersView";
import { ContractorServiceVisits } from "@/components/business/ContractorServiceVisits";
import ShareProfileView from "@/components/contractor/ShareProfileView";
import BusinessCardEditor from "@/components/contractor/BusinessCardEditor";
import { SlaStatusPill } from "@/components/SlaStatusPill";
import type { Database } from "@/integrations/supabase/types";
import { useContractorPipeline, type PipelineEngagement, type PipelineEnquiryRef, type PipelineStage } from "@/hooks/useContractorPipeline";
import { formatQuoteRef } from "@/lib/documentRefs";
import { PipelineCard } from "@/components/contractor/work/PipelineCard";
import { EngagementThread } from "@/components/contractor/thread/EngagementThread";
import { Inbox, CheckCircle2 } from "lucide-react";

type EnquiryForDialog = {
  id: string;
  contractor_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  job_description: string;
  location: string;
  preferred_timeline: string | null;
  preferred_time_of_day: string | null;
  preferred_window_start: string | null;
  preferred_window_end: string | null;
  budget_range: string | null;
  status: string | null;
};
type Job = Database["public"]["Tables"]["jobs"]["Row"];
// sla_status / sla_completion_due are not yet in the generated Database types
// (pending migration 20260629130000_sla_clock.sql + a types regen) — extend locally.
type JobWithSla = Job & { sla_status?: string | null; sla_completion_due?: string | null };

const ContractorDashboard = () => {
  const [enquiries, setEnquiries] = useState<any[]>([]);
  const [activeEnquiry, setActiveEnquiry] = useState<EnquiryForDialog | null>(null);
  const [enquiryDialog, setEnquiryDialog] = useState<"quote" | "reject" | "respond" | "site_visit" | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileIncomplete, setProfileIncomplete] = useState(false);
  const [stripeAccountId, setStripeAccountId] = useState<string | null>(null);

  const { engagements, loading: pipelineLoading, refetch: refetchPipeline } = useContractorPipeline();
  const [filterStage, setFilterStage] = useState<PipelineStage | null>(null);
  const [openEngagement, setOpenEngagement] = useState<PipelineEngagement | null>(null);

  const [dashboardData, setDashboardData] = useState({
    monthlyRevenue: 0,
    activeJobs: 0,
    pendingInvoicesTotal: 0,
    pendingInvoicesCount: 0,
    overdueInvoicesCount: 0,
    clientCount: 0,
    panelCount: 0,
    upcomingVisits: 0,
  });
  const [activeJobs, setActiveJobs] = useState<Partial<Job>[]>([]);

  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("view") ?? "dashboard";
  const setActiveTab = (tab: string) => navigate(`/dashboard/contractor?view=${tab}`);

  const tourSteps: TourStep[] = useMemo(() => [
    { target: '[data-tour="dashboard-header"]', title: "Welcome to Your Dashboard!", description: "This is your command centre. Get an overview of your revenue, projects, invoices, and clients all in one place.", placement: "bottom" },
    { target: '[data-tour="tab-quotes"]', title: "Quote Requests", description: "Receive and manage quote requests from potential clients.", placement: "bottom", action: () => setActiveTab("enquiries") },
    { target: '[data-tour="tab-invoices"]', title: "Invoice Management", description: "Create professional invoices, track payments, and manage your cash flow.", placement: "bottom", action: () => setActiveTab("invoices") },
    { target: '[data-tour="tab-contracts"]', title: "Contracts", description: "Manage your active contracts and keep all your agreements organised.", placement: "bottom", action: () => setActiveTab("contracts") },
    { target: '[data-tour="tab-team"]', title: "Team Management", description: "Add team members, manage roles, and set hourly rates.", placement: "bottom", action: () => setActiveTab("team") },
    { target: '[data-tour="tab-schedule"]', title: "Schedule & Calendar", description: "Plan your jobs, set availability, and manage appointments.", placement: "bottom", action: () => setActiveTab("schedule") },
    { target: '[data-tour="tab-clients"]', title: "Client CRM", description: "Build your client database and nurture relationships.", placement: "bottom", action: () => setActiveTab("clients") },
    { target: '[data-tour="tab-financials"]', title: "Financial Tracking", description: "Track income and expenses and get a clear picture of your finances.", placement: "bottom", action: () => setActiveTab("financials") },
    { target: '[data-tour="tab-profile"]', title: "Your Profile", description: "Complete your profile to appear in the contractor directory.", placement: "bottom", action: () => setActiveTab("profile") },
  ], []);

  const { isActive: isTourActive, currentStep, totalSteps, step: currentTourStep, startTour, endTour, nextStep, prevStep } = useOnboardingTour(tourSteps);

  const filteredEngagements = useMemo(
    () => (filterStage ? engagements.filter((e) => e.stage === filterStage) : engagements),
    [engagements, filterStage],
  );
  const needsYouEngagements = useMemo(() => {
    // Stage-weighted: scheduling/enquiry engagements are quick, high-value
    // touches — they float above aged jobs even if a job has been sitting
    // longer. Sort is stable, so ties keep the hook's oldest-first order.
    const stageWeight: Record<string, number> = { enquiry: 0, scheduling: 0, quote_sent: 1, job: 2, invoice: 2 };
    return filteredEngagements
      .filter((e) => e.band === "needs_you")
      .slice()
      .sort((a, b) => (stageWeight[a.stage] ?? 1) - (stageWeight[b.stage] ?? 1));
  }, [filteredEngagements]);
  const waitingEngagements = useMemo(
    () => filteredEngagements.filter((e) => e.band === "waiting"),
    [filteredEngagements],
  );

  // Deep-link from Issued Quotes' "Open thread" button (?thread=<quoteId>).
  // Resolved by quote_number, not the exact version id clicked — a card's
  // quoteId is the *governing* version (job's quote / accepted / latest
  // non-draft), which can differ from whichever version was on screen in
  // Issued Quotes. Same positional-versioning trap as Defects 1/2, so this
  // matches on the sibling group rather than an exact id.
  useEffect(() => {
    const threadQuoteId = searchParams.get("thread");
    if (!threadQuoteId || !profileId || pipelineLoading) return;
    let cancelled = false;

    (async () => {
      const { data: clicked } = await supabase
        .from("issued_quotes")
        .select("id, quote_number, contractor_id")
        .eq("id", threadQuoteId)
        .maybeSingle();
      if (cancelled || !clicked) return;

      const { data: siblings } = await supabase
        .from("issued_quotes")
        .select("id, version, status, client_name, recipient_id, enquiry_id, created_at")
        .eq("quote_number", clicked.quote_number)
        .eq("contractor_id", clicked.contractor_id);
      if (cancelled || !siblings || siblings.length === 0) return;

      const siblingIds = new Set(siblings.map((s) => s.id));

      // Prefer the card built on the exact version clicked — a quote_number
      // group can now carry two live cards (the governing card plus its
      // unsent draft-revision card, see Defect 1), so matching on the group
      // alone is ambiguous about which one the user meant. Only fall back to
      // "any card in the group" when the clicked version isn't itself a
      // card's quoteId — e.g. a superseded sibling like Q-0011 v1, where the
      // group's only live card is built on the governing v2.
      const liveMatch =
        engagements.find((e) => e.quoteId === clicked.id) ??
        engagements.find((e) => e.quoteId && siblingIds.has(e.quoteId));
      if (liveMatch) {
        setOpenEngagement(liveMatch);
        setSearchParams((prev) => { prev.delete("thread"); return prev; }, { replace: true });
        return;
      }

      // No live card (rejected past grace, paid-and-done, lapsed/archived,
      // or a job whose invoice is settled) — still must be reachable.
      // Resolve governing precedence the same way the pipeline hook does:
      // job's quote > accepted version > latest non-draft version.
      const { data: job } = await supabase
        .from("jobs")
        .select("id, status, company_id, issued_quote_id, sla_status, sla_completion_due")
        .in("issued_quote_id", Array.from(siblingIds))
        .neq("status", "cancelled")
        .maybeSingle();

      const jobQuote = job ? siblings.find((s) => s.id === job.issued_quote_id) : undefined;
      const acceptedVersion = siblings
        .filter((s) => s.status === "accepted")
        .reduce<typeof siblings[number] | undefined>((a, b) => (!a || b.version > a.version ? b : a), undefined);
      const nonDraft = siblings.filter((s) => s.status !== "draft");
      const latestNonDraft = nonDraft.length ? nonDraft.reduce((a, b) => (b.version > a.version ? b : a)) : undefined;
      const clickedSibling = siblings.find((s) => s.id === clicked.id);
      const governing = jobQuote ?? acceptedVersion ?? latestNonDraft ?? clickedSibling ?? siblings[0];

      // enquiry_id via the group's anchor, not raw off whichever version was
      // clicked. The Defect-2 backfill made every sibling agree, but resolve
      // defensively rather than trust one specific row — feeding this into
      // enquiryRef gives getOrCreateEngagementConversation a real fallback
      // (job/quote checked first) so a conversation started at the enquiry
      // stage, before this quote existed, is found instead of forked.
      const resolvedEnquiryId = siblings.find((s) => s.enquiry_id)?.enquiry_id ?? null;

      let clientCode: string | null = null;
      if (governing.recipient_id) {
        const { data: profileRow } = await supabase
          .from("profiles")
          .select("ts_profile_code")
          .eq("id", governing.recipient_id)
          .maybeSingle();
        clientCode = profileRow?.ts_profile_code ?? null;
      }
      if (cancelled) return;

      const enquiryRef: PipelineEnquiryRef | null = resolvedEnquiryId
        ? {
            id: resolvedEnquiryId,
            contractor_id: null,
            customer_id: null,
            customer_name: null,
            customer_email: null,
            customer_phone: null,
            job_description: "",
            location: "",
            preferred_timeline: null,
            budget_range: null,
            status: null,
          }
        : null;

      const synthetic: PipelineEngagement = {
        key: `deeplink:${governing.id}`,
        clientName: governing.client_name,
        clientCode,
        companyId: job?.company_id ?? null,
        stage: job ? "job" : governing.status === "accepted" ? "scheduling" : "quote_sent",
        stageLabel: job ? "Archived job" : governing.status === "accepted" ? "Scheduling" : "Archived quote",
        reference: formatQuoteRef(clicked.quote_number, { version: governing.version > 1 ? governing.version : undefined }),
        band: "waiting",
        action: "",
        sinceIso: governing.created_at,
        overdue: false,
        slaStatus: job?.sla_status ?? null,
        slaCompletionDue: job?.sla_completion_due ?? null,
        enquiryRef,
        quoteId: governing.id,
        jobId: job?.id ?? null,
        invoiceId: null,
        confirmableProposalId: null,
      };

      setOpenEngagement(synthetic);
      setSearchParams((prev) => { prev.delete("thread"); return prev; }, { replace: true });
    })();

    return () => { cancelled = true; };
  }, [searchParams, profileId, pipelineLoading, engagements, setSearchParams]);

  useEffect(() => {
    const loadUserAndData = async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) { navigate("/auth"); return; }
      setUser(currentUser);

      const { data: profileRow } = await supabase.from('profiles').select('id').eq('user_id', currentUser.id).maybeSingle();
      const pid = profileRow?.id ?? null;
      setProfileId(pid);

      const { data: profileData } = await supabase.from('profiles').select('trades, location, working_radius, logo_url, stripe_account_id').eq('user_id', currentUser.id).single();
      setStripeAccountId((profileData as any)?.stripe_account_id ?? null);
      const trades = (profileData as any)?.trades;
      const hasNoTrades = !trades || !Array.isArray(trades) || trades.length === 0;
      if (profileData && (hasNoTrades || !(profileData as any).location || !(profileData as any).working_radius || !(profileData as any).logo_url)) {
        setProfileIncomplete(true);
        setActiveTab("profile");
      }

      const { data: enquiriesData, error: enquiriesError } = await supabase.from('enquiries')
        .select('id, title, job_description, location, status, created_at, contractor_id, customer_id, customer_name, customer_email, customer_phone, budget_range, preferred_timeline, preferred_time_of_day, preferred_window_start, preferred_window_end, photo_urls')
        .eq('contractor_id', currentUser.id).order('created_at', { ascending: false });
      if (enquiriesError) console.error('Error loading enquiries:', enquiriesError);
      else setEnquiries(enquiriesData || []);

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      // Use profileId (pid) for all FK lookups
      const contractorId = pid ?? currentUser.id;

      const [
        paidInvoicesRes, outstandingInvoicesRes, overdueInvoicesRes,
        activeJobsCountRes, crmClientsRes, panelRes, serviceVisitsRes,
        activeJobsDataRes,
      ] = await Promise.all([
        supabase.from('invoices').select('total').eq('contractor_id', contractorId).eq('status', 'paid').gte('paid_date', startOfMonth),
        supabase.from('invoices').select('total').eq('contractor_id', contractorId).in('status', ['draft', 'sent']),
        supabase.from('invoices').select('id').eq('contractor_id', contractorId).eq('status', 'overdue'),
        supabase.from('jobs').select('id').eq('contractor_id', contractorId).in('status', ['scheduled', 'in_progress', 'snagging']),
        supabase.from('crm_clients').select('id').eq('contractor_id', contractorId),
        supabase.from('contractor_panel').select('id').eq('contractor_id', contractorId).eq('status', 'approved'),
        supabase.from('service_visits').select('id, asset_id, scheduled_window_end, status, company_id')
          .eq('contractor_id', contractorId)
          .in('status', ['scheduled', 'confirmed'])
          .gte('scheduled_window_end', now.toISOString())
          .order('scheduled_window_end', { ascending: true })
          .limit(5),
        supabase.from('jobs').select('id, title, status, contract_value, start_date, end_date, sla_status, sla_completion_due')
          .eq('contractor_id', contractorId).in('status', ['scheduled', 'in_progress', 'snagging'])
          .order('created_at', { ascending: false }).limit(3),
      ]);

      setDashboardData({
        monthlyRevenue: paidInvoicesRes.data?.reduce((sum, inv) => sum + (inv.total || 0), 0) ?? 0,
        activeJobs: activeJobsCountRes.data?.length ?? 0,
        pendingInvoicesTotal: outstandingInvoicesRes.data?.reduce((sum, inv) => sum + (inv.total || 0), 0) ?? 0,
        pendingInvoicesCount: outstandingInvoicesRes.data?.length ?? 0,
        overdueInvoicesCount: overdueInvoicesRes.data?.length ?? 0,
        clientCount: crmClientsRes.data?.length ?? 0,
        panelCount: panelRes.data?.length ?? 0,
        upcomingVisits: serviceVisitsRes.data?.length ?? 0,
      });

      setActiveJobs(activeJobsDataRes.data || []);

      setLoading(false);
    };
    loadUserAndData();
  }, [navigate]);

  const reloadEnquiries = async () => {
    if (!user) return;
    const { data } = await supabase.from('enquiries')
      .select('id, title, job_description, location, status, created_at, contractor_id, customer_id, customer_name, customer_email, customer_phone, budget_range, preferred_timeline, preferred_time_of_day, preferred_window_start, preferred_window_end, photo_urls')
      .eq('contractor_id', user.id).order('created_at', { ascending: false });
    setEnquiries(data || []);
  };

  const reloadEnquiriesAndPipeline = () => { reloadEnquiries(); refetchPipeline(); };

  const openEnquiryDialog = (enquiry: any, dialog: "quote" | "reject" | "respond" | "site_visit") => { setActiveEnquiry(enquiry as EnquiryForDialog); setEnquiryDialog(dialog); };
  const closeEnquiryDialog = () => { setEnquiryDialog(null); setActiveEnquiry(null); };

  const dashboardStats = [
    {
      title: "Monthly Revenue",
      value: `£${dashboardData.monthlyRevenue.toLocaleString('en-GB', { minimumFractionDigits: 0 })}`,
      change: "Paid invoices this month",
      icon: DollarSign,
      trend: "up",
      onClick: () => setFilterStage((prev) => (prev === "invoice" ? null : "invoice")),
    },
    {
      title: "Active Jobs",
      value: `${dashboardData.activeJobs}`,
      change: "Currently in progress",
      icon: FileText,
      trend: "up",
      onClick: () => setFilterStage((prev) => (prev === "job" ? null : "job")),
    },
    {
      title: "Invoices",
      value: `£${dashboardData.pendingInvoicesTotal.toLocaleString('en-GB', { minimumFractionDigits: 0 })}`,
      change: `${dashboardData.pendingInvoicesCount} pending${dashboardData.overdueInvoicesCount > 0 ? ` · ${dashboardData.overdueInvoicesCount} overdue` : ''}`,
      icon: dashboardData.overdueInvoicesCount > 0 ? AlertTriangle : Clock,
      trend: dashboardData.overdueInvoicesCount > 0 ? "danger" : "warning",
      onClick: () => setFilterStage((prev) => (prev === "invoice" ? null : "invoice")),
    },
    {
      title: "Clients",
      value: `${dashboardData.clientCount}`,
      change: "In your CRM",
      icon: Users,
      trend: "up",
      onClick: () => setActiveTab("clients"),
    },
    {
      title: "Service Visits",
      value: `${dashboardData.upcomingVisits}`,
      change: "Upcoming visits",
      icon: Wrench,
      trend: "up",
      onClick: () => setActiveTab("service-visits"),
    },
    {
      title: "Panels",
      value: `${dashboardData.panelCount}`,
      change: "Active memberships",
      icon: UserCheck,
      trend: "up",
      onClick: () => setActiveTab("panel-invites"),
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "paid": return "bg-green-100 text-green-800";
      case "pending": return "bg-yellow-100 text-yellow-800";
      case "overdue": return "bg-red-100 text-red-800";
      case "active": case "in_progress": case "in-progress": return "bg-blue-100 text-blue-800";
      case "completed": return "bg-green-100 text-green-800";
      case "cancelled": return "bg-red-100 text-red-800";
      case "scheduled": return "bg-blue-100 text-blue-800";
      case "confirmed": return "bg-yellow-100 text-yellow-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  if (loading || !profileId) {
    return (
      <ContractorLayout>
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </ContractorLayout>
    );
  }

  return (
    <HelpSystemProvider profileId={profileId} role="contractor">
    <ContractorLayout>
      <div className={activeTab === "messages" ? "h-full min-h-0 flex flex-col" : "container mx-auto px-4 py-8 max-w-7xl"}>
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className={activeTab === "messages" ? "h-full min-h-0 flex flex-col flex-1" : "space-y-8"}
        >

          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-8">
            {profileId && <PanelInvites profileId={profileId} />}

            {!stripeAccountId && <StripeConnect />}

            {/* Stats grid — 3 cols on md, 6 on lg */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              {dashboardStats.map((stat, index) => (
                <Card key={index} className="cursor-pointer hover:shadow-md transition-shadow" onClick={stat.onClick}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
                    <CardTitle className="text-xs font-medium text-muted-foreground">{stat.title}</CardTitle>
                    <stat.icon className={`h-4 w-4 ${stat.trend === 'danger' ? 'text-red-500' : stat.trend === 'warning' ? 'text-yellow-500' : 'text-muted-foreground'}`} />
                  </CardHeader>
                  <CardContent className="p-4 pt-0">
                    <div className={`text-xl font-bold ${stat.trend === 'danger' ? 'text-red-600' : ''}`}>{stat.value}</div>
                    <p className={`text-xs mt-1 ${stat.trend === 'danger' ? 'text-red-600' : stat.trend === 'warning' ? 'text-yellow-600' : 'text-green-600'}`}>{stat.change}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {filterStage && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Filtering pipeline to <span className="font-medium capitalize">{filterStage}</span> engagements</span>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setFilterStage(null)}>Clear filter</Button>
              </div>
            )}

            {pipelineLoading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <div className="space-y-8">
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Needs you</h3>
                  {needsYouEngagements.length === 0 ? (
                    <Card><CardContent className="p-8 text-center flex flex-col items-center gap-2">
                      <CheckCircle2 className="h-8 w-8 text-green-500" />
                      <p className="text-sm text-muted-foreground">Nothing needs you right now.</p>
                    </CardContent></Card>
                  ) : (
                    <div className="space-y-3">
                      {needsYouEngagements.map((e) => (
                        <PipelineCard
                          key={e.key}
                          engagement={e}
                          contractorId={profileId!}
                          onOpenThread={setOpenEngagement}
                          onOpenEnquiry={(engagement, dialog) => engagement.enquiryRef && openEnquiryDialog(engagement.enquiryRef, dialog)}
                          onRefetch={refetchPipeline}
                        />
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Waiting on others</h3>
                  {waitingEngagements.length === 0 ? (
                    <Card><CardContent className="p-8 text-center flex flex-col items-center gap-2">
                      <Inbox className="h-8 w-8 text-muted-foreground" />
                      <p className="text-sm text-muted-foreground">Nothing waiting on others.</p>
                    </CardContent></Card>
                  ) : (
                    <div className="space-y-3">
                      {waitingEngagements.map((e) => (
                        <PipelineCard
                          key={e.key}
                          engagement={e}
                          contractorId={profileId!}
                          onOpenThread={setOpenEngagement}
                          onOpenEnquiry={(engagement, dialog) => engagement.enquiryRef && openEnquiryDialog(engagement.enquiryRef, dialog)}
                          onRefetch={refetchPipeline}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          {/* Panel Invites Tab */}
          <TabsContent value="panel-invites" className="space-y-6">
            <h2 className="font-heading text-2xl font-bold">Panel Invitations</h2>
            {profileId ? <PanelInvites profileId={profileId} /> : (
              <Card><CardContent className="p-8 text-center"><p className="text-muted-foreground">Unable to load invites — profile not found.</p></CardContent></Card>
            )}
          </TabsContent>

          {/* Panel Compliance Tab */}
          <TabsContent value="panel-compliance">
            {profileId ? <ContractorPrequalStatus profileId={profileId} /> : (
              <Card><CardContent className="p-8 text-center"><p className="text-muted-foreground">Unable to load panel compliance — profile not found.</p></CardContent></Card>
            )}
          </TabsContent>

          {/* Service Visits Tab */}
          <TabsContent value="service-visits" className="space-y-6">
            {profileId ? <ContractorServiceVisits profileId={profileId} /> : (
              <Card><CardContent className="p-8 text-center"><p className="text-muted-foreground">Unable to load service visits — profile not found.</p></CardContent></Card>
            )}
          </TabsContent>

          <TabsContent value="messages" className="h-full min-h-0">
  {profileId && <BusinessMessageInbox profileId={profileId} senderRole="contractor" />}
</TabsContent>

          {/* Enquiries Tab */}
          <TabsContent value="enquiries" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="font-heading text-2xl font-bold">Enquiries</h2>
              <Button variant="outline"><Filter className="h-4 w-4 mr-2" />Filter</Button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Card><CardContent className="p-4"><div className="flex items-center gap-2"><MessageCircle className="h-4 w-4 text-blue-500" /><div><p className="text-2xl font-bold">{enquiries.filter(e => e.status === 'new').length}</p><p className="text-sm text-muted-foreground">New</p></div></div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="flex items-center gap-2"><Eye className="h-4 w-4 text-yellow-500" /><div><p className="text-2xl font-bold">{enquiries.filter(e => e.status === 'replied').length}</p><p className="text-sm text-muted-foreground">Replied</p></div></div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="flex items-center gap-2"><Send className="h-4 w-4 text-green-500" /><div><p className="text-2xl font-bold">{enquiries.filter(e => e.status === 'converted').length}</p><p className="text-sm text-muted-foreground">Converted</p></div></div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="flex items-center gap-2"><Star className="h-4 w-4 text-purple-500" /><div><p className="text-2xl font-bold">{enquiries.length}</p><p className="text-sm text-muted-foreground">Total</p></div></div></CardContent></Card>
            </div>
            {enquiries.length === 0 ? (
              <Card><CardContent className="p-8 text-center">
                <MessageCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No Enquiries Yet</h3>
                <p className="text-muted-foreground">Enquiries assigned to you will appear here.</p>
              </CardContent></Card>
            ) : (
              <div className="space-y-4">
                {enquiries.map((enquiry) => (
                  <Card key={enquiry.id} className="hover:shadow-lg transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-lg font-semibold">{enquiry.title}</h3>
                            <Badge className={getStatusColor(enquiry.status || 'new')}>{enquiry.status}</Badge>
                          </div>
                          <p className="text-muted-foreground mb-2">{enquiry.job_description}</p>
                          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                            {enquiry.location && <span>Location: {enquiry.location}</span>}
                            {enquiry.budget_range && <span>Budget: {enquiry.budget_range}</span>}
                            {enquiry.preferred_timeline && <span>Timeline: {enquiry.preferred_timeline}</span>}
                            <span>Received: {new Date(enquiry.created_at).toLocaleDateString('en-GB')}</span>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 md:min-w-[160px]">
                          {enquiry.status !== 'converted' && enquiry.status !== 'declined' && (
                            <Button size="sm" onClick={() => openEnquiryDialog(enquiry, 'quote')}><Send className="h-3 w-3 mr-1" />Send Quote</Button>
                          )}
                          {enquiry.status !== 'converted' && enquiry.status !== 'declined' && (
                            <Button variant="outline" size="sm" onClick={() => openEnquiryDialog(enquiry, 'site_visit')}><Calendar className="h-3 w-3 mr-1" />Propose Site Visit</Button>
                          )}
                          {enquiry.status !== 'converted' && enquiry.status !== 'declined' && (
                            <Button variant="outline" size="sm" onClick={() => openEnquiryDialog(enquiry, 'respond')}><MessageSquare className="h-3 w-3 mr-1" />Request Info</Button>
                          )}
                          {(enquiry.status === 'new' || enquiry.status === 'replied') && (
                            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => openEnquiryDialog(enquiry, 'reject')}><XCircle className="h-3 w-3 mr-1" />Decline</Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Issued Quotes Tab */}
          <TabsContent value="issued-quotes" className="space-y-6">
            <IssuedQuotes profileId={profileId} />
          </TabsContent>

          <TabsContent value="invoices"><InvoiceManagement /></TabsContent>

          {/* Projects Tab */}
          <TabsContent value="projects" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="font-heading text-2xl font-bold">Project Management</h2>
              <Button onClick={() => setActiveTab("jobs")}><Plus className="h-4 w-4 mr-2" />New Job</Button>
            </div>
            {activeJobs.length === 0 ? (
              <Card><CardContent className="p-8 text-center">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No Active Projects</h3>
                <p className="text-muted-foreground">Create a job to get started.</p>
              </CardContent></Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                {activeJobs.map((job) => (
                  <Card key={job.id}>
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-lg">{job.title}</CardTitle>
                          <CardDescription>{job.contract_value ? `£${Number(job.contract_value).toLocaleString('en-GB')}` : 'Value TBC'}</CardDescription>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <Badge className={getStatusColor(job.status || '')}>{job.status}</Badge>
                          <SlaStatusPill status={(job as JobWithSla).sla_status} completionDue={(job as JobWithSla).sla_completion_due} />
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {job.start_date && <div className="flex justify-between text-sm"><span>Start:</span><span>{new Date(job.start_date).toLocaleDateString('en-GB')}</span></div>}
                      {job.end_date && <div className="flex justify-between text-sm"><span>Deadline:</span><span>{new Date(job.end_date).toLocaleDateString('en-GB')}</span></div>}
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => setActiveTab("jobs")}><Eye className="h-4 w-4 mr-2" />View</Button>
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => setActiveTab("jobs")}><Edit className="h-4 w-4 mr-2" />Edit</Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="jobs"><JobManagement /></TabsContent>

          {/* Tenders Tab */}
          <TabsContent value="tenders">
            {profileId ? <ContractorTendersView profileId={profileId} /> : (
              <Card><CardContent className="p-8 text-center"><p className="text-muted-foreground">Unable to load tenders — profile not found.</p></CardContent></Card>
            )}
          </TabsContent>

          <TabsContent value="contracts"><ContractManagement /></TabsContent>
          <TabsContent value="team"><TeamManagement /></TabsContent>
          <TabsContent value="timesheets"><TimesheetManagement /></TabsContent>
          <TabsContent value="photos"><PhotoGallery /></TabsContent>
          <TabsContent value="documents"><DocumentManagement /></TabsContent>
          <TabsContent value="financials"><FinancialsManagement /></TabsContent>
          <TabsContent value="schedule"><ScheduleManagement /></TabsContent>
          <TabsContent value="clients"><CRMManagement /></TabsContent>
          <TabsContent value="settings"><ProfileManagement /></TabsContent>
          <TabsContent value="profile"><ProfileManagement /></TabsContent>
          <TabsContent value="canvas-editor" style={{ height: "100%", padding: 0 }}><CanvasEditor /></TabsContent>
          <TabsContent value="share-profile"><ShareProfileView /></TabsContent>
          <TabsContent value="business-card-editor">
            <BusinessCardEditor tsCode="" fullName="" trade="" location="" logoUrl="" />
          </TabsContent>
          <TabsContent value="profile-editor" style={{ height: "100%", padding: 0 }}><ProfileEditor /></TabsContent>
        </Tabs>

        {activeEnquiry && (
          <>
            <SendQuoteDialog open={enquiryDialog === 'quote'} onOpenChange={(open) => { if (!open) closeEnquiryDialog(); }} enquiry={activeEnquiry} onSuccess={reloadEnquiriesAndPipeline} />
            <RespondDialog open={enquiryDialog === 'respond'} onOpenChange={(open) => { if (!open) closeEnquiryDialog(); }} enquiry={activeEnquiry} onSuccess={reloadEnquiriesAndPipeline} />
            <RejectDialog open={enquiryDialog === 'reject'} onOpenChange={(open) => { if (!open) closeEnquiryDialog(); }} enquiry={activeEnquiry} onSuccess={reloadEnquiriesAndPipeline} />
            <ProposeSiteVisitDialog open={enquiryDialog === 'site_visit'} onOpenChange={(open) => { if (!open) closeEnquiryDialog(); }} enquiry={activeEnquiry} onSuccess={reloadEnquiriesAndPipeline} />
          </>
        )}

        {profileId && (
          <EngagementThread
            engagement={openEngagement}
            contractorId={profileId}
            open={!!openEngagement}
            onClose={() => setOpenEngagement(null)}
            onChanged={refetchPipeline}
          />
        )}

        <OnboardingTour isActive={isTourActive} step={currentTourStep} currentStep={currentStep} totalSteps={totalSteps} onNext={nextStep} onPrev={prevStep} onSkip={() => endTour(true)} />
      </div>
    </ContractorLayout>
    </HelpSystemProvider>
  );
};

export default ContractorDashboard;
