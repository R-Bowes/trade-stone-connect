import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface CRMClient {
  id: string;
  contractor_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  address: string | null;
  notes: string | null;
  status: string;
  source: string | null;
  total_revenue: number;
  created_at: string;
  updated_at: string;
}

export interface CRMActivity {
  id: string;
  contractor_id: string;
  client_id: string;
  activity_type: string;
  title: string;
  description: string | null;
  activity_date: string;
  created_at: string;
}

export type ClientFormData = {
  full_name: string;
  email: string;
  phone: string;
  company_name: string;
  address: string;
  notes: string;
  status: string;
  source: string;
};

export type ActivityFormData = {
  activity_type: string;
  title: string;
  description: string;
  activity_date: string;
};

export function useCRM() {
  const [clients, setClients] = useState<CRMClient[]>([]);
  const [activities, setActivities] = useState<CRMActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchClients = useCallback(async () => {
    const { data, error } = await supabase
      .from("crm_clients")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching clients:", error);
      toast({ title: "Error", description: "Failed to load clients", variant: "destructive" });
    } else {
      setClients(data || []);
    }
  }, [toast]);

  const fetchActivities = useCallback(async (clientId?: string) => {
    let query = supabase
      .from("crm_activities")
      .select("*")
      .order("activity_date", { ascending: false });

    if (clientId) {
      query = query.eq("client_id", clientId);
    }

    const { data, error } = await query;
    if (error) {
      console.error("Error fetching activities:", error);
    } else {
      setActivities(data || []);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchClients(), fetchActivities()]);
      setLoading(false);
    };
    load();
  }, [fetchClients, fetchActivities]);

  const addClient = async (data: ClientFormData) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("crm_clients").insert({
      contractor_id: user.id,
      full_name: data.full_name,
      email: data.email || null,
      phone: data.phone || null,
      company_name: data.company_name || null,
      address: data.address || null,
      notes: data.notes || null,
      status: data.status,
      source: data.source || "manual",
    });

    if (error) {
      toast({ title: "Error", description: "Failed to add client", variant: "destructive" });
      return false;
    }

    toast({ title: "Client Added", description: `${data.full_name} has been added to your CRM.` });
    await fetchClients();
    return true;
  };

  const updateClient = async (id: string, data: Partial<ClientFormData>) => {
    const { error } = await supabase
      .from("crm_clients")
      .update(data)
      .eq("id", id);

    if (error) {
      toast({ title: "Error", description: "Failed to update client", variant: "destructive" });
      return false;
    }

    toast({ title: "Client Updated" });
    await fetchClients();
    return true;
  };

  const deleteClient = async (id: string) => {
    const { error } = await supabase.from("crm_clients").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: "Failed to delete client", variant: "destructive" });
      return false;
    }
    toast({ title: "Client Deleted" });
    await fetchClients();
    return true;
  };

  const addActivity = async (clientId: string, data: ActivityFormData) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase.from("crm_activities").insert({
      contractor_id: user.id,
      client_id: clientId,
      activity_type: data.activity_type,
      title: data.title,
      description: data.description || null,
      activity_date: data.activity_date || new Date().toISOString(),
    });

    if (error) {
      toast({ title: "Error", description: "Failed to add activity", variant: "destructive" });
      return false;
    }

    toast({ title: "Activity Logged" });
    await fetchActivities(clientId);
    return true;
  };

  const deleteActivity = async (id: string, clientId: string) => {
    const { error } = await supabase.from("crm_activities").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: "Failed to delete activity", variant: "destructive" });
      return false;
    }
    await fetchActivities(clientId);
    return true;
  };

  return {
    clients,
    activities,
    loading,
    addClient,
    updateClient,
    deleteClient,
    addActivity,
    deleteActivity,
    fetchActivities,
  };
}
