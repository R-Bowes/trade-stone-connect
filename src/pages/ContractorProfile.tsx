import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect, type ReactNode } from "react";
import Header from "@/components/Header";
import QuoteRequestDialog from "@/components/QuoteRequestDialog";
import { ContractorMessageDialog } from "@/components/ContractorMessageDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAvailability } from "@/hooks/useAvailability";
import { HeroBlock, type AvailabilityInfo } from "@/components/profile/ProfileWidgets";
import { isToday, isTomorrow, format, formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScoreGauge } from "@/components/scoring/ScoreGauge";
import { computeTrend, SCORE_EXPLANATIONS, type ScoreConfidence } from "@/lib/scoring";
import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";
import { VerificationBadge } from "@/components/verification/VerificationBadge";
import { extractVideoId } from "@/hooks/useProfileVideos";
import { getEmbedUrl } from "@/lib/videoEmbed";
import { BeforeAfterSlider } from "@/components/profile/BeforeAfterSlider";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PageProfile {
  id: string;       // profiles.id
  user_id: string;  // profiles.user_id
  full_name: string | null;
  company_name: string | null;
  ts_profile_code: string | null;
  bio: string | null;
  trades: string[] | null;
  location: string | null;
  working_radius: string | null;
  avatar_url: string | null;
  logo_url: string | null;
  is_verified: boolean | null;
  rating: number | null;
  review_count: number | null;
  completed_jobs: number | null;
  years_experience: number | null;
  hourly_rate: number | null;
  cover_url: string | null;
  profile_is_published: boolean;
  cta_label: string | null;
  social_links: Record<string, string> | null;
  service_area_center_lat: number | null;
  service_area_center_lng: number | null;
  service_area_radius_miles: number | null;
}

interface ProfileVideoRow {
  id: string;
  url: string;
  platform: "youtube" | "tiktok" | "vimeo" | "other";
  title: string | null;
  description: string | null;
}

interface BeforeAfterRow {
  id: string;
  before_photo_url: string;
  after_photo_url: string;
  title: string | null;
  description: string | null;
}

interface CanvasSection {
  id: string;
  widget_key: string;
  label: string | null;
  is_enabled: boolean;
  display_order: number;
  published_order: number | null;
  section_ref_id: string | null;
  is_published: boolean;
  meta: Record<string, unknown> | null;
}

interface GalleryPhoto {
  id: string;
  photo_url: string;
  gallery_id?: string | null;
  display_order: number;
  title: string | null;
}

interface Project {
  id: string;
  title: string;
  description: string | null;
  trade: string | null;
  location: string | null;
  completion_date: string | null;
  photo_urls: string[];
  display_order: number;
}

interface Review {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  pinned?: boolean;
}

interface TeamMember {
  id: string;
  full_name: string;
  role: string | null;
}

interface Credential {
  id: string;
  name: string;
  issuer: string | null;
  reference_number: string | null;
  verified: boolean | null;
}

interface VerifiedCredential {
  id: string;
  name: string;
  issuer: string | null; // awarding body
}

interface VerifiedRegisterCheck {
  id: string;
  register_name: string;
  registration_number: string | null;
}

interface Endorsement {
  id: string;
  endorser_id: string;
  endorsement_text: string | null;
  created_at: string;
  endorser: { full_name: string | null; company_name: string | null } | null;
}

interface ContractorScoresRow {
  craft_score: number | null;
  craft_confidence: ScoreConfidence | null;
  craft_signal_count: number;
  service_score: number | null;
  service_confidence: ScoreConfidence | null;
  service_review_count: number;
  value_score: number | null;
  value_confidence: ScoreConfidence | null;
  value_signal_count: number;
}

interface ScoreHistoryRow {
  score_type: "craft" | "service" | "value";
  score_value: number | null;
  confidence: ScoreConfidence | null;
  recorded_at: string;
}

interface TradeAverageRow {
  trade: string;
  region: string | null;
  avg_craft: number | null;
  avg_service: number | null;
  avg_value: number | null;
}

interface ServiceReviewRow {
  id: string;
  communication: 1 | 2 | 3;
  reliability: 1 | 2 | 3;
  property_respect: 1 | 2 | 3;
  expectation_management: 1 | 2 | 3;
  costs_communicated_clearly: boolean | null;
  free_text: string | null;
  created_at: string;
  reviewer: { full_name: string | null } | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const NAVY = "#1a2744";
const ORANGE = "#f07820";
const PAGE_BG = "#f4f4f0";

const DEFAULT_SECTION_LABELS: Record<string, string> = {
  bio: "About",
  stats: "Stats",
  trades: "Trades & services",
  services: "Services",
  photos: "Portfolio",
  gallery: "Our work",
  project: "Project showcase",
  reviews: "Reviews",
  credentials: "Credentials",
  availability: "Availability",
  team: "Team",
};

function getSectionLabel(section: CanvasSection): string {
  return section.label || DEFAULT_SECTION_LABELS[section.widget_key] || section.widget_key;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatAvailability(date: Date | null, loading: boolean): AvailabilityInfo {
  if (loading) return { label: "Checking...", isAvailable: false, loading: true };
  if (!date) return { label: "Contact for availability", isAvailable: false, loading: false };
  if (isToday(date)) return { label: "Available today", isAvailable: true, loading: false };
  if (isTomorrow(date)) return { label: "Available tomorrow", isAvailable: true, loading: false };
  return { label: `Available from ${format(date, "EEE d MMM")}`, isAvailable: true, loading: false };
}

function formatReviewDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function getInitials(name: string | null): string {
  if (!name) return "?";
  return name.split(" ").map(n => n[0] ?? "").join("").slice(0, 2).toUpperCase();
}

function Stars({ rating }: { rating: number }) {
  return (
    <span aria-label={`${rating} stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} style={{ color: i < rating ? ORANGE : "#ddd", fontSize: 14 }}>&#9733;</span>
      ))}
    </span>
  );
}

// ── Section card wrapper ──────────────────────────────────────────────────────

function SectionCard({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <div style={{ background: "white", borderRadius: 12, marginBottom: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.07)", overflow: "hidden" }}>
      <div style={{ padding: "16px 20px 0" }}>
        <div style={{ borderLeft: `3px solid ${ORANGE}`, paddingLeft: 10, marginBottom: 14, color: NAVY, fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          {heading}
        </div>
      </div>
      <div style={{ padding: "0 20px 18px" }}>{children}</div>
    </div>
  );
}

// ── Section block renderers ───────────────────────────────────────────────────

function BioBlock({ section, profile }: { section: CanvasSection; profile: PageProfile }) {
  return (
    <SectionCard heading={getSectionLabel(section)}>
      {profile.bio ? (
        <p style={{ fontSize: 14, color: "#444", lineHeight: 1.65, margin: 0 }}>{profile.bio}</p>
      ) : (
        <p style={{ fontSize: 14, color: "#aaa", fontStyle: "italic", margin: 0 }}>No bio added yet.</p>
      )}
      {profile.working_radius && profile.location && (
        <div style={{ marginTop: 10, fontSize: 12, color: "#888", display: "flex", alignItems: "center", gap: 6 }}>
          <i className="ti ti-map-pin" style={{ fontSize: 14, color: ORANGE }} />
          Works within {profile.working_radius} of {profile.location}
        </div>
      )}
    </SectionCard>
  );
}

function StatsBlock({ section, profile }: { section: CanvasSection; profile: PageProfile }) {
  const visibleKeys: string[] = (section.meta?.visibleStats as string[] | undefined)
    ?? ["completed_jobs", "rating", "years_experience"];

  const statDefs: { key: string; label: string; value: string }[] = [
    { key: "completed_jobs",   label: "Jobs done",  value: profile.completed_jobs != null ? String(profile.completed_jobs) : "—" },
    { key: "rating",           label: "Rating",     value: profile.rating != null ? profile.rating.toFixed(1) + " ★" : "—" },
    { key: "years_experience", label: "Experience", value: profile.years_experience != null ? `${profile.years_experience} yrs` : "—" },
    { key: "review_count",     label: "Reviews",    value: profile.review_count != null ? String(profile.review_count) : "—" },
    { key: "hourly_rate",      label: "From / hr",  value: profile.hourly_rate != null ? `£${profile.hourly_rate}` : "—" },
  ];
  const shown = statDefs.filter(s => visibleKeys.includes(s.key));
  if (shown.length === 0) return null;

  return (
    <SectionCard heading={getSectionLabel(section)}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {shown.map(s => (
          <div key={s.key} style={{ flex: "1 1 0", minWidth: 80, background: "#f8f8f6", borderRadius: 8, padding: "14px 10px", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: NAVY, fontFamily: "'Roboto Mono', monospace" }}>{s.value}</div>
            <div style={{ fontSize: 10, color: "#999", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 4 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function ServicesBlock({ section, profile }: { section: CanvasSection; profile: PageProfile }) {
  const trades = profile.trades ?? [];
  if (!trades.length) return null;
  return (
    <SectionCard heading={getSectionLabel(section)}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {trades.map((t, i) => (
          <span key={i} style={{ background: "rgba(240,120,32,0.08)", color: "#c85e10", padding: "5px 14px", borderRadius: 20, fontSize: 13, fontWeight: 500, border: "1px solid rgba(240,120,32,0.2)" }}>
            {t}
          </span>
        ))}
      </div>
    </SectionCard>
  );
}

function GalleryBlock({ section, photosByGallery }: { section: CanvasSection; photosByGallery: Map<string, GalleryPhoto[]> }) {
  const photos = section.section_ref_id ? (photosByGallery.get(section.section_ref_id) ?? []) : [];
  if (!photos.length) return null;
  return (
    <SectionCard heading={getSectionLabel(section)}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {photos.slice(0, 9).map(p => (
          <div key={p.id} style={{ aspectRatio: "1", borderRadius: 6, overflow: "hidden", background: "#eee" }}>
            <img src={p.photo_url} alt={p.title ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function PhotosBlock({ section, allPhotos }: { section: CanvasSection; allPhotos: GalleryPhoto[] }) {
  if (!allPhotos.length) return null;
  return (
    <SectionCard heading={getSectionLabel(section)}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {allPhotos.slice(0, 9).map(p => (
          <div key={p.id} style={{ aspectRatio: "1", borderRadius: 6, overflow: "hidden", background: "#eee" }}>
            <img src={p.photo_url} alt={p.title ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function ProjectBlock({ section, projects }: { section: CanvasSection; projects: Project[] }) {
  if (!projects.length) return null;
  return (
    <SectionCard heading={getSectionLabel(section)}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {projects.map(p => (
          <div key={p.id} style={{ border: "1px solid #f0f0f0", borderRadius: 10, overflow: "hidden" }}>
            {p.photo_urls.length > 0 && (
              <div style={{ height: 160, overflow: "hidden" }}>
                <img src={p.photo_urls[0]} alt={p.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
            )}
            <div style={{ padding: "12px 16px" }}>
              <div style={{ fontWeight: 700, fontSize: 15, color: NAVY }}>{p.title}</div>
              {(p.trade || p.location || p.completion_date) && (
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                  {[p.trade, p.location].filter(Boolean).join(" · ")}
                  {p.completion_date && ` · ${format(new Date(p.completion_date), "MMM yyyy")}`}
                </div>
              )}
              {p.description && <p style={{ fontSize: 13, color: "#555", marginTop: 8, marginBottom: 0, lineHeight: 1.55 }}>{p.description}</p>}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function FeaturedReviewCard({ review }: { review: Review }) {
  return (
    <div style={{
      position: "relative", padding: "18px 20px 16px", marginBottom: 14,
      background: "rgba(240,120,32,0.04)", border: `1.5px solid rgba(240,120,32,0.35)`, borderRadius: 10,
    }}>
      <span style={{ position: "absolute", top: 10, right: 14, fontSize: 10, fontWeight: 700, color: ORANGE, textTransform: "uppercase", letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 3 }}>
        <i className="ti ti-pin" style={{ fontSize: 11 }} />Featured
      </span>
      <i className="ti ti-quote" style={{ fontSize: 26, color: "rgba(240,120,32,0.35)", display: "block", marginBottom: 4 }} />
      {review.comment && (
        <p style={{ fontSize: 15, color: "#333", lineHeight: 1.6, margin: "0 0 10px", fontStyle: "italic" }}>{review.comment}</p>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Stars rating={review.rating} />
        <span style={{ fontSize: 11, color: "#aaa" }}>{formatReviewDate(review.created_at)}</span>
      </div>
    </div>
  );
}

function ReviewsBlock({ section, reviews }: { section: CanvasSection; reviews: Review[] }) {
  const featured = reviews.filter(r => r.pinned);
  const rest = reviews.filter(r => !r.pinned);

  return (
    <SectionCard heading={getSectionLabel(section)}>
      {!reviews.length ? (
        <p style={{ fontSize: 14, color: "#aaa", fontStyle: "italic", margin: 0 }}>No reviews yet.</p>
      ) : (
        <>
          {featured.map(r => <FeaturedReviewCard key={r.id} review={r} />)}
          {rest.map((r, idx) => (
            <div key={r.id} style={{ paddingBottom: 14, marginBottom: idx < rest.length - 1 ? 14 : 0, borderBottom: idx < rest.length - 1 ? "1px solid #f0f0f0" : "none" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <div style={{ width: 32, height: 32, borderRadius: "50%", background: NAVY, color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>C</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 13, color: NAVY }}>Verified client</div>
                  <div style={{ fontSize: 11, color: "#aaa" }}>{formatReviewDate(r.created_at)}</div>
                </div>
                <Stars rating={r.rating} />
              </div>
              {r.comment && <p style={{ fontSize: 14, color: "#555", lineHeight: 1.55, margin: 0 }}>{r.comment}</p>}
            </div>
          ))}
        </>
      )}
    </SectionCard>
  );
}

function CredentialsBlock({ section, credentials }: { section: CanvasSection; credentials: Credential[] }) {
  return (
    <SectionCard heading={getSectionLabel(section)}>
      {!credentials.length ? (
        <p style={{ fontSize: 14, color: "#aaa", fontStyle: "italic", margin: 0 }}>No credentials added.</p>
      ) : (
        credentials.map((c, idx) => (
          <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 12, marginBottom: idx < credentials.length - 1 ? 12 : 0, borderBottom: idx < credentials.length - 1 ? "1px solid #f0f0f0" : "none" }}>
            <i className="ti ti-certificate" style={{ fontSize: 22, color: ORANGE, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: NAVY }}>{c.name}</div>
              {c.issuer && <div style={{ fontSize: 12, color: "#888" }}>{c.issuer}</div>}
            </div>
            {c.reference_number && (
              <div style={{ fontSize: 11, color: "#aaa", fontFamily: "'Roboto Mono', monospace", flexShrink: 0 }}>{c.reference_number}</div>
            )}
            {c.verified && <i className="ti ti-circle-check" style={{ fontSize: 16, color: "#16a34a", flexShrink: 0 }} />}
          </div>
        ))
      )}
    </SectionCard>
  );
}

const TIER_EXPLANATIONS: Record<number, string> = {
  1: "This contractor has registered on TradeStone.",
  2: "Identity confirmed via Stripe verification.",
  3: "Insurance and credentials verified by TradeStone.",
  4: "Fully verified — identity, compliance, and background checks complete.",
};

function HeroVerificationBadge({ tier }: { tier: number | null }) {
  const [open, setOpen] = useState(false);
  // Tier 1 shows no badge on the public profile (SCORING.md: "No badge
  // shown on public profile" until identity is actually confirmed).
  if (!tier || tier < 2) return null;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "8px 0 4px" }}>
      <VerificationBadge tier={tier} size="lg" />
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ background: "none", border: "none", padding: 0, fontSize: 12, color: "#888", textDecoration: "underline", cursor: "pointer", fontFamily: "inherit" }}
      >
        What does this mean?
      </button>
      {open && (
        <p style={{ flexBasis: "100%", fontSize: 12, color: "#888", margin: "4px 0 0", lineHeight: 1.5 }}>
          {TIER_EXPLANATIONS[tier]}
        </p>
      )}
    </div>
  );
}

const TIER_BADGES: Record<number, { label: string; icon: string }> = {
  2: { label: "Identity Verified", icon: "ti-user-check" },
  3: { label: "Compliance Verified", icon: "ti-shield-check" },
  4: { label: "Credential Verified", icon: "ti-award" },
};

const REGISTER_LABELS: Record<string, string> = {
  gas_safe: "Gas Safe",
  niceic: "NICEIC",
  napit: "NAPIT",
  fgas: "F-Gas",
};

function VerificationBadgeBlock({ tier, registerChecks, credentials }: {
  tier: number | null;
  registerChecks: VerifiedRegisterCheck[];
  credentials: VerifiedCredential[];
}) {
  // Tier 1 (Claimed) shows nothing at all — no badge, no section.
  if (!tier || tier < 2) return null;
  const badge = TIER_BADGES[tier];
  if (!badge) return null;

  return (
    <SectionCard heading="Verification">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: (registerChecks.length || credentials.length) ? 14 : 0 }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(22,163,74,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <i className={`ti ${badge.icon}`} style={{ fontSize: 19, color: "#16a34a" }} />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: NAVY }}>{badge.label}</div>
          <div style={{ fontSize: 12, color: "#888" }}>Verified by TradeStone</div>
        </div>
      </div>

      {registerChecks.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: credentials.length ? 10 : 0 }}>
          {registerChecks.map(rc => (
            <div key={rc.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
              <i className="ti ti-circle-check" style={{ fontSize: 15, color: "#16a34a", flexShrink: 0 }} />
              <span style={{ color: NAVY, fontWeight: 600 }}>{REGISTER_LABELS[rc.register_name] ?? rc.register_name}</span>
              {rc.registration_number && (
                <span style={{ color: "#aaa", fontFamily: "'Roboto Mono', monospace", fontSize: 11 }}>{rc.registration_number}</span>
              )}
              <span style={{ color: "#888", fontSize: 11 }}>&middot; verified against the live register</span>
            </div>
          ))}
        </div>
      )}

      {credentials.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {credentials.map(c => (
            <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
              <i className="ti ti-award" style={{ fontSize: 15, color: "#16a34a", flexShrink: 0 }} />
              <span style={{ color: NAVY, fontWeight: 600 }}>{c.name}</span>
              {c.issuer && <span style={{ color: "#888", fontSize: 11 }}>&middot; {c.issuer}</span>}
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function EndorsementsBlock({ endorsements, canEndorse, alreadyEndorsed, onEndorse, onRetract }: {
  endorsements: Endorsement[];
  canEndorse: boolean;
  alreadyEndorsed: boolean;
  onEndorse: () => void;
  onRetract: () => void;
}) {
  // Deliberately minimal (SCORING.md Step 7) — no display unless there's
  // something to show or a verified peer contractor could act.
  if (endorsements.length === 0 && !canEndorse) return null;

  return (
    <SectionCard heading="Peer endorsements">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: endorsements.length ? 14 : 0 }}>
        <div style={{ fontSize: 13, color: "#888" }}>
          {endorsements.length === 0
            ? "No peer endorsements yet."
            : `${endorsements.length} verified contractor${endorsements.length === 1 ? "" : "s"} ${endorsements.length === 1 ? "has" : "have"} endorsed this contractor`}
        </div>
        {canEndorse && (
          alreadyEndorsed ? (
            <button
              onClick={onRetract}
              style={{ background: "none", border: "1px solid #d1d5db", borderRadius: 6, padding: "5px 12px", fontSize: 12, fontWeight: 600, color: "#6b7280", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}
            >
              <i className="ti ti-circle-check" style={{ fontSize: 14, color: "#16a34a" }} /> Endorsed
            </button>
          ) : (
            <button
              onClick={onEndorse}
              style={{ background: ORANGE, border: "none", borderRadius: 6, padding: "5px 12px", fontSize: 12, fontWeight: 600, color: "white", cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}
            >
              Endorse
            </button>
          )
        )}
      </div>
      {endorsements.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {endorsements.filter(e => e.endorsement_text).map(e => (
            <div key={e.id} style={{ fontSize: 13, color: "#555", fontStyle: "italic", borderLeft: "2px solid #eee", paddingLeft: 10 }}>
              &ldquo;{e.endorsement_text}&rdquo;
              <div style={{ fontSize: 11, color: "#aaa", fontStyle: "normal", marginTop: 2 }}>
                &mdash; {e.endorser?.company_name || e.endorser?.full_name || "A verified contractor"}
              </div>
            </div>
          ))}
        </div>
      )}
    </SectionCard>
  );
}

const SCORE_ROW_META: { key: "craft" | "service" | "value"; label: string; icon: string }[] = [
  { key: "craft", label: "Craft", icon: "ti-hammer" },
  { key: "service", label: "Service", icon: "ti-message" },
  { key: "value", label: "Value", icon: "ti-receipt" },
];

function HomeownerScoresBlock({ scores }: { scores: ContractorScoresRow | null }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!scores) return null;

  const byKey = {
    craft: { score: scores.craft_score, confidence: scores.craft_confidence },
    service: { score: scores.service_score, confidence: scores.service_confidence },
    value: { score: scores.value_score, confidence: scores.value_confidence },
  };

  return (
    <SectionCard heading="TradeStone Scores">
      <p style={{ fontSize: 11, color: "#999", marginTop: -6, marginBottom: 12 }}>
        Craft, Service and Value are assessed independently by whoever is actually qualified to judge each — not a single star rating.
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {SCORE_ROW_META.map(({ key, label, icon }) => {
          const { score, confidence } = byKey[key];
          const isBuilding = confidence === "building" || confidence == null;
          return (
            <div key={key}>
              <button
                onClick={() => setExpanded((cur) => (cur === key ? null : key))}
                style={{ width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <i className={`ti ${icon}`} style={{ fontSize: 16, color: isBuilding ? "#bbb" : ORANGE, width: 18, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: isBuilding ? "#999" : NAVY, width: 60, flexShrink: 0 }}>{label}</span>
                  <div style={{ flex: 1 }}>
                    <ScoreGauge score={score} confidence={confidence} variant="compact" />
                  </div>
                  <span style={{ fontSize: 11, color: "#aaa", flexShrink: 0, width: 44, textAlign: "right" }}>
                    {confidence === "established" ? "" : confidence === "provisional" ? "Early" : "Building"}
                  </span>
                  <i className={`ti ti-chevron-${expanded === key ? "up" : "down"}`} style={{ fontSize: 13, color: "#ccc" }} />
                </div>
              </button>
              {expanded === key && (
                <p style={{ fontSize: 12, color: "#888", marginTop: 6, marginLeft: 28, lineHeight: 1.5 }}>
                  {SCORE_EXPLANATIONS[key]}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

function DetailedScorecardBlock({ scores, history, tradeAverage }: {
  scores: ContractorScoresRow | null;
  history: ScoreHistoryRow[];
  tradeAverage: TradeAverageRow | null;
}) {
  const [open, setOpen] = useState(false);
  if (!scores) return null;

  const rows: { key: "craft" | "service" | "value"; label: string; score: number | null; confidence: ScoreConfidence | null; count: number; countLabel: string; avg: number | null | undefined }[] = [
    { key: "craft", label: "Craft", score: scores.craft_score, confidence: scores.craft_confidence, count: scores.craft_signal_count, countLabel: "completed jobs", avg: tradeAverage?.avg_craft },
    { key: "service", label: "Service", score: scores.service_score, confidence: scores.service_confidence, count: scores.service_review_count, countLabel: "reviews", avg: tradeAverage?.avg_service },
    { key: "value", label: "Value", score: scores.value_score, confidence: scores.value_confidence, count: scores.value_signal_count, countLabel: "priced jobs", avg: tradeAverage?.avg_value },
  ];

  return (
    <SectionCard heading="Detailed scores">
      <button
        onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", padding: 0 }}
      >
        <span style={{ fontSize: 13, color: "#888" }}>Full breakdown with trend and trade comparison</span>
        <i className={`ti ti-chevron-${open ? "up" : "down"}`} style={{ fontSize: 15, color: "#999" }} />
      </button>

      {open && (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 16 }}>
          {rows.map((r) => {
            const sparkData = history
              .filter((h) => h.score_type === r.key && h.score_value !== null)
              .map((h) => ({ date: h.recorded_at, value: h.score_value as number }));
            const trend = computeTrend(r.score, history, r.key);
            return (
              <div key={r.key} style={{ borderTop: "1px solid #f0f0f0", paddingTop: 12 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{r.label}</div>
                  <div style={{ fontSize: 13, fontFamily: "'Roboto Mono', monospace", color: r.confidence === "established" ? ORANGE : "#999" }}>
                    {r.score !== null ? `${r.score.toFixed(1)} / 10` : "Building"}
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>
                  Confidence: {r.confidence ?? "building"} &middot; Based on {r.count} {r.countLabel}
                  {trend !== "new" && <> &middot; {trend === "up" ? "Improving" : trend === "down" ? "Declining" : "Stable"}</>}
                </div>
                {r.avg != null && (
                  <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>
                    Trade average{tradeAverage?.region ? ` (${tradeAverage.region})` : " (national)"}: {r.avg.toFixed(1)}
                  </div>
                )}
                {sparkData.length >= 2 && (
                  <div style={{ height: 40, marginTop: 6 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={sparkData}>
                        <YAxis domain={[0, 10]} hide />
                        <Line type="monotone" dataKey="value" stroke={ORANGE} strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

function ServiceReviewsBlock({ reviews }: { reviews: ServiceReviewRow[] }) {
  if (reviews.length === 0) return null;

  const dimLabel = (v: 1 | 2 | 3) => (v === 1 ? "Below" : v === 2 ? "Met" : "Exceeded");
  const dimColor = (v: 1 | 2 | 3) => (v === 1 ? "#dc2626" : v === 2 ? "#f59e0b" : "#16a34a");
  const avg = (nums: number[]) => nums.reduce((a, b) => a + b, 0) / nums.length;

  const dims: { key: keyof Pick<ServiceReviewRow, "communication" | "reliability" | "property_respect" | "expectation_management">; label: string }[] = [
    { key: "communication", label: "Communication" },
    { key: "reliability", label: "Reliability" },
    { key: "property_respect", label: "Property respect" },
    { key: "expectation_management", label: "Expectations" },
  ];

  return (
    <SectionCard heading="Client feedback">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 16, paddingBottom: 14, borderBottom: "1px solid #f0f0f0" }}>
        {dims.map((d) => (
          <div key={d.key} style={{ fontSize: 11, color: "#888" }}>
            {d.label}: <strong style={{ color: NAVY }}>{avg(reviews.map((r) => r[d.key])).toFixed(1)}/3</strong>
          </div>
        ))}
        <div style={{ fontSize: 11, color: "#888" }}>{reviews.length} review{reviews.length === 1 ? "" : "s"}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {reviews.slice(0, 10).map((r) => (
          <div key={r.id} style={{ paddingBottom: 14, borderBottom: "1px solid #f5f5f5" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: NAVY }}>{r.reviewer?.full_name || "Verified client"}</span>
              <span style={{ fontSize: 11, color: "#aaa" }}>{formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: r.free_text ? 8 : 0 }}>
              {dims.map((d) => (
                <span key={d.key} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: `${dimColor(r[d.key])}14`, color: dimColor(r[d.key]) }}>
                  {d.label}: {dimLabel(r[d.key])}
                </span>
              ))}
              {r.costs_communicated_clearly !== null && (
                <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: "#f3f4f6", color: "#6b7280" }}>
                  Costs clear: {r.costs_communicated_clearly ? "Yes" : "No"}
                </span>
              )}
            </div>
            {r.free_text && <p style={{ fontSize: 13, color: "#555", margin: 0, lineHeight: 1.5 }}>{r.free_text}</p>}
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function AvailabilityBlock({ section, availability, profile }: { section: CanvasSection; availability: AvailabilityInfo; profile: PageProfile }) {
  return (
    <SectionCard heading={getSectionLabel(section)}>
      {availability.loading ? (
        <div style={{ fontSize: 14, color: "#aaa" }}>Checking availability...</div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <i className={`ti ${availability.isAvailable ? "ti-circle-check" : "ti-circle-x"}`} style={{ fontSize: 20, color: availability.isAvailable ? "#16a34a" : "#aaa" }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: availability.isAvailable ? "#15803d" : "#888" }}>{availability.label}</span>
          </div>
          {profile.working_radius && profile.location && (
            <div style={{ marginTop: 10, fontSize: 13, color: "#888", display: "flex", alignItems: "center", gap: 6 }}>
              <i className="ti ti-map-pin" style={{ fontSize: 14, color: ORANGE }} />
              Works within {profile.working_radius} miles of {profile.location}
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}

function TeamBlock({ section, teamMembers }: { section: CanvasSection; teamMembers: TeamMember[] }) {
  return (
    <SectionCard heading={getSectionLabel(section)}>
      {!teamMembers.length ? (
        <p style={{ fontSize: 14, color: "#aaa", fontStyle: "italic", margin: 0 }}>No team members listed.</p>
      ) : (
        teamMembers.map((m, idx) => (
          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, paddingBottom: 10, marginBottom: idx < teamMembers.length - 1 ? 10 : 0, borderBottom: idx < teamMembers.length - 1 ? "1px solid #f0f0f0" : "none" }}>
            <div style={{ width: 34, height: 34, borderRadius: "50%", background: NAVY, color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
              {getInitials(m.full_name)}
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 14, color: NAVY }}>{m.full_name}</div>
              {m.role && <div style={{ fontSize: 12, color: "#888" }}>{m.role}</div>}
            </div>
          </div>
        ))
      )}
    </SectionCard>
  );
}

function VideoBlock({ section, videos }: { section: CanvasSection; videos: ProfileVideoRow[] }) {
  if (!videos.length) return null;
  return (
    <SectionCard heading={getSectionLabel(section)}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
        {videos.map(v => {
          const { videoId } = extractVideoId(v.url);
          const embedUrl = getEmbedUrl(v.platform, videoId);
          return (
            <div key={v.id} style={{ borderRadius: 8, overflow: "hidden", border: "1px solid #f0f0f0" }}>
              <div style={{ aspectRatio: "16/9", background: "#111" }}>
                {embedUrl ? (
                  <iframe
                    src={embedUrl}
                    title={v.title ?? "Video"}
                    style={{ width: "100%", height: "100%", border: "none" }}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                  />
                ) : (
                  <a
                    href={v.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af" }}
                  >
                    <i className="ti ti-external-link" style={{ fontSize: 24 }} />
                  </a>
                )}
              </div>
              {(v.title || v.description) && (
                <div style={{ padding: "10px 12px" }}>
                  {v.title && <div style={{ fontWeight: 600, fontSize: 13, color: NAVY }}>{v.title}</div>}
                  {v.description && <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>{v.description}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

function BeforeAfterBlock({ section, pairs }: { section: CanvasSection; pairs: BeforeAfterRow[] }) {
  if (!pairs.length) return null;
  return (
    <SectionCard heading={getSectionLabel(section)}>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {pairs.map(p => (
          <div key={p.id}>
            <BeforeAfterSlider beforeUrl={p.before_photo_url} afterUrl={p.after_photo_url} height={260} />
            {(p.title || p.description) && (
              <div style={{ marginTop: 8 }}>
                {p.title && <div style={{ fontWeight: 600, fontSize: 14, color: NAVY }}>{p.title}</div>}
                {p.description && <div style={{ fontSize: 13, color: "#888", marginTop: 2 }}>{p.description}</div>}
              </div>
            )}
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function ServiceAreaBlock({ section, profile }: { section: CanvasSection; profile: PageProfile }) {
  const areasCovered = (section.meta?.areasCovered as string | undefined)?.trim();
  return (
    <SectionCard heading={getSectionLabel(section)}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(240,120,32,0.1)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <i className="ti ti-map-pin" style={{ fontSize: 20, color: ORANGE }} />
        </div>
        <div>
          {profile.location ? (
            <p style={{ fontSize: 14, color: "#444", margin: 0, lineHeight: 1.6 }}>
              Based in <strong>{profile.location}</strong>
              {profile.working_radius && <>, covering a <strong>{profile.working_radius}</strong> radius</>}
            </p>
          ) : (
            <p style={{ fontSize: 14, color: "#aaa", fontStyle: "italic", margin: 0 }}>No service area set.</p>
          )}
          {areasCovered && (
            <p style={{ fontSize: 13, color: "#888", margin: "8px 0 0", lineHeight: 1.55 }}>
              Areas covered: {areasCovered}
            </p>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

// ── Not published / not found ─────────────────────────────────────────────────

function NotPublished() {
  return (
    <div style={{ maxWidth: 680, margin: "80px auto", padding: "0 16px", textAlign: "center" }}>
      <i className="ti ti-eye-off" style={{ fontSize: 48, color: "#d1d5db", display: "block", marginBottom: 16 }} />
      <h2 style={{ fontSize: 20, fontWeight: 700, color: NAVY, marginBottom: 8 }}>Profile not yet published</h2>
      <p style={{ fontSize: 14, color: "#6b7280", margin: 0 }}>This contractor hasn't published their profile yet.</p>
    </div>
  );
}

// ── Preview banner (owner only) ───────────────────────────────────────────────

function PreviewBanner({ onPublish, publishing }: { onPublish: () => void; publishing: boolean }) {
  const navigate = useNavigate();
  return (
    <div style={{ background: ORANGE, padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "center", gap: 12, flexWrap: "wrap" }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: "white" }}>This is a preview of your profile</span>
      <button
        onClick={onPublish}
        disabled={publishing}
        style={{ background: "white", color: ORANGE, fontWeight: 700, fontSize: 12, padding: "4px 12px", borderRadius: 5, border: "none", cursor: "pointer", fontFamily: "inherit" }}
      >
        {publishing ? "Publishing…" : "Publish now"}
      </button>
      <button
        onClick={() => navigate("/dashboard/contractor?view=profile")}
        style={{ background: "rgba(255,255,255,0.2)", color: "white", fontWeight: 600, fontSize: 12, padding: "4px 12px", borderRadius: 5, border: "1px solid rgba(255,255,255,0.3)", cursor: "pointer", fontFamily: "inherit" }}
      >
        Back to editor
      </button>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

type ViewSource = "marketplace" | "direct" | "panel";

const ContractorProfile = () => {
  // Supports both /contractor/:code and /hire/:slug
  const { code, slug } = useParams<{ code?: string; slug?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  // Marketplace clicks pass state.source; a bare /contractor or /hire URL
  // (typed, shared, bookmarked) has no state and counts as a direct visit.
  const viewSource: ViewSource = (location.state as { source?: ViewSource } | null)?.source ?? "direct";

  const [profile, setProfile] = useState<PageProfile | null>(null);
  const [sections, setSections] = useState<CanvasSection[]>([]);
  const [photosByGallery, setPhotosByGallery] = useState<Map<string, GalleryPhoto[]>>(new Map());
  const [allPhotos, setAllPhotos] = useState<GalleryPhoto[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [videos, setVideos] = useState<ProfileVideoRow[]>([]);
  const [beforeAfterPairs, setBeforeAfterPairs] = useState<BeforeAfterRow[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [verificationTier, setVerificationTier] = useState<number | null>(null);
  const [verifiedRegisterChecks, setVerifiedRegisterChecks] = useState<VerifiedRegisterCheck[]>([]);
  const [verifiedCredentials, setVerifiedCredentials] = useState<VerifiedCredential[]>([]);
  const [endorsements, setEndorsements] = useState<Endorsement[]>([]);
  const [viewerProfileId, setViewerProfileId] = useState<string | null>(null);
  const [viewerCanEndorse, setViewerCanEndorse] = useState(false);
  const [endorseDialogOpen, setEndorseDialogOpen] = useState(false);
  const [endorseText, setEndorseText] = useState("");
  const [endorseSubmitting, setEndorseSubmitting] = useState(false);
  const [contractorScores, setContractorScores] = useState<ContractorScoresRow | null>(null);
  const [scoreHistory, setScoreHistory] = useState<ScoreHistoryRow[]>([]);
  const [tradeAverage, setTradeAverage] = useState<TradeAverageRow | null>(null);
  const [serviceReviews, setServiceReviews] = useState<ServiceReviewRow[]>([]);
  const [detailedScoresOpen, setDetailedScoresOpen] = useState(false);
  const [viewerAuthed, setViewerAuthed] = useState(false);
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const [isQuoteOpen, setIsQuoteOpen] = useState(false);
  const [isMessageOpen, setIsMessageOpen] = useState(false);

  // Availability hook — read-only, safe for public pages; takes profiles.id.
  const { getNextAvailable, loading: availLoading } = useAvailability(profile?.id ?? "");
  const nextAvailable = profile?.id ? getNextAvailable() : null;
  const availability = formatAvailability(nextAvailable, !!profile?.id && availLoading);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setNotFound(false);

      let profileId: string | null = null;
      let pub: Record<string, unknown> | null = null;

      const publicSelect = `
        id, user_id, full_name, company_name, ts_profile_code,
        bio, trades, location, working_radius,
        avatar_url, logo_url, is_verified,
        rating, review_count, completed_jobs, years_experience, hourly_rate,
        profile_is_published, cover_url, cta_label,
        social_links, service_area_center_lat, service_area_center_lng, service_area_radius_miles
      `;

      if (code) {
        const { data } = await supabase
          .from("public_pro_profiles")
          .select(publicSelect)
          .eq("ts_profile_code", code)
          .maybeSingle();
        if (!data) { setNotFound(true); setLoading(false); return; }
        pub = data as Record<string, unknown>;
        profileId = pub.id as string;
      } else if (slug) {
        // vanity_slug lives on profiles (not yet exposed by public_pro_profiles).
        // profiles SELECT is USING (true) so this lookup is safe for public viewers.
        const { data: profileRow } = await (supabase as any)
          .from("profiles")
          .select("id")
          .eq("vanity_slug", slug)
          .maybeSingle();
        if (!profileRow) { setNotFound(true); setLoading(false); return; }
        profileId = profileRow.id as string;

        const { data } = await supabase
          .from("public_pro_profiles")
          .select(publicSelect)
          .eq("id", profileId)
          .maybeSingle();
        if (!data) { setNotFound(true); setLoading(false); return; }
        pub = data as Record<string, unknown>;
      } else {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const assembled: PageProfile = {
        ...(pub as any),
        cover_url: (pub as any).cover_url ?? null,
        profile_is_published: (pub as any).profile_is_published ?? false,
        cta_label: (pub as any).cta_label ?? null,
      };
      setProfile(assembled);

      const { data: { user } } = await supabase.auth.getUser();
      const owner = user?.id === assembled.user_id;
      setIsOwner(owner);
      setViewerAuthed(!!user);

      if (user && !owner) {
        const { data: viewerProfile } = await supabase
          .from("profiles")
          .select("id, user_type")
          .eq("user_id", user.id)
          .maybeSingle();
        if (viewerProfile?.id) {
          setViewerProfileId(viewerProfile.id);
          supabase
            .from("profile_view_events")
            .insert({ profile_id: assembled.id, viewer_id: viewerProfile.id, source: viewSource })
            .then(({ error }) => {
              if (error) console.error("Failed to log profile view:", error);
            });

          // Endorsing requires the viewer themselves to be a verified (Tier
          // 2+) contractor — checked via their own contractor_verification
          // row, which their own RLS policy already lets them read.
          if ((viewerProfile as { user_type?: string }).user_type === "contractor") {
            supabase
              .from("contractor_verification")
              .select("current_tier")
              .eq("contractor_id", viewerProfile.id)
              .maybeSingle()
              .then(({ data }) => setViewerCanEndorse((data?.current_tier ?? 1) >= 2));
          }
        }
      }

      // profile_widgets: prefer the published snapshot, fall back to the live draft.
      const widgetSelect = "id, widget_key, label, is_enabled, display_order, published_order, section_ref_id, is_published, meta";
      const { data: publishedRows } = await supabase
        .from("profile_widgets")
        .select(widgetSelect)
        .eq("contractor_id", profileId)
        .eq("is_published", true)
        .order("published_order", { ascending: true, nullsFirst: false });

      let widgetRows: Record<string, unknown>[];
      if (publishedRows && publishedRows.length > 0) {
        widgetRows = publishedRows as unknown as Record<string, unknown>[];
      } else {
        const { data: draftRows } = await supabase
          .from("profile_widgets")
          .select(widgetSelect)
          .eq("contractor_id", profileId)
          .order("display_order", { ascending: true });
        widgetRows = (draftRows ?? []) as unknown as Record<string, unknown>[];
      }

      const parsedSections: CanvasSection[] = widgetRows.map(row => ({
        id: row.id as string,
        widget_key: row.widget_key as string,
        label: row.label as string | null,
        is_enabled: row.is_enabled as boolean,
        display_order: row.display_order as number,
        published_order: row.published_order as number | null,
        section_ref_id: row.section_ref_id as string | null,
        is_published: row.is_published as boolean,
        meta: (row.meta as Record<string, unknown> | null) ?? {},
      }));
      setSections(parsedSections);

      const enabledSections = parsedSections.filter(s => s.is_enabled);
      const needsGallery = enabledSections.some(s => s.widget_key === "gallery");
      const needsPhotos = enabledSections.some(s => s.widget_key === "photos");
      const needsProjects = enabledSections.some(s => s.widget_key === "project");
      const needsReviews = enabledSections.some(s => s.widget_key === "reviews");
      const needsTeam = enabledSections.some(s => s.widget_key === "team");
      const needsCredentials = enabledSections.some(s => s.widget_key === "credentials");
      const needsVideos = enabledSections.some(s => s.widget_key === "video");
      const needsBeforeAfter = enabledSections.some(s => s.widget_key === "before_after");

      const fetches: Promise<void>[] = [];

      // Verification tier badge — always shown, not tied to widget enablement.
      // current_tier is read via the SECURITY DEFINER compliance-gate RPC
      // (granted to anon) rather than a direct table read, since
      // contractor_verification has no public SELECT policy.
      fetches.push(
        supabase
          .rpc("check_contractor_compliance", { p_contractor_id: profileId })
          .then(({ data }) => {
            const tier = (data as { current_tier?: number } | null)?.current_tier;
            setVerificationTier(typeof tier === "number" ? tier : null);
          })
      );
      fetches.push(
        supabase
          .from("contractor_register_checks")
          .select("id, register_name, registration_number")
          .eq("contractor_id", profileId)
          .eq("status", "verified")
          .then(({ data }) => setVerifiedRegisterChecks((data ?? []) as VerifiedRegisterCheck[]))
      );
      fetches.push(
        supabase
          .from("contractor_credentials")
          .select("id, name, issuer")
          .eq("contractor_id", profileId)
          .eq("verified", true)
          .then(({ data }) => setVerifiedCredentials((data ?? []) as VerifiedCredential[]))
      );
      fetches.push(
        supabase
          .from("peer_endorsements")
          .select("id, endorser_id, endorsement_text, created_at, endorser:profiles!peer_endorsements_endorser_id_fkey(full_name, company_name)")
          .eq("endorsed_id", profileId)
          .order("created_at", { ascending: false })
          .then(({ data }) => setEndorsements((data ?? []) as unknown as Endorsement[]))
      );
      fetches.push(
        supabase
          .from("contractor_scores")
          .select("craft_score, craft_confidence, craft_signal_count, service_score, service_confidence, service_review_count, value_score, value_confidence, value_signal_count")
          .eq("contractor_id", profileId)
          .maybeSingle()
          .then(({ data }) => setContractorScores((data as ContractorScoresRow | null) ?? null))
      );
      fetches.push(
        supabase
          .from("contractor_score_history")
          .select("score_type, score_value, confidence, recorded_at")
          .eq("contractor_id", profileId)
          .gte("recorded_at", new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString())
          .order("recorded_at", { ascending: true })
          .then(({ data }) => setScoreHistory((data ?? []) as ScoreHistoryRow[]))
      );
      fetches.push(
        supabase
          .from("service_reviews")
          .select("id, communication, reliability, property_respect, expectation_management, costs_communicated_clearly, free_text, created_at, reviewer:profiles!service_reviews_reviewer_id_fkey(full_name)")
          .eq("contractor_id", profileId)
          .eq("suppressed", false)
          .order("created_at", { ascending: false })
          .then(({ data }) => setServiceReviews((data ?? []) as unknown as ServiceReviewRow[]))
      );
      if (pub && (pub as any).trades?.[0]) {
        fetches.push(
          supabase
            .from("trade_averages")
            .select("trade, region, avg_craft, avg_service, avg_value")
            .eq("trade", (pub as any).trades[0])
            .or(`region.eq.${(pub as any).location ?? ""},region.is.null`)
            .order("region", { ascending: false, nullsFirst: false })
            .limit(1)
            .then(({ data }) => setTradeAverage((data?.[0] as TradeAverageRow | undefined) ?? null))
        );
      }

      if (needsGallery) {
        const galleryIds = enabledSections
          .filter(s => s.widget_key === "gallery" && s.section_ref_id)
          .map(s => s.section_ref_id as string);
        if (galleryIds.length > 0) {
          fetches.push(
            (supabase as any)
              .from("contractor_photos")
              .select("id, photo_url, gallery_id, display_order, title")
              .in("gallery_id", galleryIds)
              .order("display_order", { ascending: true })
              .then(({ data }: { data: GalleryPhoto[] | null }) => {
                const map = new Map<string, GalleryPhoto[]>();
                for (const p of data ?? []) {
                  if (!p.gallery_id) continue;
                  const bucket = map.get(p.gallery_id) ?? [];
                  bucket.push(p);
                  map.set(p.gallery_id, bucket);
                }
                setPhotosByGallery(map);
              })
          );
        }
      }

      if (needsPhotos) {
        fetches.push(
          supabase
            .from("contractor_photos")
            .select("id, photo_url, display_order, title")
            .eq("contractor_id", assembled.user_id)
            .order("display_order", { ascending: true })
            .then(({ data }) => setAllPhotos((data ?? []) as GalleryPhoto[]))
        );
      }

      if (needsProjects) {
        fetches.push(
          (supabase as any)
            .from("contractor_projects")
            .select("id, title, description, trade, location, completion_date, photo_urls, display_order")
            .eq("contractor_id", profileId)
            .order("display_order", { ascending: true })
            .then(({ data }: { data: Project[] | null }) => setProjects(data ?? []))
        );
      }

      if (needsReviews) {
        const reviewsSection = enabledSections.find(s => s.widget_key === "reviews");
        const pinnedIds = (reviewsSection?.meta?.pinnedReviewIds as string[] | undefined) ?? [];
        fetches.push(
          supabase
            .from("job_reviews")
            .select("id, rating, comment, created_at")
            .eq("contractor_id", profileId)
            .order("created_at", { ascending: false })
            .then(({ data }) => {
              const all = (data ?? []) as Review[];
              const pinned = all.filter(r => pinnedIds.includes(r.id)).map(r => ({ ...r, pinned: true }));
              const rest = all.filter(r => !pinnedIds.includes(r.id));
              setReviews([...pinned, ...rest]);
            })
        );
      }

      if (needsTeam) {
        fetches.push(
          supabase
            .from("team_members")
            .select("id, full_name, role")
            .eq("contractor_id", assembled.user_id)
            .eq("is_active", true)
            .then(({ data }) => setTeamMembers((data ?? []) as TeamMember[]))
        );
      }

      if (needsCredentials) {
        fetches.push(
          supabase
            .from("contractor_credentials")
            .select("id, name, issuer, reference_number, verified")
            .eq("contractor_id", profileId)
            .order("display_order", { ascending: true })
            .then(({ data }) => setCredentials((data ?? []) as Credential[]))
        );
      }

      if (needsVideos) {
        fetches.push(
          supabase
            .from("profile_videos")
            .select("id, url, platform, title, description")
            .eq("contractor_id", profileId)
            .eq("is_active", true)
            .order("display_order", { ascending: true })
            .then(({ data }) => setVideos((data ?? []) as ProfileVideoRow[]))
        );
      }

      if (needsBeforeAfter) {
        fetches.push(
          supabase
            .from("profile_before_after")
            .select("id, before_photo_url, after_photo_url, title, description")
            .eq("contractor_id", profileId)
            .eq("is_active", true)
            .order("display_order", { ascending: true })
            .then(({ data }) => setBeforeAfterPairs((data ?? []) as BeforeAfterRow[]))
        );
      }

      await Promise.all(fetches);
      setLoading(false);
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, slug]);

  const handleEnquire = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate(`/auth?returnTo=${encodeURIComponent(window.location.pathname)}`); return; }
    setIsQuoteOpen(true);
  };

  const handleMessage = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { navigate(`/auth?returnTo=${encodeURIComponent(window.location.pathname)}`); return; }
    if (!profile?.user_id) return;
    setIsMessageOpen(true);
  };

  const myEndorsement = endorsements.find((e) => e.endorser_id === viewerProfileId) ?? null;

  const handleSubmitEndorsement = async () => {
    if (!profile || !viewerProfileId) return;
    setEndorseSubmitting(true);
    try {
      const { data, error } = await supabase
        .from("peer_endorsements")
        .insert({ endorser_id: viewerProfileId, endorsed_id: profile.id, endorsement_text: endorseText.trim() || null })
        .select("id, endorser_id, endorsement_text, created_at, endorser:profiles!peer_endorsements_endorser_id_fkey(full_name, company_name)")
        .single();
      if (error) throw error;
      setEndorsements((prev) => [data as unknown as Endorsement, ...prev]);
      setEndorseDialogOpen(false);
      setEndorseText("");
      toast({ title: "Endorsement sent" });
    } catch {
      toast({ title: "Couldn't submit endorsement", variant: "destructive" });
    } finally {
      setEndorseSubmitting(false);
    }
  };

  const handleRetractEndorsement = async () => {
    if (!myEndorsement) return;
    const { error } = await supabase.from("peer_endorsements").delete().eq("id", myEndorsement.id);
    if (!error) setEndorsements((prev) => prev.filter((e) => e.id !== myEndorsement.id));
  };

  const handlePublish = async () => {
    if (!profile) return;
    setPublishing(true);
    try {
      await (supabase as any)
        .from("profiles")
        .update({ profile_is_published: true })
        .eq("id", profile.id);
      setProfile(prev => prev ? { ...prev, profile_is_published: true } : prev);
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen" style={{ background: PAGE_BG }}>
        <Header />
        <main style={{ paddingTop: 80, display: "flex", justifyContent: "center" }}>
          <p style={{ color: "#9ca3af", fontSize: 14 }}>Loading...</p>
        </main>
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div className="min-h-screen" style={{ background: PAGE_BG }}>
        <Header />
        <main style={{ paddingTop: 80 }}>
          <NotPublished />
        </main>
      </div>
    );
  }

  if (!profile.profile_is_published && !isOwner) {
    return (
      <div className="min-h-screen" style={{ background: PAGE_BG }}>
        <Header />
        <main style={{ paddingTop: 80 }}>
          <NotPublished />
        </main>
      </div>
    );
  }

  // Hero and CTA always bookend the page; everything else renders in widget order.
  const enabledSections = sections.filter(
    s => s.is_enabled && s.widget_key !== "hero" && s.widget_key !== "cta"
  );

  const renderSection = (section: CanvasSection) => {
    switch (section.widget_key) {
      case "bio":          return <BioBlock key={section.id} section={section} profile={profile} />;
      case "stats":        return <StatsBlock key={section.id} section={section} profile={profile} />;
      case "trades":
      case "services":     return <ServicesBlock key={section.id} section={section} profile={profile} />;
      case "gallery":      return <GalleryBlock key={section.id} section={section} photosByGallery={photosByGallery} />;
      case "photos":       return <PhotosBlock key={section.id} section={section} allPhotos={allPhotos} />;
      case "project":      return <ProjectBlock key={section.id} section={section} projects={projects} />;
      case "reviews":      return <ReviewsBlock key={section.id} section={section} reviews={reviews} />;
      case "credentials":  return <CredentialsBlock key={section.id} section={section} credentials={credentials} />;
      case "availability": return <AvailabilityBlock key={section.id} section={section} availability={availability} profile={profile} />;
      case "team":         return <TeamBlock key={section.id} section={section} teamMembers={teamMembers} />;
      case "video":        return <VideoBlock key={section.id} section={section} videos={videos} />;
      case "before_after": return <BeforeAfterBlock key={section.id} section={section} pairs={beforeAfterPairs} />;
      case "service_area": return <ServiceAreaBlock key={section.id} section={section} profile={profile} />;
      case "social":       return null; // rendered inside HeroBlock via SocialLinksBar
      default:             return null;
    }
  };

  const ctaSection = sections.find(s => s.widget_key === "cta");
  const ctaLabel = ctaSection?.label || profile.cta_label || "Send enquiry";

  return (
    <div className="min-h-screen" style={{ background: PAGE_BG }}>
      {isOwner && !profile.profile_is_published && (
        <PreviewBanner onPublish={handlePublish} publishing={publishing} />
      )}

      <Header />

      <main style={{ paddingTop: 72 }}>
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "16px 16px 0" }}>
          <button
            onClick={() => navigate(-1)}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "#6b7280", fontFamily: "inherit", padding: 0 }}
          >
            <i className="ti ti-arrow-left" style={{ fontSize: 16 }} />
            Back
          </button>
        </div>

        <div style={{ maxWidth: 680, margin: "12px auto 40px", padding: "0 16px" }}>
          {/* Hero — always first */}
          <HeroBlock profile={profile} availability={availability} coverUrl={profile.cover_url} />

          {/* Compact tier badge + explainer, right under the name/TS code */}
          <HeroVerificationBadge tier={verificationTier} />

          {/* Verification tier badge — always shown when Tier 2+, not a configurable widget */}
          <VerificationBadgeBlock tier={verificationTier} registerChecks={verifiedRegisterChecks} credentials={verifiedCredentials} />

          <EndorsementsBlock
            endorsements={endorsements}
            canEndorse={viewerCanEndorse}
            alreadyEndorsed={!!myEndorsement}
            onEndorse={() => setEndorseDialogOpen(true)}
            onRetract={handleRetractEndorsement}
          />

          <HomeownerScoresBlock scores={contractorScores} />

          {viewerAuthed && (
            <DetailedScorecardBlock scores={contractorScores} history={scoreHistory} tradeAverage={tradeAverage} />
          )}

          <ServiceReviewsBlock reviews={serviceReviews} />

          {/* Enabled sections in widget order */}
          {enabledSections.map(renderSection)}

          {/* Message button */}
          <div style={{ background: "white", borderRadius: 12, marginBottom: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.07)", padding: "16px 20px" }}>
            <button
              onClick={handleMessage}
              disabled={!profile.user_id}
              style={{ width: "100%", background: "white", color: NAVY, border: "1px solid #d1d5db", borderRadius: 8, padding: "12px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            >
              <i className="ti ti-message" style={{ fontSize: 18 }} />
              Send a message
            </button>
          </div>

          {/* CTA — always last */}
          <div style={{ background: "white", borderRadius: "0 0 12px 12px", padding: "20px 24px", boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
            <button
              onClick={handleEnquire}
              style={{ width: "100%", background: ORANGE, color: "white", border: "none", borderRadius: 8, padding: "14px", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}
            >
              {ctaLabel}
            </button>
          </div>
        </div>
      </main>

      <QuoteRequestDialog
        isOpen={isQuoteOpen}
        onClose={() => setIsQuoteOpen(false)}
        contractorId={profile.id}
        contractorName={profile.full_name ?? ""}
        contractorTsCode={profile.ts_profile_code}
        contractorAvatarUrl={profile.avatar_url ?? profile.logo_url}
        source={viewSource}
      />

      {profile.user_id && (
        <ContractorMessageDialog
          open={isMessageOpen}
          onOpenChange={setIsMessageOpen}
          recipientUserId={profile.user_id}
          contractorName={profile.full_name ?? ""}
          contractorLocation={profile.location ?? ""}
          source={viewSource}
        />
      )}

      <Dialog open={endorseDialogOpen} onOpenChange={setEndorseDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Endorse {profile.full_name || "this contractor"}</DialogTitle>
            <DialogDescription>What's your experience working with this contractor?</DialogDescription>
          </DialogHeader>
          <Textarea
            value={endorseText}
            onChange={(e) => setEndorseText(e.target.value)}
            placeholder="Optional — e.g. &quot;I've worked alongside them on three kitchens, solid electrical work.&quot;"
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEndorseDialogOpen(false)} disabled={endorseSubmitting}>Cancel</Button>
            <Button onClick={handleSubmitEndorsement} disabled={endorseSubmitting}>
              {endorseSubmitting ? "Submitting..." : "Submit endorsement"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ContractorProfile;
