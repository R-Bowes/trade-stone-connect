import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type TeamMember = Database["public"]["Tables"]["team_members"]["Row"];

export interface FieldTeamMemberState {
  loading: boolean;
  // null once loaded means: not an active team member of anyone — the /field
  // guard is what decides what to do about that, this hook just reports it.
  teamMember: TeamMember | null;
  employerName: string | null;
  // The EMPLOYER's ts_profile_code (TS-C-...) — never the team member's own.
  // A team member's own code is meaningless (minted off user_type='personal'
  // at signup, so it's a TS-P-... code) and must never be surfaced on any
  // team-facing screen.
  employerTsCode: string | null;
  ownProfileId: string | null;
}

/**
 * Resolves the acting user's own team_members row (profile_id = auth.uid(),
 * status='active') plus their employer's display name. Used by the /field
 * guard and every field/* screen — kept as one hook so each screen doesn't
 * re-derive this independently.
 */
export function useFieldTeamMember(): FieldTeamMemberState {
  const [state, setState] = useState<FieldTeamMemberState>({
    loading: true,
    teamMember: null,
    employerName: null,
    employerTsCode: null,
    ownProfileId: null,
  });

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) {
          setState({ loading: false, teamMember: null, employerName: null, employerTsCode: null, ownProfileId: null });
        }
        return;
      }

      const { data: teamMember } = await supabase
        .from("team_members")
        .select("*")
        .eq("profile_id", user.id)
        .eq("status", "active")
        .maybeSingle();

      if (!teamMember) {
        if (!cancelled) {
          setState({ loading: false, teamMember: null, employerName: null, employerTsCode: null, ownProfileId: user.id });
        }
        return;
      }

      // Resolved via team_members.contractor_id -> the CONTRACTOR's own
      // profile row. Deliberately not selecting anything off the team
      // member's own profile here — there is nothing on it worth showing.
      const { data: employer } = await supabase
        .from("profiles")
        .select("company_name, full_name, ts_profile_code")
        .eq("id", teamMember.contractor_id)
        .maybeSingle();

      if (!cancelled) {
        setState({
          loading: false,
          teamMember,
          employerName: employer?.company_name || employer?.full_name || "your employer",
          employerTsCode: employer?.ts_profile_code ?? null,
          ownProfileId: user.id,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
