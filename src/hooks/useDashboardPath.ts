import { useEffect, useState } from "react";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useTeamMembership } from "@/contexts/TeamMembershipContext";

export interface DashboardProfile {
  user_type: "personal" | "business" | "contractor";
  full_name: string | null;
  ts_profile_code: string | null;
  logo_url: string | null;
}

// Extracted out of Header.tsx (single source of truth) so any other
// component needing "where does this logged-in user's dashboard live"
// consumes the exact same session/profile fetch and role-resolution
// logic, rather than a hand-copied second version that can drift.
export function useDashboardPath() {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<DashboardProfile | null>(null);
  const { isTeamMember, loading: teamLoading } = useTeamMembership();

  useEffect(() => {
    const fetchProfile = async (userId: string) => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_type, full_name, ts_profile_code, logo_url")
        .eq("user_id", userId)
        .single();

      if (error) {
        console.error("Error fetching profile:", error);
        return;
      }

      setProfile(data);
    };

    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
    };

    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else setProfile(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Role-aware base path. 'personal' user_type is ambiguous — it covers both
  // genuine homeowners and team member sub-accounts, which must never land on
  // /dashboard/homeowner (see TeamMembershipContext). While team-membership
  // status is still resolving, dashboardPath is null rather than guessing
  // homeowner and correcting later — callers must treat null as "not ready
  // yet" and omit/disable their click target accordingly.
  const dashboardPath = !user || !profile
    ? "/"
    : profile.user_type === "contractor"
    ? "/dashboard/contractor"
    : profile.user_type === "business"
    ? "/dashboard/business"
    : teamLoading
    ? null
    : isTeamMember
    ? "/field"
    : "/dashboard/homeowner";

  return { user, profile, dashboardPath };
}
