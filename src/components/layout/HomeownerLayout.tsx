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
    group: "My Jobs",
    items: [
      { value: "jobs",      label: "Jobs",       icon: "ti-briefcase" },
      { value: "quotes",    label: "Quotes",     icon: "ti-file-text" },
      { value: "enquiries", label: "Enquiries",  icon: "ti-message-question" },
    ],
  },
  {
    group: "Hire",
    items: [
      { value: "find", label: "Find a contractor", icon: "ti-search" },
    ],
  },
  {
    group: "Money",
    items: [
      { value: "invoices", label: "Invoices & payments", icon: "ti-receipt" },
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
  jobs:      "Jobs",
  quotes:    "Quotes",
  enquiries: "Enquiries",
  find:      "Find a Contractor",
  invoices:  "Invoices & Payments",
  messages:  "Messages",
  settings:  "Settings",
};

interface HomeownerLayoutProps {
  children: React.ReactNode;
}

interface SidebarProfile {
  full_name: string;
  ts_profile_code: string | null;
}

const HomeownerLayout = ({ children }: HomeownerLayoutProps) => {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    return localStorage.getItem("hw_collapsed") === "true";
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
    localStorage.setItem("hw_collapsed", String(collapsed));
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
        .select("full_name, ts_profile_code")
        .eq("user_id", user.id)
        .single();
      if (data) setProfile(data as SidebarProfile);
    };
    loadProfile();
  }, []);

  const handleNav = (value: string) => {
    if (value === "find") {
      navigate("/contractors");
      setMobileOpen(false);
      return;
    }
    navigate(`/dashboard/homeowner?view=${value}`);
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
          {/* Initials avatar — homeowners have no company logo */}
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
                const isActive = item.value !== "find" && activeView === item.value;
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
        <div className="hidden md:block">
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
          <h1
            className="font-heading text-2xl font-bold"
            style={{ margin: 0 }}
          >
            {currentTitle}
          </h1>
        </div>
        <main
          style={{
            flex: 1,
            overflowY: "auto",
            paddingBottom: isMobile ? 72 : undefined,
          }}
        >
          {children}
        </main>
      </div>
    </div>

    {/* Mobile bottom tab bar */}
    {isMobile && (
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          height: 56,
          paddingBottom: "env(safe-area-inset-bottom)",
          background: "white",
          borderTop: "1px solid #e5e7eb",
          display: "flex",
          alignItems: "center",
          zIndex: 40,
        }}
      >
        {[
          { key: "dashboard", icon: "ti-layout-dashboard", label: "Home" },
          { key: "jobs", icon: "ti-briefcase", label: "Jobs" },
          { key: "invoices", icon: "ti-file-invoice", label: "Invoices" },
          { key: "messages", icon: "ti-message", label: "Messages" },
          { key: "more", icon: "ti-menu", label: "More" },
        ].map((tab) => {
          const isActive =
            tab.key === "more"
              ? mobileOpen || !["dashboard", "jobs", "invoices", "messages"].includes(activeView)
              : !mobileOpen && activeView === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => {
                if (tab.key === "more") {
                  setMobileOpen(true);
                } else {
                  navigate(`/dashboard/homeowner?view=${tab.key}`);
                  setMobileOpen(false);
                }
              }}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 2,
                height: "100%",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: isActive ? "#f07820" : "#9ca3af",
                padding: 0,
              }}
            >
              <i className={`ti ${tab.icon}`} style={{ fontSize: 22 }} />
              <span style={{ fontSize: 10, fontFamily: "Lexend, sans-serif", fontWeight: 500 }}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    )}

    <TutorialModal />
    <HelpModal />
    <WhatIsNewModal />
    </>
  );
};

export default HomeownerLayout;
