// SQL required: ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cover_url text;
// SQL required: CREATE STORAGE BUCKET covers (public: true) — run in Supabase dashboard

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
  const { credentials, addCredential, deleteCredential } = useContractorCredentials();
  const { toast } = useToast();

  // Profile + supplementary data for preview
  const [contractorId, setContractorId] = useState("");
  const [userId, setUserId] = useState("");
  const [tsCode, setTsCode] = useState<string | null>(null);
  const [publicProfile, setPublicProfile] = useState<PublicProfile | null>(null);
  const [photos, setPhotos] = useState<ProfilePhoto[]>([]);
  const [reviews, setReviews] = useState<ProfileReview[]>([]);
  const [team, setTeam] = useState<ProfileTeamMember[]>([]);

  // Cover image
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // Credential form
  const [credName, setCredName] = useState("");
  const [credIssuer, setCredIssuer] = useState("");
  const [credRef, setCredRef] = useState("");
  const [credAdding, setCredAdding] = useState(false);

  // Photo upload
  const [photoUploading, setPhotoUploading] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

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

      // cover_url: requires ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cover_url text
      const { data: coverRow } = await (supabase as any)
        .from("profiles")
        .select("cover_url")
        .eq("user_id", user.id)
        .single();
      if (coverRow?.cover_url) setCoverUrl(coverRow.cover_url as string);

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

  const handleCoverUpload = async (file: File) => {
    if (!userId) return;
    setCoverUploading(true);
    const { error: uploadError } = await supabase.storage
      .from("covers")
      .upload(`${userId}/cover.jpg`, file, { upsert: true, contentType: file.type });
    if (uploadError) {
      toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
      setCoverUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from("covers").getPublicUrl(`${userId}/cover.jpg`);
    const url = urlData.publicUrl;
    await (supabase as any).from("profiles").update({ cover_url: url }).eq("user_id", userId);
    setCoverUrl(url);
    setCoverUploading(false);
  };

  const handleAddCredential = async () => {
    if (!credName.trim() || credAdding) return;
    setCredAdding(true);
    await addCredential({
      name: credName.trim(),
      issuer: credIssuer.trim() || null,
      reference_number: credRef.trim() || null,
      verified: false,
      display_order: credentials.length,
    });
    setCredName("");
    setCredIssuer("");
    setCredRef("");
    setCredAdding(false);
  };

  const handlePhotoUpload = async (file: File) => {
    if (!userId) return;
    setPhotoUploading(true);
    const timestamp = Date.now();
    const path = `${userId}/${timestamp}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from("contractor-photos")
      .upload(path, file, { upsert: false, contentType: file.type });
    if (uploadError) {
      toast({ title: "Upload failed", description: uploadError.message, variant: "destructive" });
      setPhotoUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from("contractor-photos").getPublicUrl(path);
    const { data: inserted } = await supabase
      .from("contractor_photos")
      .insert({
        contractor_id: userId,
        photo_url: urlData.publicUrl,
        display_order: photos.length,
      })
      .select()
      .single();
    if (inserted) setPhotos(prev => [...prev, { id: inserted.id, photo_url: inserted.photo_url, title: inserted.title }]);
    setPhotoUploading(false);
  };

  const handleDeletePhoto = async (photoId: string, photoUrl: string) => {
    const pathSegment = photoUrl.split("/contractor-photos/")[1];
    if (pathSegment) {
      await supabase.storage.from("contractor-photos").remove([pathSegment]);
    }
    await supabase.from("contractor_photos").delete().eq("id", photoId);
    setPhotos(prev => prev.filter(p => p.id !== photoId));
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
          flexShrink: 0,
        }}>
          <i className="ti ti-grip-vertical" style={{ fontSize: 16, color: "#e5e7eb", flexShrink: 0 }} />
          <i className="ti ti-id-badge" style={{ fontSize: 16, color: "#1a2744", flexShrink: 0 }} />
          <span style={{ flex: 1, fontSize: 13, color: "#374151", fontWeight: 500 }}>Hero / identity</span>
          <span style={{ fontSize: 10, color: "#9ca3af", background: "#f3f4f6", padding: "2px 8px", borderRadius: 10 }}>
            Required
          </span>
        </div>

        {/* Cover image section */}
        <div style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6", flexShrink: 0 }}>
          <div style={{
            fontSize: 10, fontWeight: 600, color: "#6b7280",
            textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 6,
          }}>
            Cover image
          </div>
          <div style={{
            width: "100%", height: 72, borderRadius: 6, overflow: "hidden",
            background: "#1a2744",
            backgroundImage: coverUrl ? `url(${coverUrl})` : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
            marginBottom: 6,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {!coverUrl && (
              <i className="ti ti-photo" style={{ fontSize: 22, color: "rgba(255,255,255,0.25)" }} />
            )}
          </div>
          <input
            ref={coverInputRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={e => { const f = e.target.files?.[0]; if (f) handleCoverUpload(f); e.target.value = ""; }}
          />
          <button
            onClick={() => coverInputRef.current?.click()}
            disabled={coverUploading}
            style={{
              width: "100%", background: "none",
              color: coverUploading ? "#bbb" : "#374151",
              border: "1px solid #d1d5db", borderRadius: 5, padding: "6px 10px",
              fontSize: 12, fontWeight: 500,
              cursor: coverUploading ? "default" : "pointer",
              fontFamily: "inherit",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
            }}
          >
            <i className="ti ti-upload" style={{ fontSize: 13 }} />
            {coverUploading ? "Uploading..." : "Upload cover image"}
          </button>
        </div>

        {/* Scrollable area: widget rows + credentials + photos */}
        <div style={{ flex: 1, overflowY: "auto" }}>

          {/* Draggable widget rows */}
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

          {/* Credentials section */}
          <div style={{ padding: "10px 12px 8px", borderTop: "2px solid #f3f4f6" }}>
            <div style={{
              fontSize: 10, fontWeight: 600, color: "#6b7280",
              textTransform: "uppercase", letterSpacing: "0.07em",
              marginBottom: 8,
              display: "flex", alignItems: "center", gap: 5,
            }}>
              <i className="ti ti-certificate" style={{ fontSize: 13, color: "#f07820" }} />
              Credentials
            </div>

            {credentials.length === 0 && (
              <div style={{ fontSize: 12, color: "#bbb", fontStyle: "italic", marginBottom: 8 }}>
                No credentials added.
              </div>
            )}
            {credentials.map(c => (
              <div key={c.id} style={{
                display: "flex", alignItems: "flex-start", gap: 7,
                padding: "6px 0", borderBottom: "1px solid #f3f4f6",
              }}>
                <i className="ti ti-certificate" style={{ fontSize: 14, color: "#f07820", flexShrink: 0, marginTop: 1 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#1a2744", lineHeight: 1.3 }}>{c.name}</div>
                  {c.issuer && <div style={{ fontSize: 11, color: "#9ca3af" }}>{c.issuer}</div>}
                  {c.reference_number && (
                    <div style={{ fontSize: 10, color: "#bbb", fontFamily: "'Roboto Mono', monospace" }}>
                      {c.reference_number}
                    </div>
                  )}
                </div>
                {c.verified && (
                  <i className="ti ti-circle-check" style={{ fontSize: 14, color: "#16a34a", flexShrink: 0, marginTop: 1 }} />
                )}
                <button
                  onClick={() => deleteCredential(c.id)}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    padding: "2px 3px", color: "#d1d5db", flexShrink: 0,
                    display: "flex", alignItems: "center",
                  }}
                  aria-label="Delete credential"
                >
                  <i className="ti ti-trash" style={{ fontSize: 14 }} />
                </button>
              </div>
            ))}

            {/* Add credential form */}
            <div style={{ marginTop: 10 }}>
              <input
                value={credName}
                onChange={e => setCredName(e.target.value)}
                placeholder="Credential name"
                style={{
                  width: "100%", padding: "5px 8px", fontSize: 12,
                  border: "1px solid #e5e7eb", borderRadius: 5,
                  fontFamily: "inherit", color: "#374151", marginBottom: 4,
                  boxSizing: "border-box", outline: "none",
                }}
              />
              <input
                value={credIssuer}
                onChange={e => setCredIssuer(e.target.value)}
                placeholder="Issuer (optional)"
                style={{
                  width: "100%", padding: "5px 8px", fontSize: 12,
                  border: "1px solid #e5e7eb", borderRadius: 5,
                  fontFamily: "inherit", color: "#374151", marginBottom: 4,
                  boxSizing: "border-box", outline: "none",
                }}
              />
              <input
                value={credRef}
                onChange={e => setCredRef(e.target.value)}
                placeholder="Reference number (optional)"
                onKeyDown={e => { if (e.key === "Enter") handleAddCredential(); }}
                style={{
                  width: "100%", padding: "5px 8px", fontSize: 12,
                  border: "1px solid #e5e7eb", borderRadius: 5,
                  fontFamily: "inherit", color: "#374151", marginBottom: 6,
                  boxSizing: "border-box", outline: "none",
                }}
              />
              <button
                onClick={handleAddCredential}
                disabled={!credName.trim() || credAdding}
                style={{
                  width: "100%",
                  background: credName.trim() && !credAdding ? "#1a2744" : "#e5e7eb",
                  color: credName.trim() && !credAdding ? "white" : "#aaa",
                  border: "none", borderRadius: 5, padding: "7px 10px",
                  fontSize: 12, fontWeight: 600,
                  cursor: credName.trim() && !credAdding ? "pointer" : "default",
                  fontFamily: "inherit",
                }}
              >
                {credAdding ? "Adding..." : "Add credential"}
              </button>
            </div>
          </div>

          {/* Portfolio photos section */}
          <div style={{ padding: "10px 12px 14px", borderTop: "2px solid #f3f4f6" }}>
            <div style={{
              fontSize: 10, fontWeight: 600, color: "#6b7280",
              textTransform: "uppercase", letterSpacing: "0.07em",
              marginBottom: 8,
              display: "flex", alignItems: "center", gap: 5,
            }}>
              <i className="ti ti-photo" style={{ fontSize: 13, color: "#f07820" }} />
              Portfolio photos
            </div>

            {photos.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 5, marginBottom: 8 }}>
                {photos.map(p => (
                  <div key={p.id} style={{ position: "relative", aspectRatio: "1 / 1", borderRadius: 4, overflow: "hidden", background: "#eee" }}>
                    <img
                      src={p.photo_url}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    />
                    <button
                      onClick={() => handleDeletePhoto(p.id, p.photo_url)}
                      style={{
                        position: "absolute", top: 2, right: 2,
                        background: "rgba(0,0,0,0.55)", border: "none",
                        borderRadius: 3, color: "white", cursor: "pointer",
                        padding: "2px 4px",
                        display: "flex", alignItems: "center", justifyContent: "center",
                      }}
                      aria-label="Delete photo"
                    >
                      <i className="ti ti-trash" style={{ fontSize: 11 }} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={e => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f); e.target.value = ""; }}
            />
            <button
              onClick={() => photoInputRef.current?.click()}
              disabled={photoUploading}
              style={{
                width: "100%", background: "none",
                color: photoUploading ? "#bbb" : "#374151",
                border: "1px solid #d1d5db", borderRadius: 5, padding: "6px 10px",
                fontSize: 12, fontWeight: 500,
                cursor: photoUploading ? "default" : "pointer",
                fontFamily: "inherit",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
              }}
            >
              <i className="ti ti-plus" style={{ fontSize: 13 }} />
              {photoUploading ? "Uploading..." : "Add photo"}
            </button>
          </div>

        </div>
      </div>

      {/* ── Right preview panel ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px" }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <HeroBlock profile={publicProfile} availability={availabilityInfo} isPreview coverUrl={coverUrl} />

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
