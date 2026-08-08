import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useFieldTeamMember } from "@/hooks/useFieldTeamMember";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

/**
 * Guards /field. A user with no active team_members row (a contractor
 * hitting it directly, a homeowner, a business user, an unauthenticated
 * visitor) is bounced to /dashboard, which resolves their real role —
 * this component never duplicates that resolution logic itself.
 */
export default function FieldGuard({ children }: { children: React.ReactNode }) {
  const { loading, teamMember } = useFieldTeamMember();
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setAuthenticated(!!data.session);
      setAuthChecked(true);
    });
  }, []);

  if (!authChecked || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#1a2744" }}>
        <Loader2 className="h-6 w-6 animate-spin text-white" />
      </div>
    );
  }

  if (!authenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!teamMember) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
