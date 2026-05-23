import { Button } from "@/components/ui/button";
import { Menu, LogOut, Settings, FolderKanban } from "lucide-react";
import { NotificationBell } from "@/components/NotificationBell";
import { useState, useEffect } from "react";
import { useNavigate, Link, NavLink } from "react-router-dom";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import tradestoneLogo from "@/assets/tradestone-logo.png";

interface UserProfile {
  user_type: "personal" | "business" | "contractor";
  full_name: string;
}

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
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

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("user_type, full_name")
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
              <Link to="/dashboard" className="text-sm text-slate-700 hover:text-slate-900">
                {profile?.full_name || "Dashboard"}
              </Link>
              {profile?.user_type === "business" && (
                <Link
                  to="/dashboard/business/settings"
                  className="text-sm text-slate-500 hover:text-slate-900"
                  title="Business settings"
                >
                  <Settings className="h-4 w-4" />
                </Link>
              )}
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="h-3.5 w-3.5 mr-1" />
                Log out
              </Button>
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
                {profile?.user_type === "business" && (
                  <Link
                    to="/dashboard/business/settings"
                    onClick={() => setIsMenuOpen(false)}
                    className="flex items-center gap-2"
                  >
                    <Settings className="h-4 w-4" />
                    Business Settings
                  </Link>
                )}
                <Button variant="outline" size="sm" onClick={handleLogout}>
                  <LogOut className="h-4 w-4 mr-1" />
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
