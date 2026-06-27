import { useParams, useNavigate } from "react-router-dom";
import { useState, useEffect, type ReactNode } from "react";
import Header from "@/components/Header";
import QuoteRequestDialog from "@/components/QuoteRequestDialog";
import { ContractorMessageDialog } from "@/components/ContractorMessageDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAvailability } from "@/hooks/useAvailability";
import { HeroBlock, type AvailabilityInfo } from "@/components/profile/ProfileWidgets";
import { isToday, isTomorrow, format } from "date-fns";

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

function ReviewsBlock({ section, reviews }: { section: CanvasSection; reviews: Review[] }) {
  return (
    <SectionCard heading={getSectionLabel(section)}>
      {!reviews.length ? (
        <p style={{ fontSize: 14, color: "#aaa", fontStyle: "italic", margin: 0 }}>No reviews yet.</p>
      ) : (
        reviews.map((r, idx) => (
          <div key={r.id} style={{ paddingBottom: 14, marginBottom: idx < reviews.length - 1 ? 14 : 0, borderBottom: idx < reviews.length - 1 ? "1px solid #f0f0f0" : "none" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: NAVY, color: "white", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>C</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: NAVY, display: "flex", alignItems: "center", gap: 6 }}>
                  Verified client
                  {r.pinned && (
                    <span style={{ fontSize: 10, background: "rgba(240,120,32,0.1)", color: ORANGE, padding: "1px 6px", borderRadius: 4 }}>
                      <i className="ti ti-pin" style={{ fontSize: 10, marginRight: 2 }} />Pinned
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: "#aaa" }}>{formatReviewDate(r.created_at)}</div>
              </div>
              <Stars rating={r.rating} />
            </div>
            {r.comment && <p style={{ fontSize: 14, color: "#555", lineHeight: 1.55, margin: 0 }}>{r.comment}</p>}
          </div>
        ))
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

const ContractorProfile = () => {
  // Supports both /contractor/:code and /hire/:slug
  const { code, slug } = useParams<{ code?: string; slug?: string }>();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<PageProfile | null>(null);
  const [sections, setSections] = useState<CanvasSection[]>([]);
  const [photosByGallery, setPhotosByGallery] = useState<Map<string, GalleryPhoto[]>>(new Map());
  const [allPhotos, setAllPhotos] = useState<GalleryPhoto[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
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
        rating, review_count, completed_jobs, years_experience, hourly_rate
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

      // Canvas-only fields not yet exposed by public_pro_profiles — all public-facing
      // (no PII), so reading profiles directly here is safe under current RLS.
      const { data: canvasFields } = await (supabase as any)
        .from("profiles")
        .select("cover_url, profile_is_published, cta_label")
        .eq("id", profileId)
        .maybeSingle();

      const assembled: PageProfile = {
        ...(pub as any),
        cover_url: canvasFields?.cover_url ?? null,
        profile_is_published: canvasFields?.profile_is_published ?? false,
        cta_label: canvasFields?.cta_label ?? null,
      };
      setProfile(assembled);

      const { data: { user } } = await supabase.auth.getUser();
      setIsOwner(user?.id === assembled.user_id);

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

      const fetches: Promise<void>[] = [];

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

      await Promise.all(fetches);
      setLoading(false);
    };

    load();
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
      />

      {profile.user_id && (
        <ContractorMessageDialog
          open={isMessageOpen}
          onOpenChange={setIsMessageOpen}
          recipientUserId={profile.user_id}
          contractorName={profile.full_name ?? ""}
          contractorLocation={profile.location ?? ""}
        />
      )}
    </div>
  );
};

export default ContractorProfile;
