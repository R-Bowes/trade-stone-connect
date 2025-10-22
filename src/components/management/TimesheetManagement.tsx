import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

interface Timesheet {
  id: string;
  team_member_id: string | null;
  project_name: string;
  date: string;
  hours_worked: number;
  description: string;
  status: string;
}

interface TeamMember {
  id: string;
  full_name: string;
}

export function TimesheetManagement() {
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    team_member_id: "",
    project_name: "",
    date: new Date().toISOString().split("T")[0],
    hours_worked: "",
    description: "",
    status: "pending",
  });
  const { toast } = useToast();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [timesheetsResult, membersResult] = await Promise.all([
        supabase
          .from("timesheets")
          .select("*")
          .eq("contractor_id", user.id)
          .order("date", { ascending: false }),
        supabase
          .from("team_members")
          .select("id, full_name")
          .eq("contractor_id", user.id)
          .eq("is_active", true)
      ]);

      if (timesheetsResult.error) throw timesheetsResult.error;
      if (membersResult.error) throw membersResult.error;

      setTimesheets(timesheetsResult.data || []);
      setTeamMembers(membersResult.data || []);
    } catch (error) {
      console.error("Error loading data:", error);
      toast({
        title: "Error",
        description: "Failed to load timesheets",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase.from("timesheets").insert({
        contractor_id: user.id,
        team_member_id: formData.team_member_id || null,
        project_name: formData.project_name,
        date: formData.date,
        hours_worked: parseFloat(formData.hours_worked),
        description: formData.description,
        status: formData.status,
      });

      if (error) throw error;

      toast({ title: "Success", description: "Timesheet added" });
      setDialogOpen(false);
      setFormData({
        team_member_id: "",
        project_name: "",
        date: new Date().toISOString().split("T")[0],
        hours_worked: "",
        description: "",
        status: "pending",
      });
      loadData();
    } catch (error) {
      console.error("Error saving timesheet:", error);
      toast({
        title: "Error",
        description: "Failed to save timesheet",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from("timesheets")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast({ title: "Success", description: "Timesheet deleted" });
      loadData();
    } catch (error) {
      console.error("Error deleting timesheet:", error);
      toast({
        title: "Error",
        description: "Failed to delete timesheet",
        variant: "destructive",
      });
    }
  };

  const updateStatus = async (id: string, status: string) => {
    try {
      const { error } = await supabase
        .from("timesheets")
        .update({ status })
        .eq("id", id);

      if (error) throw error;
      toast({ title: "Success", description: "Status updated" });
      loadData();
    } catch (error) {
      console.error("Error updating status:", error);
      toast({
        title: "Error",
        description: "Failed to update status",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">Timesheet Management</h2>
          <p className="text-muted-foreground">Track hours worked on projects</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Timesheet
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Timesheet</DialogTitle>
              <DialogDescription>Record hours worked on a project</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="team_member">Team Member (Optional)</Label>
                <Select
                  value={formData.team_member_id}
                  onValueChange={(value) => setFormData({ ...formData, team_member_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select team member" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None (Personal)</SelectItem>
                    {teamMembers.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="project_name">Project Name</Label>
                <Input
                  id="project_name"
                  value={formData.project_name}
                  onChange={(e) => setFormData({ ...formData, project_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hours_worked">Hours Worked</Label>
                <Input
                  id="hours_worked"
                  type="number"
                  step="0.5"
                  value={formData.hours_worked}
                  onChange={(e) => setFormData({ ...formData, hours_worked: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                />
              </div>
              <Button onClick={handleSubmit} className="w-full">
                Add Timesheet
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {timesheets.map((timesheet) => (
          <Card key={timesheet.id}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle>{timesheet.project_name}</CardTitle>
                  <CardDescription>
                    {new Date(timesheet.date).toLocaleDateString()} • {timesheet.hours_worked} hours
                  </CardDescription>
                </div>
                <div className="flex gap-2 items-center">
                  <Select
                    value={timesheet.status}
                    onValueChange={(value) => updateStatus(timesheet.id, value)}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(timesheet.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            {timesheet.description && (
              <CardContent>
                <p className="text-sm text-muted-foreground">{timesheet.description}</p>
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}