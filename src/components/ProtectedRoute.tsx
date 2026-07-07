import { useCallback, useEffect, useRef, useState } from "react";
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

  // Tracks whose session is currently loaded, so a SIGNED_IN event for the
  // same user (re-emitted on some token refresh cycles) doesn't trigger a
  // redundant full re-check. Cleared on SIGNED_OUT.
  const loadedUserIdRef = useRef<string | null>(null);
  // Once the initial check has resolved to a real role, never show the
  // full-page loading gate again for this mount — defence in depth so no
  // later refetch (even one we didn't anticipate) can unmount the tree.
  const hasLoadedOnceRef = useRef(false);

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
        loadedUserIdRef.current = null;
        setAuthenticated(false);
        setUserRole(null);
        return;
      }

      loadedUserIdRef.current = session.user.id;
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
      hasLoadedOnceRef.current = true;
    } catch (error) {
      console.error("Auth check failed", error);
      setAuthError("We couldn't verify your session. Please retry.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();

    // TOKEN_REFRESHED (and any other event we don't explicitly handle) is a
    // no-op for UI state — it fires routinely on tab-focus return and must
    // not re-run the full check, which would flip `loading` and unmount
    // whatever's rendered inside this route. Only a genuine sign-out or a
    // sign-in as a *different* user warrants re-deriving auth/role state.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        loadedUserIdRef.current = null;
        setAuthenticated(false);
        setUserRole(null);
        return;
      }

      if (event === "SIGNED_IN") {
        if (session?.user.id !== loadedUserIdRef.current) {
          void checkAuth();
        }
        return;
      }

      // TOKEN_REFRESHED, USER_UPDATED, etc. — session object isn't cached
      // here, so there's nothing to silently update; UI state is untouched.
    });

    return () => subscription.unsubscribe();
  }, [checkAuth]);

  if (loading && !hasLoadedOnceRef.current) {
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
