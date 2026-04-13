import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  DollarSign,
  Users,
  FileText,
  Clock,
  Plus,
  Eye,
  Edit,
  Send,
  MessageCircle,
  Star,
  Hammer,
  HelpCircle,
  AlertCircle,
  MapPin,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { useOnboardingTour, type TourStep } from "@/hooks/useOnboardingTour";
import { OnboardingTour } from "@/components/OnboardingTour";
import type { User } from "@supabase/supabase-js";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import { StripeConnect } from "@/components/management/StripeConnect";
import { ProfileManagement } from "@/components/management/ProfileManagement";
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
import { RespondDialog } from "@/components/management/RespondDialog";
import { RejectDialog } from "@/components/management/RejectDialog";
import type { Database } from "@/integrations/supabase/types";
import { EmptyState, ErrorState, LoadingState } from "@/components/AsyncState";

type Quote = Database["public"]["Tables"]["quotes"]["Row"];
type Invoice = Database["public"]["Tables"]["invoices"]["Row"];
type Job = Database["public"]["Tables"]["jobs"]["Row"];
type Enquiry = {
  id: string;
  contractor_id: string | null;
  customer_id: string | null;
  customer_name: string | null;
  customer_ts_code: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  job_description: string;
  location: string;
  preferred_timeline: string | null;
  budget_range: string | null;
  status: string | null;
  created_at: string;
};

const contractorDashboardViews = [
  { value: "dashboard", label: "Dashboard" },
  { value: "quotes", label: "Quotes" },
  { value: "jobs", label: "Jobs" },
  { value: "invoices", label: "Invoices" },
  { value: "projects", label: "Projects" },
  { value: "contracts", label: "Contracts" },
  { value: "team", label: "Team" },
  { value: "timesheets", label: "Timesheets" },
  { value: "photos", label: "Photos" },
  { value: "documents", label: "Documents" },
  { value: "financials", label: "Financials" },
  { value: "schedule", label: "Schedule" },
  { value: "clients", label: "CRM" },
  { value: "profile", label: "Profile" },
] as const;

const ContractorDashboard = () => {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileIncomplete, setProfileIncomplete] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [enquiries, setEnquiries] = useState<Enquiry[]>([]);
  const [enquiriesLoading, setEnquiriesLoading] = useState(false);
  const [enquiriesError, setEnquiriesError] = useState<string | null>(null);
  const [sendQuoteEnquiry, setSendQuoteEnquiry] = useState<Enquiry | null>(null);
  const [respondEnquiry, setRespondEnquiry] = useState<Enquiry | null>(null);
  const [rejectEnquiry, setRejectEnquiry] = useState<Enquiry | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [dashboardData, setDashboardData] = useState({
    monthlyRevenue: 0,
    activeJobs: 0,
    pendingInvoicesTotal: 0,
    pendingInvoicesCount: 0,
    clientCount: 0,
  });
  const [recentInvoices, setRecentInvoices] = useState<Partial<Invoice>[]>([]);
  const [activeJobs, setActiveJobs] = useState<Partial<Job>[]>([]);

  const { toast } = useToast();
  const navigate = useNavigate();

  const loadEnquiries = async (contractorId: string) => {
    setEnquiriesLoading(true);
    setEnquiriesError(null);

    const { data, error } = await supabase
      .from("enquiries")
      .select("id, contractor_id, customer_id, customer_name, customer_email, customer_phone, job_description, location, preferred_timeline, budget_range, status, created_at")
      .eq("contractor_id", contractorId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading enquiries:", error);
      setEnquiriesError("Unable to load enquiries right now. Please try again.");
      setEnquiries([]);
      setEnquiriesLoading(false);
      return;
    }

    // Enrich with customer TS codes
    const enriched = await Promise.all((data ?? []).map(async (enquiry: any) => {
      if (!enquiry.customer_id) return enquiry;
      const { data: profile } = await supabase
        .from("profiles")
        .select("ts_profile_code")
        .eq("id", enquiry.customer_id)
        .maybeSingle();
      return { ...enquiry, customer_ts_code: profile?.ts_profile_code ?? null };
    }));

    setEnquiries(enriched as Enquiry[]);
    setEnquiriesLoading(false);
  };

  const tourSteps: TourStep[] = useMemo(() => [
    {
      target: '[data-tour="dashboard-header"]',
      title: "Welcome to Your Dashboard!",
      description: "This is your command centre. Get an overview of your revenue, projects, invoices, and clients all in one place.",
      placement: "bottom",
    },
    {
      target: '[data-tour="tab-quotes"]',
      title: "Quote Requests",
      description: "Receive and manage quote requests from potential clients. Track their status and respond quickly to win more work.",
      placement: "bottom",
      action: () => setActiveTab("quotes"),
    },
    {
      target: '[data-tour="tab-invoices"]',
      title: "Invoice Management",
      description: "Create professional invoices, track payments, and manage your cash flow. Send invoices directly to clients.",
      placement: "bottom",
      action: () => setActiveTab("invoices"),
    },
    {
      target: '[data-tour="tab-contracts"]',
      title: "Contracts",
      description: "Manage your active contracts, track milestones, and keep all your agreements organised in one place.",
      placement: "bottom",
      action: () => setActiveTab("contracts"),
    },
    {
      target: '[data-tour="tab-team"]',
      title: "Team Management",
      description: "Add team members, manage roles, and set hourly rates. Keep your crew organised and track their assignments.",
      placement: "bottom",
      action: () => setActiveTab("team"),
    },
    {
      target: '[data-tour="tab-schedule"]',
      title: "Schedule & Calendar",
      description: "Plan your jobs, set availability, and manage appointments. Never double-book again with the built-in calendar.",
      placement: "bottom",
      action: () => setActiveTab("schedule"),
    },
    {
      target: '[data-tour="tab-clients"]',
      title: "Client CRM",
      description: "Build your client database, track interactions, and nurture relationships. Your clients are your business — keep them close.",
      placement: "bottom",
      action: () => setActiveTab("clients"),
    },
    {
      target: '[data-tour="tab-financials"]',
      title: "Financial Tracking",
      description: "Track income and expenses, categorise spending, and get a clear picture of your business finances.",
      placement: "bottom",
      action: () => setActiveTab("financials"),
    },
    {
      target: '[data-tour="tab-profile"]',
      title: "Your Profile",
      description: "Complete your profile to appear in the contractor directory. Add your skills, portfolio, and contact details to attract clients.",
      placement: "bottom",
      action: () => setActiveTab("profile"),
    },
  ], []);

  const {
    isActive: isTourActive,
    currentStep,
    totalSteps,
    step: currentTourStep,
    startTour,
    endTour,
    nextStep,
    prevStep,
  } = useOnboardingTour(tourSteps);

  useEffect(() => {
    const loadUserAndData = async () => {
      setLoadError(null);
      const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser();

      if (userError) {
        setLoadError("Unable to validate your account.");
        setLoading(false);
        return;
      }

      if (!currentUser) {
        navigate("/login");
        return;
      }

      setUser(currentUser);

      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('trades, location, working_radius, logo_url, user_type')
        .eq('user_id', currentUser.id)
        .single();

      if (profileError) {
        setLoadError("Unable to load your profile.");
        setLoading(false);
        return;
      }

      if (profileData?.user_type && profileData.user_type !== "contractor") {
        navigate(`/dashboard/${profileData.user_type}`);
        return;
      }

      const trades = (profileData as any)?.trades;
      const hasNoTrades = !trades || !Array.isArray(trades) || trades.length === 0;
      if (profileData && (hasNoTrades || !(profileData as any).location || !(profileData as any).working_radius || !(profileData as any).logo_url)) {
        setProfileIncomplete(true);
        setActiveTab("profile");
      }

      const { data: quotesData, error: quotesError } = await supabase
        .from('quotes')
        .select('*')
        .eq('contractor_id', currentUser.id)
        .order('created_at', { ascending: false });

      if (quotesError) {
        console.error('Error loading quotes:', quotesError);
      } else {
        setQuotes(quotesData || []);
      }

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      const { data: paidInvoices, error: paidInvoicesError } = await supabase
        .from('invoices')
        .select('total')
        .eq('contractor_id', currentUser.id)
        .eq('status', 'paid')
        .gte('paid_date', startOfMonth);

      const { data: pendingInvoices, error: pendingInvoicesError } = await supabase
        .from('invoices')
        .select('total')
        .eq('contractor_id', currentUser.id)
        .eq('status', 'pending');

      const { data: activeJobsCount, error: activeJobsCountError } = await supabase
        .from('jobs')
        .select('id')
        .eq('contractor_id', currentUser.id)
        .in('status', ['active', 'in_progress', 'in-progress']);

      const { data: crmClients, error: crmClientsError } = await supabase
        .from('crm_clients')
        .select('id')
        .eq('contractor_id', currentUser.id);

      if (paidInvoicesError || pendingInvoicesError || activeJobsCountError || crmClientsError) {
        console.error('Error loading dashboard metrics', { paidInvoicesError, pendingInvoicesError, activeJobsCountError, crmClientsError });
        setLoadError('Unable to load dashboard metrics. Please try again.');
        setLoading(false);
        return;
      }

      setDashboardData({
        monthlyRevenue: paidInvoices?.reduce((sum, inv) => sum + (inv.total || 0), 0) ?? 0,
        activeJobs: activeJobsCount?.length ?? 0,
        pendingInvoicesTotal: pendingInvoices?.reduce((sum, inv) => sum + (inv.total || 0), 0) ?? 0,
        pendingInvoicesCount: pendingInvoices?.length ?? 0,
        clientCount: crmClients?.length ?? 0,
      });

      const { data: recentInvoicesData, error: recentInvoicesError } = await supabase
        .from('invoices')
        .select('id, invoice_number, client_name, total, status, due_date, issued_date')
        .eq('contractor_id', currentUser.id)
        .order('created_at', { ascending: false })
        .limit(3);

      if (recentInvoicesError) {
        console.error('Error loading recent invoices', recentInvoicesError);
      }
      setRecentInvoices(recentInvoicesData || []);

      const { data: activeJobsData, error: activeJobsError } = await supabase
        .from('jobs')
        .select('id, title, status, contract_value, start_date, end_date')
        .eq('contractor_id', currentUser.id)
        .in('status', ['active', 'in_progress', 'in-progress'])
        .order('created_at', { ascending: false })
        .limit(3);

      if (activeJobsError) {
        console.error('Error loading active jobs', activeJobsError);
      }
      setActiveJobs(activeJobsData || []);
      const { data: profileRow } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', currentUser.id)
        .single();
      setProfileId(profileRow?.id ?? null);
      if (profileRow?.id) await loadEnquiries(profileRow.id);
      setLoading(false);
    };

    loadUserAndData();
  }, [navigate]);

  useEffect(() => {
    if (!user || !profileId) return;

    const quotesChannel = supabase
      .channel('new-quotes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'quotes',
          filter: `contractor_id=eq.${profileId}`,
        },
        (payload) => {
          setQuotes((prev) => [payload.new as Quote, ...prev]);
          toast({
            title: "New Quote Request!",
            description: `${(payload.new as Quote).customer_name} has sent a quote request.`,
          });
        }
      )
      .subscribe();

    const enquiriesChannel = supabase
      .channel('new-enquiries')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'enquiries',
        },
        (payload) => {
          const inserted = payload.new as Enquiry;
          if (inserted.contractor_id !== profileId) return;

          setEnquiries((prev) => {
            if (prev.some((entry) => entry.id === inserted.id)) return prev;
            return [inserted, ...prev];
          });

          toast({
            title: "New enquiry received",
            description: `${inserted.customer_name ?? "A customer"} — ${inserted.location}.`,
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(quotesChannel);
      supabase.removeChannel(enquiriesChannel);
    };
  }, [user, profileId, toast]);

  const dashboardStats = [
    {
      title: "Monthly Revenue",
      value: `£${dashboardData.monthlyRevenue.toLocaleString('en-GB')}`,
      change: "Paid invoices this month",
      icon: DollarSign,
      trend: "up",
    },
    {
      title: "Active Jobs",
      value: `${dashboardData.activeJobs}`,
      change: "Currently in progress",
      icon: FileText,
      trend: "up",
    },
    {
      title: "Pending Invoices",
      value: `£${dashboardData.pendingInvoicesTotal.toLocaleString('en-GB')}`,
      change: `${dashboardData.pendingInvoicesCount} invoice${dashboardData.pendingInvoicesCount !== 1 ? 's' : ''} outstanding`,
      icon: Clock,
      trend: "warning",
    },
    {
      title: "Clients",
      value: `${dashboardData.clientCount}`,
      change: "In your CRM",
      icon: Users,
      trend: "up",
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "new": return "bg-blue-100 text-blue-800";
      case "replied": return "bg-yellow-100 text-yellow-800";
      case "converted": return "bg-green-100 text-green-800";
      case "archived": return "bg-gray-100 text-gray-800";
      case "declined": return "bg-red-100 text-red-800";
      case "paid": return "bg-green-100 text-green-800";
      case "pending": return "bg-yellow-100 text-yellow-800";
      case "overdue": return "bg-red-100 text-red-800";
      case "active":
      case "in_progress":
      case "in-progress": return "bg-blue-100 text-blue-800";
      case "completed": return "bg-green-100 text-green-800";
      case "cancelled": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <LoadingState message="Loading your contractor dashboard..." />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <ErrorState message={loadError} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Hammer className="h-8 w-8 text-primary" />
              <h1 className="text-3xl font-bold" data-tour="dashboard-header">Contractor Dashboard</h1>
            </div>
            <Button variant="outline" size="sm" onClick={() => { setActiveTab("dashboard"); startTour(); }}>
              <HelpCircle className="h-4 w-4 mr-2" />
              Take Tour
            </Button>
          </div>
          <p className="text-muted-foreground">
            Manage your contracting business with powerful tools designed for professionals.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
          {activeTab === "dashboard" && quotes.length === 0 && activeJobs.length === 0 && recentInvoices.length === 0 ? (
            <EmptyState
              message="No quotes, jobs, or invoices yet. Complete your profile and start bidding to receive work."
              ctaLabel="Complete profile"
              onCta={() => setActiveTab("profile")}
            />
          ) : null}
          <div className="max-w-sm" data-tour={`tab-${activeTab}`}>
            <label htmlFor="contractor-dashboard-view" className="mb-2 block text-sm font-medium text-muted-foreground">
              View
            </label>
            <Select value={activeTab} onValueChange={setActiveTab}>
              <SelectTrigger id="contractor-dashboard-view" className="w-full">
                <SelectValue placeholder="Select a view" />
              </SelectTrigger>
              <SelectContent>
                {contractorDashboardViews.map((view) => (
                  <SelectItem key={view.value} value={view.value}>
                    {view.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-8">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {dashboardStats.map((stat, index) => (
                <Card key={index}>
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                    <stat.icon className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stat.value}</div>
                    <p className={`text-xs ${stat.trend === 'up' ? 'text-green-600' : stat.trend === 'warning' ? 'text-yellow-600' : 'text-muted-foreground'}`}>
                      {stat.change}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    Recent Invoices
                    <Button variant="outline" size="sm" onClick={() => setActiveTab("invoices")}>
                      <Plus className="h-4 w-4 mr-2" />New Invoice
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {recentInvoices.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">No invoices yet</p>
                    ) : (
                      recentInvoices.map((invoice) => (
                        <div key={invoice.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div>
                            <p className="font-medium">{invoice.invoice_number || `#${invoice.id?.slice(0, 8)}`}</p>
                            <p className="text-sm text-muted-foreground">{invoice.client_name}</p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium">£{Number(invoice.total ?? 0).toLocaleString('en-GB')}</p>
                            <Badge className={getStatusColor(invoice.status || '')}>{invoice.status}</Badge>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    Active Jobs
                    <Button variant="outline" size="sm" onClick={() => setActiveTab("jobs")}>
                      <Plus className="h-4 w-4 mr-2" />New Job
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {activeJobs.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">No active jobs yet</p>
                    ) : (
                      activeJobs.map((job) => (
                        <div key={job.id} className="p-3 border rounded-lg">
                          <div className="flex justify-between items-start mb-1">
                            <div>
                              <p className="font-medium">{job.title}</p>
                              <p className="text-sm text-muted-foreground">
                                {job.contract_value ? `£${Number(job.contract_value).toLocaleString('en-GB')}` : 'Value TBC'}
                              </p>
                            </div>
                            <Badge className={getStatusColor(job.status || '')}>{job.status}</Badge>
                          </div>
                          {job.end_date && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Due: {new Date(job.end_date).toLocaleDateString('en-GB')}
                            </p>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Quotes Tab */}
          <TabsContent value="quotes" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">New Enquiries</h2>
              <Button variant="outline" onClick={() => profileId && loadEnquiries(profileId)} disabled={enquiriesLoading}>
                {enquiriesLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Refresh
              </Button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Card><CardContent className="p-4"><div className="flex items-center gap-2"><MessageCircle className="h-4 w-4 text-blue-500" /><div><p className="text-2xl font-bold">{enquiries.filter((entry) => entry.status === 'new').length}</p><p className="text-sm text-muted-foreground">New</p></div></div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="flex items-center gap-2"><Eye className="h-4 w-4 text-yellow-500" /><div><p className="text-2xl font-bold">{enquiries.filter((entry) => entry.status === 'replied').length}</p><p className="text-sm text-muted-foreground">Replied</p></div></div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="flex items-center gap-2"><Send className="h-4 w-4 text-green-500" /><div><p className="text-2xl font-bold">{enquiries.filter((entry) => entry.status === 'converted').length}</p><p className="text-sm text-muted-foreground">Converted</p></div></div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="flex items-center gap-2"><Star className="h-4 w-4 text-purple-500" /><div><p className="text-2xl font-bold">{enquiries.length}</p><p className="text-sm text-muted-foreground">Total</p></div></div></CardContent></Card>
            </div>

            {enquiriesLoading ? (
              <Card><CardContent className="p-8 text-center text-muted-foreground"><Loader2 className="h-10 w-10 mx-auto mb-4 animate-spin" /><p>Loading enquiries...</p></CardContent></Card>
            ) : enquiriesError ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Could not load enquiries</AlertTitle>
                <AlertDescription>{enquiriesError}</AlertDescription>
              </Alert>
            ) : enquiries.length === 0 ? (
              <Card><CardContent className="p-8 text-center"><MessageCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" /><h3 className="text-lg font-medium mb-2">No Enquiries Yet</h3><p className="text-muted-foreground">New enquiries assigned to you will appear here in real time.</p></CardContent></Card>
            ) : (
              <div className="space-y-4">
                {enquiries.map((enquiry) => (
                  <Card key={enquiry.id} className="hover:shadow-lg transition-shadow">
                    <CardContent className="p-6">
                   <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-lg font-semibold">{enquiry.customer_name ?? "Unknown"}</h3>
                            {enquiry.customer_ts_code && (
                              <span className="text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">{enquiry.customer_ts_code}</span>
                            )}
                            <Badge className={getStatusColor(enquiry.status ?? 'new')}>{enquiry.status ?? 'new'}</Badge>
                          </div>
                          <p className="text-muted-foreground mb-2 line-clamp-2">{enquiry.job_description}</p>
                          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                            {enquiry.preferred_timeline ? <span>Timeline: {enquiry.preferred_timeline}</span> : null}
                            {enquiry.budget_range ? <span>Budget: {enquiry.budget_range}</span> : null}
                            <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{enquiry.location}</span>
                            <span>Received: {new Date(enquiry.created_at).toLocaleString('en-GB')}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-4">
                        <Button size="sm" onClick={() => setSendQuoteEnquiry(enquiry)}>
                          Accept & Quote
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setRespondEnquiry(enquiry)}>
                          Respond
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setRejectEnquiry(enquiry)}>
                          Reject
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="invoices"><InvoiceManagement /></TabsContent>

          {/* Projects Tab */}
          <TabsContent value="projects" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Project Management</h2>
              <Button onClick={() => setActiveTab("jobs")}><Plus className="h-4 w-4 mr-2" />New Job</Button>
            </div>
            {activeJobs.length === 0 ? (
              <Card><CardContent className="p-8 text-center"><FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" /><h3 className="text-lg font-medium mb-2">No Active Projects</h3><p className="text-muted-foreground">Create a job to get started.</p></CardContent></Card>
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

          {/* Profile Tab — StripeConnect added here */}
          <TabsContent value="profile">
            <div className="space-y-6">
              <StripeConnect />
              <ProfileManagement />
            </div>
          </TabsContent>
        </Tabs>

        <OnboardingTour
          isActive={isTourActive}
          step={currentTourStep}
          currentStep={currentStep}
          totalSteps={totalSteps}
          onNext={nextStep}
          onPrev={prevStep}
          onSkip={() => endTour(true)}
        />
        {sendQuoteEnquiry && (
          <SendQuoteDialog
            open={!!sendQuoteEnquiry}
            onOpenChange={(open) => { if (!open) setSendQuoteEnquiry(null); }}
            enquiry={sendQuoteEnquiry}
            onSuccess={() => profileId && loadEnquiries(profileId)}
          />
        )}
        {respondEnquiry && (
          <RespondDialog
            open={!!respondEnquiry}
            onOpenChange={(open) => { if (!open) setRespondEnquiry(null); }}
            enquiry={respondEnquiry}
            onSuccess={() => profileId && loadEnquiries(profileId)}
          />
        )}
        {rejectEnquiry && (
          <RejectDialog
            open={!!rejectEnquiry}
            onOpenChange={(open) => { if (!open) setRejectEnquiry(null); }}
            enquiry={rejectEnquiry}
            onSuccess={() => profileId && loadEnquiries(profileId)}
          />
        )}
      </main>
    </div>
  );
};

export default ContractorDashboard;
