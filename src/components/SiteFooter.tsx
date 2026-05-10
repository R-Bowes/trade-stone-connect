import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const SiteFooter = () => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsLoggedIn(!!session?.user);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(!!session?.user);
    });

    return () => subscription.unsubscribe();
  }, []);

  return (
    <footer className="border-t border-zinc-300 bg-[#ececec] py-4">
      <nav className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-7 px-4 text-sm font-medium text-slate-700">
        <Link to="/" className="hover:text-slate-900">Home</Link>
        <Link to="/marketplace" className="hover:text-slate-900">Marketplace</Link>
        <Link to="/contractors" className="hover:text-slate-900">Hire</Link>
        <Link to="/contracts" className="hover:text-slate-900">Contracts</Link>
        <Link to="/about" className="hover:text-slate-900">How it works</Link>
        <Link to="/terms" className="hover:text-slate-900">Terms</Link>
        <Link to="/privacy" className="hover:text-slate-900">Privacy</Link>
        {isLoggedIn ? (
          <Link to="/dashboard" className="hover:text-slate-900">My Dashboard</Link>
        ) : (
          <Link to="/auth" className="hover:text-slate-900">Log in</Link>
        )}
        <Link
          to="/marketplace"
          className="rounded-md bg-orange-500 px-3 py-1.5 font-semibold text-white hover:bg-orange-400"
        >
          Post a listing
        </Link>
      </nav>
    </footer>
  );
};

export default SiteFooter;
