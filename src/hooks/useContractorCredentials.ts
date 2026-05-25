import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Credential = Database["public"]["Tables"]["contractor_credentials"]["Row"];

export type NewCredential = Pick<
  Database["public"]["Tables"]["contractor_credentials"]["Insert"],
  "name" | "issuer" | "reference_number" | "verified" | "display_order"
>;

export function useContractorCredentials() {
  const [contractorId, setContractorId] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    // Two-step lookup: profiles.user_id → profiles.id
    const { data: profile } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .single();
    if (!profile) { setLoading(false); return; }
    setContractorId(profile.id);

    const { data } = await supabase
      .from("contractor_credentials")
      .select("*")
      .eq("contractor_id", profile.id)
      .order("display_order", { ascending: true });

    setCredentials(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addCredential = useCallback(async (data: NewCredential) => {
    if (!contractorId) return;
    const { data: inserted } = await supabase
      .from("contractor_credentials")
      .insert({ ...data, contractor_id: contractorId })
      .select()
      .single();
    if (inserted) setCredentials(prev => [...prev, inserted]);
  }, [contractorId]);

  const deleteCredential = useCallback(async (id: string) => {
    await supabase.from("contractor_credentials").delete().eq("id", id);
    setCredentials(prev => prev.filter(c => c.id !== id));
  }, []);

  return { credentials, addCredential, deleteCredential, loading, refetch: load };
}
