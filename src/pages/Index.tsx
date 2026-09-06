import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import HowItWorksSection from "@/components/HowItWorksSection";
import PricingSection from "@/components/PricingSection";
import WhatYouGetSection from "@/components/WhatYouGetSection";

const Index = () => {
  const location = useLocation();

  // React Router does not scroll to a URL fragment on navigation (unlike a
  // full page load with a native <a href="#...">). This covers both cases:
  // arriving at "/#pricing" from another route, and clicking the header's
  // Pricing link while already on "/" (a location change with no pathname
  // change still fires this effect, since location is a new object).
  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.slice(1);
    // Slight delay so the target section is definitely laid out (fonts/
    // images loading on a fresh navigation can still shift layout a frame
    // or two after mount).
    const timer = setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    }, 50);
    return () => clearTimeout(timer);
  }, [location]);

  return (
    <div className="min-h-screen bg-[#efefef]">
      <Header />

      <main>
        <HeroSection />
        <HowItWorksSection />
        <PricingSection />
        <WhatYouGetSection />
      </main>
    </div>
  );
};

export default Index;
