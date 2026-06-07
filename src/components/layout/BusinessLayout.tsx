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
      { value: "jobs",      label: "Jobs",      icon: "ti-briefcase" },
      { value: "approvals", label: "Approvals", icon: "ti-circle-check" },
    ],
  },
  {
    group: "Sites & Assets",
    items: [
      { value: "sites",  label: "Sites",          icon: "ti-building-skyscraper" },
      { value: "assets", label: "Asset register", icon: "ti-tools" },
    ],
  },
  {
    group: "Contractors",
    items: [
      { value: "panel",      label: "Panel",      icon: "ti-users-group" },
      { value: "compliance", label: "Compliance", icon: "ti-shield-check" },
    ],
  },
  {
    group: "Money",
    items: [
      { value: "invoices", label: "Invoices", icon: "ti-receipt" },
      { value: "spend",    label: "Spend",    icon: "ti-chart-bar" },
    ],
  },
  {
    group: "Account",
    items: [
      { value: "messages", label: "Messages", icon: "ti-messages" },
      { value: "settings", label: "Settings", icon: "ti-settings" },
    ],
  },
];

const VIEW_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  jobs:       "Jobs",
  approvals:  "Approvals",
  sites:      "Sites",
  assets:     "Asset Register",
  panel:      "Contractor Panel",
  compliance: "Compliance",
  invoices:   "Invoices",
  spend:      "Spend",
  messages:   "Messages",
  settings:   "Settings",
};

interface BusinessLayoutProps {
  children: React.ReactNode;
}

interface SidebarProfile {
  company_name: string;
  ts_profile_code: string | null;
  logo_url: string | null;
}

const BusinessLayout = ({ children }: BusinessLayoutProps) => {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    return localStorage.getItem("biz_collapsed") === "true";
  });
  const [profile, setProfile] = useState<SidebarProfile | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const activeView = searchParams.get("view") ?? "dashboard";

  useEffect(() => {
    localStorage.setItem("biz_collapsed", String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    const loadProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: profileRow } = await supabase
        .from("profiles")
        .select("id, ts_profile_code, logo_url")
        .eq("user_id", user.id)
        .single();
      if (!profileRow) return;

      const { data: company } = await supabase
        .from("companies")
        .select("name")
        .eq("owner_id", profileRow.id)
        .maybeSingle();

      setProfile({
        company_name: company?.name ?? "My Business",
        ts_profile_code: profileRow.ts_profile_code ?? null,
        logo_url: (profileRow as any).logo_url ?? null,
      });
    };
    loadProfile();
  }, []);

  const handleNav = (value: string) => {
    navigate(`/dashboard/business?view=${value}`);
  };

  const initials = profile?.company_name
    ? profile.company_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "B";

  const currentTitle = VIEW_LABELS[activeView] ?? "Dashboard";

  return (
    <>
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
        {/* Toggle row */}
        <div
          style={{
            padding: "12px 10px",
            display: "flex",
            alignItems: "center",
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
        </div>

        {/* Profile block */}
        <div
          style={{
            borderBottom: "1px solid rgba(255,255,255,0.08)",
            padding: collapsed ? "10px 0 12px" : "0 10px 14px",
            display: "flex",
            flexDirection: collapsed ? "column" : "row",
            alignItems: "center",
            gap: collapsed ? 0 : 10,
            overflow: "hidden",
            flexShrink: 0,
            justifyContent: collapsed ? "center" : "flex-start",
          }}
        >
          {/* Squared avatar — reads as organisation */}
          {profile?.logo_url ? (
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 4,
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
                alt={profile.company_name}
                style={{ maxHeight: 28, maxWidth: 28, objectFit: "contain" }}
              />
            </div>
          ) : (
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 4,
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
                letterSpacing: "0.03em",
              }}
            >
              {initials}
            </div>
          )}
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
                {profile.company_name}
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
                      background: isActive ? "rgba(240,120,32,0.18)" : "transparent",
                      border: "none",
                      borderLeft: isActive ? "3px solid #f07820" : "3px solid transparent",
                      cursor: "pointer",
                      color: isActive ? "#f07820" : "rgba(255,255,255,0.72)",
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

        <SidebarHelpButton collapsed={collapsed} />
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
            style={{ margin: 0 }}
          >
            {currentTitle}
          </h1>
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

export default BusinessLayout;
