import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Header from "@/components/Header";
import { supabase } from "@/integrations/supabase/client";
import "@tabler/icons-webfont/dist/tabler-icons.css";

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
    ],
  },
];

const VIEW_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  enquiries: "Enquiries",
  "issued-quotes": "Issued Quotes",
  jobs: "Jobs",
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
};

interface ContractorLayoutProps {
  children: React.ReactNode;
}

interface SidebarProfile {
  full_name: string;
  ts_profile_code: string | null;
}

const ContractorLayout = ({ children }: ContractorLayoutProps) => {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    return localStorage.getItem("sb_collapsed") === "true";
  });
  const [profile, setProfile] = useState<SidebarProfile | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activeView = searchParams.get("view") ?? "dashboard";

  useEffect(() => {
    localStorage.setItem("sb_collapsed", String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("full_name, ts_profile_code")
        .eq("user_id", user.id)
        .single();
      if (data) setProfile(data as SidebarProfile);
    };
    loadProfile();
  }, []);

  const handleNav = (value: string) => {
    navigate(`/dashboard/contractor?view=${value}`);
  };

  const initials = profile?.full_name
    ? profile.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "—";

  const currentTitle = VIEW_LABELS[activeView] ?? "Dashboard";

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* Sidebar */}
      <aside
        style={{
          width: collapsed ? 52 : 220,
          transition: "width 0.2s ease",
          background: "#1a2744",
          display: "flex",
          flexDirection: "column",
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        {/* Toggle + wordmark */}
        <div
          style={{
            padding: "12px 10px",
            display: "flex",
            alignItems: "center",
            gap: 8,
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            flexShrink: 0,
          }}
        >
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
          {!collapsed && (
            <span
              style={{
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 700,
                fontSize: 22,
                letterSpacing: 1,
                whiteSpace: "nowrap",
                overflow: "hidden",
                lineHeight: 1,
              }}
            >
              <span style={{ color: "rgba(255,255,255,0.95)" }}>TRADE</span>
              <span style={{ color: "#f07820" }}>STONE</span>
            </span>
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
              {!collapsed && (
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
                    title={collapsed ? item.label : undefined}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      padding: collapsed ? "9px 0" : "7px 12px",
                      justifyContent: collapsed ? "center" : "flex-start",
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
                    {!collapsed && <span>{item.label}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Profile footer */}
        <div
          style={{
            borderTop: "1px solid rgba(255,255,255,0.08)",
            padding: "12px 10px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              border: "2px solid #f07820",
              background: "#1e3a5f",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              color: "white",
              fontSize: 12,
              fontWeight: 700,
              userSelect: "none",
            }}
          >
            {initials}
          </div>
          {!collapsed && profile && (
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
      </aside>

      {/* Main column */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minWidth: 0,
        }}
      >
        <Header />
        {/* Topbar: current view title */}
        <div
          style={{
            padding: "10px 24px",
            borderBottom: "1px solid #e5e7eb",
            background: "white",
            flexShrink: 0,
          }}
        >
          <h1
            className="font-heading text-2xl font-bold"
            data-tour="dashboard-header"
            style={{ margin: 0 }}
          >
            {currentTitle}
          </h1>
        </div>
        <main style={{ flex: 1, overflowY: "auto" }}>{children}</main>
      </div>
    </div>
  );
};

export default ContractorLayout;
