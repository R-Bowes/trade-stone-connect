import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import tradestoneLogo from "@/assets/tradestone-logo.png";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { 
  Hammer, 
  FileText, 
  CreditCard, 
  Users, 
  ShoppingCart,
  Bot
} from "lucide-react";
import { Link } from "react-router-dom";

const Index = () => {
  const keyFeatures = [
    {
      icon: Users,
      title: "Contractor Directory",
      description: "Find verified tradespeople with ratings, portfolios, and unique TradeStone codes for easy discovery.",
      link: "/contractors"
    },
    {
      icon: Hammer,
      title: "Business Management",
      description: "Complete tools for invoicing, payment tracking, job management, and contract generation.",
      link: "/business"
    },
    {
      icon: FileText,
      title: "Contract Opportunities",
      description: <>Access government and private sector contracts with AI-powered <span className="text-[0.85em] opacity-90">(Coming Soon)</span> quality checking.</>,
      link: "/contracts"
    },
    {
      icon: CreditCard,
      title: "Secure Payments",
      description: "Flexible escrow system with custom payment terms and automatic dispute resolution.",
      link: "/how-it-works"
    },
    {
      icon: ShoppingCart,
      title: "Materials Marketplace",
      description: "Buy and sell surplus trade materials with location-based filtering.",
      link: "/marketplace"
    },
    {
      icon: Bot,
      title: <>AI Assistant <span className="text-[0.85em] opacity-90">(Coming Soon)</span></>,
      description: <>Get construction advice, contract reviews, and business optimization suggestions <span className="text-[0.85em] opacity-90">(Coming Soon)</span>.</>,
      link: "/how-it-works"
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main>
        <HeroSection />

        {/* Key Features Section */}
        <section className="py-16 px-4 bg-muted/30">
          <div className="container mx-auto max-w-6xl">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Everything You Need to <span className="text-primary">Succeed</span>
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                TradeStone combines marketplace functionality with powerful business tools designed specifically for the construction industry.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {keyFeatures.map((feature, index) => (
                <Link to={feature.link} key={index}>
                  <Card className="p-6 hover:shadow-lg transition-tradestone h-full">
                    <div className="bg-primary/10 rounded-lg p-3 w-fit mb-4">
                      <feature.icon className="h-6 w-6 text-primary" />
                    </div>
                    <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
                    <p className="text-muted-foreground">{feature.description}</p>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-16 px-4">
          <div className="container mx-auto max-w-4xl text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Ready to Get Started?
            </h2>
            <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
              Join thousands of contractors and customers who trust TradeStone for their construction needs.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" className="hero-gradient" asChild>
                <Link to="/how-it-works">Learn How It Works</Link>
              </Button>
              <Button size="lg" variant="outline" asChild>
                <Link to="/contractors">Find Contractors</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="bg-card border-t py-12 px-4">
          <div className="container mx-auto max-w-6xl">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
              <div>
                <div className="flex items-center space-x-2 mb-4">
                  <img
                    src={tradestoneLogo}
                    alt="TradeStone logo" 
                    className="h-8 w-auto"
                  />
                  <span className="text-xl font-bold">TradeStone</span>
                </div>
                <p className="text-muted-foreground text-sm">
                  Connecting contractors and customers with trust, security, and efficiency.
                </p>
              </div>

              <div>
                <h4 className="font-semibold mb-4">Platform</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li><Link to="/contractors" className="hover:text-primary">Find Contractors</Link></li>
                  <li><Link to="/contracts" className="hover:text-primary">Contracts</Link></li>
                  <li><Link to="/marketplace" className="hover:text-primary">Marketplace</Link></li>
                  <li><Link to="/how-it-works" className="hover:text-primary">How It Works</Link></li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold mb-4">For Contractors</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li><Link to="/auth" className="hover:text-primary">Join as Pro</Link></li>
                  <li><Link to="/business" className="hover:text-primary">Business Dashboard</Link></li>
                  <li><Link to="/contracts" className="hover:text-primary">Contract Opportunities</Link></li>
                  <li><Link to="/marketplace" className="hover:text-primary">List Materials</Link></li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold mb-4">Legal</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li><Link to="/terms" className="hover:text-primary">Terms of Service</Link></li>
                  <li><Link to="/privacy" className="hover:text-primary">Privacy Policy</Link></li>
                </ul>
              </div>
            </div>

            <div className="border-t mt-8 pt-8 text-center text-sm text-muted-foreground">
              <p>&copy; 2024 TradeStone. All rights reserved.</p>
            </div>
          </div>
        </footer>
      </main>
    </div>
  );
};

export default Index;
