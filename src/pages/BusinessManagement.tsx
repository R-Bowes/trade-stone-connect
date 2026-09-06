import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Users,
  Plus,
  Download,
  Filter,
  MessageCircle,
} from "lucide-react";
import Header from "@/components/Header";
import { ProfileManagement } from "@/components/management/ProfileManagement";
import { PhotoGallery } from "@/components/management/PhotoGallery";
import { TeamManagement } from "@/components/management/TeamManagement";
import { TimesheetManagement } from "@/components/management/TimesheetManagement";
import { ContractManagement } from "@/components/management/ContractManagement";
import { TransactionFeeNotice } from "@/components/TransactionFeeNotice";

const businessManagementViews = [
  { value: "dashboard", label: "Dashboard" },
  { value: "quotes", label: "Quotes" },
  { value: "invoices", label: "Invoices" },
  { value: "projects", label: "Projects" },
  { value: "clients", label: "Clients" },
  { value: "payments", label: "Payments" },
  { value: "reports", label: "Reports" },
  { value: "profile", label: "Profile" },
  { value: "photos", label: "Photos" },
  { value: "team", label: "Team" },
  { value: "timesheets", label: "Timesheets" },
  { value: "contracts", label: "Contracts" },
] as const;

const BusinessManagement = () => {
  const [activeTab, setActiveTab] = useState("dashboard");

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="mb-8">
          <h1 className="font-heading text-3xl font-bold mb-2">Business Management</h1>
          <p className="text-muted-foreground">Manage your contracting business with powerful tools designed for professionals.</p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-8">
          <div className="max-w-sm">
            <label htmlFor="business-management-view" className="mb-2 block text-sm font-medium text-muted-foreground">
              View
            </label>
            <Select value={activeTab} onValueChange={setActiveTab}>
              <SelectTrigger id="business-management-view" className="w-full">
                <SelectValue placeholder="Select a view" />
              </SelectTrigger>
              <SelectContent>
                {businessManagementViews.map((view) => (
                  <SelectItem key={view.value} value={view.value}>
                    {view.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <TabsContent value="dashboard" className="space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    Recent Invoices
                    <Button variant="outline" size="sm">
                      <Plus className="h-4 w-4 mr-2" />New Invoice
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground text-center py-6">No invoices yet.</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    Active Projects
                    <Button variant="outline" size="sm">
                      <Plus className="h-4 w-4 mr-2" />New Project
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground text-center py-6">No active projects yet.</p>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="quotes" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="font-heading text-2xl font-bold">Quote Requests</h2>
              <div className="flex gap-2">
                <Button variant="outline">
                  <Filter className="h-4 w-4 mr-2" />Filter
                </Button>
              </div>
            </div>

            <Card>
              <CardContent className="p-8 text-center">
                <MessageCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No Quote Requests Yet</h3>
                <p className="text-muted-foreground mb-4">Quote requests from potential customers will appear here.</p>
                <p className="text-sm text-muted-foreground">Share your TradeStone profile link to start receiving quote requests!</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="invoices" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="font-heading text-2xl font-bold">Invoice Management</h2>
              <div className="flex gap-2">
                <Button variant="outline"><Filter className="h-4 w-4 mr-2" />Filter</Button>
                <Button><Plus className="h-4 w-4 mr-2" />Create Invoice</Button>
              </div>
            </div>
            <TransactionFeeNotice />
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-4">Invoice #</th>
                        <th className="text-left p-4">Client</th>
                        <th className="text-left p-4">Amount</th>
                        <th className="text-left p-4">Status</th>
                        <th className="text-left p-4">Due Date</th>
                        <th className="text-left p-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-sm text-muted-foreground">No invoices yet.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="projects" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="font-heading text-2xl font-bold">Project Management</h2>
              <Button><Plus className="h-4 w-4 mr-2" />New Project</Button>
            </div>
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-sm text-muted-foreground">No projects yet.</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="clients" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="font-heading text-2xl font-bold">Client Management</h2>
              <Button><Plus className="h-4 w-4 mr-2" />Add Client</Button>
            </div>
            <Card>
              <CardHeader>
                <CardTitle>Client Directory</CardTitle>
                <CardDescription>Manage your client relationships and contact information</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12">
                  <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">Client Management Coming Soon</h3>
                  <p className="text-muted-foreground mb-4">Full client management features including contact details, project history, and communication logs.</p>
                  <Button variant="outline">Request Early Access</Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="payments" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="font-heading text-2xl font-bold">Payment Tracking</h2>
              <Button variant="outline"><Download className="h-4 w-4 mr-2" />Export</Button>
            </div>
            <TransactionFeeNotice />
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-sm text-muted-foreground">No payments yet.</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reports" className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="font-heading text-2xl font-bold">Business Reports</h2>
              <Button variant="outline"><Download className="h-4 w-4 mr-2" />Generate Report</Button>
            </div>
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-sm text-muted-foreground">No report data yet.</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="profile"><ProfileManagement /></TabsContent>
          <TabsContent value="photos"><PhotoGallery /></TabsContent>
          <TabsContent value="team"><TeamManagement /></TabsContent>
          <TabsContent value="timesheets"><TimesheetManagement /></TabsContent>
          <TabsContent value="contracts"><ContractManagement /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default BusinessManagement;
