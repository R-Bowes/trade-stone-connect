import React from "react";
import type { WidgetKey } from "@/hooks/useProfileWidgets";

// ─── Shared types ─────────────────────────────────────────────────────────────

export interface PublicProfile {
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
}

export interface ProfilePhoto {
  id: string;
  photo_url: string;
  title: string | null;
}

export interface ProfileCredential {
  id: string;
  name: string;
  issuer: string | null;
  reference_number: string | null;
  verified: boolean | null;
}

export interface ProfileReview {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

export interface ProfileTeamMember {
  id: string;
  full_name: string;
  role: string;
}

export interface AvailabilityInfo {
  label: string;
  isAvailable: boolean;
  loading: boolean;
}

export interface WidgetBlockData {
  profile: PublicProfile | null;
  photos: ProfilePhoto[];
  credentials: ProfileCredential[];
  reviews: ProfileReview[];
  team: ProfileTeamMember[];
  availability: AvailabilityInfo;
}

export const WIDGET_DEFS: Record<WidgetKey, { label: string; icon: string }> = {
  bio:          { label: "About / bio",        icon: "ti-align-left" },
  stats:        { label: "Stats",              icon: "ti-chart-bar" },
  trades:       { label: "Trades & services",  icon: "ti-tools" },
  photos:       { label: "Portfolio photos",   icon: "ti-photo" },
  reviews:      { label: "Reviews",            icon: "ti-star" },
  credentials:  { label: "Credentials",        icon: "ti-certificate" },
  availability: { label: "Availability",       icon: "ti-calendar" },
  team:         { label: "Team members",       icon: "ti-users" },
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

function getInitials(name: string | null): string {
  if (!name) return "?";
  return name.split(" ").map(n => n[0] ?? "").join("").slice(0, 2).toUpperCase();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function Stars({ rating }: { rating: number }) {
  return (
    <span aria-label={`${rating} stars`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} style={{ color: i < rating ? "#f07820" : "#ddd", fontSize: 14 }}>&#9733;</span>
      ))}
    </span>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "white", borderRadius: 12, marginBottom: 10, boxShadow: "0 1px 3px rgba(0,0,0,0.07)", overflow: "hidden" }}>
      <div style={{ padding: "16px 20px 0" }}>
        <div style={{
          borderLeft: "3px solid #f07820",
          paddingLeft: 10,
          marginBottom: 14,
          color: "#1a2744",
          fontWeight: 700,
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}>
          {title}
        </div>
      </div>
      <div style={{ padding: "0 20px 18px" }}>{children}</div>
    </div>
  );
}

// ─── Hero block ───────────────────────────────────────────────────────────────

export function HeroBlock({
  profile,
  availability,
  isPreview = false,
}: {
  profile: PublicProfile | null;
  availability: AvailabilityInfo;
  isPreview?: boolean;
}) {
  if (!profile) return null;
  const { full_name, company_name, ts_profile_code, logo_url, avatar_url, is_verified, location } = profile;
  const imgSrc = logo_url || avatar_url;

  return (
    <div style={{ background: "#1a2744", borderRadius: "12px 12px 0 0", padding: "28px 24px 24px" }}>
      <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
        {/* Avatar / logo */}
        {imgSrc ? (
          logo_url ? (
            <div style={{
              width: 72, height: 72, borderRadius: 8,
              border: "3px solid #f07820", background: "white",
              display: "flex", alignItems: "center", justifyContent: "center",
              overflow: "hidden", flexShrink: 0,
            }}>
              <img src={logo_url} alt="" style={{ maxWidth: 58, maxHeight: 58, objectFit: "contain" }} />
            </div>
          ) : (
            <img
              src={avatar_url!}
              alt={full_name ?? ""}
              style={{ width: 72, height: 72, borderRadius: "50%", border: "3px solid #f07820", objectFit: "cover", flexShrink: 0 }}
            />
          )
        ) : (
          <div style={{
            width: 72, height: 72, borderRadius: "50%",
            border: "3px solid #f07820", background: "#0f2038",
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, color: "white", fontSize: 24, fontWeight: 700,
          }}>
            {getInitials(full_name)}
          </div>
        )}

        {/* Identity info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{
            fontSize: 22, fontWeight: 700, margin: "0 0 3px",
            color: "white", fontFamily: "'Barlow Condensed', sans-serif",
            textTransform: "uppercase", letterSpacing: "0.02em",
          }}>
            {full_name || "Contractor"}
          </h1>
          {company_name && (
            <div style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", marginBottom: 10 }}>{company_name}</div>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
            {ts_profile_code && (
              <span style={{
                fontFamily: "'Roboto Mono', monospace", fontSize: 11,
                color: "rgba(255,255,255,0.55)", background: "rgba(255,255,255,0.08)",
                padding: "2px 8px", borderRadius: 4,
              }}>
                {ts_profile_code}
              </span>
            )}
            {is_verified && (
              <span style={{
                fontSize: 11, color: "#86efac", background: "rgba(34,197,94,0.15)",
                padding: "2px 8px", borderRadius: 4, display: "flex", alignItems: "center", gap: 4,
              }}>
                <i className="ti ti-circle-check" style={{ fontSize: 13 }} />
                Verified
              </span>
            )}
            {location && (
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", display: "flex", alignItems: "center", gap: 4 }}>
                <i className="ti ti-map-pin" style={{ fontSize: 13 }} />
                {location}
              </span>
            )}
            {!availability.loading && (
              <span style={{
                fontSize: 11,
                color: availability.isAvailable ? "#86efac" : "rgba(255,255,255,0.4)",
                background: availability.isAvailable ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.06)",
                padding: "2px 8px", borderRadius: 4,
              }}>
                {availability.label}
              </span>
            )}
          </div>
        </div>
      </div>

      {isPreview && (
        <div style={{
          marginTop: 20, padding: "10px 16px", background: "rgba(255,255,255,0.06)",
          borderRadius: 8, fontSize: 12, color: "rgba(255,255,255,0.4)", textAlign: "center",
        }}>
          This is a preview — enquiry button appears at the bottom
        </div>
      )}
    </div>
  );
}

// ─── Widget blocks ────────────────────────────────────────────────────────────

function BioBlock({ profile }: { profile: PublicProfile | null }) {
  if (!profile) return null;
  return (
    <SectionCard title="About">
      {profile.bio ? (
        <p style={{ fontSize: 14, color: "#444", lineHeight: 1.65, margin: 0 }}>{profile.bio}</p>
      ) : (
        <p style={{ fontSize: 14, color: "#aaa", fontStyle: "italic", margin: 0 }}>No bio added yet.</p>
      )}
      {profile.working_radius && profile.location && (
        <div style={{ marginTop: 10, fontSize: 12, color: "#888", display: "flex", alignItems: "center", gap: 6 }}>
          <i className="ti ti-map-pin" style={{ fontSize: 14, color: "#f07820" }} />
          Works within {profile.working_radius} of {profile.location}
        </div>
      )}
    </SectionCard>
  );
}

function StatsBlock({ profile }: { profile: PublicProfile | null }) {
  if (!profile) return null;
  const stats = [
    { label: "Jobs done",   value: profile.completed_jobs != null ? String(profile.completed_jobs) : "—" },
    { label: "Rating",      value: profile.rating != null ? profile.rating.toFixed(1) + " ★" : "—" },
    { label: "Experience",  value: profile.years_experience != null ? `${profile.years_experience} yrs` : "—" },
  ];
  return (
    <SectionCard title="Stats">
      <div style={{ display: "flex", gap: 10 }}>
        {stats.map(s => (
          <div key={s.label} style={{
            flex: 1, background: "#f8f8f6", borderRadius: 8,
            padding: "14px 10px", textAlign: "center",
          }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#1a2744", fontFamily: "'Roboto Mono', monospace" }}>
              {s.value}
            </div>
            <div style={{ fontSize: 10, color: "#999", textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 4 }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function TradesBlock({ profile }: { profile: PublicProfile | null }) {
  if (!profile?.trades?.length) return null;
  return (
    <SectionCard title="Trades &amp; services">
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {profile.trades.map((t, i) => (
          <span key={i} style={{
            background: "rgba(240,120,32,0.08)", color: "#c85e10",
            padding: "5px 14px", borderRadius: 20, fontSize: 13, fontWeight: 500,
            border: "1px solid rgba(240,120,32,0.2)",
          }}>
            {t}
          </span>
        ))}
      </div>
    </SectionCard>
  );
}

function PhotosBlock({ photos }: { photos: ProfilePhoto[] }) {
  if (!photos.length) return null;
  return (
    <SectionCard title="Portfolio photos">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
        {photos.slice(0, 9).map(p => (
          <div key={p.id} style={{ aspectRatio: "1", borderRadius: 6, overflow: "hidden", background: "#eee" }}>
            <img
              src={p.photo_url}
              alt={p.title ?? ""}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function ReviewsBlock({ reviews }: { reviews: ProfileReview[] }) {
  if (!reviews.length) {
    return (
      <SectionCard title="Reviews">
        <p style={{ fontSize: 14, color: "#aaa", fontStyle: "italic", margin: 0 }}>No reviews yet.</p>
      </SectionCard>
    );
  }
  return (
    <SectionCard title="Reviews">
      {reviews.map((r, idx) => (
        <div key={r.id} style={{
          paddingBottom: 14, marginBottom: idx < reviews.length - 1 ? 14 : 0,
          borderBottom: idx < reviews.length - 1 ? "1px solid #f0f0f0" : "none",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <div style={{
              width: 32, height: 32, borderRadius: "50%", background: "#1a2744",
              color: "white", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 700, flexShrink: 0,
            }}>
              C
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 13, color: "#1a2744" }}>Verified client</div>
              <div style={{ fontSize: 11, color: "#aaa" }}>{formatDate(r.created_at)}</div>
            </div>
            <Stars rating={r.rating} />
          </div>
          {r.comment && (
            <p style={{ fontSize: 14, color: "#555", lineHeight: 1.55, margin: 0 }}>{r.comment}</p>
          )}
        </div>
      ))}
    </SectionCard>
  );
}

function CredentialsBlock({ credentials }: { credentials: ProfileCredential[] }) {
  if (!credentials.length) {
    return (
      <SectionCard title="Credentials">
        <p style={{ fontSize: 14, color: "#aaa", fontStyle: "italic", margin: 0 }}>No credentials added.</p>
      </SectionCard>
    );
  }
  return (
    <SectionCard title="Credentials">
      {credentials.map((c, idx) => (
        <div key={c.id} style={{
          display: "flex", alignItems: "center", gap: 12,
          paddingBottom: 12, marginBottom: idx < credentials.length - 1 ? 12 : 0,
          borderBottom: idx < credentials.length - 1 ? "1px solid #f0f0f0" : "none",
        }}>
          <i className="ti ti-certificate" style={{ fontSize: 22, color: "#f07820", flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: "#1a2744" }}>{c.name}</div>
            {c.issuer && <div style={{ fontSize: 12, color: "#888" }}>{c.issuer}</div>}
          </div>
          {c.reference_number && (
            <div style={{ fontSize: 11, color: "#aaa", fontFamily: "'Roboto Mono', monospace", flexShrink: 0 }}>
              {c.reference_number}
            </div>
          )}
          {c.verified && (
            <i className="ti ti-circle-check" style={{ fontSize: 16, color: "#16a34a", flexShrink: 0 }} />
          )}
        </div>
      ))}
    </SectionCard>
  );
}

function AvailabilityBlock({ availability }: { availability: AvailabilityInfo }) {
  return (
    <SectionCard title="Availability">
      {availability.loading ? (
        <div style={{ fontSize: 14, color: "#aaa" }}>Checking availability...</div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <i
            className={`ti ${availability.isAvailable ? "ti-circle-check" : "ti-circle-x"}`}
            style={{ fontSize: 20, color: availability.isAvailable ? "#16a34a" : "#aaa" }}
          />
          <span style={{ fontSize: 14, fontWeight: 600, color: availability.isAvailable ? "#15803d" : "#888" }}>
            {availability.label}
          </span>
        </div>
      )}
    </SectionCard>
  );
}

function TeamBlock({ team }: { team: ProfileTeamMember[] }) {
  if (!team.length) {
    return (
      <SectionCard title="Team members">
        <p style={{ fontSize: 14, color: "#aaa", fontStyle: "italic", margin: 0 }}>No team members listed.</p>
      </SectionCard>
    );
  }
  return (
    <SectionCard title="Team members">
      {team.map((m, idx) => (
        <div key={m.id} style={{
          display: "flex", alignItems: "center", gap: 12,
          paddingBottom: 10, marginBottom: idx < team.length - 1 ? 10 : 0,
          borderBottom: idx < team.length - 1 ? "1px solid #f0f0f0" : "none",
        }}>
          <div style={{
            width: 34, height: 34, borderRadius: "50%", background: "#1a2744",
            color: "white", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 700, flexShrink: 0,
          }}>
            {getInitials(m.full_name)}
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 14, color: "#1a2744" }}>{m.full_name}</div>
            <div style={{ fontSize: 12, color: "#888" }}>{m.role}</div>
          </div>
        </div>
      ))}
    </SectionCard>
  );
}

// ─── Enquire CTA ──────────────────────────────────────────────────────────────

export function EnquireBlock({ onEnquire, disabled = false }: { onEnquire: () => void; disabled?: boolean }) {
  return (
    <div style={{ background: "white", borderRadius: "0 0 12px 12px", padding: "20px 24px", boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
      <button
        onClick={disabled ? undefined : onEnquire}
        disabled={disabled}
        style={{
          width: "100%", background: disabled ? "#ccc" : "#f07820",
          color: "white", border: "none", borderRadius: 8,
          padding: "14px", fontSize: 15, fontWeight: 600,
          cursor: disabled ? "default" : "pointer", fontFamily: "inherit",
          transition: "background 0.15s",
        }}
      >
        Send enquiry
      </button>
    </div>
  );
}

// ─── Master renderer ──────────────────────────────────────────────────────────

export function WidgetBlock({ widgetKey, data }: { widgetKey: WidgetKey; data: WidgetBlockData }) {
  switch (widgetKey) {
    case "bio":          return <BioBlock profile={data.profile} />;
    case "stats":        return <StatsBlock profile={data.profile} />;
    case "trades":       return <TradesBlock profile={data.profile} />;
    case "photos":       return <PhotosBlock photos={data.photos} />;
    case "reviews":      return <ReviewsBlock reviews={data.reviews} />;
    case "credentials":  return <CredentialsBlock credentials={data.credentials} />;
    case "availability": return <AvailabilityBlock availability={data.availability} />;
    case "team":         return <TeamBlock team={data.team} />;
    default:             return null;
  }
}
