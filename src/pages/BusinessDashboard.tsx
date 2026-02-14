import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  FileText,
  Building2,
  Users,
  Briefcase,
  MessageCircle,
  TrendingUp,
  Search,
  Plus,
  Loader2,
  ExternalLink,
  Package,
  Hammer
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import Header from "@/components/Header";
import { ReceivedInvoices } from "@/components/recipient/ReceivedInvoices";
import { ReceivedQuotes } from "@/components/recipient/ReceivedQuotes";

const BusinessDashboard = () => {
  const [activeTab, setActiveTab] = useState("overview");
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const loadData = async () => {
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      
      if (!currentUser) {
        navigate("/auth");
        return;
      }
      
      setUser(currentUser);
      setLoading(false);
    };

    loadData();
  }, [navigate]);

  const stats = [
    {
      title: "Active Contracts",
      value: "0",
      icon: FileText,
      description: "Posted opportunities"
    },
    {
      title: "Bids Received",
      value: "0",
      icon: Briefcase,
      description: "From contractors"
    },
    {
      title: "Preferred Suppliers",
      value: "0",
      icon: Users,
      description: "Saved contractors"
    },
    {
      title: "Projects Completed",
      value: "0",
      icon: TrendingUp,
      description: "Total finished"
    }
  ];

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
            <Building2 className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold">Business Dashboard</h1>
          </div>
          <p className="text-muted-foreground">
            Manage contract opportunities, track bids, and connect with qualified contractors.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
          <div className="w-full overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0 md:overflow-visible">
            <TabsList className="inline-flex w-max md:grid md:w-full md:grid-cols-8 gap-1">
              <TabsTrigger value="overview" className="whitespace-nowrap">Overview</TabsTrigger>
              <TabsTrigger value="invoices" className="whitespace-nowrap">Invoices</TabsTrigger>
              <TabsTrigger value="quotes" className="whitespace-nowrap">Quotes</TabsTrigger>
              <TabsTrigger value="contracts" className="whitespace-nowrap">Contracts</TabsTrigger>
              <TabsTrigger value="bids" className="whitespace-nowrap">Bids</TabsTrigger>
              <TabsTrigger value="suppliers" className="whitespace-nowrap">Suppliers</TabsTrigger>
              <TabsTrigger value="procurement" className="whitespace-nowrap">Procurement</TabsTrigger>
              <TabsTrigger value="messages" className="whitespace-nowrap">Messages</TabsTrigger>
            </TabsList>
          </div>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-8">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {stats.map((stat, index) => (
                <Card key={index}>
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

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Plus className="h-5 w-5" />
                    Post a Contract
                  </CardTitle>
                  <CardDescription>
                    Create a new contract opportunity for bidding
                  </CardDescription>
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
                  <CardDescription>
                    Browse verified professionals for your projects
                  </CardDescription>
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
                  <CardDescription>
                    Source materials at competitive prices
                  </CardDescription>
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

            {/* Business Features Coming Soon */}
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

          {/* Invoices Tab */}
          <TabsContent value="invoices" className="space-y-6">
            <ReceivedInvoices />
          </TabsContent>

          {/* Quotes Tab */}
          <TabsContent value="quotes" className="space-y-6">
            <ReceivedQuotes />
          </TabsContent>

          {/* Contracts Tab */}
          <TabsContent value="contracts" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Contract Opportunities</h2>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Post New Contract
              </Button>
            </div>

            <Card>
              <CardContent className="p-8 text-center">
                <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No Contracts Posted</h3>
                <p className="text-muted-foreground mb-4">
                  Post your first contract opportunity to receive bids from qualified contractors.
                </p>
                <Badge variant="outline">Contract Posting Coming Soon</Badge>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Bids Tab */}
          <TabsContent value="bids" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Received Bids</h2>
            </div>

            <Card>
              <CardContent className="p-8 text-center">
                <Briefcase className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No Bids Yet</h3>
                <p className="text-muted-foreground mb-4">
                  When contractors bid on your contracts, they'll appear here for review.
                </p>
                <Button variant="outline" asChild>
                  <Link to="/contracts">View Contract Opportunities</Link>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Suppliers Tab */}
          <TabsContent value="suppliers" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Preferred Suppliers</h2>
              <Button variant="outline" asChild>
                <Link to="/contractors">
                  <Search className="mr-2 h-4 w-4" />
                  Find Contractors
                </Link>
              </Button>
            </div>

            <Card>
              <CardContent className="p-8 text-center">
                <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No Preferred Suppliers</h3>
                <p className="text-muted-foreground mb-4">
                  Build your network of trusted contractors for future projects.
                </p>
                <Button asChild>
                  <Link to="/contractors">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Suppliers
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Procurement Tab */}
          <TabsContent value="procurement" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Procurement</h2>
            </div>

            <Card>
              <CardContent className="p-8 text-center">
                <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Procurement Management</h3>
                <p className="text-muted-foreground mb-4">
                  Track material orders and supplier relationships in one place.
                </p>
                <Badge variant="outline">Coming Soon</Badge>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Messages Tab */}
          <TabsContent value="messages" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold">Messages</h2>
            </div>

            <Card>
              <CardContent className="p-8 text-center">
                <MessageCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No Messages</h3>
                <p className="text-muted-foreground mb-4">
                  Your communications with contractors will appear here.
                </p>
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
