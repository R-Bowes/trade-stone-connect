import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export type SectionKey =
  | "hero" | "bio" | "stats" | "services" | "availability"
  | "reviews" | "credentials" | "team" | "cta";

export type RepeatableSectionKey = "gallery" | "project";

export interface SectionInstance {
  id: string;
  type: SectionKey | RepeatableSectionKey;
  is_enabled: boolean;
  display_order: number;
  label: string;
  sectionRefId?: string;          // gallery_id for gallery sections; undefined for all others
  meta: Record<string, unknown>;  // visibleStats[], pinnedReviewIds[], etc.
}

export interface ProfileDraft {
  sections: SectionInstance[];
  vanitySlug: string;
  seoTitle: string;
  seoDescription: string;
  visibilityPublic: boolean;
  ctaLabel: string;
  bioHeading: string;
  bioText: string;
  servicesHeading: string;
  reviewsHeading: string;
  credentialsHeading: string;
  availabilityHeading: string;
  teamHeading: string;
  coverUrl: string;
  displayName: string;
  companyName: string;
  locationDisplay: string;
  isPublished: boolean;
  publishedAt: string | null;
}

const DEFAULT_LABEL: Record<string, string> = {
  hero: "Hero",
  bio: "About",
  stats: "Stats",
  services: "Services",
  gallery: "Our work",
  project: "Project showcase",
  reviews: "Reviews",
  team: "Team",
  credentials: "Credentials",
  availability: "Availability",
  cta: "Contact",
};

function defaultLabel(type: string): string {
  return DEFAULT_LABEL[type] ?? type;
}

// Default order when no profile_widgets rows exist.
// hero, bio, stats, services, gallery(x1), reviews, team, credentials, availability, cta
// No project sections by default.
function buildDefaultSections(): SectionInstance[] {
  const order: Array<SectionKey | RepeatableSectionKey> = [
    "hero", "bio", "stats", "services", "gallery",
    "reviews", "team", "credentials", "availability", "cta",
  ];
  return order.map((type, i) => ({
    id: crypto.randomUUID(),
    type,
    is_enabled: true,
    display_order: i,
    label: defaultLabel(type),
    meta: {},
  }));
}

const BLANK_DRAFT: ProfileDraft = {
  sections: [],
  vanitySlug: "",
  seoTitle: "",
  seoDescription: "",
  visibilityPublic: true,
  ctaLabel: "Get in touch",
  bioHeading: "About me",
  bioText: "",
  servicesHeading: "Services",
  reviewsHeading: "What clients say",
  credentialsHeading: "Credentials",
  availabilityHeading: "Availability",
  teamHeading: "Our team",
  coverUrl: "",
  displayName: "",
  companyName: "",
  locationDisplay: "",
  isPublished: false,
  publishedAt: null,
};

// Construct a ProfileDraft from raw DB rows.
// New profile columns are not in generated types.ts — cast as any.
function draftFromDB(profile: Record<string, unknown>, widgetRows: Record<string, unknown>[]): ProfileDraft {
  const p = profile as any;
  const sections: SectionInstance[] = widgetRows.length > 0
    ? widgetRows.map(row => {
        const r = row as any;
        return {
          id: r.id as string,
          type: r.widget_key as SectionKey | RepeatableSectionKey,
          is_enabled: r.is_enabled as boolean,
          display_order: r.display_order as number,
          label: (r.label as string | null) ?? defaultLabel(r.widget_key as string),
          sectionRefId: (r.section_ref_id as string | null) ?? undefined,
          meta: (r.meta as Record<string, unknown> | null) ?? {},
        };
      })
    : buildDefaultSections();

  return {
    sections,
    vanitySlug: p.vanity_slug ?? "",
    seoTitle: p.seo_title ?? "",
    seoDescription: p.seo_description ?? "",
    visibilityPublic: p.visibility_public ?? true,
    ctaLabel: p.cta_label ?? "Get in touch",
    bioHeading: p.bio_heading ?? "About me",
    bioText: p.bio ?? "",
    servicesHeading: p.services_heading ?? "Services",
    reviewsHeading: p.reviews_heading ?? "What clients say",
    credentialsHeading: p.credentials_heading ?? "Credentials",
    availabilityHeading: p.availability_heading ?? "Availability",
    teamHeading: p.team_heading ?? "Our team",
    coverUrl: p.cover_url ?? "",
    displayName: p.full_name ?? "",
    companyName: p.company_name ?? "",
    locationDisplay: p.location ?? "",
    isPublished: p.profile_is_published ?? false,
    publishedAt: p.profile_published_at ?? null,
  };
}

export function useProfileEditor() {
  const [contractorId, setContractorId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProfileDraft>({ ...BLANK_DRAFT, sections: buildDefaultSections() });
  const [isDirty, setIsDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // savedRef holds the last-persisted draft as a JSON string for dirty comparison.
  const savedRef = useRef<string>("");

  // ── Initial load ─────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("user_id", user.id)
        .single();
      if (!profile) { setLoading(false); return; }
      setContractorId(profile.id);

      const { data: widgetRows } = await supabase
        .from("profile_widgets")
        .select("id, widget_key, is_enabled, display_order, label, section_ref_id, meta")
        .eq("contractor_id", profile.id)
        .order("display_order", { ascending: true });

      const loaded = draftFromDB(
        profile as unknown as Record<string, unknown>,
        (widgetRows ?? []) as unknown as Record<string, unknown>[],
      );
      savedRef.current = JSON.stringify(loaded);
      setDraft(loaded);
      setIsDirty(false);
      setLoading(false);
    };
    load();
  }, []);

  // Recompute isDirty whenever draft changes.
  useEffect(() => {
    if (!savedRef.current) return;
    setIsDirty(JSON.stringify(draft) !== savedRef.current);
  }, [draft]);

  // ── Core save implementation (accepts a specific draft value) ─────────────
  const saveToDb = useCallback(async (d: ProfileDraft) => {
    if (!contractorId) return;

    const { error: profileError } = await supabase
      .from("profiles")
      .update({
        bio: d.bioText,
        cover_url: d.coverUrl,
        full_name: d.displayName,
        company_name: d.companyName,
        location: d.locationDisplay,
        vanity_slug: d.vanitySlug || null,
        seo_title: d.seoTitle || null,
        seo_description: d.seoDescription || null,
        visibility_public: d.visibilityPublic,
        cta_label: d.ctaLabel || null,
        bio_heading: d.bioHeading || null,
        services_heading: d.servicesHeading || null,
        reviews_heading: d.reviewsHeading || null,
        credentials_heading: d.credentialsHeading || null,
        availability_heading: d.availabilityHeading || null,
        team_heading: d.teamHeading || null,
        profile_is_published: d.isPublished,
        profile_published_at: d.publishedAt,
      } as any)
      .eq("id", contractorId);
    if (profileError) throw profileError;

    // Replace sections: delete all then reinsert.
    // Using delete+insert rather than upsert because repeatable section types
    // (gallery, project) can have multiple rows with the same widget_key.
    await supabase.from("profile_widgets").delete().eq("contractor_id", contractorId);

    if (d.sections.length > 0) {
      const { error: widgetsError } = await supabase
        .from("profile_widgets")
        .insert(
          d.sections.map(s => ({
            contractor_id: contractorId,
            widget_key: s.type,
            is_enabled: s.is_enabled,
            display_order: s.display_order,
            label: s.label,
            section_ref_id: s.sectionRefId ?? null,
            meta: s.meta ?? {},
          } as any))
        );
      if (widgetsError) throw widgetsError;
    }

    savedRef.current = JSON.stringify(d);
    setIsDirty(false);
  }, [contractorId]);

  // ── Public API ────────────────────────────────────────────────────────────

  const updateDraft = useCallback((partial: Partial<ProfileDraft>) => {
    setDraft(prev => ({ ...prev, ...partial }));
  }, []);

  const reorderSections = useCallback((from: number, to: number) => {
    setDraft(prev => {
      const sections = [...prev.sections];
      const [moved] = sections.splice(from, 1);
      sections.splice(to, 0, moved);
      return {
        ...prev,
        sections: sections.map((s, i) => ({ ...s, display_order: i })),
      };
    });
  }, []);

  const toggleSection = useCallback((id: string) => {
    setDraft(prev => ({
      ...prev,
      sections: prev.sections.map(s =>
        s.id === id ? { ...s, is_enabled: !s.is_enabled } : s
      ),
    }));
  }, []);

  // Adds a repeatable section (gallery/project) before the CTA block.
  const addSection = useCallback((
    type: RepeatableSectionKey,
    sectionRefId?: string,
    label?: string,
  ) => {
    setDraft(prev => {
      const withoutCta = prev.sections.filter(s => s.type !== "cta");
      const cta = prev.sections.find(s => s.type === "cta");
      const newSec: SectionInstance = {
        id: crypto.randomUUID(),
        type,
        is_enabled: true,
        display_order: withoutCta.length,
        label: label ?? defaultLabel(type),
        sectionRefId,
        meta: {},
      };
      const updated = [
        ...withoutCta,
        newSec,
        ...(cta ? [{ ...cta, display_order: withoutCta.length + 1 }] : []),
      ];
      return { ...prev, sections: updated.map((s, i) => ({ ...s, display_order: i })) };
    });
  }, []);

  const removeSection = useCallback((id: string) => {
    setDraft(prev => ({
      ...prev,
      sections: prev.sections
        .filter(s => s.id !== id)
        .map((s, i) => ({ ...s, display_order: i })),
    }));
  }, []);

  const saveDraft = useCallback(async () => {
    setSaving(true);
    try {
      await saveToDb(draft);
    } finally {
      setSaving(false);
    }
  }, [draft, saveToDb]);

  const publish = useCallback(async () => {
    setPublishing(true);
    try {
      const now = new Date().toISOString();
      const publishedDraft: ProfileDraft = { ...draft, isPublished: true, publishedAt: now };
      await saveToDb(publishedDraft);
      setDraft(publishedDraft);
    } finally {
      setPublishing(false);
    }
  }, [draft, saveToDb]);

  const resetToDraft = useCallback(() => {
    if (!savedRef.current) return;
    setDraft(JSON.parse(savedRef.current) as ProfileDraft);
    setIsDirty(false);
  }, []);

  return {
    draft,
    isDirty,
    loading,
    saving,
    publishing,
    updateDraft,
    reorderSections,
    toggleSection,
    addSection,
    removeSection,
    saveDraft,
    publish,
    resetToDraft,
  };
}
