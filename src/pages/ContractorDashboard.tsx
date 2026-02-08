import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  DollarSign,
  Users,
  FileText,
  Calendar,
  TrendingUp,
  Clock,
  Plus,
  Eye,
  Download,
  Edit,
  Send,
  Filter,
  MessageCircle,
  Star,
  Mail,
  Wallet,
  CalendarDays,
  UserPlus,
  Loader2,
  Hammer
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import { Link, useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import { ProfileManagement } from "@/components/management/ProfileManagement";
import { PhotoGallery } from "@/components/management/PhotoGallery";
import { TeamManagement } from "@/components/management/TeamManagement";
import { TimesheetManagement } from "@/components/management/TimesheetManagement";
import { ContractManagement } from "@/components/management/ContractManagement";
import { ScheduleManagement } from "@/components/management/ScheduleManagement";
import type { Database } from "@/integrations/supabase/types";

type Quote = Database["public"]["Tables"]["quotes"]["Row"];
type QuoteStatus = NonNullable<Quote["status"]>;

const ContractorDashboard = () => {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Load current user and quotes
  useEffect(() => {
    const loadUserAndQuotes = async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      
      if (!currentUser) {
        navigate("/auth");
        return;
      }
      
      setUser(currentUser);

      const { data: quotesData, error } = await supabase
        .from('quotes')
        .select('*')
        .eq('contractor_id', currentUser.id)
        .order('created_at', { ascending: false });
        
      if (error) {
        console.error('Error loading quotes:', error);
      } else {
        setQuotes(quotesData || []);
      }
      
      setLoading(false);
    };

    loadUserAndQuotes();
  }, [navigate]);

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

  // Mock data for demo
  const dashboardStats = [
    { title: "Monthly Revenue", value: "£12,450", change: "+15.3%", icon: DollarSign, trend: "up" },
    { title: "Active Projects", value: "8", change: "+2", icon: FileText, trend: "up" },
    { title: "Pending Invoices", value: "£3,200", change: "5 invoices", icon: Clock, trend: "warning" },
    { title: "Clients", value: "23", change: "+3 this month", icon: Users, trend: "up" }
  ];

  const recentInvoices = [
    { id: "INV-001", client: "Johnson Construction", amount: "£2,450", status: "paid", date: "2024-01-15", dueDate: "2024-01-30" },
    { id: "INV-002", client: "Smith Renovations", amount: "£1,800", status: "pending", date: "2024-01-18", dueDate: "2024-02-02" },
    { id: "INV-003", client: "Green Building Ltd", amount: "£950", status: "overdue", date: "2024-01-10", dueDate: "2024-01-25" }
  ];

  const activeProjects = [
    { id: "PRJ-001", name: "Kitchen Renovation", client: "Mrs. Wilson", progress: 75, deadline: "2024-02-15", value: "£4,500", status: "on-track" },
    { id: "PRJ-002", name: "Bathroom Remodel", client: "Davis Family", progress: 45, deadline: "2024-03-01", value: "£3,200", status: "at-risk" },
    { id: "PRJ-003", name: "Garage Extension", client: "Mr. Brown", progress: 90, deadline: "2024-01-30", value: "£8,900", status: "ahead" }
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case "paid": return "bg-green-100 text-green-800";
      case "pending": return "bg-yellow-100 text-yellow-800";
      case "overdue": return "bg-red-100 text-red-800";
      case "on-track": return "bg-blue-100 text-blue-800";
      case "at-risk": return "bg-red-100 text-red-800";
      case "ahead": return "bg-green-100 text-green-800";
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
          <div className="flex items-center gap-2 mb-2">
            <Hammer className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">Contractor Dashboard</h1>
          </div>
          <p className="text-muted-foreground">
            Manage your contracting business with powerful tools designed for professionals.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
          {/* Mobile: Horizontal scroll, Tablet: 6-col grid, Desktop: full grid */}
          <div className="w-full overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0 md:overflow-visible">
            <TabsList className="inline-flex w-max md:grid md:w-full md:grid-cols-6 lg:grid-cols-12 xl:grid-cols-15 gap-1">
              <TabsTrigger value="dashboard" className="whitespace-nowrap">Dashboard</TabsTrigger>
              <TabsTrigger value="quotes" className="whitespace-nowrap">Quotes</TabsTrigger>
              <TabsTrigger value="invoices" className="whitespace-nowrap">Invoices</TabsTrigger>
              <TabsTrigger value="projects" className="whitespace-nowrap">Projects</TabsTrigger>
              <TabsTrigger value="contracts" className="whitespace-nowrap">Contracts</TabsTrigger>
              <TabsTrigger value="team" className="whitespace-nowrap">Team</TabsTrigger>
              <TabsTrigger value="timesheets" className="whitespace-nowrap">Timesheets</TabsTrigger>
              <TabsTrigger value="photos" className="whitespace-nowrap">Photos</TabsTrigger>
              <TabsTrigger value="financials" className="whitespace-nowrap">Financials</TabsTrigger>
              <TabsTrigger value="schedule" className="whitespace-nowrap">Schedule</TabsTrigger>
              <TabsTrigger value="clients" className="whitespace-nowrap">CRM</TabsTrigger>
              <TabsTrigger value="profile" className="whitespace-nowrap">Profile</TabsTrigger>
            </TabsList>
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
                    <Button variant="outline" size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      New Invoice
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {recentInvoices.slice(0, 3).map((invoice) => (
                      <div key={invoice.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <p className="font-medium">{invoice.id}</p>
                          <p className="text-sm text-muted-foreground">{invoice.client}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">{invoice.amount}</p>
                          <Badge className={getStatusColor(invoice.status)}>{invoice.status}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    Active Projects
                    <Button variant="outline" size="sm">
                      <Plus className="h-4 w-4 mr-2" />
                      New Project
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {activeProjects.slice(0, 3).map((project) => (
                      <div key={project.id} className="p-3 border rounded-lg">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-medium">{project.name}</p>
                            <p className="text-sm text-muted-foreground">{project.client}</p>
                          </div>
                          <Badge className={getStatusColor(project.status)}>{project.status}</Badge>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>Progress</span>
                            <span>{project.progress}%</span>
                          </div>
                          <Progress value={project.progress} className="h-2" />
                        </div>
                      </div>
                    ))}
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
              <Card><CardContent className="p-4"><div className="flex items-center gap-2"><MessageCircle className="h-4 w-4 text-blue-500" /><div><p className="text-2xl font-bold">{quotes.filter(q => q.status === 'pending').length}</p><p className="text-sm text-muted-foreground">Pending</p></div></div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="flex items-center gap-2"><Eye className="h-4 w-4 text-yellow-500" /><div><p className="text-2xl font-bold">{quotes.filter(q => q.status === 'viewed').length}</p><p className="text-sm text-muted-foreground">Viewed</p></div></div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="flex items-center gap-2"><Send className="h-4 w-4 text-green-500" /><div><p className="text-2xl font-bold">{quotes.filter(q => q.status === 'responded').length}</p><p className="text-sm text-muted-foreground">Responded</p></div></div></CardContent></Card>
              <Card><CardContent className="p-4"><div className="flex items-center gap-2"><Star className="h-4 w-4 text-purple-500" /><div><p className="text-2xl font-bold">{quotes.length}</p><p className="text-sm text-muted-foreground">Total</p></div></div></CardContent></Card>
            </div>

            {quotes.length === 0 ? (
              <Card><CardContent className="p-8 text-center"><MessageCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" /><h3 className="text-lg font-medium mb-2">No Quote Requests Yet</h3><p className="text-muted-foreground">Share your TradeStone profile to start receiving quotes!</p></CardContent></Card>
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
                            <span>Email: {quote.customer_email}</span>
                            {quote.customer_phone && <span>Phone: {quote.customer_phone}</span>}
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 md:min-w-[140px]">
                          {quote.status === 'pending' && (
                            <Button size="sm" onClick={() => updateQuoteStatus(quote.id, 'viewed')}>Mark as Viewed</Button>
                          )}
                          {quote.status === 'viewed' && (
                            <Button size="sm" onClick={() => updateQuoteStatus(quote.id, 'responded')}>Mark as Responded</Button>
                          )}
                          <Button variant="outline" size="sm"><Mail className="h-3 w-3 mr-1" />Contact</Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Invoices Tab */}
          <TabsContent value="invoices" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Invoice Management</h2>
              <div className="flex gap-2">
                <Button variant="outline"><Filter className="h-4 w-4 mr-2" />Filter</Button>
                <Button><Plus className="h-4 w-4 mr-2" />Create Invoice</Button>
              </div>
            </div>
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-4">Invoice ID</th>
                        <th className="text-left p-4">Client</th>
                        <th className="text-left p-4">Amount</th>
                        <th className="text-left p-4">Status</th>
                        <th className="text-left p-4">Due Date</th>
                        <th className="text-left p-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentInvoices.map((invoice) => (
                        <tr key={invoice.id} className="border-t">
                          <td className="p-4 font-medium">{invoice.id}</td>
                          <td className="p-4">{invoice.client}</td>
                          <td className="p-4 font-medium">{invoice.amount}</td>
                          <td className="p-4"><Badge className={getStatusColor(invoice.status)}>{invoice.status}</Badge></td>
                          <td className="p-4">{invoice.dueDate}</td>
                          <td className="p-4">
                            <div className="flex gap-2">
                              <Button variant="outline" size="sm"><Eye className="h-4 w-4" /></Button>
                              <Button variant="outline" size="sm"><Edit className="h-4 w-4" /></Button>
                              <Button variant="outline" size="sm"><Send className="h-4 w-4" /></Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Projects Tab */}
          <TabsContent value="projects" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Project Management</h2>
              <Button><Plus className="h-4 w-4 mr-2" />New Project</Button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {activeProjects.map((project) => (
                <Card key={project.id}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg">{project.name}</CardTitle>
                        <CardDescription>{project.client}</CardDescription>
                      </div>
                      <Badge className={getStatusColor(project.status)}>{project.status}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between text-sm"><span>Value:</span><span className="font-medium">{project.value}</span></div>
                    <div className="flex justify-between text-sm"><span>Deadline:</span><span>{project.deadline}</span></div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm"><span>Progress</span><span>{project.progress}%</span></div>
                      <Progress value={project.progress} />
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1"><Eye className="h-4 w-4 mr-2" />View</Button>
                      <Button variant="outline" size="sm" className="flex-1"><Edit className="h-4 w-4 mr-2" />Edit</Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Contracts Tab */}
          <TabsContent value="contracts"><ContractManagement /></TabsContent>

          {/* Team Tab */}
          <TabsContent value="team"><TeamManagement /></TabsContent>

          {/* Timesheets Tab */}
          <TabsContent value="timesheets"><TimesheetManagement /></TabsContent>

          {/* Photos Tab */}
          <TabsContent value="photos"><PhotoGallery /></TabsContent>

          {/* Financials Tab (NEW) */}
          <TabsContent value="financials" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Financial Management</h2>
              <Button variant="outline"><Download className="h-4 w-4 mr-2" />Export Report</Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Revenue (YTD)</CardTitle>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">£45,200</div>
                  <p className="text-xs text-muted-foreground">+12% from last year</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Expenses (YTD)</CardTitle>
                  <Wallet className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">£18,400</div>
                  <p className="text-xs text-muted-foreground">-5% from last year</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
                  <TrendingUp className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">£26,800</div>
                  <p className="text-xs text-green-600">+18% margin</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Expense Tracking</CardTitle>
                <CardDescription>Track and categorize your business expenses</CardDescription>
              </CardHeader>
              <CardContent className="text-center py-8">
                <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Expense Tracking Coming Soon</h3>
                <p className="text-muted-foreground">Log expenses, categorize spending, and generate profit/loss reports.</p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Schedule Tab */}
          <TabsContent value="schedule">
            <ScheduleManagement />
          </TabsContent>

          {/* CRM Tab (NEW) */}
          <TabsContent value="clients" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Client Relationship Management</h2>
              <Button><UserPlus className="h-4 w-4 mr-2" />Add Client</Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Clients</CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">23</div>
                  <p className="text-xs text-muted-foreground">Active relationships</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Leads</CardTitle>
                  <UserPlus className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">5</div>
                  <p className="text-xs text-muted-foreground">Pending follow-up</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Repeat Clients</CardTitle>
                  <Star className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">8</div>
                  <p className="text-xs text-muted-foreground">35% of total</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Client Database</CardTitle>
                <CardDescription>Manage contacts, track follow-ups, and nurture leads</CardDescription>
              </CardHeader>
              <CardContent className="text-center py-8">
                <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Full CRM Coming Soon</h3>
                <p className="text-muted-foreground mb-4">Store client contacts, track communications, and manage leads.</p>
                <Badge variant="outline">Early Access Available Soon</Badge>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Profile Tab */}
          <TabsContent value="profile"><ProfileManagement /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default ContractorDashboard;
