import { useEffect } from "react";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Edit, Trash2, Mail, Phone, Building2, MapPin, Link } from "lucide-react";
import { formatQuoteRef } from "@/lib/documentRefs";
import { ActivityLog } from "./ActivityLog";
import type { CRMClient, CRMActivity, CRMJobHistory, ActivityFormData } from "@/hooks/useCRM";

interface Props {
  client: CRMClient;
  activities: CRMActivity[];
  jobHistory: CRMJobHistory[];
  onBack: () => void;
  onEdit: (client: CRMClient) => void;
  onDelete: (id: string) => void;
  onAddActivity: (clientId: string, data: ActivityFormData) => Promise<boolean>;
  onDeleteActivity: (id: string, clientId: string) => Promise<boolean>;
  onFetchActivities: (clientId: string) => void;
  onFetchJobHistory: (profileId: string) => void;
  onLinkProfile: (clientId: string, email: string) => Promise<boolean>;
}

const statusColors: Record<string, string> = {
  lead: "bg-yellow-100 text-yellow-800",
  active: "bg-green-100 text-green-800",
  inactive: "bg-gray-100 text-gray-800",
  prospect: "bg-blue-100 text-blue-800",
};

const jobStatusLabel: Record<string, string> = {
  scheduled: "Scheduled",
  in_progress: "In progress",
  snagging: "Snagging",
  complete: "Complete",
  cancelled: "Cancelled",
};

export function ClientDetail({ client, activities, jobHistory, onBack, onEdit, onDelete, onAddActivity, onDeleteActivity, onFetchActivities, onFetchJobHistory, onLinkProfile }: Props) {
  useEffect(() => {
    onFetchActivities(client.id);
    if (client.profile_id) onFetchJobHistory(client.profile_id);
  }, [client.id, client.profile_id, onFetchActivities, onFetchJobHistory]);

  const clientActivities = activities.filter(a => a.client_id === client.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" />Back</Button>
        <h2 className="font-heading text-xl font-bold flex-1">{client.full_name}</h2>
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

        <Card className="col-span-1 lg:col-span-3">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Job History</CardTitle>
              {client.profile_id && (
                <span className="text-xs text-muted-foreground">Account linked</span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!client.profile_id ? (
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground">
                  Link this client to their TradeStone account to see job history.
                </p>
                <span title={!client.email ? "No email address on this client record" : undefined}>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!client.email}
                    onClick={() => onLinkProfile(client.id, client.email ?? "")}
                  >
                    <Link className="h-3.5 w-3.5 mr-1.5" />
                    Link account
                  </Button>
                </span>
              </div>
            ) : jobHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">No jobs found for this client.</p>
            ) : (
              <div className="divide-y">
                {jobHistory.map((job) => (
                  <div key={job.id} className="flex items-center gap-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">{job.title}</span>
                        {job.quote_number != null && (
                          <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {formatQuoteRef(job.quote_number)}
                          </span>
                        )}
                      </div>
                      {job.start_date && (
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(job.start_date), "dd MMM yyyy")}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {job.contract_value != null && (
                        <span className="text-sm font-medium">£{job.contract_value.toLocaleString()}</span>
                      )}
                      <Badge
                        variant={job.status === "cancelled" ? "destructive" : "secondary"}
                        className="text-[10px] px-1.5 py-0"
                        style={
                          job.status === "in_progress"
                            ? { backgroundColor: "#f07820", color: "#fff", borderColor: "#f07820" }
                            : job.status === "snagging"
                            ? { backgroundColor: "#f59e0b", color: "#fff", borderColor: "#f59e0b" }
                            : job.status === "complete"
                            ? { backgroundColor: "#16a34a", color: "#fff", borderColor: "#16a34a" }
                            : job.status === "scheduled"
                            ? { backgroundColor: "#1e3a5f", color: "#fff", borderColor: "#1e3a5f" }
                            : undefined
                        }
                      >
                        {jobStatusLabel[job.status] ?? job.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
