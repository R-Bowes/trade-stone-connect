import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  DollarSign,
  Users,
  FileText,
  Clock,
  Plus,
  Eye,
  Edit,
  Send,
  Filter,
  MessageCircle,
  Star,
  Loader2,
  Hammer,
  HelpCircle
} from "lucide-react";
import { useOnboardingTour, type TourStep } from "@/hooks/useOnboardingTour";
import { OnboardingTour } from "@/components/OnboardingTour";
import type { User } from "@supabase/supabase-js";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
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
import type { Database } from "@/integrations/supabase/types";

type Quote = Database["public"]["Tables"]["quotes"]["Row"];
type QuoteStatus = NonNullable<Quote["status"]>;
type Invoice = Database["public"]["Tables"]["invoices"]["Row"];
type Job = Database["public"]["Tables"]["jobs"]["Row"];

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

  // Real dashboard data
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

  // Load current user, quotes, and real dashboard stats
  useEffect(() => {
    const loadUserAndData = async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser();

      if (!currentUser) {
        navigate("/auth");
        return;
      }

      setUser(currentUser);

      // Check profile completeness
      const { data: profileData } = await supabase
        .from('profiles')
        .select('trades, location, working_radius, logo_url')
        .eq('user_id', currentUser.id)
        .single();

      const trades = (profileData as any)?.trades;
      const hasNoTrades = !trades || !Array.isArray(trades) || trades.length === 0;
      if (profileData && (hasNoTrades || !(profileData as any).location || !(profileData as any).working_radius || !(profileData as any).logo_url)) {
        setProfileIncomplete(true);
        setActiveTab("profile");
      }

      // Load quotes
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

      // --- Real dashboard stats ---

      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      // Monthly revenue: paid invoices with a paid_date this month
      const { data: paidInvoices } = await supabase
        .from('invoices')
        .select('total')
        .eq('contractor_id', currentUser.id)
        .eq('status', 'paid')
        .gte('paid_date', startOfMonth);

      // Pending invoices
      const { data: pendingInvoices } = await supabase
        .from('invoices')
        .select('total')
        .eq('contractor_id', currentUser.id)
        .eq('status', 'pending');

      // Active jobs
      const { data: activeJobsCount } = await supabase
        .from('jobs')
        .select('id')
        .eq('contractor_id', currentUser.id)
        .in('status', ['active', 'in_progress', 'in-progress']);

      // CRM clients
      const { data: crmClients } = await supabase
        .from('crm_clients')
        .select('id')
        .eq('contractor_id', currentUser.id);

      const monthlyRevenue = paidInvoices?.reduce((sum, inv) => sum + (inv.total || 0), 0) ?? 0;
      const pendingTotal = pendingInvoices?.reduce((sum, inv) => sum + (inv.total || 0), 0) ?? 0;

      setDashboardData({
        monthlyRevenue,
        activeJobs: activeJobsCount?.length ?? 0,
        pendingInvoicesTotal: pendingTotal,
        pendingInvoicesCount: pendingInvoices?.length ?? 0,
        clientCount: crmClients?.length ?? 0,
      });

      // Recent invoices (last 3)
      const { data: recentInvoicesData } = await supabase
        .from('invoices')
        .select('id, invoice_number, client_name, total, status, due_date, issued_date')
        .eq('contractor_id', currentUser.id)
        .order('created_at', { ascending: false })
        .limit(3);

      setRecentInvoices(recentInvoicesData || []);

      // Active jobs for projects card (last 3)
      const { data: activeJobsData } = await supabase
        .from('jobs')
        .select('id, title, status, contract_value, start_date, end_date')
        .eq('contractor_id', currentUser.id)
        .in('status', ['active', 'in_progress', 'in-progress'])
        .order('created_at', { ascending: false })
        .limit(3);

      setActiveJobs(activeJobsData || []);

      setLoading(false);
    };

    loadUserAndData();
  }, [navigate]);

  // Real-time new quote subscription
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel('new-quotes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'quotes',
          filter: `contractor_id=eq.${user.id}`,
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

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, toast]);

  const updateQuoteStatus = async (quoteId: string, newStatus: QuoteStatus) => {
    try {
      const { error } = await supabase
        .from('quotes')
        .update({ status: newStatus })
        .eq('id', quoteId);

      if (error) throw error;

      setQuotes(prev => prev.map(quote =>
        quote.id === quoteId ? { ...quote, status: newStatus } : quote
      ));

      toast({
        title: "Quote Updated",
        description: `Quote status updated to ${newStatus}`,
      });
    } catch (error) {
      console.error('Error updating quote status:', error);
      toast({
        title: "Error",
        description: "Failed to update quote status",
        variant: "destructive",
      });
    }
  };

  // Real dashboard stats cards
  const dashboardStats = [
    {
      title: "Monthly Revenue",
      value: `£${dashboardData.monthlyRevenue.toLocaleString('en-GB', { minimumFractionDigits: 0 })}`,
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
      value: `£${dashboardData.pendingInvoicesTotal.toLocaleString('en-GB', { minimumFractionDigits: 0 })}`,
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
      case "paid": return "bg-green-100 text-green-800";
      case "pending": return "bg-yellow-100 text-yellow-800";
      case "overdue": return "bg-red-100 text-red-800";
      case "active": return "bg-blue-100 text-blue-800";
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
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
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
              {/* Recent Invoices */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    Recent Invoices
                    <Button variant="outline" size="sm" onClick={() => setActiveTab("invoices")}>
                      <Plus className="h-4 w-4 mr-2" />
                      New Invoice
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

              {/* Active Jobs */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    Active Jobs
                    <Button variant="outline" size="sm" onClick={() => setActiveTab("jobs")}>
                      <Plus className="h-4 w-4 mr-2" />
                      New Job
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
                                {job.contract_value
                                  ? `£${Number(job.contract_value).toLocaleString('en-GB')}`
                                  : 'Value TBC'}
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
              <h2 className="text-2xl font-bold">Quote Requests</h2>
              <Button variant="outline"><Filter className="h-4 w-4 mr-2" />Filter</Button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <MessageCircle className="h-4 w-4 text-blue-500" />
                    <div>
                      <p className="text-2xl font-bold">{quotes.filter(q => q.status === 'pending').length}</p>
                      <p className="text-sm text-muted-foreground">Pending</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Eye className="h-4 w-4 text-yellow-500" />
                    <div>
                      <p className="text-2xl font-bold">{quotes.filter(q => q.status === 'viewed').length}</p>
                      <p className="text-sm text-muted-foreground">Viewed</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Send className="h-4 w-4 text-green-500" />
                    <div>
                      <p className="text-2xl font-bold">{quotes.filter(q => q.status === 'responded').length}</p>
                      <p className="text-sm text-muted-foreground">Responded</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Star className="h-4 w-4 text-purple-500" />
                    <div>
                      <p className="text-2xl font-bold">{quotes.length}</p>
                      <p className="text-sm text-muted-foreground">Total</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {quotes.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <MessageCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Quote Requests Yet</h3>
                  <p className="text-muted-foreground">Share your TradeStone profile to start receiving quotes!</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {quotes.map((quote) => (
                  <Card key={quote.id} className="hover:shadow-lg transition-shadow">
                    <CardContent className="p-6">
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="text-lg font-semibold">{quote.project_title}</h3>
                            <Badge className={getStatusColor(quote.status || 'pending')}>{quote.status}</Badge>
                          </div>
                          <p className="text-muted-foreground mb-2">{quote.project_description}</p>
                          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                            <span>From: {quote.customer_name}</span>
                            {quote.customer_phone && <span>Phone: {quote.customer_phone}</span>}
                            {quote.budget_range && <span>Budget: {quote.budget_range}</span>}
                            {quote.timeline && <span>Timeline: {quote.timeline}</span>}
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 md:min-w-[140px]">
                          {quote.status === 'pending' && (
                            <Button size="sm" onClick={() => updateQuoteStatus(quote.id, 'viewed')}>
                              Mark as Viewed
                            </Button>
                          )}
                          {quote.status === 'viewed' && (
                            <Button size="sm" onClick={() => updateQuoteStatus(quote.id, 'responded')}>
                              Mark as Responded
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Invoices Tab */}
          <TabsContent value="invoices">
            <InvoiceManagement />
          </TabsContent>

          {/* Projects Tab */}
          <TabsContent value="projects" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Project Management</h2>
              <Button onClick={() => setActiveTab("jobs")}><Plus className="h-4 w-4 mr-2" />New Job</Button>
            </div>
            {activeJobs.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No Active Projects</h3>
                  <p className="text-muted-foreground">Create a job to get started.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                {activeJobs.map((job) => (
                  <Card key={job.id}>
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-lg">{job.title}</CardTitle>
                          <CardDescription>
                            {job.contract_value
                              ? `£${Number(job.contract_value).toLocaleString('en-GB')}`
                              : 'Value TBC'}
                          </CardDescription>
                        </div>
                        <Badge className={getStatusColor(job.status || '')}>{job.status}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {job.start_date && (
                        <div className="flex justify-between text-sm">
                          <span>Start:</span>
                          <span>{new Date(job.start_date).toLocaleDateString('en-GB')}</span>
                        </div>
                      )}
                      {job.end_date && (
                        <div className="flex justify-between text-sm">
                          <span>Deadline:</span>
                          <span>{new Date(job.end_date).toLocaleDateString('en-GB')}</span>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => setActiveTab("jobs")}>
                          <Eye className="h-4 w-4 mr-2" />View
                        </Button>
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => setActiveTab("jobs")}>
                          <Edit className="h-4 w-4 mr-2" />Edit
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Jobs Tab */}
          <TabsContent value="jobs"><JobManagement /></TabsContent>

          {/* Contracts Tab */}
          <TabsContent value="contracts"><ContractManagement /></TabsContent>

          {/* Team Tab */}
          <TabsContent value="team"><TeamManagement /></TabsContent>

          {/* Timesheets Tab */}
          <TabsContent value="timesheets"><TimesheetManagement /></TabsContent>

          {/* Photos Tab */}
          <TabsContent value="photos"><PhotoGallery /></TabsContent>

          {/* Documents Tab */}
          <TabsContent value="documents">
            <DocumentManagement />
          </TabsContent>

          {/* Financials Tab */}
          <TabsContent value="financials">
            <FinancialsManagement />
          </TabsContent>

          {/* Schedule Tab */}
          <TabsContent value="schedule">
            <ScheduleManagement />
          </TabsContent>

          {/* CRM Tab */}
          <TabsContent value="clients">
            <CRMManagement />
          </TabsContent>

          {/* Profile Tab */}
          <TabsContent value="profile"><ProfileManagement /></TabsContent>
        </Tabs>

        {/* Onboarding Tour */}
        <OnboardingTour
          isActive={isTourActive}
          step={currentTourStep}
          currentStep={currentStep}
          totalSteps={totalSteps}
          onNext={nextStep}
          onPrev={prevStep}
          onSkip={() => endTour(true)}
        />
      </main>
    </div>
  );
};

export default ContractorDashboard;
