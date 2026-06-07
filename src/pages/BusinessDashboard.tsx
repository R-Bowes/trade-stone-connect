import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { LoadingState, ErrorState } from "@/components/AsyncState";
import BusinessLayout from "@/components/layout/BusinessLayout";
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
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
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

      if (pid) {
        const { data: company } = await supabase
          .from("companies")
          .select("id")
          .eq("owner_id", pid)
          .maybeSingle();
        setCompanyId(company?.id ?? null);
      }

      setLoading(false);
    };
    load();
  }, [navigate]);

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
    // Company-required guard
    const needsCompany = ["dashboard", "jobs", "sites", "assets", "compliance"].includes(activeView);
    if (needsCompany && !companyId) {
      return (
        <div className="p-6">
          <p className="text-muted-foreground text-sm">
            Complete your company profile in Settings before using this view.
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

  return (
    <BusinessLayout>
      {renderView()}
    </BusinessLayout>
  );
};

export default BusinessDashboard;
