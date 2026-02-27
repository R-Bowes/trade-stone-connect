import { Button } from "@/components/ui/button";
import { Menu, User as UserIcon, LogOut } from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import tradestoneLogo from "@/assets/tradestone-logo.png";

interface UserProfile {
  user_type: 'personal' | 'business' | 'contractor';
  full_name: string;
  company_name?: string;
}

const Header = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Get initial session
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      }
    };

    getSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null);
        if (session?.user) {
          fetchProfile(session.user.id);
        } else {
          setProfile(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('user_type, full_name, company_name')
        .eq('user_id', userId)
        .single();

      if (error) {
        console.error('Error fetching profile:', error);
        return;
      }

      setProfile(data);
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  };

  const handleLogout = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        toast({
          variant: "destructive",
          title: "Logout failed",
          description: error.message,
        });
      } else {
        toast({
          title: "Logged out",
          description: "You have been logged out successfully.",
        });
        navigate("/");
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "An unexpected error occurred.",
      });
    }
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between px-4">
        {/* Logo */}
        <Link to="/" className="flex items-center space-x-3 hover:opacity-80 transition-opacity">
          <img
            src={tradestoneLogo}
            alt="TradeStone logo" 
            className="h-10 w-auto"
          />
          <span className="text-xl font-bold text-foreground">TradeStone</span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden lg:flex items-center space-x-6">
          <Link to="/contractors" className="text-sm font-medium hover:text-primary transition-colors">
            Find Contractors
          </Link>
          <Link to="/contracts" className="text-sm font-medium hover:text-primary transition-colors">
            Contracts
          </Link>
          <Link to="/marketplace" className="text-sm font-medium hover:text-primary transition-colors">
            Marketplace
          </Link>
          {user && (
            <Link to="/dashboard" className="text-sm font-medium hover:text-primary transition-colors">
              {profile?.user_type === 'contractor' ? 'Business' : 
               profile?.user_type === 'business' ? 'Dashboard' : 'My Account'}
            </Link>
          )}
          <Link to="/how-it-works" className="text-sm font-medium hover:text-primary transition-colors">
            How It Works
          </Link>
        </nav>

        {/* Desktop Actions */}
        <div className="hidden lg:flex items-center space-x-3">
          {user ? (
            <div className="flex items-center space-x-3">
              <Link to="/dashboard" className="flex items-center space-x-2 hover:text-primary transition-colors">
                <UserIcon className="h-4 w-4" />
                <span className="text-sm">
                  {profile?.full_name || user.email}
                  {profile?.user_type === 'contractor' && (
                    <span className="ml-1 text-xs bg-primary text-primary-foreground px-2 py-1 rounded">
                      PRO
                    </span>
                  )}
                  {profile?.user_type === 'business' && (
                    <span className="ml-1 text-xs bg-blue-500 text-white px-2 py-1 rounded">
                      BIZ
                    </span>
                  )}
                </span>
              </Link>
              <Button variant="outline" size="sm" onClick={handleLogout}>
                <LogOut className="h-4 w-4 mr-1" />
                Logout
              </Button>
            </div>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => navigate("/auth")}>
                <UserIcon className="h-4 w-4 mr-2" />
                Sign In
              </Button>
              <Button size="sm" className="hero-gradient bg-orange-400 hover:bg-orange-300" onClick={() => navigate("/auth")}>
                Sign-up
              </Button>
            </>
          )}
        </div>

        {/* Mobile/Tablet Menu Button */}
        <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setIsMenuOpen(!isMenuOpen)}>
          <Menu className="h-5 w-5" />
        </Button>

        {/* Mobile/Tablet Navigation */}
        {isMenuOpen && (
          <div className="absolute top-16 left-0 right-0 bg-background border-b lg:hidden">
            <nav className="flex flex-col space-y-3 p-4">
              <Link to="/contractors" className="text-sm font-medium hover:text-primary transition-colors" onClick={() => setIsMenuOpen(false)}>
                Find Contractors
              </Link>
              <Link to="/contracts" className="text-sm font-medium hover:text-primary transition-colors" onClick={() => setIsMenuOpen(false)}>
                Contracts
              </Link>
              <Link to="/marketplace" className="text-sm font-medium hover:text-primary transition-colors" onClick={() => setIsMenuOpen(false)}>
                Marketplace
              </Link>
              {user && (
                <Link to="/dashboard" className="text-sm font-medium hover:text-primary transition-colors" onClick={() => setIsMenuOpen(false)}>
                  {profile?.user_type === 'contractor' ? 'Business' : 
                   profile?.user_type === 'business' ? 'Dashboard' : 'My Account'}
                </Link>
              )}
              <Link to="/how-it-works" className="text-sm font-medium hover:text-primary transition-colors" onClick={() => setIsMenuOpen(false)}>
                How It Works
              </Link>
              <div className="flex flex-col space-y-2 pt-3 border-t">
                {user ? (
                  <>
                    <Link to="/dashboard" className="text-sm text-muted-foreground mb-2 hover:text-primary">
                      {profile?.full_name || user.email}
                      {profile?.user_type === 'contractor' && (
                        <span className="ml-1 text-xs bg-primary text-primary-foreground px-2 py-1 rounded">
                          PRO
                        </span>
                      )}
                      {profile?.user_type === 'business' && (
                        <span className="ml-1 text-xs bg-blue-500 text-white px-2 py-1 rounded">
                          BIZ
                        </span>
                      )}
                    </Link>
                    <Button variant="outline" size="sm" onClick={handleLogout}>
                      <LogOut className="h-4 w-4 mr-1" />
                      Logout
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => navigate("/auth")}>
                      <UserIcon className="h-4 w-4 mr-2" />
                      Sign In
                    </Button>
                    <Button size="sm" className="hero-gradient" onClick={() => navigate("/auth")}>
                      Sign-up
                    </Button>
                  </>
                )}
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
