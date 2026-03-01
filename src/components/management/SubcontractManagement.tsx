import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Edit, Loader2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

interface Subcontract {
  id: string;
  contract_id: string;
  subcontractor_id: string;
  scope_description: string;
  subcontract_value: number;
  start_date: string;
  end_date: string | null;
  status: string;
  subcontractor?: {
    full_name: string | null;
    company_name: string | null;
    ts_profile_code: string | null;
  };
}

interface ProContractor {
  user_id: string;
  full_name: string | null;
  company_name: string | null;
  ts_profile_code: string | null;
}

interface SubcontractManagementProps {
  contractId: string;
  contractTitle: string;
}

export function SubcontractManagement({ contractId, contractTitle }: SubcontractManagementProps) {
  const [subcontracts, setSubcontracts] = useState<Subcontract[]>([]);
  const [proContractors, setProContractors] = useState<ProContractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSubcontract, setEditingSubcontract] = useState<Subcontract | null>(null);
  const [formData, setFormData] = useState({
    subcontractor_id: "",
    scope_description: "",
    subcontract_value: "",
    start_date: "",
    end_date: "",
    status: "pending",
  });
  const { toast } = useToast();

  useEffect(() => {
    loadSubcontracts();
    loadProContractors();
  }, [contractId]);

  const loadSubcontracts = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("subcontracts")
        .select("*")
        .eq("contract_id", contractId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Fetch subcontractor details
      const subcontractorIds = data?.map(s => s.subcontractor_id) || [];
      if (subcontractorIds.length > 0) {
        const { data: profiles } = await supabase
          .from("public_pro_profiles")
          .select("user_id, full_name, company_name, ts_profile_code")
          .in("user_id", subcontractorIds);

        const profileMap = new Map(profiles?.map(p => [p.user_id, p]));
        const enrichedData = data?.map(s => ({
          ...s,
          subcontractor: profileMap.get(s.subcontractor_id)
        }));
        setSubcontracts(enrichedData || []);
      } else {
        setSubcontracts(data || []);
      }
    } catch (error) {
      console.error("Error loading subcontracts:", error);
      toast({
        title: "Error",
        description: "Failed to load subcontracts",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadProContractors = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load all Pro accounts except current user
      const { data, error } = await supabase
        .from("public_pro_profiles")
        .select("user_id, full_name, company_name, ts_profile_code")
        .eq("user_type", "contractor")
        .neq("user_id", user.id);

      if (error) throw error;
      setProContractors(data || []);
    } catch (error) {
      console.error("Error loading pro contractors:", error);
    }
  };

  const handleSubmit = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const subcontractData = {
        contract_id: contractId,
        contractor_id: user.id,
        subcontractor_id: formData.subcontractor_id,
        scope_description: formData.scope_description,
        subcontract_value: parseFloat(formData.subcontract_value),
        start_date: formData.start_date,
        end_date: formData.end_date || null,
        status: formData.status,
      };

      if (editingSubcontract) {
        const { error } = await supabase
          .from("subcontracts")
          .update(subcontractData)
          .eq("id", editingSubcontract.id);

        if (error) throw error;
        toast({ title: "Success", description: "Subcontract updated" });
      } else {
        const { error } = await supabase
          .from("subcontracts")
          .insert(subcontractData);

        if (error) throw error;
        toast({ title: "Success", description: "Subcontract added" });
      }

      resetForm();
      loadSubcontracts();
    } catch (error) {
      console.error("Error saving subcontract:", error);
      toast({
        title: "Error",
        description: "Failed to save subcontract",
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setDialogOpen(false);
    setEditingSubcontract(null);
    setFormData({
      subcontractor_id: "",
      scope_description: "",
      subcontract_value: "",
      start_date: "",
      end_date: "",
      status: "pending",
    });
  };

  const handleEdit = (subcontract: Subcontract) => {
    setEditingSubcontract(subcontract);
    setFormData({
      subcontractor_id: subcontract.subcontractor_id,
      scope_description: subcontract.scope_description,
      subcontract_value: subcontract.subcontract_value.toString(),
      start_date: subcontract.start_date,
      end_date: subcontract.end_date || "",
      status: subcontract.status,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from("subcontracts")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast({ title: "Success", description: "Subcontract deleted" });
      loadSubcontracts();
    } catch (error) {
      console.error("Error deleting subcontract:", error);
      toast({
        title: "Error",
        description: "Failed to delete subcontract",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      pending: "secondary",
      active: "default",
      completed: "default",
      cancelled: "destructive",
    };
    return <Badge variant={variants[status] || "outline"}>{status}</Badge>;
  };

  if (loading) {
    return (
      <div className="flex justify-center p-4">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="mt-4 pt-4 border-t">
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">Subcontracts</span>
          <Badge variant="outline" className="text-xs">{subcontracts.length}</Badge>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline">
              <Plus className="mr-1 h-3 w-3" />
              Add Subcontract
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>
                {editingSubcontract ? "Edit Subcontract" : "Add Subcontract"}
              </DialogTitle>
              <DialogDescription>
                Assign part of "{contractTitle}" to a platform contractor
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="subcontractor_id">Subcontractor (Pro Account)</Label>
                <Select
                  value={formData.subcontractor_id}
                  onValueChange={(value) => setFormData({ ...formData, subcontractor_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a contractor" />
                  </SelectTrigger>
                  <SelectContent>
                    {proContractors.map((contractor) => (
                      <SelectItem key={contractor.user_id} value={contractor.user_id}>
                        {contractor.company_name || contractor.full_name || "Unknown"} 
                        {contractor.ts_profile_code && ` (${contractor.ts_profile_code})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="scope_description">Scope of Work</Label>
                <Textarea
                  id="scope_description"
                  value={formData.scope_description}
                  onChange={(e) => setFormData({ ...formData, scope_description: e.target.value })}
                  placeholder="Describe the work being subcontracted"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="subcontract_value">Value (£)</Label>
                  <Input
                    id="subcontract_value"
                    type="number"
                    step="0.01"
                    value={formData.subcontract_value}
                    onChange={(e) => setFormData({ ...formData, subcontract_value: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sub_status">Status</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => setFormData({ ...formData, status: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sub_start_date">Start Date</Label>
                  <Input
                    id="sub_start_date"
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sub_end_date">End Date</Label>
                  <Input
                    id="sub_end_date"
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  />
                </div>
              </div>
              <Button onClick={handleSubmit} className="w-full">
                {editingSubcontract ? "Update" : "Create"} Subcontract
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {subcontracts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No subcontracts yet</p>
      ) : (
        <div className="space-y-2">
          {subcontracts.map((sub) => (
            <div key={sub.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-sm">
                    {sub.subcontractor?.company_name || sub.subcontractor?.full_name || "Unknown Contractor"}
                  </span>
                  {getStatusBadge(sub.status)}
                </div>
                <p className="text-xs text-muted-foreground line-clamp-1">{sub.scope_description}</p>
                <p className="text-xs mt-1">
                  £{sub.subcontract_value.toLocaleString()} • {new Date(sub.start_date).toLocaleDateString()}
                </p>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => handleEdit(sub)}>
                  <Edit className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(sub.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
