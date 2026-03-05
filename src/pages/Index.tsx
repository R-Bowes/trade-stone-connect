import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import SiteFooter from "@/components/SiteFooter";

const Index = () => {
  return (
    <div className="min-h-screen bg-[#efefef]">
      <Header />

      <main>
        <HeroSection />

        <SiteFooter />
      </main>
    </div>
  );
};

export default Index;
