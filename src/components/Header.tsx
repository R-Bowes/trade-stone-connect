import { Button } from "@/components/ui/button";
import { Menu, FolderKanban } from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { useState, useEffect, useRef } from "react";
import { useNavigate, Link, NavLink } from "react-router-dom";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import tradestoneLogo from "@/assets/tradestone-logo.png";

interface UserProfile {
  user_type: "personal" | "business" | "contractor";
  full_name: string;
  ts_profile_code: string | null;
  logo_url: string | null;
}

const getInitials = (name: string) =>
  name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
    };

    getSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user.id);
      else setProfile(null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [dropdownOpen]);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("user_type, full_name, ts_profile_code, logo_url")
      .eq("user_id", userId)
      .single();

    if (error) {
      console.error("Error fetching profile:", error);
      return;
    }

    setProfile(data);
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast({ variant: "destructive", title: "Logout failed", description: error.message });
      return;
    }

    toast({ title: "Logged out", description: "You have been logged out successfully." });
    navigate("/");
  };

  const handleDropdownNav = (href: string) => {
    setDropdownOpen(false);
    navigate(href);
  };

  const avatarEl = profile?.logo_url ? (
    <div
      style={{
        width: 28,
        height: 28,
        borderRadius: 6,
        border: "2px solid #f07820",
        background: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        flexShrink: 0,
      }}
    >
      <img
        src={profile.logo_url}
        alt=""
        style={{ maxHeight: 22, maxWidth: 22, objectFit: "contain" }}
      />
    </div>
  ) : (
    <div
      style={{
        width: 28,
        height: 28,
        borderRadius: "50%",
        border: "2px solid #f07820",
        background: "#1a2744",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        color: "white",
        fontSize: 11,
        fontWeight: 700,
        userSelect: "none",
      }}
    >
      {profile ? getInitials(profile.full_name) : "—"}
    </div>
  );

  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-300 bg-white">
      <div className="container flex h-16 items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2.5">
          <img src={tradestoneLogo} alt="TradeStone logo" className="h-7 w-auto" />
          <span
            className="leading-none uppercase tracking-wide"
            style={{ fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 700, fontSize: '28px', letterSpacing: '1px' }}
          >
            <span style={{ color: '#1e3a5f' }}>TRADE</span><span style={{ color: '#f07820' }}>STONE</span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-700">
          <NavLink to="/" end className={({ isActive }) => isActive ? "font-semibold text-orange-500" : "hover:text-slate-900"}>Home</NavLink>
          <NavLink to="/marketplace" className={({ isActive }) => isActive ? "font-semibold text-orange-500" : "hover:text-slate-900"}>Marketplace</NavLink>
          <NavLink to="/contractors" className={({ isActive }) => isActive ? "font-semibold text-orange-500" : "hover:text-slate-900"}>Hire</NavLink>
          <NavLink to="/contracts" className={({ isActive }) => isActive ? "font-semibold text-orange-500" : "hover:text-slate-900"}>Contracts</NavLink>
          <NavLink
            to="/projects"
            className={({ isActive }) =>
              isActive
                ? "font-semibold text-orange-500"
                : "hover:text-slate-900"
            }
          >
            Projects
          </NavLink>
        </nav>

        <div className="hidden md:flex items-center gap-3">
          {user ? (
            <>
              <NotificationBell />

              {/* Avatar chip + dropdown */}
              <div ref={dropdownRef} style={{ position: "relative" }}>
                <button
                  onClick={() => setDropdownOpen((o) => !o)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "4px 10px 4px 4px",
                    borderRadius: 999,
                    border: "1px solid #e5e7eb",
                    background: "white",
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  {avatarEl}
                  <span style={{ fontSize: 12, fontWeight: 500, color: "#374151", whiteSpace: "nowrap" }}>
                    {profile?.full_name}
                  </span>
                  <i className="ti ti-chevron-down" style={{ fontSize: 14, color: "#6b7280" }} />
                </button>

                {dropdownOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 8px)",
                      right: 0,
                      background: "white",
                      border: "1px solid #e5e7eb",
                      borderRadius: 8,
                      boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
                      minWidth: 220,
                      zIndex: 100,
                      overflow: "hidden",
                    }}
                  >
                    {/* Dropdown header */}
                    <div style={{ padding: "12px 14px", borderBottom: "1px solid #f3f4f6" }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>
                        {profile?.full_name}
                      </div>
                      {profile?.ts_profile_code && (
                        <div
                          style={{
                            fontSize: 11,
                            color: "#9ca3af",
                            fontFamily: "'Roboto Mono', monospace",
                            marginTop: 2,
                          }}
                        >
                          {profile.ts_profile_code}
                        </div>
                      )}
                    </div>

                    {/* Nav items */}
                    {[
                      { icon: "ti-layout-dashboard", label: "My dashboard", href: "/dashboard/contractor" },
                      { icon: "ti-user", label: "My profile", href: "/dashboard/contractor?view=profile" },
                      { icon: "ti-settings", label: "Account settings", href: "/dashboard/contractor?view=settings" },
                    ].map((item) => (
                      <button
                        key={item.label}
                        onClick={() => handleDropdownNav(item.href)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          width: "100%",
                          padding: "9px 14px",
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          fontSize: 13,
                          color: "#374151",
                          textAlign: "left",
                          fontFamily: "inherit",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "#f9fafb")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                      >
                        <i className={`ti ${item.icon}`} style={{ fontSize: 16 }} />
                        {item.label}
                      </button>
                    ))}

                    <div style={{ borderTop: "1px solid #f3f4f6", margin: "4px 0" }} />

                    <button
                      onClick={() => { setDropdownOpen(false); handleLogout(); }}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        width: "100%",
                        padding: "9px 14px",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        fontSize: 13,
                        color: "#dc2626",
                        textAlign: "left",
                        fontFamily: "inherit",
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#fef2f2")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                    >
                      <i className="ti ti-logout" style={{ fontSize: 16 }} />
                      Log out
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => navigate("/auth")} className="text-sm text-slate-700 hover:text-slate-900">
                Log in
              </Button>
              <Button size="sm" onClick={() => navigate("/auth")} className="rounded-lg bg-orange-500 px-4 text-sm font-semibold text-white hover:bg-orange-400">
                Sign-Up
              </Button>
            </>
          )}
        </div>

        <Button variant="ghost" size="sm" className="md:hidden" onClick={() => setIsMenuOpen(!isMenuOpen)}>
          <Menu className="h-5 w-5" />
        </Button>
      </div>

      {isMenuOpen && (
        <div className="border-t border-zinc-200 bg-white px-4 py-4 md:hidden">
          <nav className="flex flex-col gap-3 text-sm text-slate-700">
            <NavLink to="/" end onClick={() => setIsMenuOpen(false)} className={({ isActive }) => isActive ? "font-semibold text-orange-500" : ""}>Home</NavLink>
            <NavLink to="/marketplace" onClick={() => setIsMenuOpen(false)} className={({ isActive }) => isActive ? "font-semibold text-orange-500" : ""}>Marketplace</NavLink>
            <NavLink to="/contractors" onClick={() => setIsMenuOpen(false)} className={({ isActive }) => isActive ? "font-semibold text-orange-500" : ""}>Hire</NavLink>
            <NavLink to="/contracts" onClick={() => setIsMenuOpen(false)} className={({ isActive }) => isActive ? "font-semibold text-orange-500" : ""}>Contracts</NavLink>
            <NavLink
              to="/projects"
              onClick={() => setIsMenuOpen(false)}
              className={({ isActive }) =>
                isActive
                  ? "flex items-center gap-2 font-semibold text-orange-500"
                  : "flex items-center gap-2"
              }
            >
              <FolderKanban className="h-4 w-4" />
              Projects
            </NavLink>
            {user ? (
              <>
                <Link
                  to="/dashboard/contractor"
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center gap-2"
                >
                  <i className="ti ti-layout-dashboard" style={{ fontSize: 16 }} />
                  My dashboard
                </Link>
                <Link
                  to="/dashboard/contractor?view=profile"
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center gap-2"
                >
                  <i className="ti ti-user" style={{ fontSize: 16 }} />
                  My profile
                </Link>
                <Link
                  to="/dashboard/contractor?view=settings"
                  onClick={() => setIsMenuOpen(false)}
                  className="flex items-center gap-2"
                >
                  <i className="ti ti-settings" style={{ fontSize: 16 }} />
                  Account settings
                </Link>
                <Button variant="outline" size="sm" onClick={handleLogout} className="text-red-600 border-red-200 hover:bg-red-50">
                  <i className="ti ti-logout mr-1" style={{ fontSize: 16 }} />
                  Log out
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => navigate("/auth")}>
                  Log in
                </Button>
                <Button size="sm" className="bg-orange-500 hover:bg-orange-400" onClick={() => navigate("/auth")}>
                  Sign-Up
                </Button>
              </>
            )}
          </nav>
        </div>
      )}
    </header>
  );
};

export default Header;
