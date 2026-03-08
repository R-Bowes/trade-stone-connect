import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import SiteFooter from "@/components/SiteFooter";
import CookieConsent from "@/components/CookieConsent";

const Index = () => {
  return (
    <div className="min-h-screen bg-[#efefef]">
      <Header />

      <main>
        <HeroSection />

        <SiteFooter />
      </main>

      <CookieConsent />
    </div>
  );
};

export default Index;
