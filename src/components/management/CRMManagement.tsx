import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, UserPlus, Star, Search, Mail, Phone, Loader2 } from "lucide-react";
import { useCRM, type CRMClient, type ClientFormData } from "@/hooks/useCRM";
import { ClientFormDialog } from "./crm/ClientFormDialog";
import { ClientDetail } from "./crm/ClientDetail";

const statusColors: Record<string, string> = {
  lead: "bg-yellow-100 text-yellow-800",
  active: "bg-green-100 text-green-800",
  inactive: "bg-gray-100 text-gray-800",
  prospect: "bg-blue-100 text-blue-800",
};

export function CRMManagement() {
  const crm = useCRM();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<CRMClient | null>(null);
  const [selectedClient, setSelectedClient] = useState<CRMClient | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filtered = crm.clients.filter(c => {
    const matchesSearch = c.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (c.email?.toLowerCase().includes(search.toLowerCase())) ||
      (c.company_name?.toLowerCase().includes(search.toLowerCase()));
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const leads = crm.clients.filter(c => c.status === "lead").length;
  const active = crm.clients.filter(c => c.status === "active").length;
  const totalRevenue = crm.clients.reduce((sum, c) => sum + c.total_revenue, 0);

  const handleSubmit = async (data: ClientFormData) => {
    if (editingClient) {
      return await crm.updateClient(editingClient.id, data);
    }
    return await crm.addClient(data);
  };

  const handleEdit = (client: CRMClient) => {
    setEditingClient(client);
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    await crm.deleteClient(id);
    setSelectedClient(null);
  };

  if (crm.loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  if (selectedClient) {
    const freshClient = crm.clients.find(c => c.id === selectedClient.id);
    if (!freshClient) {
      setSelectedClient(null);
      return null;
    }
    return (
      <ClientDetail
        client={freshClient}
        activities={crm.activities}
        onBack={() => setSelectedClient(null)}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onAddActivity={crm.addActivity}
        onDeleteActivity={crm.deleteActivity}
        onFetchActivities={crm.fetchActivities}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Client Relationship Management</h2>
        <Button onClick={() => { setEditingClient(null); setDialogOpen(true); }}>
          <UserPlus className="h-4 w-4 mr-2" />Add Client
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Clients</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{crm.clients.length}</div>
            <p className="text-xs text-muted-foreground">{active} active</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Leads</CardTitle>
            <UserPlus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{leads}</div>
            <p className="text-xs text-muted-foreground">Pending follow-up</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <Star className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">£{totalRevenue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">From all clients</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search clients..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="lead">Lead</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="prospect">Prospect</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">
              {crm.clients.length === 0 ? "No Clients Yet" : "No Matching Clients"}
            </h3>
            <p className="text-muted-foreground">
              {crm.clients.length === 0 ? "Add your first client to start building your CRM." : "Try adjusting your search or filter."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(client => (
            <Card key={client.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedClient(client)}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-semibold">{client.full_name}</h3>
                    {client.company_name && <p className="text-sm text-muted-foreground">{client.company_name}</p>}
                  </div>
                  <Badge className={statusColors[client.status] || "bg-muted"} variant="secondary">{client.status}</Badge>
                </div>
                <div className="space-y-1 text-sm text-muted-foreground">
                  {client.email && <div className="flex items-center gap-1.5"><Mail className="h-3 w-3" />{client.email}</div>}
                  {client.phone && <div className="flex items-center gap-1.5"><Phone className="h-3 w-3" />{client.phone}</div>}
                </div>
                {client.total_revenue > 0 && (
                  <p className="text-sm font-medium mt-2">£{client.total_revenue.toLocaleString()} revenue</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ClientFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleSubmit}
        client={editingClient}
      />
    </div>
  );
}
