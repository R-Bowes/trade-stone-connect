import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useHelpSystem, type UserRole, type FeatureAnnouncement } from "./HelpSystemProvider";

const FEATURES: Record<UserRole, string[]> = {
  personal: [
    "Find and contact contractors by trade and location",
    "Browse contractor profiles, reviews, and availability",
    "Send enquiries and receive itemised quotes",
    "Accept, negotiate schedule, or decline quotes",
    "Track job progress stage by stage",
    "View contractor-uploaded job photos",
    "Message your contractor directly",
    "Review and pay invoices securely through TradeStone",
    "Full payment and job history",
  ],
  contractor: [
    "Public profile visible to homeowners searching by trade",
    "Receive and respond to job enquiries",
    "Send quotes with pricing and proposed schedule",
    "Manage active jobs with stage progression",
    "Job photo documentation",
    "Direct client messaging",
    "Raise and send invoices",
    "Receive payments through TradeStone",
    "Availability and scheduling management",
    "Compliance document storage",
  ],
  business: [
    "Company profile and branding",
    "Approved contractor panel",
    "Raise jobs to panel contractors",
    "Quote approval before work begins",
    "Job tracking across all sites",
    "Sites and asset register with service history",
    "SLA tracking and alerting",
    "Compliance monitoring for panel contractors",
    "Consolidated invoicing and spend reporting",
    "Multi-user access (coming soon)",
  ],
};

const TOUR_SUBTITLES: Record<UserRole, string> = {
  personal: "A quick walkthrough of finding contractors, requesting quotes, and managing your jobs.",
  contractor: "A step-by-step guide to setting up your profile, responding to enquiries, and getting paid.",
  business: "Learn how to build your panel, raise jobs, and stay across your whole portfolio.",
};

export default function HelpModal() {
  const { activeModal, role, close, openTutorial } = useHelpSystem();
  const [recentAnnouncements, setRecentAnnouncements] = useState<FeatureAnnouncement[]>([]);
  const [announcementsLoading, setAnnouncementsLoading] = useState(false);

  useEffect(() => {
    if (activeModal !== "help") return;

    let cancelled = false;
    setAnnouncementsLoading(true);

    supabase
      .from("feature_announcements")
      .select("id, title, description, applies_to, released_at")
      .contains("applies_to", [role])
      .order("released_at", { ascending: false })
      .limit(3)
      .then(({ data }) => {
        if (!cancelled) {
          setRecentAnnouncements((data ?? []) as FeatureAnnouncement[]);
          setAnnouncementsLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [activeModal, role]);

  if (activeModal !== "help") return null;

  const handleStartTour = () => {
    close();
    openTutorial();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(0,0,0,0.40)",
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-end",
      }}
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 360,
          height: "100%",
          background: "#fff",
          borderLeft: "1px solid #e6e9ef",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
          boxShadow: "-4px 0 24px rgba(0,0,0,0.12)",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "18px 20px",
            borderBottom: "1px solid #eef0f4",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: "'Lexend', sans-serif",
              fontWeight: 600,
              fontSize: 16,
              color: "#1a2744",
            }}
          >
            How to use TradeStone
          </span>
          <button
            onClick={close}
            aria-label="Close"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#9ca3af",
              padding: 4,
              display: "flex",
              alignItems: "center",
              borderRadius: 4,
            }}
          >
            <i className="ti ti-x" style={{ fontSize: 18, lineHeight: 1 }} />
          </button>
        </div>

        <div style={{ flex: 1, padding: "20px 20px 32px", display: "flex", flexDirection: "column", gap: 28 }}>
          {/* Section 1: Your features */}
          <section>
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.07em",
                color: "#9ca3af",
                textTransform: "uppercase",
                marginBottom: 12,
              }}
            >
              Your features
            </p>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              {FEATURES[role].map((item) => (
                <li key={item} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                  <i
                    className="ti ti-circle-check"
                    style={{ fontSize: 16, color: "#f07820", flexShrink: 0, lineHeight: "20px" }}
                  />
                  <span style={{ fontSize: 13, color: "#1a2744", lineHeight: "20px" }}>{item}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* Section 2: Guided tour */}
          <section>
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.07em",
                color: "#9ca3af",
                textTransform: "uppercase",
                marginBottom: 12,
              }}
            >
              Guided tour
            </p>
            <div
              style={{
                background: "#f7f8fb",
                border: "1px solid #e6e9ef",
                borderRadius: 10,
                padding: "16px 16px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <p
                  style={{
                    fontFamily: "'Lexend', sans-serif",
                    fontWeight: 600,
                    fontSize: 13,
                    color: "#1a2744",
                    margin: "0 0 4px",
                  }}
                >
                  Take the guided tour
                </p>
                <p
                  style={{
                    fontFamily: "'Source Serif 4', serif",
                    fontSize: 12,
                    color: "#6b7280",
                    margin: 0,
                    lineHeight: 1.5,
                  }}
                >
                  {TOUR_SUBTITLES[role]}
                </p>
              </div>
              <button
                onClick={handleStartTour}
                style={{
                  background: "#f07820",
                  color: "#fff",
                  border: "none",
                  borderRadius: 8,
                  padding: "8px 14px",
                  fontSize: 13,
                  fontFamily: "'Lexend', sans-serif",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  flexShrink: 0,
                  whiteSpace: "nowrap",
                }}
              >
                <i className="ti ti-player-play" style={{ fontSize: 14, lineHeight: 1 }} />
                Start
              </button>
            </div>
          </section>

          {/* Section 3: What's new (independent query) */}
          <section>
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.07em",
                color: "#9ca3af",
                textTransform: "uppercase",
                marginBottom: 12,
              }}
            >
              What's new
            </p>
            {announcementsLoading ? (
              <p style={{ fontSize: 12, color: "#9ca3af" }}>Loading...</p>
            ) : recentAnnouncements.length === 0 ? (
              <p
                style={{
                  fontFamily: "'Source Serif 4', serif",
                  fontSize: 13,
                  color: "#9ca3af",
                  fontStyle: "italic",
                }}
              >
                You're all up to date
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {recentAnnouncements.map((ann) => (
                  <div key={ann.id} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <div
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: "50%",
                        background: "#fff3e8",
                        border: "1.5px solid #f0c89a",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <i className="ti ti-sparkles" style={{ fontSize: 16, color: "#f07820", lineHeight: 1 }} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p
                        style={{
                          fontFamily: "'Lexend', sans-serif",
                          fontWeight: 500,
                          fontSize: 13,
                          color: "#1a2744",
                          margin: "0 0 2px",
                        }}
                      >
                        {ann.title}
                      </p>
                      {ann.description && (
                        <p
                          style={{
                            fontFamily: "'Source Serif 4', serif",
                            fontSize: 12,
                            color: "#6b7280",
                            margin: 0,
                            lineHeight: 1.5,
                          }}
                        >
                          {ann.description}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
