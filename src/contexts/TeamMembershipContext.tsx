import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type TeamMember = Database["public"]["Tables"]["team_members"]["Row"];

export interface TeamMembershipState {
  loading: boolean;
  isTeamMember: boolean;
  // Full row, so callers that need contractor_id (e.g. useFieldTeamMember's
  // employer lookup) don't have to re-query it.
  teamMember: TeamMember | null;
}

const initialState: TeamMembershipState = {
  loading: true,
  isTeamMember: false,
  teamMember: null,
};

const TeamMembershipContext = createContext<TeamMembershipState>(initialState);

/**
 * The single place in the app that answers "is the current user an active
 * team member sub-account?" (team_members.profile_id = auth.uid() AND
 * status = 'active'). Mounted once near the app root, above <Routes>, so
 * Header, ProtectedRoute, Dashboard and the /field screens all read the
 * same cached answer instead of each re-querying team_members themselves —
 * that duplication is exactly what let Header.tsx's dashboardPath and
 * ProtectedRoute.tsx's role gate silently diverge from Dashboard.tsx's
 * correct behaviour.
 *
 * Does not query when there is no authenticated user. Refetches only on
 * auth state change (sign-in as a different user, sign-out) — not on every
 * render or route change.
 */
export function TeamMembershipProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TeamMembershipState>(initialState);

  useEffect(() => {
    let cancelled = false;

    const loadFor = async (userId: string | null) => {
      if (!userId) {
        if (!cancelled) setState({ loading: false, isTeamMember: false, teamMember: null });
        return;
      }

      if (!cancelled) setState((s) => ({ ...s, loading: true }));

      const { data } = await supabase
        .from("team_members")
        .select("*")
        .eq("profile_id", userId)
        .eq("status", "active")
        .maybeSingle();

      if (!cancelled) {
        setState({ loading: false, isTeamMember: !!data, teamMember: data ?? null });
      }
    };

    // Two-pronged, same reasoning as AcceptTeamInvite.tsx: a single
    // getSession() can race ahead of onAuthStateChange's async URL/token
    // parsing on first load. Subscribing to onAuthStateChange too catches
    // whichever way that race lands; loadFor() re-running for the same
    // user on the immediate INITIAL_SESSION event is a harmless no-op cost,
    // not a correctness issue.
    supabase.auth.getSession().then(({ data }) => {
      void loadFor(data.session?.user.id ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      void loadFor(session?.user.id ?? null);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <TeamMembershipContext.Provider value={state}>
      {children}
    </TeamMembershipContext.Provider>
  );
}

export function useTeamMembership(): TeamMembershipState {
  return useContext(TeamMembershipContext);
}
