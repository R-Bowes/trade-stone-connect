import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type TeamMember = Database["public"]["Tables"]["team_members"]["Row"];

export type TeamMemberInsert = Pick<
  Database["public"]["Tables"]["team_members"]["Insert"],
  "full_name" | "email" | "role" | "phone" | "hourly_rate"
>;

export type TeamMemberUpdate = Partial<TeamMemberInsert & { is_active: boolean }>;

// team_members.contractor_id references profiles.user_id (not profiles.id).
// Since profiles.user_id = auth.uid() by construction, we use auth user.id
// directly — same exception pattern as contractor_photos per CLAUDE.md.

// For the authenticated contractor managing their own team.
export function useContractorTeam() {
  const [userId, setUserId] = useState<string | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }
    setUserId(user.id);

    const { data } = await supabase
      .from("team_members")
      .select("*")
      .eq("contractor_id", user.id)
      .order("full_name", { ascending: true });

    setMembers(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addMember = useCallback(async (data: TeamMemberInsert) => {
    if (!userId) return;
    const { data: inserted, error } = await supabase
      .from("team_members")
      .insert({ ...data, contractor_id: userId, is_active: true })
      .select()
      .single();
    if (error) throw error;
    if (inserted) setMembers(prev => [...prev, inserted]);
  }, [userId]);

  const updateMember = useCallback(async (id: string, data: TeamMemberUpdate) => {
    const { data: updated, error } = await supabase
      .from("team_members")
      .update(data)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    if (updated) setMembers(prev => prev.map(m => m.id === id ? updated : m));
  }, []);

  const deleteMember = useCallback(async (id: string) => {
    const { error } = await supabase.from("team_members").delete().eq("id", id);
    if (error) throw error;
    setMembers(prev => prev.filter(m => m.id !== id));
  }, []);

  return { members, loading, addMember, updateMember, deleteMember, refetch: load };
}

// For the public contractor profile page.
// contractorProfileId is profiles.id, which equals profiles.user_id
// (the value stored in team_members.contractor_id).
export function usePublicTeam(contractorProfileId: string) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!contractorProfileId) return;
    const load = async () => {
      const { data } = await supabase
        .from("team_members")
        .select("*")
        .eq("contractor_id", contractorProfileId)
        .eq("is_active", true)
        .order("full_name", { ascending: true });
      setMembers(data ?? []);
      setLoading(false);
    };
    load();
  }, [contractorProfileId]);

  return { members, loading };
}
