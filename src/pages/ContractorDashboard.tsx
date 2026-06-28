import { useState, useEffect, useMemo } from "react";
import { QuoteScheduleNegotiation } from "@/components/recipient/QuoteScheduleNegotiation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import {
  DollarSign, Users, FileText, Clock, Plus, Eye, Edit, Send,
  Filter, MessageCircle, Star, Loader2,
  ChevronDown, ChevronUp, RefreshCw, XCircle, MessageSquare,
  AlertTriangle, Calendar, Wrench, UserCheck,
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
import { SendQuoteDialog } from "@/components/management/SendQuoteDialog";
import { RejectDialog } from "@/components/management/RejectDialog";
import { RespondDialog } from "@/components/management/RespondDialog";
import { PanelInvites } from "@/components/business/PanelInvites";
import { ContractorServiceVisits } from "@/components/business/ContractorServiceVisits";
import ShareProfileView from "@/components/contractor/ShareProfileView";
import BusinessCardEditor from "@/components/contractor/BusinessCardEditor";
import type { Database } from "@/integrations/supabase/types";

type Quote = Database["public"]["Tables"]["quotes"]["Row"];
type QuoteStatus = NonNullable<Quote["status"]>;
type Invoice = Database["public"]["Tables"]["invoices"]["Row"];

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
  budget_range: string | null;
  status: string | null;
};
type Job = Database["public"]["Tables"]["jobs"]["Row"];

interface UpcomingEvent {
  id: string;
  type: 'schedule' | 'service_visit' | 'job';
  title: string;
  subtitle: string | null;
  date: string;
  status: string;
  tab: string;
}


const fmtDate = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow';
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};

const ContractorDashboard = () => {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [enquiries, setEnquiries] = useState<any[]>([]);
  const [activeEnquiry, setActiveEnquiry] = useState<EnquiryForDialog | null>(null);
  const [enquiryDialog, setEnquiryDialog] = useState<"quote" | "reject" | "respond" | null>(null);
  const [issuedQuotes, setIssuedQuotes] = useState<any[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileIncomplete, setProfileIncomplete] = useState(false);
  const [expandedQuoteId, setExpandedQuoteId] = useState<string | null>(null);
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([]);

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
  const [recentInvoices, setRecentInvoices] = useState<Partial<Invoice>[]>([]);
  const [activeJobs, setActiveJobs] = useState<Partial<Job>[]>([]);

  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
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

  useEffect(() => {
    const loadUserAndData = async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) { navigate("/auth"); return; }
      setUser(currentUser);

      const { data: profileRow } = await supabase.from('profiles').select('id').eq('user_id', currentUser.id).maybeSingle();
      const pid = profileRow?.id ?? null;
      setProfileId(pid);

      const { data: profileData } = await supabase.from('profiles').select('trades, location, working_radius, logo_url').eq('user_id', currentUser.id).single();
      const trades = (profileData as any)?.trades;
      const hasNoTrades = !trades || !Array.isArray(trades) || trades.length === 0;
      if (profileData && (hasNoTrades || !(profileData as any).location || !(profileData as any).working_radius || !(profileData as any).logo_url)) {
        setProfileIncomplete(true);
        setActiveTab("profile");
      }

      const { data: quotesData, error: quotesError } = await supabase.from('quotes').select('*').eq('contractor_id', currentUser.id).order('created_at', { ascending: false });
      if (quotesError) console.error('Error loading quotes:', quotesError);
      else setQuotes(quotesData || []);

      const { data: enquiriesData, error: enquiriesError } = await supabase.from('enquiries')
        .select('id, title, job_description, location, status, created_at, contractor_id, customer_id, customer_name, customer_email, customer_phone, budget_range, preferred_timeline, photo_urls')
        .eq('contractor_id', currentUser.id).order('created_at', { ascending: false });
      if (enquiriesError) console.error('Error loading enquiries:', enquiriesError);
      else setEnquiries(enquiriesData || []);

      if (pid) {
        const { data: issuedQuotesData } = await supabase.from('issued_quotes')
          .select('id, quote_number, client_name, total, status, recipient_response, created_at')
          .eq('contractor_id', pid).order('created_at', { ascending: false });
        setIssuedQuotes(issuedQuotesData || []);
      }

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      // Use profileId (pid) for all FK lookups
      const contractorId = pid ?? currentUser.id;

      const [
        paidInvoicesRes, pendingInvoicesRes, overdueInvoicesRes,
        activeJobsCountRes, crmClientsRes, panelRes, serviceVisitsRes,
        scheduleEventsRes, activeJobsDataRes, recentInvoicesDataRes,
      ] = await Promise.all([
        supabase.from('invoices').select('total').eq('contractor_id', contractorId).eq('status', 'paid').gte('paid_date', startOfMonth),
        supabase.from('invoices').select('total').eq('contractor_id', contractorId).eq('status', 'pending'),
        supabase.from('invoices').select('id').eq('contractor_id', contractorId).eq('status', 'overdue'),
        supabase.from('jobs').select('id').eq('contractor_id', contractorId).in('status', ['active', 'in_progress', 'in-progress']),
        supabase.from('crm_clients').select('id').eq('contractor_id', contractorId),
        supabase.from('contractor_panel').select('id').eq('contractor_id', contractorId).eq('status', 'approved'),
        supabase.from('service_visits').select('id, asset_id, scheduled_window_end, status, company_id')
          .eq('contractor_id', contractorId)
          .in('status', ['scheduled', 'confirmed'])
          .gte('scheduled_window_end', now.toISOString())
          .order('scheduled_window_end', { ascending: true })
          .limit(5),
        supabase.from('schedule_events').select('id, title, start_time, event_type, client_name, status')
          .eq('contractor_id', contractorId)
          .gte('start_time', now.toISOString())
          .order('start_time', { ascending: true })
          .limit(5),
        supabase.from('jobs').select('id, title, status, contract_value, start_date, end_date')
          .eq('contractor_id', contractorId).in('status', ['active', 'in_progress', 'in-progress'])
          .order('created_at', { ascending: false }).limit(3),
        supabase.from('invoices').select('id, invoice_number, client_name, total, status, due_date, issued_date')
          .eq('contractor_id', contractorId).order('created_at', { ascending: false }).limit(3),
      ]);

      setDashboardData({
        monthlyRevenue: paidInvoicesRes.data?.reduce((sum, inv) => sum + (inv.total || 0), 0) ?? 0,
        activeJobs: activeJobsCountRes.data?.length ?? 0,
        pendingInvoicesTotal: pendingInvoicesRes.data?.reduce((sum, inv) => sum + (inv.total || 0), 0) ?? 0,
        pendingInvoicesCount: pendingInvoicesRes.data?.length ?? 0,
        overdueInvoicesCount: overdueInvoicesRes.data?.length ?? 0,
        clientCount: crmClientsRes.data?.length ?? 0,
        panelCount: panelRes.data?.length ?? 0,
        upcomingVisits: serviceVisitsRes.data?.length ?? 0,
      });

      setActiveJobs(activeJobsDataRes.data || []);
      setRecentInvoices(recentInvoicesDataRes.data || []);

      // Build upcoming events list — merge schedule events + service visits
      const events: UpcomingEvent[] = [];

      // Schedule events
      for (const ev of scheduleEventsRes.data ?? []) {
        events.push({
          id: ev.id,
          type: 'schedule',
          title: ev.title,
          subtitle: ev.client_name,
          date: ev.start_time,
          status: ev.status,
          tab: 'schedule',
        });
      }

      // Service visits — hydrate asset names
      if (serviceVisitsRes.data?.length) {
        const assetIds = [...new Set(serviceVisitsRes.data.map(v => v.asset_id))];
        const { data: assetsData } = await supabase.from('assets').select('id, name').in('id', assetIds);
        for (const v of serviceVisitsRes.data) {
          const assetName = assetsData?.find(a => a.id === v.asset_id)?.name ?? 'Service Visit';
          events.push({
            id: v.id,
            type: 'service_visit',
            title: assetName,
            subtitle: `Due by ${new Date(v.scheduled_window_end).toLocaleDateString('en-GB')}`,
            date: v.scheduled_window_end,
            status: v.status,
            tab: 'service-visits',
          });
        }
      }

      // Sort chronologically and take top 7
      events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setUpcomingEvents(events.slice(0, 7));

      setLoading(false);
    };
    loadUserAndData();
  }, [navigate]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel('new-quotes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'quotes', filter: `contractor_id=eq.${user.id}` },
        (payload) => {
          setQuotes((prev) => [payload.new as Quote, ...prev]);
          toast({ title: "New Quote Request!", description: `${(payload.new as Quote).customer_name} has sent a quote request.` });
        }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, toast]);

  const reloadEnquiries = async () => {
    if (!user) return;
    const { data } = await supabase.from('enquiries')
      .select('id, title, job_description, location, status, created_at, contractor_id, customer_id, customer_name, customer_email, customer_phone, budget_range, preferred_timeline, photo_urls')
      .eq('contractor_id', user.id).order('created_at', { ascending: false });
    setEnquiries(data || []);
  };

  const openEnquiryDialog = (enquiry: any, dialog: "quote" | "reject" | "respond") => { setActiveEnquiry(enquiry as EnquiryForDialog); setEnquiryDialog(dialog); };
  const closeEnquiryDialog = () => { setEnquiryDialog(null); setActiveEnquiry(null); };

  const updateQuoteStatus = async (quoteId: string, newStatus: QuoteStatus) => {
    try {
      const { error } = await supabase.from('quotes').update({ status: newStatus }).eq('id', quoteId);
      if (error) throw error;
      setQuotes(prev => prev.map(q => q.id === quoteId ? { ...q, status: newStatus } : q));
      toast({ title: "Quote Updated", description: `Quote status updated to ${newStatus}` });
    } catch (error) {
      toast({ title: "Error", description: "Failed to update quote status", variant: "destructive" });
    }
  };

  const dashboardStats = [
    {
      title: "Monthly Revenue",
      value: `£${dashboardData.monthlyRevenue.toLocaleString('en-GB', { minimumFractionDigits: 0 })}`,
      change: "Paid invoices this month",
      icon: DollarSign,
      trend: "up",
      onClick: () => setActiveTab("invoices"),
    },
    {
      title: "Active Jobs",
      value: `${dashboardData.activeJobs}`,
      change: "Currently in progress",
      icon: FileText,
      trend: "up",
      onClick: () => setActiveTab("jobs"),
    },
    {
      title: "Invoices",
      value: `£${dashboardData.pendingInvoicesTotal.toLocaleString('en-GB', { minimumFractionDigits: 0 })}`,
      change: `${dashboardData.pendingInvoicesCount} pending${dashboardData.overdueInvoicesCount > 0 ? ` · ${dashboardData.overdueInvoicesCount} overdue` : ''}`,
      icon: dashboardData.overdueInvoicesCount > 0 ? AlertTriangle : Clock,
      trend: dashboardData.overdueInvoicesCount > 0 ? "danger" : "warning",
      onClick: () => setActiveTab("invoices"),
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

  const getEventTypeConfig = (type: UpcomingEvent['type']) => {
    switch (type) {
      case 'service_visit': return { label: 'Service Visit', colour: 'bg-orange-100 text-orange-800', icon: Wrench };
      case 'schedule': return { label: 'Scheduled', colour: 'bg-blue-100 text-blue-800', icon: Calendar };
      case 'job': return { label: 'Job', colour: 'bg-green-100 text-green-800', icon: FileText };
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
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">

          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-8">
            {profileId && <PanelInvites profileId={profileId} />}

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

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Upcoming events */}
              <Card className="lg:col-span-1">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center justify-between">
                    <span className="flex items-center gap-2"><Calendar className="h-4 w-4" />Upcoming</span>
                    <Button variant="ghost" size="sm" className="text-xs" onClick={() => setActiveTab("schedule")}>View all</Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {upcomingEvents.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">Nothing scheduled</p>
                  ) : (
                    <div className="space-y-3">
                      {upcomingEvents.map(event => {
                        const cfg = getEventTypeConfig(event.type);
                        const Icon = cfg.icon;
                        return (
                          <div key={`${event.type}-${event.id}`}
                            className="flex items-start gap-3 cursor-pointer hover:bg-muted/50 rounded-lg p-2 -mx-2 transition-colors"
                            onClick={() => setActiveTab(event.tab)}>
                            <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                              <Icon className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium truncate">{event.title}</p>
                              {event.subtitle && <p className="text-xs text-muted-foreground truncate">{event.subtitle}</p>}
                              <p className="text-xs text-primary font-medium mt-0.5">{fmtDate(event.date)}</p>
                            </div>
                            <Badge className={`text-xs shrink-0 ${cfg.colour}`}>{cfg.label}</Badge>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Recent invoices + Active jobs */}
              <div className="lg:col-span-2 space-y-6">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center justify-between">
                      Recent Invoices
                      <Button variant="outline" size="sm" onClick={() => setActiveTab("invoices")}><Plus className="h-4 w-4 mr-2" />New</Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {recentInvoices.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">No invoices yet</p>
                      ) : recentInvoices.map((invoice) => (
                        <div key={invoice.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div>
                            <p className="font-medium text-sm">{invoice.invoice_number || `#${invoice.id?.slice(0, 8)}`}</p>
                            <p className="text-xs text-muted-foreground">{invoice.client_name}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium text-sm">£{Number(invoice.total ?? 0).toLocaleString('en-GB')}</p>
                            <Badge className={`text-xs ${getStatusColor(invoice.status || '')}`}>{invoice.status}</Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center justify-between">
                      Active Jobs
                      <Button variant="outline" size="sm" onClick={() => setActiveTab("jobs")}><Plus className="h-4 w-4 mr-2" />New</Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {activeJobs.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">No active jobs yet</p>
                      ) : activeJobs.map((job) => (
                        <div key={job.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div>
                            <p className="font-medium text-sm">{job.title}</p>
                            <p className="text-xs text-muted-foreground">{job.contract_value ? `£${Number(job.contract_value).toLocaleString('en-GB')}` : 'Value TBC'}</p>
                          </div>
                          <div className="text-right">
                            <Badge className={`text-xs ${getStatusColor(job.status || '')}`}>{job.status}</Badge>
                            {job.end_date && <p className="text-xs text-muted-foreground mt-1">Due {new Date(job.end_date).toLocaleDateString('en-GB')}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Panel Invites Tab */}
          <TabsContent value="panel-invites" className="space-y-6">
            <h2 className="font-heading text-2xl font-bold">Panel Invitations</h2>
            {profileId ? <PanelInvites profileId={profileId} /> : (
              <Card><CardContent className="p-8 text-center"><p className="text-muted-foreground">Unable to load invites — profile not found.</p></CardContent></Card>
            )}
          </TabsContent>

          {/* Service Visits Tab */}
          <TabsContent value="service-visits" className="space-y-6">
            {profileId ? <ContractorServiceVisits profileId={profileId} /> : (
              <Card><CardContent className="p-8 text-center"><p className="text-muted-foreground">Unable to load service visits — profile not found.</p></CardContent></Card>
            )}
          </TabsContent>

          <TabsContent value="messages" className="space-y-6">
  <div>
    <h2 className="text-2xl font-bold tracking-tight" style={{ fontFamily: "Lexend, sans-serif", color: "#1e2d4a" }}>
      Messages
    </h2>
    <p className="text-muted-foreground text-sm mt-1">
      All conversations with your clients in one place
    </p>
  </div>
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
                          {enquiry.status !== 'converted' && enquiry.status !== 'archived' && (
                            <Button size="sm" onClick={() => openEnquiryDialog(enquiry, 'quote')}><Send className="h-3 w-3 mr-1" />Send Quote</Button>
                          )}
                          {enquiry.status !== 'converted' && enquiry.status !== 'archived' && (
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
            {activeEnquiry && (
              <>
                <SendQuoteDialog open={enquiryDialog === 'quote'} onOpenChange={(open) => { if (!open) closeEnquiryDialog(); }} enquiry={activeEnquiry} onSuccess={reloadEnquiries} />
                <RespondDialog open={enquiryDialog === 'respond'} onOpenChange={(open) => { if (!open) closeEnquiryDialog(); }} enquiry={activeEnquiry} onSuccess={reloadEnquiries} />
                <RejectDialog open={enquiryDialog === 'reject'} onOpenChange={(open) => { if (!open) closeEnquiryDialog(); }} enquiry={activeEnquiry} onSuccess={reloadEnquiries} />
              </>
            )}
          </TabsContent>

          {/* Issued Quotes Tab */}
          <TabsContent value="issued-quotes" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="font-heading text-2xl font-bold">Issued Quotes</h2>
              <Button variant="outline" onClick={async () => {
                if (!profileId) return;
                const { data } = await supabase.from('issued_quotes').select('id, quote_number, client_name, total, status, recipient_response, created_at').eq('contractor_id', profileId).order('created_at', { ascending: false });
                setIssuedQuotes(data || []);
              }}><RefreshCw className="h-4 w-4 mr-2" />Refresh</Button>
            </div>
            {issuedQuotes.length === 0 ? (
              <Card><CardContent className="p-8 text-center">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No Issued Quotes Yet</h3>
                <p className="text-muted-foreground">Quotes you send to clients will appear here.</p>
              </CardContent></Card>
            ) : (
              <Card><CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium">Quote #</th>
                      <th className="text-left p-3 font-medium">Total</th>
                      <th className="text-left p-3 font-medium">Status</th>
                      <th className="text-left p-3 font-medium">Response</th>
                      <th className="text-left p-3 font-medium">Date Sent</th>
                      <th className="text-left p-3 font-medium">Schedule</th>
                    </tr></thead>
                    <tbody>
                      {issuedQuotes.map((iq) => (
                        <>
                          <tr key={iq.id} className="border-b hover:bg-muted/30">
                            <td className="p-3">{iq.quote_number || `#${iq.id.slice(0, 8)}`}</td>
                            <td className="p-3">£{Number(iq.total ?? 0).toLocaleString('en-GB')}</td>
                            <td className="p-3"><Badge className={getStatusColor(iq.status || '')}>{iq.status}</Badge></td>
                            <td className="p-3">{iq.recipient_response ? (
                              <Badge className={iq.recipient_response === 'accepted' ? 'bg-green-100 text-green-800' : iq.recipient_response === 'declined' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'}>{iq.recipient_response}</Badge>
                            ) : <span className="text-muted-foreground">—</span>}</td>
                            <td className="p-3">{new Date(iq.created_at).toLocaleDateString('en-GB')}</td>
                            <td className="p-3">{iq.recipient_response === 'accepted' && (
                              <Button variant="ghost" size="sm" onClick={() => setExpandedQuoteId(expandedQuoteId === iq.id ? null : iq.id)}>
                                {expandedQuoteId === iq.id ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                              </Button>
                            )}</td>
                          </tr>
                          {expandedQuoteId === iq.id && (
                            <tr key={`${iq.id}-schedule`}>
                              <td colSpan={7} className="p-4 bg-muted/20">
                                <QuoteScheduleNegotiation quoteId={iq.id} contractorId={profileId} mode="contractor" />
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent></Card>
            )}
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
                        <Badge className={getStatusColor(job.status || '')}>{job.status}</Badge>
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

        <OnboardingTour isActive={isTourActive} step={currentTourStep} currentStep={currentStep} totalSteps={totalSteps} onNext={nextStep} onPrev={prevStep} onSkip={() => endTour(true)} />
      </div>
    </ContractorLayout>
    </HelpSystemProvider>
  );
};

export default ContractorDashboard;
