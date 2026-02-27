import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import { Link } from "react-router-dom";

const Index = () => {
  return (
    <div className="min-h-screen bg-[#efefef]">
      <Header />

      <main>
        <HeroSection />

        <footer className="border-t border-zinc-300 bg-[#ececec] py-4">
          <nav className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-7 px-4 text-sm font-medium text-slate-700">
            <Link to="/" className="hover:text-slate-900">Home</Link>
            <Link to="/marketplace" className="hover:text-slate-900">Marketplace</Link>
            <Link to="/contractors" className="hover:text-slate-900">Hire</Link>
            <Link to="/contracts" className="hover:text-slate-900">Contracts</Link>
            <Link to="/auth" className="hover:text-slate-900">Log in</Link>
            <Link
              to="/marketplace"
              className="rounded-md bg-orange-500 px-3 py-1.5 font-semibold text-white hover:bg-orange-400"
            >
              Post a listing
            </Link>
          </nav>
        </footer>
      </main>
    </div>
  );
};

export default Index;
