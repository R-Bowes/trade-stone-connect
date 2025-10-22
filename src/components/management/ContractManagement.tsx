import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Edit, Loader2, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

interface Contract {
  id: string;
  client_name: string;
  client_email: string;
  client_phone: string | null;
  project_title: string;
  project_description: string;
  contract_value: number;
  start_date: string;
  end_date: string | null;
  status: string;
  terms: string | null;
}

export function ContractManagement() {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [formData, setFormData] = useState({
    client_name: "",
    client_email: "",
    client_phone: "",
    project_title: "",
    project_description: "",
    contract_value: "",
    start_date: "",
    end_date: "",
    status: "draft",
    terms: "",
  });
  const { toast } = useToast();

  useEffect(() => {
    loadContracts();
  }, []);

  const loadContracts = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("contracts")
        .select("*")
        .eq("contractor_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setContracts(data || []);
    } catch (error) {
      console.error("Error loading contracts:", error);
      toast({
        title: "Error",
        description: "Failed to load contracts",
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

      const contractData = {
        contractor_id: user.id,
        client_name: formData.client_name,
        client_email: formData.client_email,
        client_phone: formData.client_phone || null,
        project_title: formData.project_title,
        project_description: formData.project_description,
        contract_value: parseFloat(formData.contract_value),
        start_date: formData.start_date,
        end_date: formData.end_date || null,
        status: formData.status,
        terms: formData.terms || null,
      };

      if (editingContract) {
        const { error } = await supabase
          .from("contracts")
          .update(contractData)
          .eq("id", editingContract.id);

        if (error) throw error;
        toast({ title: "Success", description: "Contract updated" });
      } else {
        const { error } = await supabase
          .from("contracts")
          .insert(contractData);

        if (error) throw error;
        toast({ title: "Success", description: "Contract added" });
      }

      setDialogOpen(false);
      setEditingContract(null);
      setFormData({
        client_name: "",
        client_email: "",
        client_phone: "",
        project_title: "",
        project_description: "",
        contract_value: "",
        start_date: "",
        end_date: "",
        status: "draft",
        terms: "",
      });
      loadContracts();
    } catch (error) {
      console.error("Error saving contract:", error);
      toast({
        title: "Error",
        description: "Failed to save contract",
        variant: "destructive",
      });
    }
  };

  const handleEdit = (contract: Contract) => {
    setEditingContract(contract);
    setFormData({
      client_name: contract.client_name,
      client_email: contract.client_email,
      client_phone: contract.client_phone || "",
      project_title: contract.project_title,
      project_description: contract.project_description,
      contract_value: contract.contract_value.toString(),
      start_date: contract.start_date,
      end_date: contract.end_date || "",
      status: contract.status,
      terms: contract.terms || "",
    });
    setDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from("contracts")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast({ title: "Success", description: "Contract deleted" });
      loadContracts();
    } catch (error) {
      console.error("Error deleting contract:", error);
      toast({
        title: "Error",
        description: "Failed to delete contract",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive"> = {
      draft: "secondary",
      active: "default",
      completed: "default",
      cancelled: "destructive",
    };
    return <Badge variant={variants[status] || "default"}>{status}</Badge>;
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
          <h2 className="text-2xl font-bold">Contract Management</h2>
          <p className="text-muted-foreground">Manage your project contracts</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) {
            setEditingContract(null);
            setFormData({
              client_name: "",
              client_email: "",
              client_phone: "",
              project_title: "",
              project_description: "",
              contract_value: "",
              start_date: "",
              end_date: "",
              status: "draft",
              terms: "",
            });
          }
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Contract
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingContract ? "Edit Contract" : "Add New Contract"}
              </DialogTitle>
              <DialogDescription>
                {editingContract ? "Update contract details" : "Create a new contract"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="client_name">Client Name</Label>
                  <Input
                    id="client_name"
                    value={formData.client_name}
                    onChange={(e) => setFormData({ ...formData, client_name: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="client_email">Client Email</Label>
                  <Input
                    id="client_email"
                    type="email"
                    value={formData.client_email}
                    onChange={(e) => setFormData({ ...formData, client_email: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="client_phone">Client Phone</Label>
                <Input
                  id="client_phone"
                  value={formData.client_phone}
                  onChange={(e) => setFormData({ ...formData, client_phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="project_title">Project Title</Label>
                <Input
                  id="project_title"
                  value={formData.project_title}
                  onChange={(e) => setFormData({ ...formData, project_title: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="project_description">Project Description</Label>
                <Textarea
                  id="project_description"
                  value={formData.project_description}
                  onChange={(e) => setFormData({ ...formData, project_description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="contract_value">Contract Value (£)</Label>
                  <Input
                    id="contract_value"
                    type="number"
                    step="0.01"
                    value={formData.contract_value}
                    onChange={(e) => setFormData({ ...formData, contract_value: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => setFormData({ ...formData, status: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start_date">Start Date</Label>
                  <Input
                    id="start_date"
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end_date">End Date (Optional)</Label>
                  <Input
                    id="end_date"
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="terms">Terms & Conditions</Label>
                <Textarea
                  id="terms"
                  value={formData.terms}
                  onChange={(e) => setFormData({ ...formData, terms: e.target.value })}
                  rows={4}
                />
              </div>
              <Button onClick={handleSubmit} className="w-full">
                {editingContract ? "Update" : "Create"} Contract
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {contracts.map((contract) => (
          <Card key={contract.id}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="h-5 w-5" />
                    <CardTitle>{contract.project_title}</CardTitle>
                    {getStatusBadge(contract.status)}
                  </div>
                  <CardDescription>
                    Client: {contract.client_name} • Value: £{contract.contract_value.toLocaleString()}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEdit(contract)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(contract.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <p><strong>Description:</strong> {contract.project_description}</p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-muted-foreground">Start Date</p>
                    <p>{new Date(contract.start_date).toLocaleDateString()}</p>
                  </div>
                  {contract.end_date && (
                    <div>
                      <p className="text-muted-foreground">End Date</p>
                      <p>{new Date(contract.end_date).toLocaleDateString()}</p>
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-muted-foreground">Contact</p>
                  <p>{contract.client_email} {contract.client_phone && `• ${contract.client_phone}`}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}