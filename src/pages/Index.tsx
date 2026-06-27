import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import CookieConsent from "@/components/CookieConsent";

const Index = () => {
  return (
    <div className="min-h-screen bg-[#efefef]">
      <Header />

      <main>
        <HeroSection />
      </main>

      <CookieConsent />
    </div>
  );
};

export default Index;
