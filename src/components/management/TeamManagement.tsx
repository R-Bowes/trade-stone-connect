import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Edit, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface TeamMember {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  role: string;
  hourly_rate: number;
  is_active: boolean;
}

export function TeamManagement() {
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    phone: "",
    role: "",
    hourly_rate: "",
    is_active: true,
  });
  const { toast } = useToast();

  useEffect(() => {
    loadTeamMembers();
  }, []);

  const loadTeamMembers = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("team_members")
        .select("*")
        .eq("contractor_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTeamMembers(data || []);
    } catch (error) {
      console.error("Error loading team members:", error);
      toast({
        title: "Error",
        description: "Failed to load team members",
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

      const memberData = {
        contractor_id: user.id,
        full_name: formData.full_name,
        email: formData.email,
        phone: formData.phone,
        role: formData.role,
        hourly_rate: parseFloat(formData.hourly_rate) || null,
        is_active: formData.is_active,
      };

      if (editingMember) {
        const { error } = await supabase
          .from("team_members")
          .update(memberData)
          .eq("id", editingMember.id);

        if (error) throw error;
        toast({ title: "Success", description: "Team member updated" });
      } else {
        const { error } = await supabase
          .from("team_members")
          .insert(memberData);

        if (error) throw error;
        toast({ title: "Success", description: "Team member added" });
      }

      setDialogOpen(false);
      setEditingMember(null);
      setFormData({
        full_name: "",
        email: "",
        phone: "",
        role: "",
        hourly_rate: "",
        is_active: true,
      });
      loadTeamMembers();
    } catch (error) {
      console.error("Error saving team member:", error);
      toast({
        title: "Error",
        description: "Failed to save team member",
        variant: "destructive",
      });
    }
  };

  const handleEdit = (member: TeamMember) => {
    setEditingMember(member);
    setFormData({
      full_name: member.full_name,
      email: member.email,
      phone: member.phone || "",
      role: member.role,
      hourly_rate: member.hourly_rate?.toString() || "",
      is_active: member.is_active,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from("team_members")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast({ title: "Success", description: "Team member deleted" });
      loadTeamMembers();
    } catch (error) {
      console.error("Error deleting team member:", error);
      toast({
        title: "Error",
        description: "Failed to delete team member",
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
          <h2 className="text-2xl font-bold">Team Management</h2>
          <p className="text-muted-foreground">Manage your team members</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditingMember(null);
            setFormData({
              full_name: "",
              email: "",
              phone: "",
              role: "",
              hourly_rate: "",
              is_active: true,
            });
          }
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Team Member
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingMember ? "Edit Team Member" : "Add New Team Member"}
              </DialogTitle>
              <DialogDescription>
                {editingMember ? "Update team member details" : "Add a new member to your team"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name</Label>
                <Input
                  id="full_name"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Input
                  id="role"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  placeholder="e.g., Electrician, Plumber"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hourly_rate">Hourly Rate (£)</Label>
                <Input
                  id="hourly_rate"
                  type="number"
                  step="0.01"
                  value={formData.hourly_rate}
                  onChange={(e) => setFormData({ ...formData, hourly_rate: e.target.value })}
                />
              </div>
              <Button onClick={handleSubmit} className="w-full">
                {editingMember ? "Update" : "Add"} Team Member
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {teamMembers.map((member) => (
          <Card key={member.id}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {member.full_name}
                    {member.is_active ? (
                      <Badge>Active</Badge>
                    ) : (
                      <Badge variant="secondary">Inactive</Badge>
                    )}
                  </CardTitle>
                  <CardDescription>{member.role}</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(member)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(member.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Email</p>
                  <p>{member.email}</p>
                </div>
                {member.phone && (
                  <div>
                    <p className="text-muted-foreground">Phone</p>
                    <p>{member.phone}</p>
                  </div>
                )}
                {member.hourly_rate && (
                  <div>
                    <p className="text-muted-foreground">Hourly Rate</p>
                    <p>£{member.hourly_rate}/hr</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}