import Header from "@/components/Header";
import HeroSection from "@/components/HeroSection";
import ContractorDirectory from "@/components/ContractorDirectory";
import tradeStoneLogoCorrect from "@/assets/tradestone-logo-correct.png";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Hammer, 
  FileText, 
  CreditCard, 
  Users, 
  Crown,
  MessageSquare,
  Bot,
  MapPin,
  ShoppingCart,
  TrendingUp,
  Star,
  CheckCircle2
} from "lucide-react";

const Index = () => {
  const accountTypes = [
    {
      type: "Free Account",
      subtitle: "Perfect for DIYers & Buyers",
      price: "£0",
      features: [
        "Browse contractor directory",
        "Buy and sell surplus materials",
        "Basic AI construction advice",
        "Access to community forums"
      ],
      icon: Users,
      popular: false
    },
    {
      type: "Pro Account",
      subtitle: "For Professional Contractors",
      price: "£29",
      period: "/month",
      features: [
        "Everything in Free",
        "Business management tools",
        "Invoicing & payment system",
        "Contract bidding access",
        "Public company profile",
        "AI business assistant",
        "Priority customer support"
      ],
      icon: Crown,
      popular: true
    }
  ];

  const keyFeatures = [
    {
      icon: Users,
      title: "Contractor Directory",
      description: "Find verified tradespeople with ratings, portfolios, and unique TradeStone codes for easy discovery."
    },
    {
      icon: Hammer,
      title: "Business Management",
      description: "Complete tools for invoicing, payment tracking, job management, and contract generation."
    },
    {
      icon: FileText,
      title: "Contract Opportunities",
      description: "Access government and private sector contracts with AI-powered quality checking."
    },
    {
      icon: CreditCard,
      title: "Secure Payments",
      description: "Flexible escrow system with custom payment terms and automatic dispute resolution."
    },
    {
      icon: ShoppingCart,
      title: "Materials Marketplace",
      description: "Buy and sell surplus trade materials with location-based filtering."
    },
    {
      icon: Bot,
      title: "AI Assistant",
      description: "Get construction advice, contract reviews, and business optimization suggestions."
    }
  ];

  const contractHighlights = [
    {
      icon: FileText,
      title: "AI-Assisted Contracts",
      description: "Generate and review contracts with automated quality checks and suggested terms tailored to each project."
    },
    {
      icon: MessageSquare,
      title: "Collaborative Workflows",
      description: "Track revisions, manage approvals, and keep every stakeholder aligned with clear communication threads."
    },
    {
      icon: CheckCircle2,
      title: "Compliance & Documentation",
      description: "Store certificates, insurance, and regulatory documents with reminders so nothing slips through the cracks."
    }
  ];

  const marketplaceHighlights = [
    {
      icon: ShoppingCart,
      title: "Surplus Materials",
      description: "Buy and sell excess stock with secure payments and transparent ratings for every transaction."
    },
    {
      icon: MapPin,
      title: "Local Discovery",
      description: "Filter listings by location to source materials nearby and reduce delivery times and costs."
    },
    {
      icon: TrendingUp,
      title: "Pricing Insights",
      description: "Track market trends and receive suggestions on optimal pricing based on demand in your area."
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />

      <main>
        <HeroSection />

        <ContractorDirectory />

        {/* Contracts Section */}
        <section id="contracts" className="py-16 px-4 bg-card/30">
          <div className="container mx-auto max-w-6xl">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Manage <span className="text-primary">Contracts</span> with Confidence
              </h2>
              <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
                From bid to signature, TradeStone keeps every agreement organised, transparent, and ready for action.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {contractHighlights.map((highlight, index) => (
                <Card key={index} className="p-6 h-full flex flex-col">
                  <div className="bg-primary/10 rounded-lg p-3 w-fit mb-4">
                    <highlight.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold mb-3">{highlight.title}</h3>
                  <p className="text-muted-foreground flex-1">{highlight.description}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Marketplace Section */}
        <section id="marketplace" className="py-16 px-4">
          <div className="container mx-auto max-w-6xl">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Explore the <span className="text-primary">Marketplace</span>
              </h2>
              <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
                Discover materials, tools, and services posted by trusted professionals in the TradeStone community.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {marketplaceHighlights.map((highlight, index) => (
                <Card key={index} className="p-6 h-full flex flex-col">
                  <div className="bg-primary/10 rounded-lg p-3 w-fit mb-4">
                    <highlight.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold mb-3">{highlight.title}</h3>
                  <p className="text-muted-foreground flex-1">{highlight.description}</p>
                </Card>
              ))}
            </div>

            <div className="mt-10 flex flex-col md:flex-row items-center justify-between gap-6 bg-muted/30 rounded-2xl p-8">
              <div>
                <h3 className="text-2xl font-semibold mb-3">Post Your Listing</h3>
                <p className="text-muted-foreground">
                  Showcase equipment, reclaimed materials, or specialised services. Listings are boosted to nearby buyers and contractors.
                </p>
              </div>
              <Button size="lg" className="hero-gradient">
                Open Marketplace
              </Button>
            </div>
          </div>
        </section>

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
                <Card key={index} className="p-6 hover:shadow-lg transition-tradestone">
                  <div className="bg-primary/10 rounded-lg p-3 w-fit mb-4">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold mb-3">{feature.title}</h3>
                  <p className="text-muted-foreground">{feature.description}</p>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Account Types Section */}
        <section id="pricing" className="py-16 px-4">
          <div className="container mx-auto max-w-4xl">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Choose Your <span className="text-primary">Account Type</span>
              </h2>
              <p className="text-lg text-muted-foreground">
                Whether you're a DIY enthusiast or professional contractor, we have the right plan for you.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {accountTypes.map((account, index) => (
                <Card key={index} className={`p-8 relative ${account.popular ? 'border-primary shadow-lg' : ''}`}>
                  {account.popular && (
                    <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-primary">
                      Most Popular
                    </Badge>
                  )}
                  
                  <div className="text-center mb-6">
                    <account.icon className={`h-12 w-12 mx-auto mb-4 ${account.popular ? 'text-primary' : 'text-muted-foreground'}`} />
                    <h3 className="text-2xl font-bold mb-2">{account.type}</h3>
                    <p className="text-muted-foreground mb-4">{account.subtitle}</p>
                    <div className="flex items-baseline justify-center">
                      <span className="text-4xl font-bold">{account.price}</span>
                      {account.period && <span className="text-muted-foreground ml-1">{account.period}</span>}
                    </div>
                  </div>

                  <ul className="space-y-3 mb-8">
                    {account.features.map((feature, featureIndex) => (
                      <li key={featureIndex} className="flex items-start">
                        <CheckCircle2 className="h-5 w-5 text-primary mr-3 mt-0.5 flex-shrink-0" />
                        <span className="text-sm">{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Button 
                    className={`w-full ${account.popular ? 'hero-gradient' : ''}`}
                    variant={account.popular ? 'default' : 'outline'}
                  >
                    {account.type === 'Free Account' ? 'Get Started Free' : 'Start Pro Trial'}
                  </Button>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* How It Works Section */}
        <section id="how-it-works" className="py-16 px-4 bg-muted/30">
          <div className="container mx-auto max-w-6xl">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                How <span className="text-primary">TradeStone</span> Works
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Getting started is simple. Whether you're looking for contractors or offering services, TradeStone streamlines the entire process.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="text-center">
                <div className="bg-primary/10 rounded-full p-6 w-20 h-20 mx-auto mb-6 flex items-center justify-center">
                  <span className="text-2xl font-bold text-primary">1</span>
                </div>
                <h3 className="text-xl font-semibold mb-3">Create Your Profile</h3>
                <p className="text-muted-foreground">
                  Sign up and create your contractor profile or customer account. Get your unique TradeStone code.
                </p>
              </div>

              <div className="text-center">
                <div className="bg-primary/10 rounded-full p-6 w-20 h-20 mx-auto mb-6 flex items-center justify-center">
                  <span className="text-2xl font-bold text-primary">2</span>
                </div>
                <h3 className="text-xl font-semibold mb-3">Connect & Discover</h3>
                <p className="text-muted-foreground">
                  Find contractors by trade, location, or code. Browse contract opportunities and materials marketplace.
                </p>
              </div>

              <div className="text-center">
                <div className="bg-primary/10 rounded-full p-6 w-20 h-20 mx-auto mb-6 flex items-center justify-center">
                  <span className="text-2xl font-bold text-primary">3</span>
                </div>
                <h3 className="text-xl font-semibold mb-3">Work & Get Paid</h3>
                <p className="text-muted-foreground">
                  Manage projects, communicate securely, and receive payments through our protected escrow system.
                </p>
              </div>
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
                    src={tradeStoneLogoCorrect} 
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
                  <li><a href="#" className="hover:text-primary">Find Contractors</a></li>
                  <li><a href="#" className="hover:text-primary">Contracts</a></li>
                  <li><a href="#" className="hover:text-primary">Marketplace</a></li>
                  <li><a href="#" className="hover:text-primary">AI Assistant</a></li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold mb-4">Support</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li><a href="#" className="hover:text-primary">Help Center</a></li>
                  <li><a href="#" className="hover:text-primary">Contact Us</a></li>
                  <li><a href="#" className="hover:text-primary">Safety</a></li>
                  <li><a href="#" className="hover:text-primary">Terms</a></li>
                </ul>
              </div>

              <div>
                <h4 className="font-semibold mb-4">Company</h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li><a href="#" className="hover:text-primary">About</a></li>
                  <li><a href="#" className="hover:text-primary">Careers</a></li>
                  <li><a href="#" className="hover:text-primary">Press</a></li>
                  <li><a href="#" className="hover:text-primary">Privacy</a></li>
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
