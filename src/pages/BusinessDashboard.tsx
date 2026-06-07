import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { LoadingState, ErrorState } from "@/components/AsyncState";
import BusinessLayout from "@/components/layout/BusinessLayout";
import { HelpSystemProvider } from "@/components/help/HelpSystemProvider";
import { BusinessOverview } from "@/components/business/BusinessOverview";
import { BusinessJobsView } from "@/components/business/BusinessJobsView";
import { BusinessComplianceView } from "@/components/business/BusinessComplianceView";
import { BusinessSpendView } from "@/components/business/BusinessSpendView";
import { ReceivedInvoices } from "@/components/recipient/ReceivedInvoices";
import { ReceivedQuotes } from "@/components/recipient/ReceivedQuotes";
import { PanelManagement } from "@/components/business/PanelManagement";
import { MaintenanceManagement } from "@/components/business/MaintenanceManagement";
import { BusinessMessageInbox } from "@/components/business/BusinessMessageInbox";
import BusinessSettings from "@/pages/BusinessSettings";
import Header from "@/components/Header";
import type { User } from "@supabase/supabase-js";

const BusinessDashboard = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activeView = searchParams.get("view") ?? "dashboard";

  const [user, setUser] = useState<User | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyFetchError, setCompanyFetchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Phase 1: resolve auth + profile (runs once on mount).
  useEffect(() => {
    const loadProfile = async () => {
      setLoadError(null);

      const { data: { user: currentUser }, error: userError } = await supabase.auth.getUser();
      if (userError) { setLoadError("Unable to validate your account."); setLoading(false); return; }
      if (!currentUser) { navigate("/login"); return; }
      setUser(currentUser);

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, user_type")
        .eq("user_id", currentUser.id)
        .maybeSingle();

      if (profileError) { setLoadError("Unable to load your profile."); setLoading(false); return; }
      if (profile?.user_type && profile.user_type !== "business") {
        navigate(`/dashboard/${profile.user_type}`);
        return;
      }

      const pid = profile?.id ?? null;
      setProfileId(pid);
      // If no profile row exists, phase 2 won't fire (profileId stays null).
      // Clear loading here so the user sees a useful state rather than hanging.
      if (!pid) setLoading(false);
    };
    loadProfile();
  }, [navigate]);

  // Phase 2: resolve company — re-runs whenever profileId becomes available.
  // This also handles the in-session case: user creates their company via
  // embedded Settings, then navigates to a company-requiring view. Previously
  // the [navigate] dependency never re-fired, so companyId stayed null.
  useEffect(() => {
    if (!profileId) return;

    const fetchCompany = async () => {
      setCompanyFetchError(null);

      // .limit(1) prevents PGRST116 (the "multiple rows" error from .maybeSingle())
      // from being treated silently as "no company". We also check `error` explicitly
      // so RLS blocks / network failures surface as a distinct error, not as null.
      const { data: company, error: companyError } = await supabase
        .from("companies")
        .select("id")
        .eq("owner_id", profileId)
        .limit(1)
        .maybeSingle();

      if (companyError) {
        console.error("[BusinessDashboard] company fetch error:", companyError);
        setCompanyFetchError(
          `Unable to load company data (${companyError.code ?? companyError.message}). ` +
          `Check the companies RLS SELECT policy allows owner reads.`
        );
      } else {
        setCompanyId(company?.id ?? null);
      }

      setLoading(false);
    };

    fetchCompany();
  }, [profileId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <LoadingState message="Loading your business dashboard..." />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <ErrorState message={loadError} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  const renderView = () => {
    // Company-required guard — distinguish query error from genuine no-company.
    const needsCompany = ["dashboard", "jobs", "sites", "assets", "compliance"].includes(activeView);
    if (needsCompany && companyFetchError) {
      return (
        <div className="p-6">
          <p className="text-sm text-red-600 font-medium">Company data could not be loaded.</p>
          <p className="text-xs text-muted-foreground mt-1">{companyFetchError}</p>
        </div>
      );
    }
    if (needsCompany && !companyId) {
      return (
        <div className="p-6">
          <p className="text-muted-foreground text-sm">
            No company profile found. Go to Settings to create your company profile.
          </p>
        </div>
      );
    }

    // Profile-required guard (should always exist if we got here)
    if (!profileId) {
      return (
        <div className="p-6">
          <p className="text-muted-foreground text-sm">Profile not found.</p>
        </div>
      );
    }

    switch (activeView) {
      case "dashboard":
        return <BusinessOverview profileId={profileId} companyId={companyId} />;

      case "jobs":
        return <BusinessJobsView companyId={companyId!} profileId={profileId} />;

      case "approvals":
        return (
          <div className="p-6">
            <ReceivedQuotes />
          </div>
        );

      case "sites":
        return (
          <div className="p-6">
            <MaintenanceManagement
              companyId={companyId!}
              profileId={profileId}
              defaultTab="sites"
              embedded
            />
          </div>
        );

      case "assets":
        return (
          <div className="p-6">
            <MaintenanceManagement
              companyId={companyId!}
              profileId={profileId}
              defaultTab="assets"
              embedded
            />
          </div>
        );

      case "panel":
        return (
          <div className="p-6">
            {user ? (
              <PanelManagement profileId={profileId} userId={user.id} />
            ) : (
              <p className="text-muted-foreground text-sm">Unable to load panel.</p>
            )}
          </div>
        );

      case "compliance":
        return <BusinessComplianceView companyId={companyId!} />;

      case "invoices":
        return (
          <div className="p-6">
            <ReceivedInvoices />
          </div>
        );

      case "spend":
        return <BusinessSpendView profileId={profileId} />;

      case "messages":
        return (
          <div className="p-6">
            <BusinessMessageInbox profileId={profileId} />
          </div>
        );

      case "settings":
        return <BusinessSettings embedded />;

      default:
        return (
          <div className="p-6">
            <p className="text-muted-foreground text-sm">View not found.</p>
          </div>
        );
    }
  };

  if (!profileId) {
    return (
      <BusinessLayout>
        <div className="p-6">
          <p className="text-muted-foreground text-sm">Profile not found.</p>
        </div>
      </BusinessLayout>
    );
  }

  return (
    <HelpSystemProvider profileId={profileId} role="business">
      <BusinessLayout>
        {renderView()}
      </BusinessLayout>
    </HelpSystemProvider>
  );
};

export default BusinessDashboard;
