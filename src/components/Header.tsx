import { Button } from "@/components/ui/button";
import { Menu, FolderKanban } from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { useState, useEffect, useRef } from "react";
import { useNavigate, Link, NavLink } from "react-router-dom";
import { performSignOut } from "@/lib/signOut";
import { Wordmark } from "@/components/Wordmark";
import { useDashboardPath } from "@/hooks/useDashboardPath";

const getInitials = (name: string | null | undefined) => {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
};

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { user, profile, dashboardPath } = useDashboardPath();

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

  const handleLogout = () => performSignOut(navigate);

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

  // dashboardPath itself now comes from useDashboardPath() above — shared
  // with HeroSection so the role-resolution logic (including the null
  // state while team membership is still resolving) has one source.
  const profilePath = dashboardPath
    ? profile?.user_type === "contractor"
      ? `${dashboardPath}?view=canvas-editor`
      : `${dashboardPath}?view=settings`
    : null;

  const settingsPath = dashboardPath ? `${dashboardPath}?view=settings` : null;

  const dropdownNavItems = [
    dashboardPath ? { icon: "ti-layout-dashboard", label: "My dashboard", href: dashboardPath } : null,
    profilePath ? { icon: "ti-user", label: "My profile", href: profilePath } : null,
    settingsPath ? { icon: "ti-settings", label: "Account settings", href: settingsPath } : null,
  ].filter((item): item is { icon: string; label: string; href: string } => item !== null);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-zinc-300 bg-white">
      <div className="container flex h-16 items-center justify-between px-4">
        {/* Falls back to "/" while dashboardPath is still resolving (personal
            user_type, team-membership check in flight) — safe destination,
            never /dashboard/homeowner. */}
        <Link to={dashboardPath ?? "/"} className="flex items-center gap-2.5">
          <Wordmark theme="light" size={26} />
        </Link>

        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-700">
          <NavLink to="/contractors" className={({ isActive }) => isActive ? "font-semibold text-orange-500" : "hover:text-slate-900"}>Find Contractors</NavLink>
          <NavLink to="/how-it-works" className={({ isActive }) => isActive ? "font-semibold text-orange-500" : "hover:text-slate-900"}>How It Works</NavLink>
          <Link to="/#pricing" className="hover:text-slate-900">Pricing</Link>
        </nav>

        <div className="hidden md:flex items-center gap-3">
          {user ? (
            <>
              {/* Home / dashboard shortcut icon — omitted while dashboardPath
                  is still resolving so it can never point at
                  /dashboard/homeowner for a not-yet-confirmed team member. */}
              {dashboardPath && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(dashboardPath)}
                  title="Go to dashboard"
                >
                  <i className="ti ti-home" style={{ fontSize: 18 }} />
                </Button>
              )}

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

                    {/* Nav items — role-aware */}
                    {dropdownNavItems.map((item) => (
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
            <NavLink to="/contractors" onClick={() => setIsMenuOpen(false)} className={({ isActive }) => isActive ? "font-semibold text-orange-500" : ""}>Find Contractors</NavLink>
            <NavLink to="/how-it-works" onClick={() => setIsMenuOpen(false)} className={({ isActive }) => isActive ? "font-semibold text-orange-500" : ""}>How It Works</NavLink>
            <Link to="/#pricing" onClick={() => setIsMenuOpen(false)}>Pricing</Link>
            {user ? (
              <>
                {dropdownNavItems.map((item) => (
                  <Link
                    key={item.label}
                    to={item.href}
                    onClick={() => setIsMenuOpen(false)}
                    className="flex items-center gap-2"
                  >
                    <i className={`ti ${item.icon}`} style={{ fontSize: 16 }} />
                    {item.label}
                  </Link>
                ))}
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