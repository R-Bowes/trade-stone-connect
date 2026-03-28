import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ErrorState, LoadingState } from "@/components/AsyncState";

type UserRole = "personal" | "business" | "contractor";

const roleDashboardMap: Record<UserRole, string> = {
  personal: "/dashboard/personal",
  business: "/dashboard/business",
  contractor: "/dashboard/contractor",
};

const ProtectedRoute = ({
  children,
  requiredRole,
}: {
  children: React.ReactNode;
  requiredRole?: UserRole;
}) => {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const checkAuth = useCallback(async () => {
    setLoading(true);
    setAuthError(null);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        throw sessionError;
      }

      if (!session?.user) {
        setAuthenticated(false);
        setUserRole(null);
        return;
      }

      setAuthenticated(true);

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("user_type")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (profileError) {
        throw profileError;
      }

      setUserRole((profile?.user_type as UserRole) ?? "personal");
    } catch (error) {
      console.error("Auth check failed", error);
      setAuthError("We couldn't verify your session. Please retry.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void checkAuth();
    });

    return () => subscription.unsubscribe();
  }, [checkAuth]);

  if (loading) {
    return <LoadingState message="Checking your session..." />;
  }

  if (authError) {
    return <ErrorState message={authError} onRetry={() => void checkAuth()} />;
  }

  if (!authenticated) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRole && userRole && userRole !== requiredRole) {
    return <Navigate to={roleDashboardMap[userRole]} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
