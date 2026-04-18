import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import {
  FileText,
  Building2,
  Users,
  Briefcase,
  MessageCircle,
  TrendingUp,
  Search,
  Plus,
  ExternalLink,
  Package,
  Hammer
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { EmptyState, ErrorState, LoadingState } from "@/components/AsyncState";
import type { User } from "@supabase/supabase-js";
import Header from "@/components/Header";
import { ReceivedInvoices } from "@/components/recipient/ReceivedInvoices";
import { ReceivedQuotes } from "@/components/recipient/ReceivedQuotes";
import { ClientJobsView } from "@/components/management/ClientJobsView";

const businessDashboardViews = [
  { value: "overview", label: "Overview" },
  { value: "jobs", label: "My Jobs" },
  { value: "invoices", label: "Invoices" },
  { value: "quotes", label: "Quotes" },
  { value: "contracts", label: "Contracts" },
  { value: "bids", label: "Bids" },
  { value: "suppliers", label: "Suppliers" },
  { value: "procurement", label: "Procurement" },
  { value: "messages", label: "Messages" },
] as const;

const BusinessDashboard = () => {
  const [activeTab, setActiveTab] = useState("overview");
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const [loadError, setLoadError] = useState<string | null>(null);

  const [dashboardData, setDashboardData] = useState({
    activeJobs: 0,
    receivedQuotes: 0,
    pendingInvoices: 0,
    completedJobs: 0,
  });

  useEffect(() => {
    const loadData = async () => {
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

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("user_type")
        .eq("user_id", currentUser.id)
        .maybeSingle();

      if (profileError) {
        setLoadError("Unable to load your profile.");
        setLoading(false);
        return;
      }

      if (profile?.user_type && profile.user_type !== "business") {
        navigate(`/dashboard/${profile.user_type}`);
        return;
      }

      const { data: activeJobs, error: activeJobsError } = await supabase
        .from('jobs')
        .select('id')
        .eq('customer_id', currentUser.id)
        .in('status', ['active', 'in_progress', 'in-progress']);

      const { data: completedJobs, error: completedJobsError } = await supabase
        .from('jobs')
        .select('id')
        .eq('client_id', currentUser.id)
        .eq('status', 'completed');

      const { data: receivedQuotes, error: receivedQuotesError } = await supabase
        .from('issued_quotes')
        .select('id')
        .eq('recipient_id', currentUser.id);

      const { data: pendingInvoices, error: pendingInvoicesError } = await supabase
        .from('invoices')
        .select('id')
        .eq('recipient_id', currentUser.id)
        .eq('status', 'pending');

      if (activeJobsError || completedJobsError || receivedQuotesError || pendingInvoicesError) {
        console.error("Dashboard query error", { activeJobsError, completedJobsError, receivedQuotesError, pendingInvoicesError });
        setLoadError("Unable to load dashboard data. Please try again.");
        setLoading(false);
        return;
      }

      setDashboardData({
        activeJobs: activeJobs?.length ?? 0,
        receivedQuotes: receivedQuotes?.length ?? 0,
        pendingInvoices: pendingInvoices?.length ?? 0,
        completedJobs: completedJobs?.length ?? 0,
      });

      setLoading(false);
    };

    loadData();
  }, [navigate]);



  const hasNoActivity =
    dashboardData.activeJobs === 0 &&
    dashboardData.receivedQuotes === 0 &&
    dashboardData.pendingInvoices === 0 &&
    dashboardData.completedJobs === 0;

  const stats = [
    {
      title: "Active Jobs",
      value: `${dashboardData.activeJobs}`,
      icon: FileText,
      description: "Currently in progress",
      tab: "jobs",
    },
    {
      title: "Quotes Received",
      value: `${dashboardData.receivedQuotes}`,
      icon: Briefcase,
      description: "From contractors",
      tab: "quotes",
    },
    {
      title: "Pending Invoices",
      value: `${dashboardData.pendingInvoices}`,
      icon: Users,
      description: "Awaiting payment",
      tab: "invoices",
    },
    {
      title: "Projects Completed",
      value: `${dashboardData.completedJobs}`,
      icon: TrendingUp,
      description: "Total finished",
      tab: "jobs",
    },
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <LoadingState message="Loading your business dashboard..." />
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
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">Business Dashboard</h1>
          </div>
          <p className="text-muted-foreground">
            Manage contract opportunities, track bids, and connect with qualified contractors.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
          <div className="max-w-sm">
            <label htmlFor="business-dashboard-view" className="mb-2 block text-sm font-medium text-muted-foreground">
              View
            </label>
            <Select value={activeTab} onValueChange={setActiveTab}>
              <SelectTrigger id="business-dashboard-view" className="w-full">
                <SelectValue placeholder="Select a view" />
              </SelectTrigger>
              <SelectContent>
                {businessDashboardViews.map((view) => (
                  <SelectItem key={view.value} value={view.value}>
                    {view.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-8">
            {hasNoActivity ? (
              <EmptyState
                message="Your business dashboard has no jobs, quotes, or invoices yet."
                ctaLabel="Post your first opportunity"
                onCta={() => navigate("/contracts")}
              />
            ) : null}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {stats.map((stat, index) => (
                <Card
                  key={index}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setActiveTab(stat.tab)}
                >
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                    <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                    <stat.icon className="h-4 w-4 text-muted-foreground" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{stat.value}</div>
                    <p className="text-xs text-muted-foreground">{stat.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Plus className="h-5 w-5" />
                    Post a Contract
                  </CardTitle>
                  <CardDescription>Create a new contract opportunity for bidding</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild className="w-full">
                    <Link to="/contracts">
                      Post Opportunity
                      <ExternalLink className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Hammer className="h-5 w-5" />
                    Find Contractors
                  </CardTitle>
                  <CardDescription>Browse verified professionals for your projects</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" asChild className="w-full">
                    <Link to="/contractors">
                      Browse Directory
                      <ExternalLink className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    Bulk Materials
                  </CardTitle>
                  <CardDescription>Source materials at competitive prices</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" asChild className="w-full">
                    <Link to="/marketplace">
                      View Marketplace
                      <ExternalLink className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Business Features</CardTitle>
                <CardDescription>Powerful tools for commercial operations</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-4 p-4 rounded-lg border">
                    <FileText className="h-8 w-8 text-primary" />
                    <div>
                      <p className="font-medium">Contract Management</p>
                      <p className="text-sm text-muted-foreground">Post and manage contract opportunities</p>
                    </div>
                    <Badge variant="outline" className="ml-auto">Coming Soon</Badge>
                  </div>
                  <div className="flex items-center gap-4 p-4 rounded-lg border">
                    <Briefcase className="h-8 w-8 text-primary" />
                    <div>
                      <p className="font-medium">Bid Evaluation</p>
                      <p className="text-sm text-muted-foreground">Compare and evaluate contractor bids</p>
                    </div>
                    <Badge variant="outline" className="ml-auto">Coming Soon</Badge>
                  </div>
                  <div className="flex items-center gap-4 p-4 rounded-lg border">
                    <Users className="h-8 w-8 text-primary" />
                    <div>
                      <p className="font-medium">Supplier Network</p>
                      <p className="text-sm text-muted-foreground">Build your preferred supplier list</p>
                    </div>
                    <Badge variant="outline" className="ml-auto">Coming Soon</Badge>
                  </div>
                  <div className="flex items-center gap-4 p-4 rounded-lg border">
                    <TrendingUp className="h-8 w-8 text-primary" />
                    <div>
                      <p className="font-medium">Spend Analytics</p>
                      <p className="text-sm text-muted-foreground">Track spending across projects</p>
                    </div>
                    <Badge variant="outline" className="ml-auto">Coming Soon</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="jobs"><ClientJobsView /></TabsContent>
          <TabsContent value="invoices"><ReceivedInvoices /></TabsContent>
          <TabsContent value="quotes"><ReceivedQuotes /></TabsContent>

          <TabsContent value="contracts" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Contract Opportunities</h2>
              <Button><Plus className="mr-2 h-4 w-4" />Post New Contract</Button>
            </div>
            <Card>
              <CardContent className="p-8 text-center">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No Contracts Posted</h3>
                <p className="text-muted-foreground mb-4">Post your first contract opportunity to receive bids from qualified contractors.</p>
                <Badge variant="outline">Contract Posting Coming Soon</Badge>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="bids" className="space-y-6">
            <h2 className="text-2xl font-bold">Received Bids</h2>
            <Card>
              <CardContent className="p-8 text-center">
                <Briefcase className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No Bids Yet</h3>
                <p className="text-muted-foreground mb-4">When contractors bid on your contracts, they'll appear here for review.</p>
                <Button variant="outline" asChild><Link to="/contracts">View Contract Opportunities</Link></Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="suppliers" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Preferred Suppliers</h2>
              <Button variant="outline" asChild>
                <Link to="/contractors"><Search className="mr-2 h-4 w-4" />Find Contractors</Link>
              </Button>
            </div>
            <Card>
              <CardContent className="p-8 text-center">
                <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No Preferred Suppliers</h3>
                <p className="text-muted-foreground mb-4">Build your network of trusted contractors for future projects.</p>
                <Button asChild><Link to="/contractors"><Plus className="mr-2 h-4 w-4" />Add Suppliers</Link></Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="procurement" className="space-y-6">
            <h2 className="text-2xl font-bold">Procurement</h2>
            <Card>
              <CardContent className="p-8 text-center">
                <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Procurement Management</h3>
                <p className="text-muted-foreground mb-4">Track material orders and supplier relationships in one place.</p>
                <Badge variant="outline">Coming Soon</Badge>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="messages" className="space-y-6">
            <h2 className="text-2xl font-bold">Messages</h2>
            <Card>
              <CardContent className="p-8 text-center">
                <MessageCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No Messages</h3>
                <p className="text-muted-foreground mb-4">Your communications with contractors will appear here.</p>
                <Badge variant="outline">Messaging Coming Soon</Badge>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default BusinessDashboard;
