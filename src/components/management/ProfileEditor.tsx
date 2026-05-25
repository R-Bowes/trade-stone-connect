import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useProfileWidgets } from "@/hooks/useProfileWidgets";
import { useContractorCredentials } from "@/hooks/useContractorCredentials";
import { useAvailability } from "@/hooks/useAvailability";
import {
  HeroBlock, EnquireBlock, WidgetBlock, WIDGET_DEFS,
  type PublicProfile, type ProfilePhoto, type ProfileReview,
  type ProfileTeamMember, type WidgetBlockData,
} from "@/components/profile/ProfileWidgets";
import type { WidgetKey } from "@/hooks/useProfileWidgets";

// ─── Left panel: widget row ───────────────────────────────────────────────────

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      onClick={onChange}
      aria-pressed={on}
      style={{
        width: 40, height: 22, borderRadius: 11, border: "none", cursor: "pointer",
        background: on ? "#f07820" : "#d1d5db",
        position: "relative", transition: "background 0.2s", flexShrink: 0,
        padding: 0,
      }}
    >
      <span style={{
        position: "absolute", top: 3,
        left: on ? 21 : 3,
        width: 16, height: 16, borderRadius: "50%", background: "white",
        transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
      }} />
    </button>
  );
}

interface WidgetRowProps {
  widgetKey: WidgetKey;
  isEnabled: boolean;
  onToggle: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
  isDragOver: boolean;
}

function WidgetRow({ widgetKey, isEnabled, onToggle, onDragStart, onDragOver, onDrop, onDragEnd, isDragOver }: WidgetRowProps) {
  const def = WIDGET_DEFS[widgetKey];
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "9px 12px",
        background: isDragOver ? "rgba(240,120,32,0.07)" : "white",
        borderBottom: "1px solid #f3f4f6",
        cursor: "grab",
        borderLeft: isDragOver ? "3px solid #f07820" : "3px solid transparent",
        transition: "background 0.1s, border-color 0.1s",
        userSelect: "none",
      }}
    >
      <i className="ti ti-grip-vertical" style={{ fontSize: 16, color: "#ccc", flexShrink: 0 }} />
      <i className={`ti ${def.icon}`} style={{ fontSize: 16, color: "#1a2744", flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 13, color: "#374151", fontWeight: 500 }}>{def.label}</span>
      <Toggle on={isEnabled} onChange={onToggle} />
    </div>
  );
}

// ─── ProfileEditor ────────────────────────────────────────────────────────────

export function ProfileEditor() {
  const { widgets, toggleWidget, reorderWidgets, saveWidgets, saving } = useProfileWidgets();
  const { credentials } = useContractorCredentials();
  const { toast } = useToast();

  // Profile + supplementary data for preview
  const [contractorId, setContractorId] = useState("");
  const [userId, setUserId] = useState("");
  const [tsCode, setTsCode] = useState<string | null>(null);
  const [publicProfile, setPublicProfile] = useState<PublicProfile | null>(null);
  const [photos, setPhotos] = useState<ProfilePhoto[]>([]);
  const [reviews, setReviews] = useState<ProfileReview[]>([]);
  const [team, setTeam] = useState<ProfileTeamMember[]>([]);

  // Drag state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragKeyRef = useRef<WidgetKey | null>(null);

  const { getNextAvailable, loading: availLoading } = useAvailability(contractorId);
  const nextAvailable = contractorId ? getNextAvailable() : null;
  const availabilityInfo = {
    label: availLoading
      ? "Checking..."
      : nextAvailable
        ? (nextAvailable.toDateString() === new Date().toDateString()
          ? "Available today"
          : `Available from ${nextAvailable.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}`)
        : "Contact for availability",
    isAvailable: !!nextAvailable,
    loading: availLoading,
  };

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      // Two-step lookup: profiles.user_id → profiles.id
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, ts_profile_code")
        .eq("user_id", user.id)
        .single();
      if (!profile) return;
      setContractorId(profile.id);
      setTsCode(profile.ts_profile_code);

      if (profile.ts_profile_code) {
        const { data: pub } = await supabase
          .from("public_pro_profiles")
          .select("full_name, company_name, ts_profile_code, bio, trades, location, working_radius, avatar_url, logo_url, is_verified, rating, review_count, completed_jobs, years_experience, hourly_rate")
          .eq("ts_profile_code", profile.ts_profile_code)
          .single();
        if (pub) setPublicProfile(pub as PublicProfile);
      }

      // contractor_photos uses user_id FK directly
      const { data: photoData } = await supabase
        .from("contractor_photos")
        .select("id, photo_url, title")
        .eq("contractor_id", user.id)
        .order("display_order", { ascending: true });
      setPhotos(photoData ?? []);

      // team_members uses user_id FK directly
      const { data: teamData } = await supabase
        .from("team_members")
        .select("id, full_name, role")
        .eq("contractor_id", user.id)
        .eq("is_active", true);
      setTeam(teamData ?? []);

      // job_reviews uses profiles.id FK (two-step)
      const { data: reviewData } = await supabase
        .from("job_reviews")
        .select("id, rating, comment, created_at")
        .eq("contractor_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(5);
      setReviews(reviewData ?? []);
    };
    load();
  }, []);

  const handlePublish = async () => {
    await saveWidgets();
    toast({ title: "Profile updated", description: "Your profile layout has been saved." });
  };

  const handleDragStart = (index: number, key: WidgetKey) => {
    setDragIndex(index);
    dragKeyRef.current = key;
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  };

  const handleDrop = (index: number) => {
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    const order = widgets.map(w => w.widget_key);
    const [moved] = order.splice(dragIndex, 1);
    order.splice(index, 0, moved);
    reorderWidgets(order);
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const blockData: WidgetBlockData = {
    profile: publicProfile,
    photos,
    credentials: credentials.map(c => ({
      id: c.id,
      name: c.name,
      issuer: c.issuer,
      reference_number: c.reference_number,
      verified: c.verified,
    })),
    reviews,
    team,
    availability: availabilityInfo,
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden", background: "#f4f4f0" }}>

      {/* ── Left panel ── */}
      <div style={{
        width: 260, background: "white", flexShrink: 0,
        display: "flex", flexDirection: "column",
        borderRight: "1px solid #e5e7eb", overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{ padding: "18px 16px 14px", borderBottom: "1px solid #f3f4f6" }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1a2744", marginBottom: 2 }}>Profile editor</div>
          <div style={{ fontSize: 12, color: "#9ca3af" }}>Toggle and reorder your sections</div>
        </div>

        {/* Action buttons */}
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #f3f4f6", display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            onClick={handlePublish}
            disabled={saving}
            style={{
              background: saving ? "#f5a96d" : "#f07820", color: "white", border: "none",
              borderRadius: 6, padding: "9px 14px", fontSize: 13, fontWeight: 600,
              cursor: saving ? "default" : "pointer", fontFamily: "inherit", width: "100%",
            }}
          >
            {saving ? "Saving..." : "Publish changes"}
          </button>
          {tsCode && (
            <button
              onClick={() => window.open(`/contractor/${tsCode}`, "_blank")}
              style={{
                background: "white", color: "#374151", border: "1px solid #d1d5db",
                borderRadius: 6, padding: "9px 14px", fontSize: 13, fontWeight: 500,
                cursor: "pointer", fontFamily: "inherit", width: "100%",
              }}
            >
              Preview as client
            </button>
          )}
        </div>

        {/* Fixed hero row */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "9px 12px",
          background: "#fafafa",
          borderBottom: "1px solid #f3f4f6",
        }}>
          <i className="ti ti-grip-vertical" style={{ fontSize: 16, color: "#e5e7eb", flexShrink: 0 }} />
          <i className="ti ti-id-badge" style={{ fontSize: 16, color: "#1a2744", flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 13, color: "#374151", fontWeight: 500 }}>Hero / identity</span>
          <span style={{ fontSize: 10, color: "#9ca3af", background: "#f3f4f6", padding: "2px 8px", borderRadius: 10 }}>
            Required
          </span>
        </div>

        {/* Draggable widget list */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {widgets.map((w, i) => (
            <WidgetRow
              key={w.widget_key}
              widgetKey={w.widget_key}
              isEnabled={w.is_enabled}
              onToggle={() => toggleWidget(w.widget_key)}
              onDragStart={() => handleDragStart(i, w.widget_key)}
              onDragOver={(e) => handleDragOver(e, i)}
              onDrop={() => handleDrop(i)}
              onDragEnd={handleDragEnd}
              isDragOver={dragOverIndex === i && dragIndex !== i}
            />
          ))}
        </div>
      </div>

      {/* ── Right preview panel ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px" }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <HeroBlock profile={publicProfile} availability={availabilityInfo} isPreview />

          {widgets
            .filter(w => w.is_enabled)
            .map(w => (
              <WidgetBlock key={w.widget_key} widgetKey={w.widget_key} data={blockData} />
            ))
          }

          <EnquireBlock onEnquire={() => {}} disabled />
        </div>
      </div>
    </div>
  );
}
