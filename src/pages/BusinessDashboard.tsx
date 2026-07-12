import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { LoadingState, ErrorState } from "@/components/AsyncState";
import BusinessLayout from "@/components/layout/BusinessLayout";
import { HelpSystemProvider } from "@/components/help/HelpSystemProvider";
import { BusinessOverview } from "@/components/business/BusinessOverview";
import { BusinessJobsView } from "@/components/business/BusinessJobsView";
import { BusinessComplianceView } from "@/components/business/BusinessComplianceView";
import { BusinessPrequalView } from "@/components/business/BusinessPrequalView";
import { BusinessSpendView } from "@/components/business/BusinessSpendView";
import { BusinessTeamView } from "@/components/business/BusinessTeamView";
import { SiteGroupsView } from "@/components/business/SiteGroupsView";
import { ReceivedInvoices } from "@/components/recipient/ReceivedInvoices";
import { ReceivedQuotes } from "@/components/recipient/ReceivedQuotes";
import { PanelManagement } from "@/components/business/PanelManagement";
import { MaintenanceManagement } from "@/components/business/MaintenanceManagement";
import { BusinessRequestsView } from "@/components/business/BusinessRequestsView";
import { BusinessTendersView } from "@/components/business/BusinessTendersView";
import { BusinessTenderStub } from "@/components/business/BusinessTenderStub";
import { BusinessMessageInbox } from "@/components/business/BusinessMessageInbox";
import BusinessSettings from "@/pages/BusinessSettings";
import Header from "@/components/Header";
import type { User } from "@supabase/supabase-js";

interface PendingInviteSummary {
  id: string;
  company_id: string;
  coverageKind: string;
  companies: { name: string } | null;
}

const COVERAGE_LABEL: Record<string, string> = {
  national: "National coverage",
  group: "Group coverage",
  site: "Site coverage",
};

const BusinessDashboard = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activeView = searchParams.get("view") ?? "dashboard";

  const [user, setUser] = useState<User | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<PendingInviteSummary[]>([]);
  const [companyFetchError, setCompanyFetchError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Increment to re-trigger Phase 2 (e.g. after accepting an in-dashboard invite)
  const [resolveKey, setResolveKey] = useState(0);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState<string | null>(null);

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
      if (!pid) setLoading(false);
    };
    loadProfile();
  }, [navigate]);

  // Phase 2: membership-aware company resolution.
  // Re-runs when profileId becomes available or resolveKey changes (post-invite-accept).
  useEffect(() => {
    if (!profileId) return;

    const fetchCompany = async () => {
      setLoading(true);
      setCompanyFetchError(null);
      setCompanyId(null);
      setIsOwner(false);
      setPendingInvites([]);

      // 1. Try owner resolution — owners have no business_members row.
      const { data: ownerCompany, error: ownerError } = await supabase
        .from("companies")
        .select("id")
        .eq("owner_id", profileId)
        .limit(1)
        .maybeSingle();

      if (ownerError) {
        console.error("[BusinessDashboard] company fetch error:", ownerError);
        setCompanyFetchError(
          `Unable to load company data (${ownerError.code ?? ownerError.message}). ` +
          `Check the companies RLS SELECT policy allows owner reads.`
        );
        setLoading(false);
        return;
      }

      if (ownerCompany) {
        setCompanyId(ownerCompany.id);
        setIsOwner(true);
        setLoading(false);
        return;
      }

      // 2. No owned company — try active coverage membership.
      const { data: memberRow, error: memberError } = await supabase
        .from("business_members")
        .select("company_id, coverage_kind, coverage_group_id, coverage_site_id")
        .eq("profile_id", profileId)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();

      if (memberError) {
        console.error("[BusinessDashboard] membership fetch error:", memberError);
        // Non-fatal — fall through to invite check.
      }

      if (memberRow) {
        setCompanyId(memberRow.company_id);
        setIsOwner(false);
        setLoading(false);
        return;
      }

      // 3. No active company — check for pending invites (TS-Code path: profile_id is set).
      const { data: invites } = await supabase
        .from("business_members")
        .select("id, company_id, coverage_kind, coverage_group_id, coverage_site_id, companies(name)")
        .eq("profile_id", profileId)
        .eq("status", "invited");

      if (invites && invites.length > 0) {
        const mapped: PendingInviteSummary[] = (invites as any[]).map((inv) => ({
          id: inv.id,
          company_id: inv.company_id,
          coverageKind: inv.coverage_kind,
          companies: inv.companies,
        }));
        setPendingInvites(mapped);
      }

      setLoading(false);
    };

    fetchCompany();
  }, [profileId, resolveKey]);

  const handleAcceptInvite = async (inviteId: string) => {
    setAccepting(true);
    setAcceptError(null);
    try {
      const { error } = await supabase.rpc("accept_business_invite", { p_invite_id: inviteId });
      if (error) throw error;
      setPendingInvites([]);
      setResolveKey((k) => k + 1);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setAcceptError(msg);
    } finally {
      setAccepting(false);
    }
  };

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
    // Show accept-invite prompt when no active company but pending TS-Code invites exist.
    if (!companyId && pendingInvites.length > 0) {
      return (
        <div className="p-6 max-w-md space-y-3">
          <h2 className="font-heading text-xl font-bold">Pending invitation</h2>
          {pendingInvites.map((invite) => (
            <div key={invite.id} className="border rounded-lg p-4 space-y-2">
              <p className="text-sm">
                <span className="font-medium">
                  {invite.companies?.name ?? "A company"}
                </span>{" "}
                has invited you to join with{" "}
                <span className="font-semibold">
                  {COVERAGE_LABEL[invite.coverageKind] ?? invite.coverageKind}
                </span>.
              </p>
              {acceptError && (
                <p className="text-xs text-red-600">{acceptError}</p>
              )}
              <button
                onClick={() => handleAcceptInvite(invite.id)}
                disabled={accepting}
                className="px-4 py-2 bg-[#f07820] text-white rounded text-sm font-medium disabled:opacity-60"
              >
                {accepting ? "Accepting..." : "Accept invitation"}
              </button>
            </div>
          ))}
        </div>
      );
    }

    // Company-required guard — distinguish query error from genuine no-company.
    const needsCompany = ["dashboard", "jobs", "requests", "sites", "assets", "compliance", "prequal", "team", "groups", "tenders"].includes(activeView);
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

      case "requests":
        return <BusinessRequestsView companyId={companyId!} profileId={profileId} />;

      case "approvals":
        return (
          <div className="p-6">
            <ReceivedQuotes />
          </div>
        );

      case "tenders":
        return <BusinessTendersView companyId={companyId!} />;

      case "tenders-stub":
        return <BusinessTenderStub />;

      case "sites":
      case "assets":
        return (
          <div className="p-6">
            <MaintenanceManagement
              key={activeView}
              companyId={companyId!}
              profileId={profileId}
              defaultTab={activeView === "assets" ? "assets" : "sites"}
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

      case "prequal":
        return <BusinessPrequalView companyId={companyId!} profileId={profileId} />;

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
          <div className="h-full min-h-0 flex flex-col p-6">
            <BusinessMessageInbox profileId={profileId} senderRole="business" />
          </div>
        );

      case "team":
        return (
          <BusinessTeamView
            companyId={companyId!}
            profileId={profileId}
            isOwner={isOwner}
          />
        );

      case "groups":
        return (
          <SiteGroupsView
            companyId={companyId!}
            isOwner={isOwner}
          />
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
