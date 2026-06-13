import { useState, useEffect } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";

type PageState = "loading" | "unauthenticated" | "accepting" | "success" | "error";

const InvitePage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");

  const [pageState, setPageState] = useState<PageState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const handleInvite = async () => {
      if (!token) {
        setErrorMessage("Invalid invite link — no token found.");
        setPageState("error");
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        setPageState("unauthenticated");
        return;
      }

      // Check user_type before attempting accept: non-business accounts cannot currently
      // access the business dashboard, so accepting silently would strand them.
      const { data: profile } = await supabase
        .from("profiles")
        .select("user_type")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (profile && profile.user_type !== "business") {
        setErrorMessage(
          "Your account type cannot access the business dashboard yet. " +
          "Business membership for non-business accounts is a planned feature."
        );
        setPageState("error");
        return;
      }

      setPageState("accepting");
      const { error } = await supabase.rpc("accept_business_invite", { p_token: token });

      if (error) {
        setErrorMessage(error.message);
        setPageState("error");
      } else {
        setPageState("success");
        setTimeout(() => navigate("/dashboard/business"), 1500);
      }
    };

    handleInvite();
  }, [token, navigate]);

  const handleSignInWithToken = () => {
    if (token) {
      localStorage.setItem("pending_invite_token", token);
    }
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="container mx-auto px-4 py-16 max-w-md">

        {pageState === "loading" && (
          <div className="text-center space-y-2">
            <i className="ti ti-loader-2 animate-spin" style={{ fontSize: 32, color: "#9ca3af" }} />
            <p className="text-muted-foreground text-sm">Checking your invite...</p>
          </div>
        )}

        {pageState === "unauthenticated" && (
          <div className="text-center space-y-4">
            <i className="ti ti-mail-opened" style={{ fontSize: 40, color: "#1e3a5f" }} />
            <h1 className="font-heading text-2xl font-bold">You have been invited</h1>
            <p className="text-muted-foreground text-sm">
              Sign in to accept your invitation and join the team on TradeStone.
            </p>
            <div className="flex flex-col gap-2 pt-2">
              <Button onClick={handleSignInWithToken} className="w-full">
                Sign in to accept
              </Button>
              <p className="text-xs text-muted-foreground">
                No account yet?{" "}
                <Link
                  to="/login"
                  onClick={() => token && localStorage.setItem("pending_invite_token", token)}
                  className="underline text-primary"
                >
                  Create one
                </Link>{" "}
                then come back to this link.
              </p>
            </div>
          </div>
        )}

        {pageState === "accepting" && (
          <div className="text-center space-y-2">
            <i className="ti ti-loader-2 animate-spin" style={{ fontSize: 32, color: "#f07820" }} />
            <p className="text-muted-foreground text-sm">Accepting your invitation...</p>
          </div>
        )}

        {pageState === "success" && (
          <div className="text-center space-y-2">
            <i className="ti ti-circle-check" style={{ fontSize: 40, color: "#16a34a" }} />
            <h1 className="font-heading text-2xl font-bold">Welcome to the team</h1>
            <p className="text-muted-foreground text-sm">Redirecting to your dashboard...</p>
          </div>
        )}

        {pageState === "error" && (
          <div className="text-center space-y-4">
            <i className="ti ti-circle-x" style={{ fontSize: 40, color: "#dc2626" }} />
            <h1 className="font-heading text-2xl font-bold">Invite could not be accepted</h1>
            {errorMessage && (
              <p className="text-sm text-muted-foreground">{errorMessage}</p>
            )}
            <Button variant="outline" asChild>
              <Link to="/">Go to homepage</Link>
            </Button>
          </div>
        )}

      </div>
    </div>
  );
};

export default InvitePage;
