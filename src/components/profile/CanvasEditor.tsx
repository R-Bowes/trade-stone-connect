import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  useProfileEditor,
  type SectionInstance,
  type ProfileDraft,
  type RepeatableSectionKey,
} from "@/hooks/useProfileEditor";
import { usePhotoGalleries, useGalleryPhotos, type ContractorPhoto } from "@/hooks/usePhotoGalleries";
import { useContractorProjects, type ContractorProject, type ProjectData } from "@/hooks/useContractorProjects";
import { useProjectGroups } from "@/hooks/useProjectGroups";
import { useContractorTeam, type TeamMemberInsert } from "@/hooks/useContractorTeam";
import { useContractorCredentials, type NewCredential } from "@/hooks/useContractorCredentials";
import { useProfileVideos, extractVideoId, type ProfileVideo } from "@/hooks/useProfileVideos";
import { useBeforeAfter, type BeforeAfterPair } from "@/hooks/useBeforeAfter";
import { isEmbeddable } from "@/lib/videoEmbed";
import { ConsentGatedEmbed } from "@/components/shared/ConsentGatedEmbed";
import { BeforeAfterSlider } from "@/components/profile/BeforeAfterSlider";
import { useIsMobile } from "@/hooks/use-mobile";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { Database } from "@/integrations/supabase/types";

type TeamMemberRow = Database["public"]["Tables"]["team_members"]["Row"];
type CredentialRow = Database["public"]["Tables"]["contractor_credentials"]["Row"];

// ── Types ─────────────────────────────────────────────────────────────────────

interface SupplementaryProfile {
  id: string;
  ts_profile_code: string | null;
  avatar_url: string | null;
  logo_url: string | null;
  is_verified: boolean | null;
  trades: string[] | null;
  completed_jobs: number | null;
  rating: number | null;
  years_experience: number | null;
  review_count: number | null;
  working_radius: string | null;
  hourly_rate: number | null;
}

interface ReviewRow {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

type SectionDef = {
  icon: string;
  label: string;
  fixed?: boolean;
  hideable: boolean;
  deletable: boolean;
  reorderable: boolean;
  repeatable?: boolean;
  max?: number;
};

const SECTION_DEFS: Record<string, SectionDef> = {
  hero:         { icon: "ti-id-badge",    label: "Hero",             fixed: true,  hideable: false, deletable: false, reorderable: false },
  bio:          { icon: "ti-align-left",  label: "About",            hideable: true,  deletable: false, reorderable: true  },
  stats:        { icon: "ti-chart-bar",   label: "Stats",            hideable: true,  deletable: false, reorderable: true  },
  services:     { icon: "ti-tools",       label: "Services",         hideable: true,  deletable: false, reorderable: true  },
  gallery:      { icon: "ti-photo",       label: "Photo gallery",    hideable: true,  deletable: true,  reorderable: true,  repeatable: true, max: 6 },
  project:      { icon: "ti-briefcase",   label: "Project showcase", hideable: true,  deletable: true,  reorderable: true,  repeatable: true, max: 6 },
  reviews:      { icon: "ti-star",        label: "Reviews",          hideable: true,  deletable: false, reorderable: true  },
  team:         { icon: "ti-users",       label: "Team",             hideable: true,  deletable: false, reorderable: true  },
  credentials:  { icon: "ti-certificate", label: "Credentials",      hideable: true,  deletable: false, reorderable: true  },
  availability: { icon: "ti-calendar",    label: "Availability",     hideable: true,  deletable: false, reorderable: true  },
  video:        { icon: "ti-video",       label: "Video showcase",   hideable: true,  deletable: false, reorderable: true  },
  before_after: { icon: "ti-arrows-diff", label: "Before & after",   hideable: true,  deletable: false, reorderable: true  },
  service_area: { icon: "ti-map-pin",     label: "Service area",     hideable: true,  deletable: false, reorderable: true  },
  social:       { icon: "ti-brand-instagram", label: "Social links", hideable: true,  deletable: false, reorderable: true  },
  cta:          { icon: "ti-send",        label: "Call to action",   fixed: true,  hideable: false, deletable: false, reorderable: false },
};

// Caps not modelled by SECTION_DEFS.max (which caps how many *section
// instances* of a repeatable type can exist — see gallery/project above).
// These cap counts of *items within/across* sections instead.
const MAX_PHOTOS_PER_GALLERY = 40;
const MAX_PROJECTS_TOTAL = 12; // contractor-wide, across every project section
const MAX_SECTIONS_TOTAL = 20;

const SOCIAL_PLATFORMS: { key: string; label: string; icon: string }[] = [
  { key: "instagram", label: "Instagram",   icon: "ti-brand-instagram" },
  { key: "facebook",  label: "Facebook",    icon: "ti-brand-facebook" },
  { key: "youtube",   label: "YouTube",     icon: "ti-brand-youtube" },
  { key: "tiktok",    label: "TikTok",      icon: "ti-brand-tiktok" },
  { key: "linkedin",  label: "LinkedIn",    icon: "ti-brand-linkedin" },
  { key: "twitter",   label: "Twitter / X", icon: "ti-brand-x" },
  { key: "website",   label: "Website",     icon: "ti-world" },
];

const ALL_STAT_KEYS = ["completed_jobs", "years_experience", "rating", "review_count", "hourly_rate"];
const STAT_LABELS: Record<string, string> = {
  completed_jobs: "Jobs completed",
  years_experience: "Years experience",
  rating: "Average rating",
  review_count: "Reviews",
  hourly_rate: "Hourly rate",
};

const NAVY = "#1a2744";
const ORANGE = "#f07820";
const CANVAS_BG = "#f4f4f0";

// ── Shared helpers ────────────────────────────────────────────────────────────

function Stars({ rating }: { rating: number }) {
  return (
    <span style={{ color: ORANGE, fontSize: 13 }}>
      {Array.from({ length: 5 }, (_, i) => (
        <i key={i} className={`ti ${i < Math.round(rating) ? "ti-star-filled" : "ti-star"}`} />
      ))}
    </span>
  );
}

// ── Panel field helpers ───────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>
      {children}
    </div>
  );
}

function PanelInput({ value, onChange, placeholder, type = "text" }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: 13, border: "1px solid #e5e7eb", borderRadius: 6, fontFamily: "inherit", color: "#374151", outline: "none", marginBottom: 14 }}
    />
  );
}

function PanelTextarea({ value, onChange, placeholder, rows = 4 }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      rows={rows}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: 13, border: "1px solid #e5e7eb", borderRadius: 6, fontFamily: "inherit", color: "#374151", outline: "none", resize: "vertical", marginBottom: 14 }}
    />
  );
}

function PanelToggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", marginBottom: 14, fontSize: 13, color: "#374151" }}>
      <div
        onClick={() => onChange(!checked)}
        style={{ width: 36, height: 20, borderRadius: 10, background: checked ? ORANGE : "#d1d5db", position: "relative", transition: "background 0.2s", flexShrink: 0 }}
      >
        <div style={{ width: 16, height: 16, borderRadius: "50%", background: "white", position: "absolute", top: 2, left: checked ? 18 : 2, transition: "left 0.2s" }} />
      </div>
      {label}
    </label>
  );
}

// Edits to profile columns are not part of the published snapshot: they reach
// the public profile as soon as they are saved, without waiting for Publish.
function LiveOnSaveNote() {
  return (
    <div style={{ display: "flex", gap: 8, padding: "8px 10px", background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 6, fontSize: 12, color: "#9a3412", marginBottom: 14, lineHeight: 1.4 }}>
      <i className="ti ti-bolt" style={{ fontSize: 14, marginTop: 1, flexShrink: 0 }} />
      <span>Changes here go live as soon as you save. They don&apos;t wait for Publish.</span>
    </div>
  );
}

function PanelBtn({ onClick, children, variant = "primary" }: {
  onClick: () => void;
  children: React.ReactNode;
  variant?: "primary" | "danger" | "ghost";
}) {
  const bg = variant === "primary" ? ORANGE : variant === "danger" ? "#ef4444" : "transparent";
  const color = variant === "ghost" ? "#6b7280" : "white";
  const border = variant === "ghost" ? "1px solid #e5e7eb" : "none";
  return (
    <button
      onClick={onClick}
      style={{ padding: "8px 14px", fontSize: 13, fontWeight: 600, background: bg, color, border, borderRadius: 6, cursor: "pointer", fontFamily: "inherit" }}
    >
      {children}
    </button>
  );
}

// ── Canvas block inner content components ─────────────────────────────────────

function HeroContent({ draft, profile }: { draft: ProfileDraft; profile: SupplementaryProfile | null }) {
  return (
    <div style={{ background: NAVY, padding: "40px 24px 32px", position: "relative", overflow: "hidden" }}>
      {draft.coverUrl && (
        <img src={draft.coverUrl} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", opacity: 0.35 }} />
      )}
      <div style={{ position: "relative" }}>
        <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#334155", border: "3px solid rgba(255,255,255,0.2)", overflow: "hidden", marginBottom: 12 }}>
          {profile?.avatar_url && <img src={profile.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
        </div>
        <div style={{ color: "white", fontWeight: 700, fontSize: 20 }}>{draft.displayName || "Your name"}</div>
        {draft.companyName && <div style={{ color: "rgba(255,255,255,0.7)", fontSize: 14, marginTop: 2 }}>{draft.companyName}</div>}
        {profile?.ts_profile_code && (
          <div style={{ display: "inline-block", background: ORANGE, color: "white", fontSize: 11, fontFamily: "Roboto Mono, monospace", fontWeight: 700, padding: "2px 8px", borderRadius: 4, marginTop: 8 }}>
            {profile.ts_profile_code}
          </div>
        )}
        {draft.locationDisplay && (
          <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 13, marginTop: 8 }}>
            <i className="ti ti-map-pin" style={{ marginRight: 4 }} />{draft.locationDisplay}
          </div>
        )}
      </div>
    </div>
  );
}

function BioContent({ draft, section }: { draft: ProfileDraft; section: SectionInstance }) {
  return (
    <div style={{ padding: "20px 24px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: ORANGE, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>{section.label}</div>
      <p style={{ color: "#4b5563", fontSize: 14, lineHeight: 1.6, margin: 0 }}>
        {draft.bioText || <span style={{ color: "#9ca3af" }}>No bio added yet</span>}
      </p>
    </div>
  );
}

function StatsContent({ draft, profile, section }: { draft: ProfileDraft; profile: SupplementaryProfile | null; section: SectionInstance }) {
  const visible: string[] = (section.meta.visibleStats as string[] | undefined) ?? ALL_STAT_KEYS;
  const statsMap: Record<string, string | number | null> = {
    completed_jobs: profile?.completed_jobs ?? null,
    years_experience: profile?.years_experience ?? null,
    rating: profile?.rating ? Number(profile.rating).toFixed(1) : null,
    review_count: profile?.review_count ?? null,
    hourly_rate: profile?.hourly_rate ? `£${profile.hourly_rate}/hr` : null,
  };
  return (
    <div style={{ padding: "20px 24px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {visible.filter(k => statsMap[k] !== null).map(k => (
          <div key={k} style={{ textAlign: "center", padding: "14px 8px", background: "#f9fafb", borderRadius: 8 }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: NAVY, fontFamily: "Roboto Mono, monospace" }}>{statsMap[k]}</div>
            <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4 }}>{STAT_LABELS[k]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ServicesContent({ profile, section }: { profile: SupplementaryProfile | null; section: SectionInstance }) {
  const trades = profile?.trades ?? [];
  return (
    <div style={{ padding: "20px 24px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: ORANGE, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>{section.label}</div>
      {trades.length === 0
        ? <div style={{ color: "#9ca3af", fontSize: 13 }}>No trades added to your profile yet</div>
        : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {trades.map(t => (
              <span key={t} style={{ background: "#f1f5f9", color: NAVY, fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 20 }}>{t}</span>
            ))}
          </div>
        )
      }
    </div>
  );
}

function GalleryContent({ section, galleryPhotoMap }: { section: SectionInstance; galleryPhotoMap: Map<string, ContractorPhoto[]> }) {
  const photos = section.sectionRefId ? (galleryPhotoMap.get(section.sectionRefId) ?? []) : [];
  const intro = section.meta.intro as string | undefined;
  return (
    <div style={{ padding: "20px 24px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: ORANGE, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: intro ? 8 : 12 }}>{section.label}</div>
      {intro && <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5, margin: "0 0 12px" }}>{intro}</p>}
      {photos.length === 0
        ? <div style={{ color: "#9ca3af", fontSize: 13, padding: "24px 0", textAlign: "center" }}><i className="ti ti-photo" style={{ fontSize: 24, display: "block", marginBottom: 8 }} />No photos yet — click to add</div>
        : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
            {photos.slice(0, 6).map(p => (
              <div key={p.id} style={{ aspectRatio: "1", background: "#e5e7eb", borderRadius: 6, overflow: "hidden" }}>
                <img src={p.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              </div>
            ))}
          </div>
        )
      }
    </div>
  );
}

// contractor_projects.completed_date is a free-text column with no DB-level
// format constraint — the app is the only thing enforcing a shape.
// Convention: "YYYY-MM" (month + year, no day) or null, never free text.
// Native <input type="month"> in ProjectPanelBody only ever produces that
// shape or "", so normalizeMonth is a defensive backstop, not the primary
// guarantee. formatCompletedMonth is the read-side mirror: a value written
// outside the app (the same way this table's schema drifted outside
// migrations — see useContractorProjects.ts) might not match, so render
// nothing rather than risk "Invalid Date".
const MONTH_RE = /^\d{4}-\d{2}$/;

function normalizeMonth(value: string): string | null {
  return MONTH_RE.test(value) ? value : null;
}

function formatCompletedMonth(value: string | null): string | null {
  if (!value || !MONTH_RE.test(value)) return null;
  const [year, month] = value.split("-").map(Number);
  if (month < 1 || month > 12) return null;
  const date = new Date(year, month - 1, 1);
  if (Number.isNaN(date.getTime())) return null;
  return `Completed ${date.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}`;
}

function ProjectContent({ section, projects }: { section: SectionInstance; projects: ContractorProject[] }) {
  // A2: scope to this section's own group — see ProjectPanelContent for the
  // "not linked" case (no sectionRefId). An unlinked section's projects
  // list is empty here too, which already falls through to the ordinary
  // empty state below — correct, since the remedy (remove/re-add) lives in
  // the panel, not the preview.
  const groupProjects = section.sectionRefId ? projects.filter(p => p.group_id === section.sectionRefId) : [];
  return (
    <div style={{ padding: "20px 24px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: ORANGE, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>{section.label}</div>
      {groupProjects.length === 0
        ? <div style={{ color: "#9ca3af", fontSize: 13, padding: "16px 0" }}>No projects yet — add your first in the panel</div>
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {groupProjects.map(p => {
              const completed = formatCompletedMonth(p.completed_date);
              return (
                <div key={p.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "12px 14px" }}>
                  <div style={{ fontWeight: 600, color: NAVY, fontSize: 14 }}>{p.title}</div>
                  {completed && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{completed}</div>}
                </div>
              );
            })}
          </div>
        )
      }
    </div>
  );
}

function ReviewsContent({ reviews, section }: { reviews: ReviewRow[]; section: SectionInstance }) {
  const pinned = (section.meta.pinnedReviewIds as string[] | undefined) ?? [];
  const shown = pinned.length > 0 ? reviews.filter(r => pinned.includes(r.id)) : reviews.slice(0, 2);
  return (
    <div style={{ padding: "20px 24px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: ORANGE, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>{section.label}</div>
      {shown.length === 0
        ? <div style={{ color: "#9ca3af", fontSize: 13 }}>Reviews from completed jobs appear here</div>
        : shown.map(r => (
          <div key={r.id} style={{ borderLeft: `3px solid ${ORANGE}`, paddingLeft: 12, marginBottom: 12 }}>
            <Stars rating={r.rating} />
            {r.comment && <p style={{ fontSize: 13, color: "#4b5563", margin: "6px 0 0", fontStyle: "italic" }}>"{r.comment}"</p>}
          </div>
        ))
      }
    </div>
  );
}

function TeamContent({ members, section }: { members: TeamMemberRow[]; section: SectionInstance }) {
  const active = members.filter(m => m.status === "active");
  return (
    <div style={{ padding: "20px 24px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: ORANGE, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>{section.label}</div>
      {active.length === 0
        ? <div style={{ color: "#9ca3af", fontSize: 13 }}>No team members yet</div>
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {active.map(m => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#e5e7eb", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: NAVY }}>
                  {m.full_name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: NAVY }}>{m.full_name}</div>
                  {m.role && <div style={{ fontSize: 12, color: "#6b7280" }}>{m.role}</div>}
                </div>
              </div>
            ))}
          </div>
        )
      }
    </div>
  );
}

function CredentialsContent({ credentials, section }: { credentials: CredentialRow[]; section: SectionInstance }) {
  return (
    <div style={{ padding: "20px 24px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: ORANGE, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>{section.label}</div>
      {credentials.length === 0
        ? <div style={{ color: "#9ca3af", fontSize: 13 }}>No credentials added yet</div>
        : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {credentials.map(c => (
              <span key={c.id} style={{ display: "flex", alignItems: "center", gap: 5, background: c.verified ? "#f0fdf4" : "#f9fafb", border: `1px solid ${c.verified ? "#bbf7d0" : "#e5e7eb"}`, color: c.verified ? "#16a34a" : "#374151", fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 20 }}>
                {c.verified && <i className="ti ti-check" style={{ fontSize: 11 }} />}
                {c.name}
              </span>
            ))}
          </div>
        )
      }
    </div>
  );
}

function AvailabilityContent({ section }: { section: SectionInstance }) {
  return (
    <div style={{ padding: "20px 24px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: ORANGE, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>{section.label}</div>
      <div style={{ color: "#6b7280", fontSize: 13 }}>Live availability calendar — managed from your Availability tab</div>
    </div>
  );
}

function VideoContent({ section, videos }: { section: SectionInstance; videos: ProfileVideo[] }) {
  const intro = section.meta.intro as string | undefined;
  return (
    <div style={{ padding: "20px 24px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: ORANGE, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: intro ? 8 : 12 }}>{section.label}</div>
      {intro && <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5, margin: "0 0 12px" }}>{intro}</p>}
      {videos.length === 0
        ? <div style={{ color: "#9ca3af", fontSize: 13, padding: "16px 0" }}>No videos yet — add your first in the panel</div>
        : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
            {videos.map(v => {
              const { videoId } = extractVideoId(v.url);
              return (
                <div key={v.id} style={{ borderRadius: 8, overflow: "hidden", border: "1px solid #e5e7eb" }}>
                  {isEmbeddable(v.platform) && videoId
                    ? <ConsentGatedEmbed provider={v.platform} videoId={videoId} title={v.title ?? "Video"} sourceUrl={v.url} />
                    : (
                      <div style={{ aspectRatio: "16/9", background: "#111" }}>
                        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#6b7280" }}><i className="ti ti-video" style={{ fontSize: 24 }} /></div>
                      </div>
                    )
                  }
                  {v.title && <div style={{ padding: "8px 10px", fontSize: 12, fontWeight: 600, color: NAVY }}>{v.title}</div>}
                </div>
              );
            })}
          </div>
        )
      }
    </div>
  );
}

function BeforeAfterContent({ section, pairs }: { section: SectionInstance; pairs: BeforeAfterPair[] }) {
  const intro = section.meta.intro as string | undefined;
  return (
    <div style={{ padding: "20px 24px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: ORANGE, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: intro ? 8 : 12 }}>{section.label}</div>
      {intro && <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5, margin: "0 0 12px" }}>{intro}</p>}
      {pairs.length === 0
        ? <div style={{ color: "#9ca3af", fontSize: 13, padding: "16px 0" }}>No before/after pairs yet — add your first in the panel</div>
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {pairs.map(p => (
              <div key={p.id}>
                <BeforeAfterSlider beforeUrl={p.before_photo_url} afterUrl={p.after_photo_url} height={180} />
                {p.title && <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600, color: NAVY }}>{p.title}</div>}
              </div>
            ))}
          </div>
        )
      }
    </div>
  );
}

function ServiceAreaContent({ draft, profile }: { draft: ProfileDraft; profile: SupplementaryProfile | null }) {
  return (
    <div style={{ padding: "20px 24px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: ORANGE, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Service area</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px", background: "#f9fafb", borderRadius: 8 }}>
        <i className="ti ti-map-pin" style={{ fontSize: 20, color: ORANGE }} />
        <div style={{ fontSize: 13, color: "#374151" }}>
          {draft.locationDisplay
            ? <>Based in <strong>{draft.locationDisplay}</strong>{profile?.working_radius ? <>, covering a <strong>{profile.working_radius}</strong> radius</> : ""}</>
            : "Add your location to show your service area"}
        </div>
      </div>
    </div>
  );
}

function SocialContent({ socialLinks }: { socialLinks: Record<string, string> }) {
  const active = SOCIAL_PLATFORMS.filter(p => socialLinks[p.key]?.trim());
  return (
    <div style={{ padding: "20px 24px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: ORANGE, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Social links</div>
      {active.length === 0
        ? <div style={{ color: "#9ca3af", fontSize: 13 }}>No social links added — shown below your name in the hero once set</div>
        : (
          <div style={{ display: "flex", gap: 10 }}>
            {active.map(p => (
              <div key={p.key} style={{ width: 32, height: 32, borderRadius: "50%", background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <i className={`ti ${p.icon}`} style={{ fontSize: 16, color: NAVY }} />
              </div>
            ))}
          </div>
        )
      }
    </div>
  );
}

function CtaContent({ draft }: { draft: ProfileDraft }) {
  return (
    <div style={{ padding: "28px 24px", textAlign: "center", background: "#f9fafb" }}>
      <button style={{ background: ORANGE, color: "white", fontWeight: 700, fontSize: 15, padding: "12px 32px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
        {draft.ctaLabel || "Get in touch"}
      </button>
    </div>
  );
}

// ── Canvas block wrapper ──────────────────────────────────────────────────────

interface CanvasBlockProps {
  section: SectionInstance;
  index: number;
  total: number;
  draft: ProfileDraft;
  profile: SupplementaryProfile | null;
  reviews: ReviewRow[];
  galleryPhotoMap: Map<string, ContractorPhoto[]>;
  projects: ContractorProject[];
  members: TeamMemberRow[];
  credentials: CredentialRow[];
  videos: ProfileVideo[];
  beforeAfterPairs: BeforeAfterPair[];
  isSelected: boolean;
  onSelect: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggle: () => void;
  onDelete: () => void;
}

function CanvasBlock(props: CanvasBlockProps) {
  const { section, index, total, draft, profile, reviews, galleryPhotoMap, projects, members, credentials, videos, beforeAfterPairs, isSelected, onSelect, onMoveUp, onMoveDown, onToggle, onDelete } = props;
  const [hovered, setHovered] = useState(false);
  const def = SECTION_DEFS[section.type] ?? SECTION_DEFS.bio;
  const showBar = (hovered || isSelected) && !def.fixed;

  return (
    <div
      id={`canvas-block-${section.id}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onSelect}
      style={{
        position: "relative",
        border: `1.5px ${isSelected ? "solid" : "dashed"} ${(hovered || isSelected) ? ORANGE : "transparent"}`,
        borderRadius: 8,
        background: "white",
        cursor: "pointer",
        opacity: section.is_enabled ? 1 : 0.45,
        transition: "border-color 0.15s, opacity 0.2s",
        marginBottom: 10,
      }}
    >
      {/* Hover / selected control bar */}
      {showBar && (
        <div
          onClick={e => e.stopPropagation()}
          style={{ position: "absolute", top: -34, left: 0, right: 0, height: 30, background: ORANGE, borderRadius: "6px 6px 0 0", display: "flex", alignItems: "center", padding: "0 8px", gap: 6, zIndex: 10 }}
        >
          <i className={`ti ${def.icon}`} style={{ color: "white", fontSize: 14 }} />
          <span style={{ color: "white", fontSize: 12, fontWeight: 600, flex: 1 }}>{section.label}</span>
          {def.reorderable && (
            <>
              <button onClick={onMoveUp} disabled={index === 0} style={{ background: "none", border: "none", color: index === 0 ? "rgba(255,255,255,0.3)" : "white", cursor: index === 0 ? "default" : "pointer", padding: "2px 4px" }}>
                <i className="ti ti-chevron-up" style={{ fontSize: 14 }} />
              </button>
              <button onClick={onMoveDown} disabled={index >= total - 1} style={{ background: "none", border: "none", color: index >= total - 1 ? "rgba(255,255,255,0.3)" : "white", cursor: index >= total - 1 ? "default" : "pointer", padding: "2px 4px" }}>
                <i className="ti ti-chevron-down" style={{ fontSize: 14 }} />
              </button>
            </>
          )}
          {def.hideable && (
            <button onClick={onToggle} title={section.is_enabled ? "Hide" : "Show"} style={{ background: "none", border: "none", color: "white", cursor: "pointer", padding: "2px 4px" }}>
              <i className={`ti ${section.is_enabled ? "ti-eye" : "ti-eye-off"}`} style={{ fontSize: 14 }} />
            </button>
          )}
          {def.deletable && (
            <button onClick={onDelete} title="Remove section" style={{ background: "none", border: "none", color: "white", cursor: "pointer", padding: "2px 4px" }}>
              <i className="ti ti-trash" style={{ fontSize: 14 }} />
            </button>
          )}
        </div>
      )}

      {/* Block content */}
      {section.type === "hero" && <HeroContent draft={draft} profile={profile} />}
      {section.type === "bio" && <BioContent draft={draft} section={section} />}
      {section.type === "stats" && <StatsContent draft={draft} profile={profile} section={section} />}
      {section.type === "services" && <ServicesContent profile={profile} section={section} />}
      {section.type === "gallery" && <GalleryContent section={section} galleryPhotoMap={galleryPhotoMap} />}
      {section.type === "project" && <ProjectContent section={section} projects={projects} />}
      {section.type === "reviews" && <ReviewsContent reviews={reviews} section={section} />}
      {section.type === "team" && <TeamContent members={members} section={section} />}
      {section.type === "credentials" && <CredentialsContent credentials={credentials} section={section} />}
      {section.type === "availability" && <AvailabilityContent section={section} />}
      {section.type === "video" && <VideoContent section={section} videos={videos} />}
      {section.type === "before_after" && <BeforeAfterContent section={section} pairs={beforeAfterPairs} />}
      {section.type === "service_area" && <ServiceAreaContent draft={draft} profile={profile} />}
      {section.type === "social" && <SocialContent socialLinks={draft.socialLinks} />}
      {section.type === "cta" && <CtaContent draft={draft} />}
    </div>
  );
}

// ── Edit panel subcomponents ──────────────────────────────────────────────────

function HeroPanel({ draft, updateDraft }: { draft: ProfileDraft; updateDraft: (p: Partial<ProfileDraft>) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const handleCoverUpload = async (file: File) => {
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // "covers" bucket never existed — every upload through it failed
      // silently (uncaught rejection, no toast) and no cover_url could ever
      // have been persisted this way. contractor-photos is public, same
      // audience as gallery/project photos which already live here; `cover`
      // is a literal category segment, matching useContractorProjects.ts's
      // `{user.id}/projects/...` convention, distinct from a gallery's
      // instance-id segment.
      const path = `${user.id}/cover/cover.jpg`;
      const { error } = await supabase.storage.from("contractor-photos").upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("contractor-photos").getPublicUrl(path);
      updateDraft({ coverUrl: publicUrl });
    } catch (err: any) {
      toast({ title: "Cover upload failed", description: String(err?.message ?? err), variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <LiveOnSaveNote />
      <FieldLabel>Display name</FieldLabel>
      <PanelInput value={draft.displayName} onChange={v => updateDraft({ displayName: v })} placeholder="Your name" />
      <FieldLabel>Company name</FieldLabel>
      <PanelInput value={draft.companyName} onChange={v => updateDraft({ companyName: v })} placeholder="Optional" />
      <FieldLabel>Location</FieldLabel>
      <PanelInput value={draft.locationDisplay} onChange={v => updateDraft({ locationDisplay: v })} placeholder="e.g. London" />
      <FieldLabel>Cover photo</FieldLabel>
      <input ref={fileRef} type="file" accept="image/*" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0, pointerEvents: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleCoverUpload(f); }} />
      {draft.coverUrl && (
        <div style={{ marginBottom: 10, borderRadius: 6, overflow: "hidden", height: 80 }}>
          <img src={draft.coverUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
      )}
      <PanelBtn variant="ghost" onClick={() => fileRef.current?.click()}>
        {uploading ? "Uploading…" : draft.coverUrl ? "Change cover" : "Upload cover photo"}
      </PanelBtn>
    </div>
  );
}

function BioPanel({ draft, updateDraft, section, updateSection }: {
  draft: ProfileDraft;
  updateDraft: (p: Partial<ProfileDraft>) => void;
  section: SectionInstance;
  updateSection: (id: string, p: Partial<SectionInstance>) => void;
}) {
  return (
    <div>
      <FieldLabel>Section heading</FieldLabel>
      <PanelInput value={section.label} onChange={v => updateSection(section.id, { label: v })} placeholder="About me" />
      <LiveOnSaveNote />
      <FieldLabel>Bio text</FieldLabel>
      <PanelTextarea value={draft.bioText} onChange={v => updateDraft({ bioText: v })} placeholder="Tell clients about yourself…" rows={6} />
    </div>
  );
}

function StatsPanel({ section, updateSection }: {
  section: SectionInstance;
  updateSection: (id: string, p: Partial<SectionInstance>) => void;
}) {
  const visible: string[] = (section.meta.visibleStats as string[] | undefined) ?? ALL_STAT_KEYS;
  const toggle = (key: string) => {
    const next = visible.includes(key) ? visible.filter(k => k !== key) : [...visible, key];
    updateSection(section.id, { meta: { ...section.meta, visibleStats: next } });
  };
  return (
    <div>
      <FieldLabel>Section heading</FieldLabel>
      <PanelInput value={section.label} onChange={v => updateSection(section.id, { label: v })} placeholder="Stats" />
      <FieldLabel>Stats to show</FieldLabel>
      {ALL_STAT_KEYS.map(k => (
        <label key={k} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, cursor: "pointer", fontSize: 13 }}>
          <input type="checkbox" checked={visible.includes(k)} onChange={() => toggle(k)} />
          {STAT_LABELS[k]}
        </label>
      ))}
    </div>
  );
}

function ServicesPanelContent({ draft, updateDraft, section, updateSection }: {
  draft: ProfileDraft;
  updateDraft: (p: Partial<ProfileDraft>) => void;
  section: SectionInstance;
  updateSection: (id: string, p: Partial<SectionInstance>) => void;
}) {
  return (
    <div>
      <FieldLabel>Section heading</FieldLabel>
      <PanelInput value={section.label} onChange={v => updateSection(section.id, { label: v })} placeholder="Services" />
      <div style={{ padding: "12px", background: "#f9fafb", borderRadius: 6, fontSize: 12, color: "#6b7280", marginBottom: 14 }}>
        <i className="ti ti-info-circle" style={{ marginRight: 6 }} />
        Trades come from your main profile settings
      </div>
    </div>
  );
}

// Gallery panel calls useGalleryPhotos — must be its own component so hook runs unconditionally.
function GalleryPanelContent({ section, updateSection, galleries, updateGallery }: {
  section: SectionInstance;
  updateSection: (id: string, p: Partial<SectionInstance>) => void;
  galleries: { id: string; title: string }[];
  updateGallery: (id: string, title: string) => Promise<void>;
}) {
  const galleryId = section.sectionRefId ?? null;
  const { photos, uploading, uploadPhoto, deletePhoto } = useGalleryPhotos(galleryId);
  const fileRef = useRef<HTMLInputElement>(null);
  const gallery = galleries.find(g => g.id === galleryId);
  const { toast } = useToast();

  const handleTitleChange = async (title: string) => {
    updateSection(section.id, { label: title });
    if (galleryId) {
      try { await updateGallery(galleryId, title); } catch (_) { /* non-fatal */ }
    }
  };

  if (!galleryId) {
    return <div style={{ color: "#9ca3af", fontSize: 13 }}>Gallery not linked. Try removing and re-adding this section.</div>;
  }

  const intro = (section.meta.intro as string | undefined) ?? "";

  return (
    <div>
      <FieldLabel>Gallery title</FieldLabel>
      <PanelInput value={section.label} onChange={handleTitleChange} placeholder="Our work" />
      <FieldLabel>Intro (optional)</FieldLabel>
      <PanelTextarea
        value={intro}
        onChange={v => updateSection(section.id, { meta: { ...section.meta, intro: v } })}
        placeholder="A short line shown above the photos on your public profile"
        rows={2}
      />
      <FieldLabel>Photos</FieldLabel>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 12 }}>
        {photos.map(p => (
          <div key={p.id} style={{ position: "relative", aspectRatio: "1", background: "#e5e7eb", borderRadius: 6, overflow: "hidden" }}>
            <img src={p.photo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <button
              onClick={() => deletePhoto(p.id)}
              style={{ position: "absolute", top: 4, right: 4, background: "rgba(0,0,0,0.6)", border: "none", borderRadius: "50%", width: 22, height: 22, color: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <i className="ti ti-x" style={{ fontSize: 11 }} />
            </button>
          </div>
        ))}
        {photos.length < MAX_PHOTOS_PER_GALLERY && (
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{ aspectRatio: "1", background: "#f9fafb", border: "2px dashed #d1d5db", borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 22 }}
          >
            <i className={`ti ${uploading ? "ti-loader" : "ti-plus"}`} />
          </button>
        )}
      </div>
      <input ref={fileRef} type="file" accept="image/*" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0, pointerEvents: "none" }} onChange={e => {
        const f = e.target.files?.[0];
        if (f) uploadPhoto(f).catch((err: any) => {
          toast({ title: "Upload failed", description: String(err?.message ?? err), variant: "destructive" });
        });
        e.target.value = "";
      }} />
      <div style={{ fontSize: 11, color: "#9ca3af" }}>{photos.length} photo{photos.length !== 1 ? "s" : ""}</div>
    </div>
  );
}

function ProjectPanelContent({ section, updateSection, projects, addProject, updateProject, deleteProject, uploadProjectPhoto, uploading, updateGroup }: {
  section: SectionInstance;
  updateSection: (id: string, p: Partial<SectionInstance>) => void;
  projects: ContractorProject[];
  addProject: (data: ProjectData) => Promise<void>;
  updateProject: (id: string, data: Partial<ProjectData>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  uploadProjectPhoto: (file: File) => Promise<string>;
  uploading: boolean;
  updateGroup: (id: string, title: string) => Promise<void>;
}) {
  const groupId = section.sectionRefId ?? null;

  // A2: mirrors GalleryPanelContent's "not linked" fallback exactly — a
  // project section with no group to scope its content to shows this
  // instead of the add/edit form, rather than falling back to showing
  // every project the contractor has ever created (the bug this fixes).
  // A project created before this migration (group_id IS NULL) is in the
  // same state as this section until one of them is reassigned — neither
  // this panel nor the gallery one offers a reassignment control today.
  if (!groupId) {
    return <div style={{ color: "#9ca3af", fontSize: 13 }}>Project group not linked. Try removing and re-adding this section.</div>;
  }

  return (
    <ProjectPanelBody
      section={section} updateSection={updateSection} groupId={groupId} updateGroup={updateGroup}
      projects={projects} addProject={addProject} updateProject={updateProject} deleteProject={deleteProject}
      uploadProjectPhoto={uploadProjectPhoto} uploading={uploading}
    />
  );
}

function ProjectPanelBody({ section, updateSection, groupId, updateGroup, projects, addProject, updateProject, deleteProject, uploadProjectPhoto, uploading }: {
  section: SectionInstance;
  updateSection: (id: string, p: Partial<SectionInstance>) => void;
  groupId: string;
  updateGroup: (id: string, title: string) => Promise<void>;
  projects: ContractorProject[];
  addProject: (data: ProjectData) => Promise<void>;
  updateProject: (id: string, data: Partial<ProjectData>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  uploadProjectPhoto: (file: File) => Promise<string>;
  uploading: boolean;
}) {
  const groupProjects = projects.filter(p => p.group_id === groupId);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newCompleted, setNewCompleted] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editCompleted, setEditCompleted] = useState("");

  const [uploadTargetId, setUploadTargetId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    await addProject({
      title: newTitle.trim(),
      description: newDesc || null,
      completed_date: normalizeMonth(newCompleted),
      photos: [],
      group_id: groupId,
    });
    setAdding(false);
    setNewTitle(""); setNewDesc(""); setNewCompleted("");
  };

  // Mirrors GalleryPanelContent's handleTitleChange — keep the underlying
  // group's own title column in sync with the section's editable heading.
  const handleHeadingChange = (title: string) => {
    updateSection(section.id, { label: title });
    updateGroup(groupId, title).catch(() => { /* non-fatal, matches gallery */ });
  };

  const startEdit = (p: ContractorProject) => {
    setEditingId(p.id);
    setEditTitle(p.title);
    setEditDesc(p.description ?? "");
    setEditCompleted(p.completed_date ?? "");
  };

  const saveEdit = async (id: string) => {
    if (!editTitle.trim()) return;
    await updateProject(id, {
      title: editTitle.trim(),
      description: editDesc || null,
      completed_date: normalizeMonth(editCompleted),
    });
    setEditingId(null);
  };

  const triggerPhotoUpload = (id: string) => {
    setUploadTargetId(id);
    fileRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const targetId = uploadTargetId;
    e.target.value = "";
    if (!file || !targetId) return;
    const project = projects.find(p => p.id === targetId);
    if (!project) return;
    try {
      const url = await uploadProjectPhoto(file);
      await updateProject(targetId, { photos: [...project.photos, url] });
    } catch (err: any) {
      toast({ title: "Upload failed", description: String(err?.message ?? err), variant: "destructive" });
    }
  };

  const removePhoto = async (p: ContractorProject, url: string) => {
    await updateProject(p.id, { photos: p.photos.filter(u => u !== url) });
  };

  return (
    <div>
      <FieldLabel>Section heading</FieldLabel>
      <PanelInput value={section.label} onChange={handleHeadingChange} placeholder="Project showcase" />
      <FieldLabel>Projects ({projects.length}/{MAX_PROJECTS_TOTAL} total)</FieldLabel>
      <div style={{ padding: "10px 12px", background: "#f9fafb", borderRadius: 6, fontSize: 11, color: "#6b7280", marginBottom: 12 }}>
        <i className="ti ti-info-circle" style={{ marginRight: 6 }} />
        This total counts every project across all your project showcase sections — it's separate from the {SECTION_DEFS.project.max} showcase sections you can add.
      </div>
      <input ref={fileRef} type="file" accept="image/*" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", opacity: 0, pointerEvents: "none" }} onChange={handleFileChange} />
      {groupProjects.map(p => (
        <div key={p.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
          {editingId === p.id ? (
            <div>
              <FieldLabel>Title</FieldLabel>
              <PanelInput value={editTitle} onChange={setEditTitle} placeholder="Project name" />
              <FieldLabel>Completed</FieldLabel>
              <PanelInput value={editCompleted} onChange={setEditCompleted} type="month" />
              <FieldLabel>Description</FieldLabel>
              <PanelTextarea value={editDesc} onChange={setEditDesc} placeholder="Brief overview…" rows={3} />
              <div style={{ display: "flex", gap: 8 }}>
                <PanelBtn onClick={() => saveEdit(p.id)}>Save</PanelBtn>
                <PanelBtn variant="ghost" onClick={() => setEditingId(null)}>Cancel</PanelBtn>
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: NAVY }}>{p.title}</div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button onClick={() => startEdit(p)} style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", padding: 0 }}>
                    <i className="ti ti-pencil" style={{ fontSize: 14 }} />
                  </button>
                  <button onClick={() => deleteProject(p.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: 0 }}>
                    <i className="ti ti-trash" style={{ fontSize: 14 }} />
                  </button>
                </div>
              </div>
              {p.description && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{p.description}</div>}
            </>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6, marginTop: 8 }}>
            {p.photos.map(url => (
              <div key={url} style={{ position: "relative", aspectRatio: "1", background: "#e5e7eb", borderRadius: 6, overflow: "hidden" }}>
                <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                <button
                  onClick={() => removePhoto(p, url)}
                  style={{ position: "absolute", top: 2, right: 2, background: "rgba(0,0,0,0.6)", border: "none", borderRadius: "50%", width: 18, height: 18, color: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                >
                  <i className="ti ti-x" style={{ fontSize: 10 }} />
                </button>
              </div>
            ))}
            <button
              onClick={() => triggerPhotoUpload(p.id)}
              disabled={uploading}
              style={{ aspectRatio: "1", background: "#f9fafb", border: "2px dashed #d1d5db", borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 18 }}
            >
              <i className={`ti ${uploading && uploadTargetId === p.id ? "ti-loader" : "ti-plus"}`} />
            </button>
          </div>
        </div>
      ))}
      {projects.length < MAX_PROJECTS_TOTAL && !adding && (
        <PanelBtn variant="ghost" onClick={() => setAdding(true)}>
          <i className="ti ti-plus" style={{ marginRight: 4 }} />Add project
        </PanelBtn>
      )}
      {adding && (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "12px" }}>
          <FieldLabel>Title</FieldLabel>
          <PanelInput value={newTitle} onChange={setNewTitle} placeholder="Project name" />
          <FieldLabel>Completed</FieldLabel>
          <PanelInput value={newCompleted} onChange={setNewCompleted} type="month" />
          <FieldLabel>Description</FieldLabel>
          <PanelTextarea value={newDesc} onChange={setNewDesc} placeholder="Brief overview…" rows={3} />
          <div style={{ display: "flex", gap: 8 }}>
            <PanelBtn onClick={handleAdd}>Add</PanelBtn>
            <PanelBtn variant="ghost" onClick={() => setAdding(false)}>Cancel</PanelBtn>
          </div>
        </div>
      )}
    </div>
  );
}

function ReviewsPanelContent({ section, updateSection, reviews }: {
  section: SectionInstance;
  updateSection: (id: string, p: Partial<SectionInstance>) => void;
  reviews: ReviewRow[];
}) {
  const pinned: string[] = (section.meta.pinnedReviewIds as string[] | undefined) ?? [];
  const togglePin = (id: string) => {
    const next = pinned.includes(id) ? pinned.filter(p => p !== id) : pinned.length < 3 ? [...pinned, id] : pinned;
    updateSection(section.id, { meta: { ...section.meta, pinnedReviewIds: next } });
  };

  return (
    <div>
      <FieldLabel>Section heading</FieldLabel>
      <PanelInput value={section.label} onChange={v => updateSection(section.id, { label: v })} placeholder="Reviews" />
      <FieldLabel>Pin up to 3 reviews</FieldLabel>
      {reviews.length === 0
        ? <div style={{ color: "#9ca3af", fontSize: 13 }}>No reviews yet</div>
        : reviews.map(r => (
          <div key={r.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 12px", marginBottom: 8, display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <Stars rating={r.rating} />
              {r.comment && <p style={{ fontSize: 12, color: "#4b5563", margin: "4px 0 0", fontStyle: "italic" }}>"{r.comment.slice(0, 80)}{r.comment.length > 80 ? "…" : ""}"</p>}
            </div>
            <button onClick={() => togglePin(r.id)} style={{ background: "none", border: "none", cursor: "pointer", color: pinned.includes(r.id) ? ORANGE : "#9ca3af", padding: 2, flexShrink: 0 }}>
              <i className="ti ti-pin" style={{ fontSize: 16 }} />
            </button>
          </div>
        ))
      }
      {pinned.length > 0 && <div style={{ fontSize: 11, color: "#6b7280" }}>{pinned.length} pinned</div>}
    </div>
  );
}

function TeamPanelContent({ section, updateSection, draft, updateDraft, members, addMember, deleteMember }: {
  section: SectionInstance;
  updateSection: (id: string, p: Partial<SectionInstance>) => void;
  draft: ProfileDraft;
  updateDraft: (p: Partial<ProfileDraft>) => void;
  members: TeamMemberRow[];
  addMember: (data: TeamMemberInsert) => Promise<void>;
  deleteMember: (id: string) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState("");

  const handleAdd = async () => {
    if (!name.trim()) return;
    await addMember({ full_name: name.trim(), role: role || null, email: null, phone: null, hourly_rate: null });
    setAdding(false); setName(""); setRole("");
  };

  return (
    <div>
      <FieldLabel>Section heading</FieldLabel>
      <PanelInput value={section.label} onChange={v => updateSection(section.id, { label: v })} placeholder="Our team" />
      <FieldLabel>Members</FieldLabel>
      {members.filter(m => m.status === "active").map(m => (
        <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{m.full_name}</div>
            {m.role && <div style={{ fontSize: 11, color: "#6b7280" }}>{m.role}</div>}
          </div>
          <button onClick={() => deleteMember(m.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444" }}>
            <i className="ti ti-trash" style={{ fontSize: 14 }} />
          </button>
        </div>
      ))}
      {!adding && (
        <PanelBtn variant="ghost" onClick={() => setAdding(true)}>
          <i className="ti ti-plus" style={{ marginRight: 4 }} />Add member
        </PanelBtn>
      )}
      {adding && (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "12px" }}>
          <FieldLabel>Name</FieldLabel>
          <PanelInput value={name} onChange={setName} placeholder="Full name" />
          <FieldLabel>Role</FieldLabel>
          <PanelInput value={role} onChange={setRole} placeholder="e.g. Apprentice" />
          <div style={{ display: "flex", gap: 8 }}>
            <PanelBtn onClick={handleAdd}>Add</PanelBtn>
            <PanelBtn variant="ghost" onClick={() => setAdding(false)}>Cancel</PanelBtn>
          </div>
        </div>
      )}
    </div>
  );
}

function CredentialsPanelContent({ section, updateSection, credentials, addCredential, deleteCredential }: {
  section: SectionInstance;
  updateSection: (id: string, p: Partial<SectionInstance>) => void;
  credentials: CredentialRow[];
  addCredential: (data: NewCredential) => Promise<void>;
  deleteCredential: (id: string) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [issuer, setIssuer] = useState("");
  const [ref, setRef] = useState("");

  const handleAdd = async () => {
    if (!name.trim()) return;
    await addCredential({ name: name.trim(), issuer: issuer || null, reference_number: ref || null, verified: false, display_order: credentials.length });
    setAdding(false); setName(""); setIssuer(""); setRef("");
  };

  return (
    <div>
      <FieldLabel>Section heading</FieldLabel>
      <PanelInput value={section.label} onChange={v => updateSection(section.id, { label: v })} placeholder="Credentials" />
      <FieldLabel>Credentials</FieldLabel>
      <p style={{ fontSize: 12, color: "#6b7280", margin: "-2px 0 10px", lineHeight: 1.4 }}>
        These appear on your public profile as listed by you. TradeStone does not check them.
      </p>
      {credentials.map(c => (
        <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</div>
            {c.issuer && <div style={{ fontSize: 11, color: "#6b7280" }}>{c.issuer}</div>}
          </div>
          {c.verified && <i className="ti ti-circle-check-filled" style={{ color: "#16a34a", fontSize: 16 }} />}
          <button onClick={() => deleteCredential(c.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444" }}>
            <i className="ti ti-trash" style={{ fontSize: 14 }} />
          </button>
        </div>
      ))}
      {!adding && (
        <PanelBtn variant="ghost" onClick={() => setAdding(true)}>
          <i className="ti ti-plus" style={{ marginRight: 4 }} />Add credential
        </PanelBtn>
      )}
      {adding && (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "12px" }}>
          <FieldLabel>Name</FieldLabel>
          <PanelInput value={name} onChange={setName} placeholder="e.g. Gas Safe" />
          <FieldLabel>Issuer</FieldLabel>
          <PanelInput value={issuer} onChange={setIssuer} placeholder="e.g. Gas Safe Register" />
          <FieldLabel>Reference number</FieldLabel>
          <PanelInput value={ref} onChange={setRef} placeholder="Optional" />
          <div style={{ display: "flex", gap: 8 }}>
            <PanelBtn onClick={handleAdd}>Add</PanelBtn>
            <PanelBtn variant="ghost" onClick={() => setAdding(false)}>Cancel</PanelBtn>
          </div>
        </div>
      )}
    </div>
  );
}

function AvailabilityPanelContent({ section, updateSection }: {
  section: SectionInstance;
  updateSection: (id: string, p: Partial<SectionInstance>) => void;
}) {
  return (
    <div>
      <FieldLabel>Section heading</FieldLabel>
      <PanelInput value={section.label} onChange={v => updateSection(section.id, { label: v })} placeholder="Availability" />
      <div style={{ padding: "12px", background: "#f9fafb", borderRadius: 6, fontSize: 12, color: "#6b7280" }}>
        <i className="ti ti-info-circle" style={{ marginRight: 6 }} />
        Availability schedule is managed from your Availability tab
      </div>
    </div>
  );
}

function VideoPanelContent({ section, updateSection, videos, addVideo, removeVideo }: {
  section: SectionInstance;
  updateSection: (id: string, p: Partial<SectionInstance>) => void;
  videos: ProfileVideo[];
  addVideo: (url: string, title?: string, description?: string) => Promise<ProfileVideo | undefined>;
  removeVideo: (id: string) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const { toast } = useToast();

  const handleAdd = async () => {
    if (!url.trim()) return;
    const { platform } = extractVideoId(url);
    if (platform === "other") {
      toast({ title: "Unrecognised video URL", description: "Paste a YouTube, TikTok, or Vimeo link.", variant: "destructive" });
      return;
    }
    await addVideo(url.trim(), title.trim() || undefined);
    setAdding(false); setUrl(""); setTitle("");
  };

  const intro = (section.meta.intro as string | undefined) ?? "";

  return (
    <div>
      <FieldLabel>Section heading</FieldLabel>
      <PanelInput value={section.label} onChange={v => updateSection(section.id, { label: v })} placeholder="Video showcase" />
      <FieldLabel>Intro (optional)</FieldLabel>
      <PanelTextarea
        value={intro}
        onChange={v => updateSection(section.id, { meta: { ...section.meta, intro: v } })}
        placeholder="A short line shown above the videos on your public profile"
        rows={2}
      />
      <FieldLabel>Videos</FieldLabel>
      {videos.map(v => (
        <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: 8 }}>
          <i className={`ti ${v.platform === "youtube" ? "ti-brand-youtube" : v.platform === "tiktok" ? "ti-brand-tiktok" : v.platform === "vimeo" ? "ti-brand-vimeo" : "ti-video"}`} style={{ fontSize: 18, color: ORANGE, flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.title || v.url}</div>
            <div style={{ fontSize: 11, color: "#6b7280", textTransform: "capitalize" }}>{v.platform}</div>
          </div>
          <button onClick={() => removeVideo(v.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444" }}>
            <i className="ti ti-trash" style={{ fontSize: 14 }} />
          </button>
        </div>
      ))}
      {!adding && (
        <PanelBtn variant="ghost" onClick={() => setAdding(true)}>
          <i className="ti ti-plus" style={{ marginRight: 4 }} />Add video
        </PanelBtn>
      )}
      {adding && (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "12px" }}>
          <FieldLabel>Video URL</FieldLabel>
          <PanelInput value={url} onChange={setUrl} placeholder="YouTube, TikTok or Vimeo link" />
          <FieldLabel>Title (optional)</FieldLabel>
          <PanelInput value={title} onChange={setTitle} placeholder="e.g. Kitchen renovation walkthrough" />
          <div style={{ display: "flex", gap: 8 }}>
            <PanelBtn onClick={handleAdd}>Add</PanelBtn>
            <PanelBtn variant="ghost" onClick={() => setAdding(false)}>Cancel</PanelBtn>
          </div>
        </div>
      )}
    </div>
  );
}

function BeforeAfterPanelContent({ section, updateSection, pairs, addPair, removePair, uploadBeforeAfterPhoto, uploading }: {
  section: SectionInstance;
  updateSection: (id: string, p: Partial<SectionInstance>) => void;
  pairs: BeforeAfterPair[];
  addPair: (beforeUrl: string, afterUrl: string, title?: string, description?: string) => Promise<BeforeAfterPair | undefined>;
  removePair: (id: string) => Promise<void>;
  uploadBeforeAfterPhoto: (file: File) => Promise<string>;
  uploading: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [beforeUrl, setBeforeUrl] = useState<string | null>(null);
  const [afterUrl, setAfterUrl] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const beforeRef = useRef<HTMLInputElement>(null);
  const afterRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleUpload = async (file: File, which: "before" | "after") => {
    try {
      const url = await uploadBeforeAfterPhoto(file);
      if (which === "before") setBeforeUrl(url); else setAfterUrl(url);
    } catch (err: any) {
      toast({ title: "Upload failed", description: String(err?.message ?? err), variant: "destructive" });
    }
  };

  const handleAdd = async () => {
    if (!beforeUrl || !afterUrl) return;
    await addPair(beforeUrl, afterUrl, title.trim() || undefined);
    setAdding(false); setBeforeUrl(null); setAfterUrl(null); setTitle("");
  };

  const intro = (section.meta.intro as string | undefined) ?? "";

  return (
    <div>
      <FieldLabel>Section heading</FieldLabel>
      <PanelInput value={section.label} onChange={v => updateSection(section.id, { label: v })} placeholder="Before & after" />
      <FieldLabel>Intro (optional)</FieldLabel>
      <PanelTextarea
        value={intro}
        onChange={v => updateSection(section.id, { meta: { ...section.meta, intro: v } })}
        placeholder="A short line shown above the pairs on your public profile"
        rows={2}
      />
      <FieldLabel>Pairs</FieldLabel>
      {pairs.map(p => (
        <div key={p.id} style={{ marginBottom: 10, border: "1px solid #e5e7eb", borderRadius: 8, padding: 10 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <img src={p.before_photo_url} alt="Before" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 4 }} />
            <img src={p.after_photo_url} alt="After" style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 4 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              {p.title && <div style={{ fontWeight: 600, fontSize: 13 }}>{p.title}</div>}
            </div>
            <button onClick={() => removePair(p.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", alignSelf: "flex-start" }}>
              <i className="ti ti-trash" style={{ fontSize: 14 }} />
            </button>
          </div>
        </div>
      ))}
      {!adding && (
        <PanelBtn variant="ghost" onClick={() => setAdding(true)}>
          <i className="ti ti-plus" style={{ marginRight: 4 }} />Add pair
        </PanelBtn>
      )}
      {adding && (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "12px" }}>
          <FieldLabel>Before photo</FieldLabel>
          <input ref={beforeRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f, "before"); e.target.value = ""; }} />
          <PanelBtn variant="ghost" onClick={() => beforeRef.current?.click()}>
            {beforeUrl ? "Change before photo" : uploading ? "Uploading…" : "Upload before photo"}
          </PanelBtn>
          {beforeUrl && <img src={beforeUrl} alt="" style={{ width: "100%", height: 80, objectFit: "cover", borderRadius: 6, marginTop: 8, marginBottom: 4 }} />}
          <div style={{ height: 10 }} />
          <FieldLabel>After photo</FieldLabel>
          <input ref={afterRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f, "after"); e.target.value = ""; }} />
          <PanelBtn variant="ghost" onClick={() => afterRef.current?.click()}>
            {afterUrl ? "Change after photo" : uploading ? "Uploading…" : "Upload after photo"}
          </PanelBtn>
          {afterUrl && <img src={afterUrl} alt="" style={{ width: "100%", height: 80, objectFit: "cover", borderRadius: 6, marginTop: 8, marginBottom: 4 }} />}
          <div style={{ height: 10 }} />
          <FieldLabel>Title (optional)</FieldLabel>
          <PanelInput value={title} onChange={setTitle} placeholder="e.g. Bathroom re-tile" />
          {beforeUrl && afterUrl && (
            <div style={{ marginBottom: 14 }}>
              <FieldLabel>Preview</FieldLabel>
              <BeforeAfterSlider beforeUrl={beforeUrl} afterUrl={afterUrl} height={140} />
            </div>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <PanelBtn onClick={handleAdd}>Add</PanelBtn>
            <PanelBtn variant="ghost" onClick={() => setAdding(false)}>Cancel</PanelBtn>
          </div>
        </div>
      )}
    </div>
  );
}

function ServiceAreaPanelContent({ draft, updateDraft, section, updateSection }: {
  draft: ProfileDraft;
  updateDraft: (p: Partial<ProfileDraft>) => void;
  section: SectionInstance;
  updateSection: (id: string, p: Partial<SectionInstance>) => void;
}) {
  const areasCovered = (section.meta.areasCovered as string | undefined) ?? "";

  return (
    <div>
      <FieldLabel>Section heading</FieldLabel>
      <PanelInput value={section.label} onChange={v => updateSection(section.id, { label: v })} placeholder="Service area" />
      <LiveOnSaveNote />
      <FieldLabel>Location</FieldLabel>
      <PanelInput value={draft.locationDisplay} onChange={v => updateDraft({ locationDisplay: v })} placeholder="e.g. London" />
      <FieldLabel>Radius (miles)</FieldLabel>
      <PanelInput
        type="number"
        value={draft.serviceAreaRadiusMiles != null ? String(draft.serviceAreaRadiusMiles) : ""}
        onChange={v => updateDraft({ serviceAreaRadiusMiles: v ? Number(v) : null })}
        placeholder="e.g. 30"
      />
      <FieldLabel>Areas / postcodes covered (optional)</FieldLabel>
      <PanelTextarea
        value={areasCovered}
        onChange={v => updateSection(section.id, { meta: { ...section.meta, areasCovered: v } })}
        placeholder="e.g. IP28, IP29, Bury St Edmunds, Newmarket"
        rows={3}
      />
      <div style={{ padding: "12px", background: "#f9fafb", borderRadius: 6, fontSize: 12, color: "#6b7280" }}>
        <i className="ti ti-info-circle" style={{ marginRight: 6 }} />
        Your service area is shown as text on your profile. A map view will be added in a future update.
      </div>
    </div>
  );
}

function SocialPanelContent({ draft, updateDraft }: {
  draft: ProfileDraft;
  updateDraft: (p: Partial<ProfileDraft>) => void;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleChange = (key: string, value: string) => {
    const trimmed = value.trim();
    if (trimmed && !trimmed.startsWith("https://") && !trimmed.startsWith("http://")) {
      setErrors(prev => ({ ...prev, [key]: "Must start with https://" }));
    } else {
      setErrors(prev => { const next = { ...prev }; delete next[key]; return next; });
    }
    updateDraft({ socialLinks: { ...draft.socialLinks, [key]: value } });
  };

  return (
    <div>
      <LiveOnSaveNote />
      {SOCIAL_PLATFORMS.map(p => (
        <div key={p.key}>
          <FieldLabel>{p.label}</FieldLabel>
          <PanelInput
            value={draft.socialLinks[p.key] ?? ""}
            onChange={v => handleChange(p.key, v)}
            placeholder="https://…"
          />
          {errors[p.key] && <div style={{ fontSize: 11, color: "#ef4444", marginTop: -10, marginBottom: 14 }}>{errors[p.key]}</div>}
        </div>
      ))}
      <div style={{ padding: "12px", background: "#f9fafb", borderRadius: 6, fontSize: 12, color: "#6b7280" }}>
        <i className="ti ti-info-circle" style={{ marginRight: 6 }} />
        Only platforms with a link set will show as icons on your profile.
      </div>
    </div>
  );
}

function CtaPanelContent({ draft, updateDraft }: { draft: ProfileDraft; updateDraft: (p: Partial<ProfileDraft>) => void }) {
  return (
    <div>
      <LiveOnSaveNote />
      <FieldLabel>Button label</FieldLabel>
      <PanelInput value={draft.ctaLabel} onChange={v => updateDraft({ ctaLabel: v })} placeholder="Get in touch" />
    </div>
  );
}

// ── Edit panel container ──────────────────────────────────────────────────────

interface EditPanelProps {
  section: SectionInstance | null;
  onClose: () => void;
  draft: ProfileDraft;
  updateDraft: (p: Partial<ProfileDraft>) => void;
  updateSection: (id: string, p: Partial<SectionInstance>) => void;
  onDeleteSection: (id: string) => void;
  saving: boolean;
  onSave: () => void;
  reviews: ReviewRow[];
  projects: ContractorProject[];
  addProject: (data: ProjectData) => Promise<void>;
  updateProject: (id: string, data: Partial<ProjectData>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  uploadProjectPhoto: (file: File) => Promise<string>;
  projectPhotoUploading: boolean;
  updateProjectGroup: (id: string, title: string) => Promise<void>;
  members: TeamMemberRow[];
  addMember: (data: TeamMemberInsert) => Promise<void>;
  deleteMember: (id: string) => Promise<void>;
  credentials: CredentialRow[];
  addCredential: (data: NewCredential) => Promise<void>;
  deleteCredential: (id: string) => Promise<void>;
  galleries: { id: string; title: string }[];
  updateGallery: (id: string, title: string) => Promise<void>;
  videos: ProfileVideo[];
  addVideo: (url: string, title?: string, description?: string) => Promise<ProfileVideo | undefined>;
  removeVideo: (id: string) => Promise<void>;
  beforeAfterPairs: BeforeAfterPair[];
  addBeforeAfterPair: (beforeUrl: string, afterUrl: string, title?: string, description?: string) => Promise<BeforeAfterPair | undefined>;
  removeBeforeAfterPair: (id: string) => Promise<void>;
  uploadBeforeAfterPhoto: (file: File) => Promise<string>;
  beforeAfterUploading: boolean;
}

function EditPanel(props: EditPanelProps & { isMobile: boolean }) {
  const {
    isMobile, section, onClose, draft, updateDraft, updateSection, onDeleteSection, saving, onSave,
    reviews, projects, addProject, updateProject, deleteProject, uploadProjectPhoto, projectPhotoUploading, updateProjectGroup, members, addMember, deleteMember,
    credentials, addCredential, deleteCredential, galleries, updateGallery,
    videos, addVideo, removeVideo, beforeAfterPairs, addBeforeAfterPair, removeBeforeAfterPair,
    uploadBeforeAfterPhoto, beforeAfterUploading,
  } = props;
  const def = section ? (SECTION_DEFS[section.type] ?? SECTION_DEFS.bio) : null;

  const content = (
    <>
      {/* Header */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 8, flexShrink: 0, background: "#fafafa" }}>
        {def && <i className={`ti ${def.icon}`} style={{ color: ORANGE, fontSize: 16 }} />}
        <span style={{ fontWeight: 700, fontSize: 14, color: NAVY, flex: 1 }}>{def?.label ?? ""}</span>
        {/* On mobile the Sheet already supplies its own close control */}
        {!isMobile && (
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", padding: 2 }}>
            <i className="ti ti-x" style={{ fontSize: 16 }} />
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
        {section && section.type !== "hero" && section.type !== "cta" && (
          <div style={{ paddingBottom: 12, marginBottom: 14, borderBottom: "1px solid #e5e7eb" }}>
            <PanelToggle
              checked={section.is_enabled}
              onChange={v => updateSection(section.id, { is_enabled: v })}
              label="Show on profile"
            />
            {!section.is_enabled && (
              <div style={{ display: "flex", gap: 8, fontSize: 12, color: "#6b7280", lineHeight: 1.4, marginTop: -4 }}>
                <i className="ti ti-eye-off" style={{ fontSize: 14, marginTop: 1, flexShrink: 0 }} />
                <span>Hidden. It stays in your editor, and comes off your public profile when you publish.</span>
              </div>
            )}
          </div>
        )}
        {section?.type === "hero" && <HeroPanel draft={draft} updateDraft={updateDraft} />}
        {section?.type === "bio" && <BioPanel draft={draft} updateDraft={updateDraft} section={section} updateSection={updateSection} />}
        {section?.type === "stats" && <StatsPanel section={section} updateSection={updateSection} />}
        {section?.type === "services" && <ServicesPanelContent draft={draft} updateDraft={updateDraft} section={section} updateSection={updateSection} />}
        {section?.type === "gallery" && (
          <GalleryPanelContent section={section} updateSection={updateSection} galleries={galleries} updateGallery={updateGallery} />
        )}
        {section?.type === "project" && (
          <ProjectPanelContent
            section={section} updateSection={updateSection} projects={projects}
            addProject={addProject} updateProject={updateProject} deleteProject={deleteProject}
            uploadProjectPhoto={uploadProjectPhoto} uploading={projectPhotoUploading}
            updateGroup={updateProjectGroup}
          />
        )}
        {section?.type === "reviews" && <ReviewsPanelContent section={section} updateSection={updateSection} reviews={reviews} />}
        {section?.type === "team" && (
          <TeamPanelContent section={section} updateSection={updateSection} draft={draft} updateDraft={updateDraft} members={members} addMember={addMember} deleteMember={deleteMember} />
        )}
        {section?.type === "credentials" && (
          <CredentialsPanelContent section={section} updateSection={updateSection} credentials={credentials} addCredential={addCredential} deleteCredential={deleteCredential} />
        )}
        {section?.type === "availability" && <AvailabilityPanelContent section={section} updateSection={updateSection} />}
        {section?.type === "video" && (
          <VideoPanelContent section={section} updateSection={updateSection} videos={videos} addVideo={addVideo} removeVideo={removeVideo} />
        )}
        {section?.type === "before_after" && (
          <BeforeAfterPanelContent
            section={section} updateSection={updateSection} pairs={beforeAfterPairs}
            addPair={addBeforeAfterPair} removePair={removeBeforeAfterPair}
            uploadBeforeAfterPhoto={uploadBeforeAfterPhoto} uploading={beforeAfterUploading}
          />
        )}
        {section?.type === "service_area" && (
          <ServiceAreaPanelContent draft={draft} updateDraft={updateDraft} section={section} updateSection={updateSection} />
        )}
        {section?.type === "social" && <SocialPanelContent draft={draft} updateDraft={updateDraft} />}
        {section?.type === "cta" && <CtaPanelContent draft={draft} updateDraft={updateDraft} />}
      </div>

      {/* Footer */}
      <div style={{ padding: "12px 16px", borderTop: "1px solid #e5e7eb", display: "flex", gap: 8, flexShrink: 0 }}>
        <button
          onClick={onSave}
          disabled={saving}
          style={{ flex: 1, background: NAVY, color: "white", fontWeight: 700, fontSize: 13, padding: "9px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: "inherit" }}
        >
          {saving ? "Saving…" : "Save section"}
        </button>
        {section && def?.deletable && (
          <button
            onClick={() => onDeleteSection(section.id)}
            title="Delete section"
            aria-label="Delete section"
            style={{ width: 36, height: 36, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "white", color: "#6b7280", border: "1px solid #e5e7eb", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", transition: "color 0.15s, border-color 0.15s, background 0.15s" }}
            onMouseEnter={e => { e.currentTarget.style.color = "#ef4444"; e.currentTarget.style.borderColor = "#ef4444"; e.currentTarget.style.background = "#fef2f2"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "#6b7280"; e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.background = "white"; }}
          >
            <i className="ti ti-trash" style={{ fontSize: 15 }} />
          </button>
        )}
      </div>
    </>
  );

  if (isMobile) {
    return (
      <Sheet open={!!section} onOpenChange={open => { if (!open) onClose(); }}>
        <SheetContent side="bottom" className="p-0 gap-0 flex flex-col h-[85vh] max-h-[85vh]">
          {content}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <div style={{
      position: "absolute", top: 0, right: 0, bottom: 0, width: 280,
      background: "white", borderLeft: "1px solid #e5e7eb",
      transform: section ? "translateX(0)" : "translateX(100%)",
      transition: "transform 0.2s ease",
      display: "flex", flexDirection: "column",
      zIndex: 20,
      boxShadow: section ? "-4px 0 12px rgba(0,0,0,0.06)" : "none",
    }}>
      {content}
    </div>
  );
}

// ── Left sidebar ──────────────────────────────────────────────────────────────

interface LeftSidebarProps {
  draft: ProfileDraft;
  updateDraft: (p: Partial<ProfileDraft>) => void;
  activeId: string | null;
  onSelectSection: (id: string) => void;
  onAddGallery: () => void;
  onAddProject: () => void;
  profile: SupplementaryProfile | null;
  isMobile: boolean;
}

function LeftSidebar({ draft, updateDraft, activeId, onSelectSection, onAddGallery, onAddProject, profile, isMobile }: LeftSidebarProps) {
  const [tab, setTab] = useState<"sections" | "page">("sections");
  const [slugError, setSlugError] = useState("");

  const orderedSections = [...draft.sections].sort((a, b) => a.display_order - b.display_order);
  // Render-only: a widget_key with no SECTION_DEFS entry (legacy pre-CanvasEditor
  // rows, e.g. "trades"/"photos") must still round-trip through draft.sections
  // untouched — filtering here only affects what's drawn in this list, never
  // what saveToDb persists.
  const renderableSections = orderedSections.filter(s => !!SECTION_DEFS[s.type]);
  const gallerySections = draft.sections.filter(s => s.type === "gallery");
  const projectSections = draft.sections.filter(s => s.type === "project");
  const galleryMax = SECTION_DEFS.gallery.max!;
  const projectMax = SECTION_DEFS.project.max!;
  // Counts renderableSections, not draft.sections: an unknown-type legacy
  // row never renders, so it isn't part of the "page becoming a wall"
  // problem this cap exists to prevent.
  const atTotalSectionsCap = renderableSections.length >= MAX_SECTIONS_TOTAL;

  const validateSlug = (v: string) => {
    if (!v) { setSlugError(""); return; }
    if (!/^[a-z0-9-]{3,}$/.test(v)) {
      setSlugError("Lowercase letters, numbers and hyphens only (min 3 chars)");
    } else {
      setSlugError("");
    }
    updateDraft({ vanitySlug: v });
  };

  return (
    <div style={{ width: isMobile ? "100%" : 220, background: "white", borderRight: isMobile ? "none" : "1px solid #e5e7eb", display: "flex", flexDirection: "column", flexShrink: 0 }}>
      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #e5e7eb" }}>
        {(["sections", "page"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{ flex: 1, padding: "10px 0", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", border: "none", borderBottom: tab === t ? `2px solid ${ORANGE}` : "2px solid transparent", background: "none", cursor: "pointer", color: tab === t ? NAVY : "#9ca3af", fontFamily: "inherit", marginBottom: -1 }}
          >
            {t === "sections" ? "Sections" : "Page"}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px" }}>
        {tab === "sections" && (
          <>
            {/* Add section chips */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Add section</div>
              <button
                onClick={onAddGallery}
                disabled={gallerySections.length >= galleryMax || atTotalSectionsCap}
                style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "7px 10px", background: (gallerySections.length >= galleryMax || atTotalSectionsCap) ? "#f9fafb" : "#fff7ed", border: `1px solid ${(gallerySections.length >= galleryMax || atTotalSectionsCap) ? "#e5e7eb" : "#fed7aa"}`, borderRadius: 20, fontSize: 12, fontWeight: 600, color: (gallerySections.length >= galleryMax || atTotalSectionsCap) ? "#9ca3af" : ORANGE, cursor: (gallerySections.length >= galleryMax || atTotalSectionsCap) ? "not-allowed" : "pointer", marginBottom: 6, fontFamily: "inherit" }}
              >
                <i className="ti ti-photo" style={{ fontSize: 14 }} />
                Photo gallery
                <span style={{ marginLeft: "auto", color: "#9ca3af", fontSize: 11 }}>{gallerySections.length}/{galleryMax}</span>
              </button>
              <button
                onClick={onAddProject}
                disabled={projectSections.length >= projectMax || atTotalSectionsCap}
                style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "7px 10px", background: (projectSections.length >= projectMax || atTotalSectionsCap) ? "#f9fafb" : "#fff7ed", border: `1px solid ${(projectSections.length >= projectMax || atTotalSectionsCap) ? "#e5e7eb" : "#fed7aa"}`, borderRadius: 20, fontSize: 12, fontWeight: 600, color: (projectSections.length >= projectMax || atTotalSectionsCap) ? "#9ca3af" : ORANGE, cursor: (projectSections.length >= projectMax || atTotalSectionsCap) ? "not-allowed" : "pointer", fontFamily: "inherit" }}
              >
                <i className="ti ti-briefcase" style={{ fontSize: 14 }} />
                Project showcase
                <span style={{ marginLeft: "auto", color: "#9ca3af", fontSize: 11 }}>{projectSections.length}/{projectMax}</span>
              </button>
              {atTotalSectionsCap && (
                <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 6 }}>
                  You've reached the {MAX_SECTIONS_TOTAL}-section limit for a profile page.
                </div>
              )}
            </div>

            {/* On canvas list */}
            <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>On canvas</div>
            {renderableSections.map(s => {
              const def = SECTION_DEFS[s.type];
              const isActive = s.id === activeId;
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    onSelectSection(s.id);
                    // On mobile the canvas may not be the visible pane (segmented
                    // control), so scrolling it into view is pointless/confusing.
                    if (!isMobile) {
                      document.getElementById(`canvas-block-${s.id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                    }
                  }}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 10px", background: isActive ? "#fff7ed" : "transparent", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 13, color: isActive ? ORANGE : "#374151", textAlign: "left", fontFamily: "inherit", opacity: s.is_enabled ? 1 : 0.5, marginBottom: 2 }}
                >
                  <i className={`ti ${def.icon}`} style={{ fontSize: 14, flexShrink: 0 }} />
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}</span>
                  {!s.is_enabled && <i className="ti ti-eye-off" style={{ fontSize: 11, color: "#9ca3af" }} />}
                </button>
              );
            })}
          </>
        )}

        {tab === "page" && (
          <>
            <FieldLabel>Vanity URL slug</FieldLabel>
            <PanelInput value={draft.vanitySlug} onChange={validateSlug} placeholder="your-name" />
            {slugError && <div style={{ fontSize: 11, color: "#ef4444", marginTop: -10, marginBottom: 12 }}>{slugError}</div>}
            {draft.vanitySlug && !slugError && (
              <div style={{ fontSize: 11, color: "#6b7280", marginTop: -10, marginBottom: 12 }}>tradesltd.co.uk/hire/{draft.vanitySlug}</div>
            )}
            <FieldLabel>SEO title</FieldLabel>
            <PanelInput value={draft.seoTitle} onChange={v => updateDraft({ seoTitle: v })} placeholder={draft.displayName || "Page title"} />
            <FieldLabel>SEO description</FieldLabel>
            <PanelTextarea value={draft.seoDescription} onChange={v => updateDraft({ seoDescription: v })} placeholder="Brief description for search engines" rows={3} />
            <PanelToggle checked={draft.visibilityPublic} onChange={v => updateDraft({ visibilityPublic: v })} label="Public profile" />
          </>
        )}
      </div>
    </div>
  );
}

// ── Top bar ───────────────────────────────────────────────────────────────────

function TopBar({ draft, isDirty, inSync, saving, publishing, onSave, onPublish, profile }: {
  draft: ProfileDraft;
  isDirty: boolean;
  inSync: boolean;
  saving: boolean;
  publishing: boolean;
  onSave: () => Promise<boolean>;
  onPublish: () => Promise<boolean>;
  profile: SupplementaryProfile | null;
}) {
  const [savedFlash, setSavedFlash] = useState(false);

  const handleSave = async () => {
    const ok = await onSave();
    if (!ok) return;
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  };

  // Published only when nothing is unsaved AND the draft's enabled sections
  // match what visitors see — so an unpublished visibility change reads Draft.
  const pillGreen = draft.isPublished && !isDirty && inSync;
  const pillLabel = pillGreen ? "Published" : "Draft";
  const pillBg = pillGreen ? "#16a34a" : ORANGE;

  return (
    <div style={{ height: 48, background: NAVY, display: "flex", alignItems: "center", padding: "0 16px", gap: 8, flexShrink: 0, zIndex: 30, overflow: "hidden" }}>
      <span className="hidden md:inline" style={{ fontWeight: 900, fontSize: 16, letterSpacing: "0.02em", fontFamily: "Barlow Condensed, sans-serif", textTransform: "uppercase", color: ORANGE, flexShrink: 0 }}>TradeStone</span>
      <span className="hidden md:inline" style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>
        {draft.displayName || "Profile"}
      </span>
      <span style={{ background: pillBg, color: "white", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 10, flexShrink: 0 }}>{pillLabel}</span>

      <div style={{ flex: 1 }} />

      {profile?.ts_profile_code && (
        <a
          href={`/contractor/${profile.ts_profile_code}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Preview"
          style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.65)", fontSize: 12, textDecoration: "none", padding: "5px 10px", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6, flexShrink: 0 }}
        >
          <i className="ti ti-external-link" style={{ fontSize: 13 }} /><span className="hidden md:inline">Preview</span>
        </a>
      )}

      <button
        onClick={handleSave}
        disabled={saving || !isDirty}
        style={{ flexShrink: 0, background: isDirty ? "rgba(255,255,255,0.12)" : "transparent", border: "1px solid rgba(255,255,255,0.2)", color: isDirty ? "white" : "rgba(255,255,255,0.35)", fontWeight: 600, fontSize: 13, padding: "6px 14px", borderRadius: 6, cursor: isDirty ? "pointer" : "default", fontFamily: "inherit" }}
      >
        {saving ? "Saving…" : savedFlash ? "Saved" : "Save"}
      </button>

      <button
        onClick={onPublish}
        disabled={publishing}
        style={{ background: ORANGE, color: "white", fontWeight: 700, fontSize: 13, padding: "6px 14px", borderRadius: 6, border: "none", cursor: "pointer", fontFamily: "inherit" }}
      >
        {publishing ? "Publishing…" : "Publish"}
      </button>
    </div>
  );
}

// ── Main CanvasEditor component ───────────────────────────────────────────────

export function CanvasEditor() {
  const {
    draft, isDirty, loading, saving, publishing,
    updateDraft, reorderSections, toggleSection, addSection, removeSection,
    saveDraft, publish, isPublishedInSync,
  } = useProfileEditor();

  const gallerySections = draft.sections.filter(s => s.type === "gallery");
  const projectSections = draft.sections.filter(s => s.type === "project");

  const { galleries, addGallery, updateGallery, deleteGallery } = usePhotoGalleries();
  const { projects, addProject, updateProject, deleteProject, uploadProjectPhoto, uploading: projectPhotoUploading } = useContractorProjects();
  const { addGroup: addProjectGroup, updateGroup: updateProjectGroup, deleteGroup: deleteProjectGroup } = useProjectGroups();
  const { members, addMember, deleteMember } = useContractorTeam();
  const { credentials, addCredential, deleteCredential } = useContractorCredentials();
  const { videos, addVideo, removeVideo } = useProfileVideos();
  const { pairs: beforeAfterPairs, addPair: addBeforeAfterPair, removePair: removeBeforeAfterPair, uploadBeforeAfterPhoto, uploading: beforeAfterUploading } = useBeforeAfter();

  const isMobile = useIsMobile();
  const [mobilePane, setMobilePane] = useState<"sections" | "preview">("sections");
  const [profile, setProfile] = useState<SupplementaryProfile | null>(null);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [galleryPhotoMap, setGalleryPhotoMap] = useState<Map<string, ContractorPhoto[]>>(new Map());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [addingGallery, setAddingGallery] = useState(false);
  const [addingProject, setAddingProject] = useState(false);

  // Load supplementary profile data
  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("id, ts_profile_code, avatar_url, logo_url, is_verified, trades, completed_jobs, rating, years_experience, review_count, working_radius, hourly_rate")
        .eq("user_id", user.id)
        .single();
      if (data) setProfile(data as unknown as SupplementaryProfile);
    };
    load();
  }, []);

  // Load reviews when profile is known
  useEffect(() => {
    if (!profile?.id) return;
    supabase
      .from("job_reviews")
      .select("id, rating, comment, created_at")
      .eq("contractor_id", profile.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setReviews((data ?? []) as ReviewRow[]));
  }, [profile?.id]);

  // Load all gallery photos whenever the gallery list changes
  useEffect(() => {
    if (galleries.length === 0) return;
    const load = async () => {
      const map = new Map<string, ContractorPhoto[]>();
      await Promise.all(
        galleries.map(async g => {
          const { data } = await supabase
            .from("contractor_photos")
            .select("*")
            .eq("gallery_id", g.id)
            .order("display_order", { ascending: true });
          map.set(g.id, (data ?? []) as ContractorPhoto[]);
        })
      );
      setGalleryPhotoMap(new Map(map));
    };
    load();
  }, [galleries]);

  const orderedSections = [...draft.sections].sort((a, b) => a.display_order - b.display_order);
  // Render-only view of orderedSections, excluding any widget_key with no
  // SECTION_DEFS entry. orderedSections itself (and draft.sections) stay
  // untouched — handleMoveUp/handleMoveDown below index into the full,
  // unfiltered orderedSections since they reorder real underlying rows.
  const renderableSections = orderedSections.filter(s => !!SECTION_DEFS[s.type]);

  const updateSection = useCallback((id: string, partial: Partial<SectionInstance>) => {
    updateDraft({
      sections: draft.sections.map(s => s.id === id ? { ...s, ...partial } : s),
    });
  }, [draft.sections, updateDraft]);

  const handleMoveUp = useCallback((sectionId: string) => {
    const idx = orderedSections.findIndex(s => s.id === sectionId);
    if (idx <= 0) return;
    // Never move above a fixed section
    const target = orderedSections[idx - 1];
    if (SECTION_DEFS[target.type]?.fixed) return;
    reorderSections(idx, idx - 1);
  }, [orderedSections, reorderSections]);

  const handleMoveDown = useCallback((sectionId: string) => {
    const idx = orderedSections.findIndex(s => s.id === sectionId);
    if (idx >= orderedSections.length - 1) return;
    const target = orderedSections[idx + 1];
    if (SECTION_DEFS[target.type]?.fixed) return;
    reorderSections(idx, idx + 1);
  }, [orderedSections, reorderSections]);

  const handleDeleteSection = useCallback(async (id: string) => {
    const section = draft.sections.find(s => s.id === id);
    if (!section) return;
    const confirmed = window.confirm(
      `Delete "${section.label}"? This removes the section from your profile${section.type === "gallery" ? " and deletes its photos" : ""}. This can't be undone.`
    );
    if (!confirmed) return;
    if (section.type === "gallery" && section.sectionRefId) {
      try { await deleteGallery(section.sectionRefId); } catch (_) { /* non-fatal */ }
    }
    // Mirrors the gallery cleanup above exactly — without this, every
    // project section removed leaves its contractor_project_groups row
    // behind (an orphan), same as the ones already found in the database.
    if (section.type === "project" && section.sectionRefId) {
      try { await deleteProjectGroup(section.sectionRefId); } catch (_) { /* non-fatal */ }
    }
    removeSection(id);
    if (activeId === id) setActiveId(null);
  }, [draft.sections, removeSection, deleteGallery, deleteProjectGroup, activeId]);

  const focusSection = (sectionId: string) => {
    setActiveId(sectionId);
    // On mobile the canvas may not be the visible pane (segmented control),
    // so scrolling it into view is pointless/confusing.
    if (isMobile) return;
    requestAnimationFrame(() => {
      document.getElementById(`canvas-block-${sectionId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const handleAddGallery = useCallback(async () => {
    if (addingGallery || gallerySections.length >= (SECTION_DEFS.gallery.max!) || renderableSections.length >= MAX_SECTIONS_TOTAL) return;
    setAddingGallery(true);
    try {
      const galleryId = await addGallery("New gallery");
      if (galleryId) {
        const newSectionId = addSection("gallery", galleryId, "New gallery");
        focusSection(newSectionId);
      }
    } catch (err) {
      console.error("Failed to add gallery:", err);
    } finally {
      setAddingGallery(false);
    }
  }, [addGallery, addSection, addingGallery, gallerySections.length, renderableSections.length]);

  const handleAddProject = useCallback(async () => {
    if (addingProject || projectSections.length >= (SECTION_DEFS.project.max!) || renderableSections.length >= MAX_SECTIONS_TOTAL) return;
    setAddingProject(true);
    try {
      // Mirrors handleAddGallery exactly (A2): create the durable group row
      // first, then a section pointing at it — never an unlinked section.
      const groupId = await addProjectGroup("Project showcase");
      if (groupId) {
        const newSectionId = addSection("project", groupId, "Project showcase");
        focusSection(newSectionId);
      }
    } catch (err) {
      console.error("Failed to add project group:", err);
    } finally {
      setAddingProject(false);
    }
  }, [addProjectGroup, addSection, addingProject, projectSections.length, renderableSections.length]);

  if (loading) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 14 }}>
        <i className="ti ti-loader" style={{ marginRight: 8 }} />Loading editor…
      </div>
    );
  }

  // Guards EditPanel the same way: an unknown-type section is never
  // selectable through the UI now (filtered out of both lists above), but
  // this keeps the panel from ever opening for one regardless.
  const activeSection = draft.sections.find(s => s.id === activeId && !!SECTION_DEFS[s.type]) ?? null;
  const galleryListForPanel = galleries.map(g => ({ id: g.id, title: g.title }));

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", fontFamily: "Lexend, sans-serif" }}>
      <TopBar
        draft={draft}
        isDirty={isDirty}
        inSync={isPublishedInSync}
        saving={saving}
        publishing={publishing}
        onSave={saveDraft}
        onPublish={publish}
        profile={profile}
      />

      {/* Mobile pane switcher — sections editor or live preview, one at a time */}
      {isMobile && (
        <div style={{ display: "flex", borderBottom: "1px solid #e5e7eb", flexShrink: 0 }}>
          {(["sections", "preview"] as const).map(p => (
            <button
              key={p}
              onClick={() => setMobilePane(p)}
              style={{ flex: 1, padding: "10px 0", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", border: "none", borderBottom: mobilePane === p ? `2px solid ${ORANGE}` : "2px solid transparent", background: "none", cursor: "pointer", color: mobilePane === p ? NAVY : "#9ca3af", fontFamily: "inherit" }}
            >
              {p === "sections" ? "Edit" : "Preview"}
            </button>
          ))}
        </div>
      )}

      {/* Body: sidebar + canvas + edit panel */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
        {(!isMobile || mobilePane === "sections") && (
          <LeftSidebar
            draft={draft}
            updateDraft={updateDraft}
            activeId={activeId}
            onSelectSection={setActiveId}
            onAddGallery={handleAddGallery}
            onAddProject={handleAddProject}
            profile={profile}
            isMobile={isMobile}
          />
        )}

        {/* Canvas */}
        {(!isMobile || mobilePane === "preview") && (
        <div
          style={{ flex: 1, background: CANVAS_BG, overflowY: "auto", padding: "40px 0" }}
          onClick={e => { if (e.target === e.currentTarget) setActiveId(null); }}
        >
          <div style={{ maxWidth: 600, margin: "0 auto", padding: "0 16px" }}>
            {/* Render-only: a widget_key with no SECTION_DEFS entry (legacy
                pre-CanvasEditor rows) must never be drawn — CanvasBlock has no
                content case for it and would show an empty, undeletable block.
                orderedSections (used by handleMoveUp/handleMoveDown for the
                real underlying order) is left untouched; this filtered copy
                only controls what's drawn below. */}
            {renderableSections.map((section) => {
              // Count only reorderable, renderable sections for up/down limits
              const reorderable = renderableSections.filter(s => !SECTION_DEFS[s.type]?.fixed);
              const reorderIdx = reorderable.findIndex(s => s.id === section.id);

              return (
                <div key={section.id} style={{ marginTop: SECTION_DEFS[section.type]?.fixed ? 0 : 36 }}>
                  <CanvasBlock
                    section={section}
                    index={reorderIdx}
                    total={reorderable.length}
                    draft={draft}
                    profile={profile}
                    reviews={reviews}
                    galleryPhotoMap={galleryPhotoMap}
                    projects={projects}
                    members={members}
                    credentials={credentials}
                    videos={videos}
                    beforeAfterPairs={beforeAfterPairs}
                    isSelected={section.id === activeId}
                    onSelect={() => setActiveId(section.id)}
                    onMoveUp={() => handleMoveUp(section.id)}
                    onMoveDown={() => handleMoveDown(section.id)}
                    onToggle={() => toggleSection(section.id)}
                    onDelete={() => handleDeleteSection(section.id)}
                  />
                </div>
              );
            })}
          </div>
        </div>
        )}

        {/* Edit panel — slide-in right on desktop, bottom sheet on mobile */}
        <EditPanel
          isMobile={isMobile}
          section={activeSection}
          onClose={() => setActiveId(null)}
          draft={draft}
          updateDraft={updateDraft}
          updateSection={updateSection}
          onDeleteSection={handleDeleteSection}
          saving={saving}
          onSave={saveDraft}
          reviews={reviews}
          projects={projects}
          addProject={addProject}
          updateProject={updateProject}
          deleteProject={deleteProject}
          uploadProjectPhoto={uploadProjectPhoto}
          projectPhotoUploading={projectPhotoUploading}
          updateProjectGroup={updateProjectGroup}
          members={members}
          addMember={addMember}
          deleteMember={deleteMember}
          credentials={credentials}
          addCredential={addCredential}
          deleteCredential={deleteCredential}
          galleries={galleryListForPanel}
          updateGallery={updateGallery}
          videos={videos}
          addVideo={addVideo}
          removeVideo={removeVideo}
          beforeAfterPairs={beforeAfterPairs}
          addBeforeAfterPair={addBeforeAfterPair}
          removeBeforeAfterPair={removeBeforeAfterPair}
          uploadBeforeAfterPhoto={uploadBeforeAfterPhoto}
          beforeAfterUploading={beforeAfterUploading}
        />
      </div>
    </div>
  );
}
