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
import { useContractorTeam, type TeamMemberInsert } from "@/hooks/useContractorTeam";
import { useContractorCredentials, type NewCredential } from "@/hooks/useContractorCredentials";
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
  gallery:      { icon: "ti-photo",       label: "Photo gallery",    hideable: true,  deletable: true,  reorderable: true,  repeatable: true, max: 3 },
  project:      { icon: "ti-briefcase",   label: "Project showcase", hideable: true,  deletable: true,  reorderable: true,  repeatable: true, max: 3 },
  reviews:      { icon: "ti-star",        label: "Reviews",          hideable: true,  deletable: false, reorderable: true  },
  team:         { icon: "ti-users",       label: "Team",             hideable: true,  deletable: false, reorderable: true  },
  credentials:  { icon: "ti-certificate", label: "Credentials",      hideable: true,  deletable: false, reorderable: true  },
  availability: { icon: "ti-calendar",    label: "Availability",     hideable: true,  deletable: false, reorderable: true  },
  cta:          { icon: "ti-send",        label: "Call to action",   fixed: true,  hideable: false, deletable: false, reorderable: false },
};

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

function BioContent({ draft }: { draft: ProfileDraft }) {
  return (
    <div style={{ padding: "20px 24px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: ORANGE, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>{draft.bioHeading}</div>
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

function ServicesContent({ draft, profile }: { draft: ProfileDraft; profile: SupplementaryProfile | null }) {
  const trades = profile?.trades ?? [];
  return (
    <div style={{ padding: "20px 24px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: ORANGE, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>{draft.servicesHeading}</div>
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
  return (
    <div style={{ padding: "20px 24px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: ORANGE, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>{section.label}</div>
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

function ProjectContent({ section, projects }: { section: SectionInstance; projects: ContractorProject[] }) {
  return (
    <div style={{ padding: "20px 24px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: ORANGE, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>{section.label}</div>
      {projects.length === 0
        ? <div style={{ color: "#9ca3af", fontSize: 13, padding: "16px 0" }}>No projects yet — add your first in the panel</div>
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {projects.map(p => (
              <div key={p.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ fontWeight: 600, color: NAVY, fontSize: 14 }}>{p.title}</div>
                {p.trade && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{p.trade}{p.location ? ` · ${p.location}` : ""}</div>}
              </div>
            ))}
          </div>
        )
      }
    </div>
  );
}

function ReviewsContent({ draft, reviews, section }: { draft: ProfileDraft; reviews: ReviewRow[]; section: SectionInstance }) {
  const pinned = (section.meta.pinnedReviewIds as string[] | undefined) ?? [];
  const shown = pinned.length > 0 ? reviews.filter(r => pinned.includes(r.id)) : reviews.slice(0, 2);
  return (
    <div style={{ padding: "20px 24px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: ORANGE, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>{draft.reviewsHeading}</div>
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

function TeamContent({ draft, members }: { draft: ProfileDraft; members: TeamMemberRow[] }) {
  const active = members.filter(m => m.is_active);
  return (
    <div style={{ padding: "20px 24px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: ORANGE, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>{draft.teamHeading}</div>
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

function CredentialsContent({ draft, credentials }: { draft: ProfileDraft; credentials: CredentialRow[] }) {
  return (
    <div style={{ padding: "20px 24px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: ORANGE, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>{draft.credentialsHeading}</div>
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

function AvailabilityContent({ draft }: { draft: ProfileDraft }) {
  return (
    <div style={{ padding: "20px 24px" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: ORANGE, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>{draft.availabilityHeading}</div>
      <div style={{ color: "#6b7280", fontSize: 13 }}>Live availability calendar — managed from your Availability tab</div>
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
  isSelected: boolean;
  onSelect: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggle: () => void;
  onDelete: () => void;
}

function CanvasBlock(props: CanvasBlockProps) {
  const { section, index, total, draft, profile, reviews, galleryPhotoMap, projects, members, credentials, isSelected, onSelect, onMoveUp, onMoveDown, onToggle, onDelete } = props;
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
      {section.type === "bio" && <BioContent draft={draft} />}
      {section.type === "stats" && <StatsContent draft={draft} profile={profile} section={section} />}
      {section.type === "services" && <ServicesContent draft={draft} profile={profile} />}
      {section.type === "gallery" && <GalleryContent section={section} galleryPhotoMap={galleryPhotoMap} />}
      {section.type === "project" && <ProjectContent section={section} projects={projects} />}
      {section.type === "reviews" && <ReviewsContent draft={draft} reviews={reviews} section={section} />}
      {section.type === "team" && <TeamContent draft={draft} members={members} />}
      {section.type === "credentials" && <CredentialsContent draft={draft} credentials={credentials} />}
      {section.type === "availability" && <AvailabilityContent draft={draft} />}
      {section.type === "cta" && <CtaContent draft={draft} />}
    </div>
  );
}

// ── Edit panel subcomponents ──────────────────────────────────────────────────

function HeroPanel({ draft, updateDraft }: { draft: ProfileDraft; updateDraft: (p: Partial<ProfileDraft>) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleCoverUpload = async (file: File) => {
    setUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.storage.from("covers").upload(`${user.id}/cover.jpg`, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("covers").getPublicUrl(`${user.id}/cover.jpg`);
      updateDraft({ coverUrl: publicUrl });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
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

  return (
    <div>
      <FieldLabel>Gallery title</FieldLabel>
      <PanelInput value={section.label} onChange={handleTitleChange} placeholder="Our work" />
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
        {photos.length < 20 && (
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

function ProjectPanelContent({ section, updateSection, projects, addProject, updateProject, deleteProject }: {
  section: SectionInstance;
  updateSection: (id: string, p: Partial<SectionInstance>) => void;
  projects: ContractorProject[];
  addProject: (data: ProjectData) => Promise<void>;
  updateProject: (id: string, data: Partial<ProjectData>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newTrade, setNewTrade] = useState("");
  const [newLocation, setNewLocation] = useState("");

  const handleAdd = async () => {
    if (!newTitle.trim()) return;
    await addProject({ title: newTitle.trim(), description: newDesc || null, trade: newTrade || null, location: newLocation || null, completion_date: null, photo_urls: [] });
    setAdding(false);
    setNewTitle(""); setNewDesc(""); setNewTrade(""); setNewLocation("");
  };

  return (
    <div>
      <FieldLabel>Section heading</FieldLabel>
      <PanelInput value={section.label} onChange={v => updateSection(section.id, { label: v })} placeholder="Project showcase" />
      <FieldLabel>Projects ({projects.length}/3)</FieldLabel>
      {projects.map(p => (
        <div key={p.id} style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 12px", marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <div style={{ fontWeight: 600, fontSize: 13, color: NAVY }}>{p.title}</div>
            <button onClick={() => deleteProject(p.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#ef4444", padding: 0 }}>
              <i className="ti ti-trash" style={{ fontSize: 14 }} />
            </button>
          </div>
          {p.trade && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{p.trade}{p.location ? ` · ${p.location}` : ""}</div>}
        </div>
      ))}
      {projects.length < 3 && !adding && (
        <PanelBtn variant="ghost" onClick={() => setAdding(true)}>
          <i className="ti ti-plus" style={{ marginRight: 4 }} />Add project
        </PanelBtn>
      )}
      {adding && (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "12px" }}>
          <FieldLabel>Title</FieldLabel>
          <PanelInput value={newTitle} onChange={setNewTitle} placeholder="Project name" />
          <FieldLabel>Trade</FieldLabel>
          <PanelInput value={newTrade} onChange={setNewTrade} placeholder="e.g. Plumbing" />
          <FieldLabel>Location</FieldLabel>
          <PanelInput value={newLocation} onChange={setNewLocation} placeholder="e.g. Manchester" />
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
    await addMember({ full_name: name.trim(), role: role || null, email: null, phone: null, hourly_rate: null, display_order: members.length });
    setAdding(false); setName(""); setRole("");
  };

  return (
    <div>
      <FieldLabel>Section heading</FieldLabel>
      <PanelInput value={section.label} onChange={v => updateSection(section.id, { label: v })} placeholder="Our team" />
      <FieldLabel>Members</FieldLabel>
      {members.filter(m => m.is_active).map(m => (
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

function CtaPanelContent({ draft, updateDraft }: { draft: ProfileDraft; updateDraft: (p: Partial<ProfileDraft>) => void }) {
  return (
    <div>
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
  members: TeamMemberRow[];
  addMember: (data: TeamMemberInsert) => Promise<void>;
  deleteMember: (id: string) => Promise<void>;
  credentials: CredentialRow[];
  addCredential: (data: NewCredential) => Promise<void>;
  deleteCredential: (id: string) => Promise<void>;
  galleries: { id: string; title: string }[];
  updateGallery: (id: string, title: string) => Promise<void>;
}

function EditPanel(props: EditPanelProps) {
  const { section, onClose, draft, updateDraft, updateSection, onDeleteSection, saving, onSave, reviews, projects, addProject, updateProject, deleteProject, members, addMember, deleteMember, credentials, addCredential, deleteCredential, galleries, updateGallery } = props;
  const def = section ? (SECTION_DEFS[section.type] ?? SECTION_DEFS.bio) : null;

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
      {/* Header */}
      <div style={{ padding: "12px 16px", borderBottom: "1px solid #e5e7eb", display: "flex", alignItems: "center", gap: 8, flexShrink: 0, background: "#fafafa" }}>
        {def && <i className={`ti ${def.icon}`} style={{ color: ORANGE, fontSize: 16 }} />}
        <span style={{ fontWeight: 700, fontSize: 14, color: NAVY, flex: 1 }}>{def?.label ?? ""}</span>
        <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "#6b7280", padding: 2 }}>
          <i className="ti ti-x" style={{ fontSize: 16 }} />
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
        {section?.type === "hero" && <HeroPanel draft={draft} updateDraft={updateDraft} />}
        {section?.type === "bio" && <BioPanel draft={draft} updateDraft={updateDraft} section={section} updateSection={updateSection} />}
        {section?.type === "stats" && <StatsPanel section={section} updateSection={updateSection} />}
        {section?.type === "services" && <ServicesPanelContent draft={draft} updateDraft={updateDraft} section={section} updateSection={updateSection} />}
        {section?.type === "gallery" && (
          <GalleryPanelContent section={section} updateSection={updateSection} galleries={galleries} updateGallery={updateGallery} />
        )}
        {section?.type === "project" && (
          <ProjectPanelContent section={section} updateSection={updateSection} projects={projects} addProject={addProject} updateProject={updateProject} deleteProject={deleteProject} />
        )}
        {section?.type === "reviews" && <ReviewsPanelContent section={section} updateSection={updateSection} reviews={reviews} />}
        {section?.type === "team" && (
          <TeamPanelContent section={section} updateSection={updateSection} draft={draft} updateDraft={updateDraft} members={members} addMember={addMember} deleteMember={deleteMember} />
        )}
        {section?.type === "credentials" && (
          <CredentialsPanelContent section={section} updateSection={updateSection} credentials={credentials} addCredential={addCredential} deleteCredential={deleteCredential} />
        )}
        {section?.type === "availability" && <AvailabilityPanelContent section={section} updateSection={updateSection} />}
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
}

function LeftSidebar({ draft, updateDraft, activeId, onSelectSection, onAddGallery, onAddProject, profile }: LeftSidebarProps) {
  const [tab, setTab] = useState<"sections" | "page">("sections");
  const [slugError, setSlugError] = useState("");

  const orderedSections = [...draft.sections].sort((a, b) => a.display_order - b.display_order);
  const gallerySections = draft.sections.filter(s => s.type === "gallery");
  const projectSections = draft.sections.filter(s => s.type === "project");

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
    <div style={{ width: 220, background: "white", borderRight: "1px solid #e5e7eb", display: "flex", flexDirection: "column", flexShrink: 0 }}>
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
                disabled={gallerySections.length >= 3}
                style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "7px 10px", background: gallerySections.length >= 3 ? "#f9fafb" : "#fff7ed", border: `1px solid ${gallerySections.length >= 3 ? "#e5e7eb" : "#fed7aa"}`, borderRadius: 20, fontSize: 12, fontWeight: 600, color: gallerySections.length >= 3 ? "#9ca3af" : ORANGE, cursor: gallerySections.length >= 3 ? "not-allowed" : "pointer", marginBottom: 6, fontFamily: "inherit" }}
              >
                <i className="ti ti-photo" style={{ fontSize: 14 }} />
                Photo gallery
                <span style={{ marginLeft: "auto", color: "#9ca3af", fontSize: 11 }}>{gallerySections.length}/3</span>
              </button>
              <button
                onClick={onAddProject}
                disabled={projectSections.length >= 3}
                style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "7px 10px", background: projectSections.length >= 3 ? "#f9fafb" : "#fff7ed", border: `1px solid ${projectSections.length >= 3 ? "#e5e7eb" : "#fed7aa"}`, borderRadius: 20, fontSize: 12, fontWeight: 600, color: projectSections.length >= 3 ? "#9ca3af" : ORANGE, cursor: projectSections.length >= 3 ? "not-allowed" : "pointer", fontFamily: "inherit" }}
              >
                <i className="ti ti-briefcase" style={{ fontSize: 14 }} />
                Project showcase
                <span style={{ marginLeft: "auto", color: "#9ca3af", fontSize: 11 }}>{projectSections.length}/3</span>
              </button>
            </div>

            {/* On canvas list */}
            <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>On canvas</div>
            {orderedSections.map(s => {
              const def = SECTION_DEFS[s.type] ?? SECTION_DEFS.bio;
              const isActive = s.id === activeId;
              return (
                <button
                  key={s.id}
                  onClick={() => {
                    onSelectSection(s.id);
                    document.getElementById(`canvas-block-${s.id}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
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

function TopBar({ draft, isDirty, saving, publishing, onSave, onPublish, profile }: {
  draft: ProfileDraft;
  isDirty: boolean;
  saving: boolean;
  publishing: boolean;
  onSave: () => void;
  onPublish: () => void;
  profile: SupplementaryProfile | null;
}) {
  const [savedFlash, setSavedFlash] = useState(false);

  const handleSave = async () => {
    await onSave();
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  };

  const pillGreen = draft.isPublished && !isDirty;
  const pillLabel = pillGreen ? "Published" : "Draft";
  const pillBg = pillGreen ? "#16a34a" : ORANGE;

  return (
    <div style={{ height: 48, background: NAVY, display: "flex", alignItems: "center", padding: "0 16px", gap: 12, flexShrink: 0, zIndex: 30 }}>
      <span style={{ fontWeight: 900, fontSize: 16, letterSpacing: "0.02em", fontFamily: "Barlow Condensed, sans-serif", textTransform: "uppercase", color: ORANGE, flexShrink: 0 }}>TradeStone</span>
      <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, flexShrink: 0 }}>
        {draft.displayName || "Profile"}
      </span>
      <span style={{ background: pillBg, color: "white", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 10, flexShrink: 0 }}>{pillLabel}</span>

      <div style={{ flex: 1 }} />

      {profile?.ts_profile_code && (
        <a
          href={`/contractor/${profile.ts_profile_code}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: "flex", alignItems: "center", gap: 6, color: "rgba(255,255,255,0.65)", fontSize: 12, textDecoration: "none", padding: "5px 10px", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 6 }}
        >
          <i className="ti ti-external-link" style={{ fontSize: 13 }} />Preview
        </a>
      )}

      <button
        onClick={handleSave}
        disabled={saving || !isDirty}
        style={{ background: isDirty ? "rgba(255,255,255,0.12)" : "transparent", border: "1px solid rgba(255,255,255,0.2)", color: isDirty ? "white" : "rgba(255,255,255,0.35)", fontWeight: 600, fontSize: 13, padding: "6px 14px", borderRadius: 6, cursor: isDirty ? "pointer" : "default", fontFamily: "inherit" }}
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
    saveDraft, publish,
  } = useProfileEditor();

  const gallerySections = draft.sections.filter(s => s.type === "gallery");
  const projectSections = draft.sections.filter(s => s.type === "project");

  const { galleries, addGallery, updateGallery, deleteGallery } = usePhotoGalleries();
  const { projects, addProject, updateProject, deleteProject } = useContractorProjects();
  const { members, addMember, deleteMember } = useContractorTeam();
  const { credentials, addCredential, deleteCredential } = useContractorCredentials();

  const [profile, setProfile] = useState<SupplementaryProfile | null>(null);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [galleryPhotoMap, setGalleryPhotoMap] = useState<Map<string, ContractorPhoto[]>>(new Map());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [addingGallery, setAddingGallery] = useState(false);

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
    removeSection(id);
    if (activeId === id) setActiveId(null);
  }, [draft.sections, removeSection, deleteGallery, activeId]);

  const focusSection = (sectionId: string) => {
    setActiveId(sectionId);
    requestAnimationFrame(() => {
      document.getElementById(`canvas-block-${sectionId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const handleAddGallery = useCallback(async () => {
    if (addingGallery || gallerySections.length >= 3) return;
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
  }, [addGallery, addSection, addingGallery, gallerySections.length]);

  const handleAddProject = useCallback(() => {
    if (projectSections.length >= 3) return;
    const newSectionId = addSection("project", undefined, "Project showcase");
    focusSection(newSectionId);
  }, [addSection, projectSections.length]);

  if (loading) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 14 }}>
        <i className="ti ti-loader" style={{ marginRight: 8 }} />Loading editor…
      </div>
    );
  }

  const activeSection = draft.sections.find(s => s.id === activeId) ?? null;
  const galleryListForPanel = galleries.map(g => ({ id: g.id, title: g.title }));

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column", fontFamily: "Lexend, sans-serif" }}>
      <TopBar
        draft={draft}
        isDirty={isDirty}
        saving={saving}
        publishing={publishing}
        onSave={saveDraft}
        onPublish={publish}
        profile={profile}
      />

      {/* Body: sidebar + canvas + edit panel */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", position: "relative" }}>
        <LeftSidebar
          draft={draft}
          updateDraft={updateDraft}
          activeId={activeId}
          onSelectSection={setActiveId}
          onAddGallery={handleAddGallery}
          onAddProject={handleAddProject}
          profile={profile}
        />

        {/* Canvas */}
        <div
          style={{ flex: 1, background: CANVAS_BG, overflowY: "auto", padding: "40px 0" }}
          onClick={e => { if (e.target === e.currentTarget) setActiveId(null); }}
        >
          <div style={{ maxWidth: 600, margin: "0 auto", padding: "0 16px" }}>
            {orderedSections.map((section, idx) => {
              // Count only reorderable sections for up/down limits
              const reorderable = orderedSections.filter(s => !SECTION_DEFS[s.type]?.fixed);
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

        {/* Edit panel (slide-in right) */}
        <EditPanel
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
          members={members}
          addMember={addMember}
          deleteMember={deleteMember}
          credentials={credentials}
          addCredential={addCredential}
          deleteCredential={deleteCredential}
          galleries={galleryListForPanel}
          updateGallery={updateGallery}
        />
      </div>
    </div>
  );
}
