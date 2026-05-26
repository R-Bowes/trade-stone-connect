import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import Header from "@/components/Header";
import QuoteRequestDialog from "@/components/QuoteRequestDialog";
import { ContractorMessageDialog } from "@/components/ContractorMessageDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAvailability } from "@/hooks/useAvailability";
import { usePublicProfileWidgets } from "@/hooks/useProfileWidgets";
import {
  HeroBlock, EnquireBlock, WidgetBlock,
  type PublicProfile, type ProfilePhoto, type ProfileCredential,
  type ProfileReview, type ProfileTeamMember, type WidgetBlockData,
} from "@/components/profile/ProfileWidgets";
import { format, isToday, isTomorrow, addDays } from "date-fns";

// ─── Data types ───────────────────────────────────────────────────────────────

interface ContractorPageData extends PublicProfile {
  id: string;       // profiles.id
  user_id: string;  // profiles.user_id
}

function formatAvailability(date: Date | null): { label: string; isAvailable: boolean } {
  if (!date) return { label: "Contact for availability", isAvailable: false };
  if (isToday(date)) return { label: "Available today", isAvailable: true };
  if (isTomorrow(date)) return { label: "Available tomorrow", isAvailable: true };
  return { label: `Available from ${format(date, "EEE d MMM")}`, isAvailable: true };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const ContractorProfile = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();

  const [contractor, setContractor] = useState<ContractorPageData | null>(null);
  const [photos, setPhotos] = useState<ProfilePhoto[]>([]);
  const [credentials, setCredentials] = useState<ProfileCredential[]>([]);
  const [reviews, setReviews] = useState<ProfileReview[]>([]);
  const [team, setTeam] = useState<ProfileTeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  const [isQuoteOpen, setIsQuoteOpen] = useState(false);
  const [isMessageOpen, setIsMessageOpen] = useState(false);

  // Widget layout — reads from profile_widgets for this contractor
  const { widgets } = usePublicProfileWidgets(contractor?.id ?? "");

  // Availability — takes profiles.id
  const { getNextAvailable, loading: availLoading } = useAvailability(contractor?.id ?? "");
  const nextAvailable = contractor?.id ? getNextAvailable() : null;
  const { label: availLabel, isAvailable } = formatAvailability(nextAvailable);

  useEffect(() => {
    if (!code) return;
    const load = async () => {
      setLoading(true);

      // Fetch public profile by ts_profile_code
      const { data: pub, error } = await supabase
        .from("public_pro_profiles")
        .select(`
          id, user_id, full_name, company_name, ts_profile_code,
          bio, trades, location, working_radius,
          avatar_url, logo_url, is_verified,
          rating, review_count, completed_jobs, years_experience, hourly_rate
        `)
        .eq("ts_profile_code", code)
        .maybeSingle();

      if (error || !pub) {
        setContractor(null);
        setLoading(false);
        return;
      }

      setContractor(pub as ContractorPageData);

      // contractor_photos uses user_id FK
      const { data: photoData } = await supabase
        .from("contractor_photos")
        .select("id, photo_url, title")
        .eq("contractor_id", pub.user_id)
        .order("display_order", { ascending: true });
      setPhotos(photoData ?? []);

      // contractor_credentials uses profiles.id FK (two-step already resolved)
      const { data: credData } = await supabase
        .from("contractor_credentials")
        .select("id, name, issuer, reference_number, verified")
        .eq("contractor_id", pub.id)
        .order("display_order", { ascending: true });
      setCredentials(credData ?? []);

      // job_reviews uses profiles.id FK (two-step already resolved)
      const { data: reviewData } = await supabase
        .from("job_reviews")
        .select("id, rating, comment, created_at")
        .eq("contractor_id", pub.id)
        .order("created_at", { ascending: false })
        .limit(10);
      setReviews(reviewData ?? []);

      // team_members uses user_id FK — RLS restricts to owner only; returns empty for public viewers
      const { data: teamData } = await supabase
        .from("team_members")
        .select("id, full_name, role")
        .eq("contractor_id", pub.user_id)
        .eq("is_active", true);
      setTeam(teamData ?? []);

      setLoading(false);
    };
    load();
  }, [code]);

  const handleEnquire = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate("/auth"); return; }
    setIsQuoteOpen(true);
  };

  const handleMessage = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate("/auth"); return; }
    if (!contractor?.user_id) return;
    setIsMessageOpen(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: "#f4f4f0" }}>
        <Header />
        <main style={{ paddingTop: 80, display: "flex", justifyContent: "center" }}>
          <p style={{ color: "#9ca3af", fontSize: 14 }}>Loading...</p>
        </main>
      </div>
    );
  }

  if (!contractor) {
    return (
      <div className="min-h-screen" style={{ background: "#f4f4f0" }}>
        <Header />
        <main style={{ paddingTop: 80, display: "flex", justifyContent: "center" }}>
          <p style={{ color: "#9ca3af", fontSize: 14 }}>Contractor not found.</p>
        </main>
      </div>
    );
  }

  const availabilityInfo = {
    label: availLoading ? "Checking..." : availLabel,
    isAvailable: availLoading ? false : isAvailable,
    loading: availLoading,
  };

  const blockData: WidgetBlockData = {
    profile: contractor,
    photos,
    credentials,
    reviews,
    team,
    availability: availabilityInfo,
  };

  return (
    <div className="min-h-screen" style={{ background: "#f4f4f0" }}>
      <Header />

      <main style={{ paddingTop: 72 }}>
        {/* Back link */}
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "16px 16px 0" }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              background: "none", border: "none", cursor: "pointer",
              fontSize: 13, color: "#6b7280", fontFamily: "inherit", padding: 0,
            }}
          >
            <i className="ti ti-arrow-left" style={{ fontSize: 16 }} />
            Back to directory
          </button>
        </div>

        {/* Profile card */}
        <div style={{ maxWidth: 680, margin: "12px auto 40px", padding: "0 16px" }}>
          {/* Hero — always first */}
          <HeroBlock profile={contractor} availability={availabilityInfo} coverUrl={contractor.cover_url} />

          {/* Enabled widgets in saved order */}
          {widgets.map(w => (
            <WidgetBlock key={w.widget_key} widgetKey={w.widget_key} data={blockData} />
          ))}

          {/* Message button */}
          <div style={{
            background: "white", borderRadius: 12, marginBottom: 10,
            boxShadow: "0 1px 3px rgba(0,0,0,0.07)", padding: "16px 20px",
          }}>
            <button
              onClick={handleMessage}
              disabled={!contractor.user_id}
              style={{
                width: "100%", background: "white", color: "#1a2744",
                border: "1px solid #d1d5db", borderRadius: 8,
                padding: "12px", fontSize: 14, fontWeight: 600,
                cursor: "pointer", fontFamily: "inherit",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}
            >
              <i className="ti ti-message" style={{ fontSize: 18 }} />
              Send a message
            </button>
          </div>

          {/* Enquire CTA — always last */}
          <EnquireBlock onEnquire={handleEnquire} />
        </div>
      </main>

      <QuoteRequestDialog
        isOpen={isQuoteOpen}
        onClose={() => setIsQuoteOpen(false)}
        contractorId={contractor.id}
        contractorName={contractor.full_name ?? ""}
      />

      {contractor.user_id && (
        <ContractorMessageDialog
          open={isMessageOpen}
          onOpenChange={setIsMessageOpen}
          recipientUserId={contractor.user_id}
          contractorName={contractor.full_name ?? ""}
          contractorLocation={contractor.location ?? ""}
        />
      )}
    </div>
  );
};

export default ContractorProfile;
