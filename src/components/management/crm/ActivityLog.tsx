import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Phone, Mail, FileText, MessageCircle, Calendar, Trash2 } from "lucide-react";
import { format } from "date-fns";
import type { CRMActivity, ActivityFormData } from "@/hooks/useCRM";

interface Props {
  activities: CRMActivity[];
  clientId: string;
  onAdd: (clientId: string, data: ActivityFormData) => Promise<boolean>;
  onDelete: (id: string, clientId: string) => Promise<boolean>;
}

const activityIcons: Record<string, React.ReactNode> = {
  call: <Phone className="h-4 w-4" />,
  email: <Mail className="h-4 w-4" />,
  meeting: <Calendar className="h-4 w-4" />,
  note: <FileText className="h-4 w-4" />,
  message: <MessageCircle className="h-4 w-4" />,
};

const activityColors: Record<string, string> = {
  call: "bg-blue-100 text-blue-800",
  email: "bg-green-100 text-green-800",
  meeting: "bg-purple-100 text-purple-800",
  note: "bg-yellow-100 text-yellow-800",
  message: "bg-orange-100 text-orange-800",
};

export function ActivityLog({ activities, clientId, onAdd, onDelete }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<ActivityFormData>({
    activity_type: "note",
    title: "",
    description: "",
    activity_date: new Date().toISOString().slice(0, 16),
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const success = await onAdd(clientId, form);
    setSaving(false);
    if (success) {
      setShowForm(false);
      setForm({ activity_type: "note", title: "", description: "", activity_date: new Date().toISOString().slice(0, 16) });
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Activity History</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4 mr-1" />Log Activity
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {showForm && (
          <form onSubmit={handleSubmit} className="space-y-3 p-3 border rounded-lg bg-muted/30">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={form.activity_type} onValueChange={v => setForm(f => ({ ...f, activity_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="call">Phone Call</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="meeting">Meeting</SelectItem>
                    <SelectItem value="note">Note</SelectItem>
                    <SelectItem value="message">Message</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Date</Label>
                <Input type="datetime-local" value={form.activity_date} onChange={e => setForm(f => ({ ...f, activity_date: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label>Title *</Label>
              <Input required value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Follow-up call about quote" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" size="sm" variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
            </div>
          </form>
        )}

        {activities.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No activities logged yet.</p>
        ) : (
          <div className="space-y-2">
            {activities.map((activity) => (
              <div key={activity.id} className="flex items-start gap-3 p-3 border rounded-lg">
                <div className="mt-0.5">{activityIcons[activity.activity_type] || <FileText className="h-4 w-4" />}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">{activity.title}</span>
                    <Badge className={activityColors[activity.activity_type] || "bg-muted text-muted-foreground"} variant="secondary">
                      {activity.activity_type}
                    </Badge>
                  </div>
                  {activity.description && <p className="text-sm text-muted-foreground">{activity.description}</p>}
                  <p className="text-xs text-muted-foreground mt-1">{format(new Date(activity.activity_date), "PPp")}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => onDelete(activity.id, clientId)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
