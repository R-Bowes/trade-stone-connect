import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Header from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import SidebarHelpButton from "@/components/help/SidebarHelpButton";
import TutorialModal from "@/components/help/TutorialModal";
import HelpModal from "@/components/help/HelpModal";
import WhatIsNewModal from "@/components/help/WhatIsNewModal";

interface NavItem {
  value: string;
  label: string;
  icon: string;
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    group: "Overview",
    items: [
      { value: "dashboard", label: "Dashboard", icon: "ti-layout-dashboard" },
    ],
  },
  {
    group: "Work",
    items: [
      { value: "enquiries", label: "Enquiries", icon: "ti-message-question" },
      { value: "issued-quotes", label: "Issued quotes", icon: "ti-file-text" },
      { value: "jobs", label: "Jobs", icon: "ti-briefcase" },
      { value: "messages", label: "Messages", icon: "ti-message" },
      { value: "projects", label: "Projects", icon: "ti-folder" },
      { value: "contracts", label: "Contracts", icon: "ti-writing" },
      { value: "panel-invites", label: "Panel invites", icon: "ti-building" },
    ],
  },
  {
    group: "Schedule & Team",
    items: [
      { value: "schedule", label: "Schedule", icon: "ti-calendar" },
      { value: "service-visits", label: "Service visits", icon: "ti-tools" },
      { value: "team", label: "Team", icon: "ti-users" },
      { value: "timesheets", label: "Timesheets", icon: "ti-clock" },
    ],
  },
  {
    group: "Money",
    items: [
      { value: "invoices", label: "Invoices", icon: "ti-receipt" },
      { value: "financials", label: "Financials", icon: "ti-chart-bar" },
    ],
  },
  {
    group: "Business",
    items: [
      { value: "clients", label: "CRM", icon: "ti-address-book" },
      { value: "photos", label: "Photos", icon: "ti-photo" },
      { value: "documents", label: "Documents", icon: "ti-files" },
      { value: "canvas-editor", label: "Profile editor", icon: "ti-layout-columns" },
      { value: "share-profile", label: "Share profile", icon: "ti-qrcode" },
    ],
  },
];

const VIEW_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  enquiries: "Enquiries",
  "issued-quotes": "Issued Quotes",
  jobs: "Jobs",
  messages: "Messages",
  projects: "Projects",
  contracts: "Contracts",
  "panel-invites": "Panel Invites",
  schedule: "Schedule",
  "service-visits": "Service Visits",
  team: "Team",
  timesheets: "Timesheets",
  invoices: "Invoices",
  financials: "Financials",
  clients: "CRM",
  photos: "Photos",
  documents: "Documents",
  profile: "Profile",
  "canvas-editor": "Profile Editor",
  "profile-editor": "Profile Editor",
  "share-profile": "Share profile",
  "business-card-editor": "Business card editor",
};

const VIEW_SUBTITLES: Record<string, string> = {
  dashboard: "Your business at a glance",
  enquiries: "Review new requests, send a quote or ask for more details before committing",
  "issued-quotes": "Chase outstanding quotes or review what's been accepted",
  jobs: "Move jobs through stages, assign team members and message clients",
  messages: "All conversations with your clients in one place",
  projects: "Track multi-stage work, manage proposals and monitor budgets",
  contracts: "View contract terms, renewal dates and linked service visits",
  "panel-invites": "Accept or decline invitations to join a business's contractor panel",
  schedule: "See what's coming up and block time off to manage your availability",
  "service-visits": "Log visit outcomes, upload photos and mark visits complete",
  team: "Add team members, set their role and daily rate",
  timesheets: "Review hours logged by you and your team against each job",
  invoices: "Send invoices, track what's paid and chase outstanding amounts",
  financials: "See your earnings over time and understand where your money is coming from",
  clients: "Keep track of clients, note key contacts and log important conversations",
  photos: "Browse job photos by project or upload new ones from site",
  documents: "Store and share certificates, contracts and compliance documents",
  "share-profile": "Download branded assets to use on your van, business cards, and emails",
  "business-card-editor": "Design and download your branded business cards",
};

interface ContractorLayoutProps {
  children: React.ReactNode;
}

interface SidebarProfile {
  full_name: string;
  ts_profile_code: string | null;
  logo_url: string | null;
}

const ContractorLayout = ({ children }: ContractorLayoutProps) => {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    return localStorage.getItem("sb_collapsed") === "true";
  });
  const [profile, setProfile] = useState<SidebarProfile | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 767px)").matches : false
  );
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activeView = searchParams.get("view") ?? "dashboard";

  useEffect(() => {
    localStorage.setItem("sb_collapsed", String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 767px)");
    const handleChange = () => setIsMobile(mql.matches);
    mql.addEventListener("change", handleChange);
    return () => mql.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("full_name, ts_profile_code, logo_url")
        .eq("user_id", user.id)
        .single();
      if (data) setProfile(data as SidebarProfile);
    };
    loadProfile();
  }, []);

  const handleNav = (value: string) => {
    navigate(`/dashboard/contractor?view=${value}`);
    setMobileOpen(false);
  };

  const effectiveCollapsed = isMobile ? false : collapsed;

  const initials = profile?.full_name
    ? profile.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "—";

  const currentTitle = VIEW_LABELS[activeView] ?? "Dashboard";
  const currentSubtitle = VIEW_SUBTITLES[activeView];

  return (
    <>
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* Mobile backdrop */}
      {isMobile && mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 49,
            background: "rgba(0,0,0,0.4)",
          }}
        />
      )}

      {/* Sidebar */}
      <aside
        style={
          isMobile
            ? {
                position: "fixed",
                top: 0,
                left: 0,
                height: "100vh",
                width: 280,
                zIndex: 50,
                transform: mobileOpen ? "translateX(0)" : "translateX(-100%)",
                transition: "transform 0.25s ease",
                background: "#1a2744",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }
            : {
                width: collapsed ? 52 : 220,
                transition: "width 0.2s ease",
                background: "#1a2744",
                display: "flex",
                flexDirection: "column",
                flexShrink: 0,
                overflow: "hidden",
              }
        }
      >
        {/* Toggle row */}
        <div
          style={{
            padding: "12px 10px",
            display: "flex",
            alignItems: "center",
            justifyContent: isMobile ? "flex-end" : "flex-start",
            flexShrink: 0,
          }}
        >
          {isMobile ? (
            <button
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "rgba(255,255,255,0.8)",
                padding: 4,
                borderRadius: 4,
                display: "flex",
                alignItems: "center",
                flexShrink: 0,
                lineHeight: 1,
                fontSize: 22,
              }}
            >
              ×
            </button>
          ) : (
            <button
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "rgba(255,255,255,0.8)",
                padding: 4,
                borderRadius: 4,
                display: "flex",
                alignItems: "center",
                flexShrink: 0,
                lineHeight: 1,
              }}
            >
              <i className="ti ti-menu-2" style={{ fontSize: 20 }} />
            </button>
          )}
        </div>

        {/* Profile block */}
        <div
          style={{
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            padding: effectiveCollapsed ? "10px 0 12px" : "0 10px 14px",
            display: "flex",
            flexDirection: effectiveCollapsed ? "column" : "row",
            alignItems: "center",
            gap: effectiveCollapsed ? 0 : 10,
            overflow: "hidden",
            flexShrink: 0,
            justifyContent: effectiveCollapsed ? "center" : "flex-start",
          }}
        >
          {/* Avatar / logo circle */}
          {profile?.logo_url ? (
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 6,
                border: "2px solid #f07820",
                background: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                overflow: "hidden",
              }}
            >
              <img
                src={profile.logo_url}
                alt={profile?.full_name ?? ""}
                style={{ maxHeight: 28, maxWidth: 28, objectFit: "contain" }}
              />
            </div>
          ) : (
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                border: "2px solid #f07820",
                background: "#1e3a5f",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                color: "white",
                fontSize: 13,
                fontWeight: 700,
                userSelect: "none",
              }}
            >
              {initials}
            </div>
          )}
          {!effectiveCollapsed && profile && (
            <div style={{ overflow: "hidden", minWidth: 0 }}>
              <div
                style={{
                  color: "white",
                  fontSize: 13,
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {profile.full_name}
              </div>
              {profile.ts_profile_code && (
                <div
                  style={{
                    color: "rgba(255,255,255,0.45)",
                    fontSize: 11,
                    fontFamily: "'Roboto Mono', monospace",
                    whiteSpace: "nowrap",
                  }}
                >
                  {profile.ts_profile_code}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Nav */}
        <nav
          style={{
            flex: 1,
            overflowY: "auto",
            overflowX: "hidden",
            padding: "8px 0",
          }}
        >
          {NAV_GROUPS.map((group) => (
            <div key={group.group}>
              {!effectiveCollapsed && (
                <div
                  style={{
                    padding: "8px 12px 4px",
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    color: "rgba(255,255,255,0.35)",
                    textTransform: "uppercase",
                    userSelect: "none",
                  }}
                >
                  {group.group}
                </div>
              )}
              {group.items.map((item) => {
                const isActive = activeView === item.value;
                return (
                  <button
                    key={item.value}
                    onClick={() => handleNav(item.value)}
                    title={effectiveCollapsed ? item.label : undefined}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      padding: effectiveCollapsed ? "9px 0" : "7px 12px",
                      justifyContent: effectiveCollapsed ? "center" : "flex-start",
                      background: isActive
                        ? "rgba(240,120,32,0.18)"
                        : "transparent",
                      border: "none",
                      borderLeft: isActive
                        ? "3px solid #f07820"
                        : "3px solid transparent",
                      cursor: "pointer",
                      color: isActive
                        ? "#f07820"
                        : "rgba(255,255,255,0.72)",
                      fontSize: 13,
                      fontFamily: "inherit",
                      transition: "background 0.15s, color 0.15s",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textAlign: "left",
                      boxSizing: "border-box",
                    }}
                  >
                    <i
                      className={`ti ${item.icon}`}
                      style={{ fontSize: 18, flexShrink: 0, lineHeight: 1 }}
                    />
                    {!effectiveCollapsed && <span>{item.label}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <SidebarHelpButton collapsed={effectiveCollapsed} />
      </aside>

      {/* Main column */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minWidth: 0,
          width: isMobile ? "100vw" : undefined,
        }}
      >
        <div style={{ display: isMobile ? "none" : "block" }}>
          <Header />
        </div>
        {/* Topbar: current view title */}
        <div
          style={{
            padding: "10px 24px",
            borderBottom: "1px solid #e5e7eb",
            background: "white",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          {isMobile && (
            <button
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
              style={{
                width: 40,
                height: 40,
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#1a2744",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                padding: 0,
              }}
            >
              <i className="ti ti-menu" style={{ fontSize: 22 }} />
            </button>
          )}
          <div>
            <h1
              className="font-heading text-2xl font-bold"
              data-tour="dashboard-header"
              style={{ margin: 0 }}
            >
              {currentTitle}
            </h1>
            {currentSubtitle && (
              <p
                style={{
                  margin: 0,
                  fontSize: "0.8rem",
                  color: "#6b7280",
                  fontFamily: "Lexend, sans-serif",
                  fontWeight: 400,
                  lineHeight: 1.4,
                }}
              >
                {currentSubtitle}
              </p>
            )}
          </div>
        </div>
        <main style={{ flex: 1, overflowY: "auto" }}>{children}</main>
      </div>
    </div>
    <TutorialModal />
    <HelpModal />
    <WhatIsNewModal />
    </>
  );
};

export default ContractorLayout;
