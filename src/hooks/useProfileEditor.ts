import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";

export type SectionKey =
  | "hero" | "bio" | "stats" | "services" | "availability"
  | "reviews" | "credentials" | "team" | "cta"
  | "video" | "before_after" | "service_area" | "social";

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

// bio_heading/services_heading/reviews_heading/credentials_heading/
// availability_heading/team_heading (profiles columns) are deliberately NOT
// modelled here any more. They used to be loaded/saved alongside this draft
// but had no input anywhere that edited them — every section's actual,
// editable heading is section.label (per-SectionInstance, below), which is
// also the only heading the public profile ever reads
// (ContractorProfile.tsx's getSectionLabel()). Rendering both left the
// editor preview showing a permanently-stuck, uneditable string that could
// (and did, by default) disagree with what the public page actually showed.
// The DB columns are left in place — vestigial, not read anywhere in the
// app — pending a decision on dropping them.
export interface ProfileDraft {
  sections: SectionInstance[];
  vanitySlug: string;
  seoTitle: string;
  seoDescription: string;
  visibilityPublic: boolean;
  ctaLabel: string;
  bioText: string;
  coverUrl: string;
  displayName: string;
  companyName: string;
  locationDisplay: string;
  isPublished: boolean;
  publishedAt: string | null;
  socialLinks: Record<string, string>;
  serviceAreaRadiusMiles: number | null;
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
  video: "Video showcase",
  before_after: "Before & after",
  service_area: "Service area",
  social: "Social links",
};

// New in this feature — inserted disabled/enabled per Step 5's spec when
// missing from an existing contractor's rows, and included at these
// defaults for brand-new contractors via buildDefaultSections below.
const NEW_SECTION_DEFAULTS: Record<"video" | "before_after" | "service_area" | "social", boolean> = {
  video: false,
  before_after: false,
  service_area: true,
  social: true,
};

function defaultLabel(type: string): string {
  return DEFAULT_LABEL[type] ?? type;
}

// Default order when no profile_widgets rows exist.
// hero, bio, stats, services, gallery(x1), social, reviews, team,
// credentials, availability, video, before_after, service_area, cta
// No project sections by default. video/before_after start disabled
// (no content yet); social/service_area start enabled (Step 5).
function buildDefaultSections(): SectionInstance[] {
  const order: Array<SectionKey | RepeatableSectionKey> = [
    "hero", "bio", "stats", "services", "gallery", "social",
    "reviews", "team", "credentials", "availability",
    "video", "before_after", "service_area", "cta",
  ];
  return order.map((type, i) => ({
    id: crypto.randomUUID(),
    type,
    is_enabled: type in NEW_SECTION_DEFAULTS ? NEW_SECTION_DEFAULTS[type as keyof typeof NEW_SECTION_DEFAULTS] : true,
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
  bioText: "",
  coverUrl: "",
  displayName: "",
  companyName: "",
  locationDisplay: "",
  isPublished: false,
  publishedAt: null,
  socialLinks: {},
  serviceAreaRadiusMiles: null,
};

// Construct a ProfileDraft from raw DB rows.
// New profile columns are not in generated types.ts — cast as any.
function draftFromDB(profile: Record<string, unknown>, widgetRows: Record<string, unknown>[]): ProfileDraft {
  const p = profile as any;
  let sections: SectionInstance[] = widgetRows.length > 0
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

  // Step 5: existing contractors (widgetRows.length > 0, i.e. they've
  // visited the editor before this feature shipped) won't have rows for
  // the new widget_keys. Backfill any missing ones now — inserted before
  // the fixed 'cta' section (or at the end if there's no cta row for some
  // reason), so they render in a sensible place without disturbing the
  // contractor's existing order/customisations for everything else.
  if (widgetRows.length > 0) {
    let backfilled = false;

    // Hero leads at position 0. The old 8-key editor (bio, stats, trades,
    // photos, reviews, credentials, availability, team) never had a hero
    // row, and this backfill previously covered only the four
    // NEW_SECTION_DEFAULTS keys below — never hero. Any contractor who
    // saved through the old editor and never revisited since has no hero
    // row: no sidebar entry, no canvas block, no way to reach HeroPanel,
    // and therefore no way to ever set a cover image (the only control
    // that writes profiles.cover_url).
    if (!sections.some(s => s.type === "hero")) {
      sections = [
        { id: crypto.randomUUID(), type: "hero", is_enabled: true, display_order: 0, label: defaultLabel("hero"), meta: {} },
        ...sections,
      ];
      backfilled = true;
    }

    // Cta trails at the end — same reasoning as hero, mirrored. The old
    // 8-key editor's WidgetKey list has no 'cta' either, so a contractor
    // from that era has no way to reach CtaPanelContent — the only
    // control that writes profiles.cta_label. Lower severity than hero:
    // draftFromDB already applies `ctaLabel: p.cta_label ?? "Get in
    // touch"` at read time, so the button still renders with a sensible
    // default; only customising its wording is unreachable. Backfilled
    // before the NEW_SECTION_DEFAULTS step below so that step's own
    // "insert before cta" logic (a few lines down) has a real cta row to
    // target, rather than falling through to its "insert at the end"
    // fallback and landing after this one.
    if (!sections.some(s => s.type === "cta")) {
      sections = [
        ...sections,
        { id: crypto.randomUUID(), type: "cta", is_enabled: true, display_order: 0, label: defaultLabel("cta"), meta: {} },
      ];
      backfilled = true;
    }

    const present = new Set(sections.map(s => s.type));
    const missing = (Object.keys(NEW_SECTION_DEFAULTS) as Array<keyof typeof NEW_SECTION_DEFAULTS>)
      .filter(key => !present.has(key));
    if (missing.length > 0) {
      const ctaIndex = sections.findIndex(s => s.type === "cta");
      const insertAt = ctaIndex >= 0 ? ctaIndex : sections.length;
      const newSections: SectionInstance[] = missing.map(type => ({
        id: crypto.randomUUID(),
        type,
        is_enabled: NEW_SECTION_DEFAULTS[type],
        display_order: 0, // reassigned below
        label: defaultLabel(type),
        meta: {},
      }));
      sections = [
        ...sections.slice(0, insertAt),
        ...newSections,
        ...sections.slice(insertAt),
      ];
      backfilled = true;
    }

    // Renumber only if something was actually inserted above — a
    // contractor needing no backfill at all keeps their exact stored
    // display_order values untouched, same as before this change.
    if (backfilled) {
      sections = sections.map((s, i) => ({ ...s, display_order: i }));
    }
  }

  return {
    sections,
    vanitySlug: p.vanity_slug ?? "",
    seoTitle: p.seo_title ?? "",
    seoDescription: p.seo_description ?? "",
    visibilityPublic: p.visibility_public ?? true,
    ctaLabel: p.cta_label ?? "Get in touch",
    bioText: p.bio ?? "",
    coverUrl: p.cover_url ?? "",
    displayName: p.full_name ?? "",
    companyName: p.company_name ?? "",
    locationDisplay: p.location ?? "",
    isPublished: p.profile_is_published ?? false,
    publishedAt: p.profile_published_at ?? null,
    socialLinks: (p.social_links as Record<string, string> | null) ?? {},
    serviceAreaRadiusMiles: p.service_area_radius_miles ?? null,
  };
}

// Key-sorted JSON so two objects with the same content compare equal whatever
// order their keys were built in.
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

interface SignatureSection {
  widget_key: string;
  label: string | null;
  section_ref_id: string | null;
  meta: unknown;
}

// What a visitor would see: enabled sections only, in order. Compared between
// the draft and the published snapshot to tell whether there are unpublished
// section changes (including a section that was hidden or shown).
function sectionsSignature(sections: SignatureSection[]): string {
  return stableStringify(
    sections.map(s => ({
      widget_key: s.widget_key,
      label: s.label ?? "",
      section_ref_id: s.section_ref_id ?? null,
      meta: s.meta ?? {},
    })),
  );
}

function draftSignature(sections: SectionInstance[]): string {
  return sectionsSignature(
    [...sections]
      .filter(s => s.is_enabled)
      .sort((a, b) => a.display_order - b.display_order)
      .map(s => ({ widget_key: s.type, label: s.label, section_ref_id: s.sectionRefId ?? null, meta: s.meta })),
  );
}

export function useProfileEditor() {
  const { toast } = useToast();
  const [contractorId, setContractorId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProfileDraft>({ ...BLANK_DRAFT, sections: buildDefaultSections() });
  const [isDirty, setIsDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  // Signature of the published snapshot's sections; null until loaded or if
  // the read failed (then the editor cannot claim to be in sync).
  const [publishedSignature, setPublishedSignature] = useState<string | null>(null);

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

      // Draft rows only, filtered explicitly: the owner can also read the
      // published snapshot rows (the public SELECT policy), and loading those
      // as drafts would duplicate every section on the next Save.
      const { data: widgetRows, error: widgetsError } = await supabase
        .from("profile_widgets")
        .select("id, widget_key, is_enabled, display_order, label, section_ref_id, meta")
        .eq("contractor_id", profile.id)
        .eq("is_published", false)
        .order("display_order", { ascending: true });
      if (widgetsError) {
        console.error("Profile editor: failed to load sections", widgetsError);
        toast({ title: "Could not load your sections", description: widgetsError.message, variant: "destructive" });
      }

      const { data: snapshotRows, error: snapshotError } = await supabase
        .from("profile_widgets")
        .select("widget_key, label, section_ref_id, meta")
        .eq("contractor_id", profile.id)
        .eq("is_published", true)
        .eq("is_enabled", true)
        .order("published_order", { ascending: true });
      if (snapshotError) {
        console.error("Profile editor: failed to read the published snapshot", snapshotError);
        setPublishedSignature(null);
      } else {
        setPublishedSignature(sectionsSignature(snapshotRows ?? []));
      }

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

  // Warn on tab close / browser back while there are unsaved edits. Listener
  // is added only while isDirty is true and removed the moment it goes
  // false (or on unmount) — not a permanently-attached handler that checks
  // isDirty internally, an actually-absent one otherwise.
  useEffect(() => {
    if (!isDirty) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  // ── Saving ────────────────────────────────────────────────────────────────
  // Two steps, sections first: save_profile_sections replaces the draft rows in
  // one transaction, then the profiles columns are updated. Draft rows are not
  // public, so a failure between the two never leaves a live half-state. Each
  // step reports its own error; nothing fails silently.

  const saveSections = useCallback(async (d: ProfileDraft) => {
    const payload = d.sections.map(s => ({
      widget_key: s.type,
      is_enabled: s.is_enabled,
      display_order: s.display_order,
      label: s.label,
      section_ref_id: s.sectionRefId ?? null,
      meta: s.meta ?? {},
    })) as unknown as Json;
    const { error } = await supabase.rpc("save_profile_sections", { p_sections: payload });
    if (error) throw new Error(`Your sections could not be saved: ${error.message}`);
  }, []);

  // Profile columns go live as soon as this runs (no snapshot for them yet).
  // profile_is_published / profile_published_at are deliberately not written
  // here: publish_profile_sections is their only writer.
  const saveProfileColumns = useCallback(async (d: ProfileDraft) => {
    if (!contractorId) return;
    const { error } = await supabase
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
        social_links: d.socialLinks,
        service_area_radius_miles: d.serviceAreaRadiusMiles,
      })
      .eq("id", contractorId);
    if (error) {
      throw new Error(`Your sections were saved, but your profile details could not be: ${error.message}`);
    }
  }, [contractorId]);

  const refreshPublishedSignature = useCallback(async () => {
    if (!contractorId) return;
    const { data, error } = await supabase
      .from("profile_widgets")
      .select("widget_key, label, section_ref_id, meta")
      .eq("contractor_id", contractorId)
      .eq("is_published", true)
      .eq("is_enabled", true)
      .order("published_order", { ascending: true });
    if (error) {
      console.error("Profile editor: failed to refresh the published snapshot", error);
      setPublishedSignature(null);
      return;
    }
    setPublishedSignature(sectionsSignature(data ?? []));
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
  // Returns the new section's id so callers can select/scroll to it.
  const addSection = useCallback((
    type: RepeatableSectionKey,
    sectionRefId?: string,
    label?: string,
  ): string => {
    const newId = crypto.randomUUID();
    setDraft(prev => {
      const withoutCta = prev.sections.filter(s => s.type !== "cta");
      const cta = prev.sections.find(s => s.type === "cta");
      const newSec: SectionInstance = {
        id: newId,
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
    return newId;
  }, []);

  const removeSection = useCallback((id: string) => {
    setDraft(prev => ({
      ...prev,
      sections: prev.sections
        .filter(s => s.id !== id)
        .map((s, i) => ({ ...s, display_order: i })),
    }));
  }, []);

  // Both return whether they succeeded and toast the reason when they did not.
  const saveDraft = useCallback(async (): Promise<boolean> => {
    if (!contractorId) return false;
    setSaving(true);
    try {
      await saveSections(draft);
      await saveProfileColumns(draft);
      savedRef.current = JSON.stringify(draft);
      setIsDirty(false);
      return true;
    } catch (err) {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : "Something went wrong saving your profile.",
        variant: "destructive",
      });
      return false;
    } finally {
      setSaving(false);
    }
  }, [contractorId, draft, saveSections, saveProfileColumns, toast]);

  // Publish saves everything first, so unsaved editor changes are published
  // too, then copies the enabled draft sections into the snapshot.
  const publish = useCallback(async (): Promise<boolean> => {
    if (!contractorId) return false;
    setPublishing(true);
    try {
      await saveSections(draft);
      await saveProfileColumns(draft);
      const { error } = await supabase.rpc("publish_profile_sections");
      if (error) throw new Error(`Your changes were saved but could not be published: ${error.message}`);

      const publishedDraft: ProfileDraft = { ...draft, isPublished: true, publishedAt: new Date().toISOString() };
      savedRef.current = JSON.stringify(publishedDraft);
      setDraft(publishedDraft);
      setIsDirty(false);
      await refreshPublishedSignature();
      return true;
    } catch (err) {
      toast({
        title: "Publish failed",
        description: err instanceof Error ? err.message : "Something went wrong publishing your profile.",
        variant: "destructive",
      });
      return false;
    } finally {
      setPublishing(false);
    }
  }, [contractorId, draft, saveSections, saveProfileColumns, refreshPublishedSignature, toast]);

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
    // True when the draft's enabled sections match what visitors currently see.
    isPublishedInSync: publishedSignature !== null && publishedSignature === draftSignature(draft.sections),
  };
}
