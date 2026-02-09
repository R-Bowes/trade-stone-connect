import { useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Edit, Trash2, Mail, Phone, Building2, MapPin } from "lucide-react";
import { ActivityLog } from "./ActivityLog";
import type { CRMClient, CRMActivity, ActivityFormData } from "@/hooks/useCRM";

interface Props {
  client: CRMClient;
  activities: CRMActivity[];
  onBack: () => void;
  onEdit: (client: CRMClient) => void;
  onDelete: (id: string) => void;
  onAddActivity: (clientId: string, data: ActivityFormData) => Promise<boolean>;
  onDeleteActivity: (id: string, clientId: string) => Promise<boolean>;
  onFetchActivities: (clientId: string) => void;
}

const statusColors: Record<string, string> = {
  lead: "bg-yellow-100 text-yellow-800",
  active: "bg-green-100 text-green-800",
  inactive: "bg-gray-100 text-gray-800",
  prospect: "bg-blue-100 text-blue-800",
};

export function ClientDetail({ client, activities, onBack, onEdit, onDelete, onAddActivity, onDeleteActivity, onFetchActivities }: Props) {
  useEffect(() => {
    onFetchActivities(client.id);
  }, [client.id, onFetchActivities]);

  const clientActivities = activities.filter(a => a.client_id === client.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>
        <h2 className="text-xl font-bold flex-1">{client.full_name}</h2>
        <Button variant="outline" size="sm" onClick={() => onEdit(client)}><Edit className="h-4 w-4 mr-1" />Edit</Button>
        <Button variant="destructive" size="sm" onClick={() => onDelete(client.id)}><Trash2 className="h-4 w-4 mr-1" />Delete</Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="text-base">Contact Info</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Badge className={statusColors[client.status] || "bg-muted"}>{client.status}</Badge>
            {client.email && (
              <div className="flex items-center gap-2 text-sm"><Mail className="h-4 w-4 text-muted-foreground" />{client.email}</div>
            )}
            {client.phone && (
              <div className="flex items-center gap-2 text-sm"><Phone className="h-4 w-4 text-muted-foreground" />{client.phone}</div>
            )}
            {client.company_name && (
              <div className="flex items-center gap-2 text-sm"><Building2 className="h-4 w-4 text-muted-foreground" />{client.company_name}</div>
            )}
            {client.address && (
              <div className="flex items-center gap-2 text-sm"><MapPin className="h-4 w-4 text-muted-foreground" />{client.address}</div>
            )}
            {client.source && (
              <div className="text-sm"><span className="text-muted-foreground">Source:</span> {client.source}</div>
            )}
            {client.total_revenue > 0 && (
              <div className="text-sm font-medium">Total Revenue: £{client.total_revenue.toLocaleString()}</div>
            )}
            {client.notes && (
              <div className="pt-2 border-t">
                <p className="text-sm text-muted-foreground">{client.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="lg:col-span-2">
          <ActivityLog
            activities={clientActivities}
            clientId={client.id}
            onAdd={onAddActivity}
            onDelete={onDeleteActivity}
          />
        </div>
      </div>
    </div>
  );
}
