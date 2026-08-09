import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useTeamMembership } from "@/contexts/TeamMembershipContext";

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
 * Resolves the acting user's own team_members row plus their employer's
 * display name. The team_members row itself now comes from
 * TeamMembershipContext (the app-wide cached answer to "is this user an
 * active team member") rather than a query this hook runs independently —
 * that duplication is what let this hook and Header.tsx/ProtectedRoute.tsx
 * silently disagree. This hook adds only what the field view needs on top:
 * the employer's display name and TS-C code, resolved via
 * teamMember.contractor_id.
 */
export function useFieldTeamMember(): FieldTeamMemberState {
  const { loading: membershipLoading, teamMember } = useTeamMembership();
  const [ownProfileId, setOwnProfileId] = useState<string | null>(null);
  const [employer, setEmployer] = useState<{ employerName: string | null; employerTsCode: string | null }>({
    employerName: null,
    employerTsCode: null,
  });
  const [employerLoading, setEmployerLoading] = useState(false);

  useEffect(() => {
    if (membershipLoading) return;

    let cancelled = false;

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!cancelled) setOwnProfileId(user?.id ?? null);

      if (!teamMember) {
        if (!cancelled) setEmployer({ employerName: null, employerTsCode: null });
        return;
      }

      setEmployerLoading(true);

      // Resolved via team_members.contractor_id -> the CONTRACTOR's own
      // profile row. Deliberately not selecting anything off the team
      // member's own profile here — there is nothing on it worth showing.
      const { data: employerRow } = await supabase
        .from("profiles")
        .select("company_name, full_name, ts_profile_code")
        .eq("id", teamMember.contractor_id)
        .maybeSingle();

      if (!cancelled) {
        setEmployer({
          employerName: employerRow?.company_name || employerRow?.full_name || "your employer",
          employerTsCode: employerRow?.ts_profile_code ?? null,
        });
        setEmployerLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [membershipLoading, teamMember]);

  return {
    loading: membershipLoading || (!!teamMember && employerLoading),
    teamMember,
    employerName: employer.employerName,
    employerTsCode: employer.employerTsCode,
    ownProfileId,
  };
}
