import Header from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Users, 
  Crown, 
  CheckCircle2,
  UserPlus,
  Search,
  Handshake,
  CreditCard,
  Star
} from "lucide-react";
import { useNavigate } from "react-router-dom";

const HowItWorks = () => {
  const navigate = useNavigate();

  const steps = [
    {
      number: "1",
      icon: UserPlus,
      title: "Create Your Profile",
      description: "Sign up and create your contractor profile or customer account. Get your unique TradeStone code."
    },
    {
      number: "2",
      icon: Search,
      title: "Connect & Discover",
      description: "Find contractors by trade, location, or code. Browse contract opportunities and materials marketplace."
    },
    {
      number: "3",
      icon: Handshake,
      title: "Agree & Contract",
      description: <>Use our AI-assisted <span className="text-[0.85em] opacity-90">(Coming Soon)</span> contracts to create clear agreements with milestone-based payments.</>
    },
    {
      number: "4",
      icon: CreditCard,
      title: "Work & Get Paid",
      description: "Manage projects, communicate securely, and receive payments through our protected escrow system."
    },
    {
      number: "5",
      icon: Star,
      title: "Rate & Review",
      description: "Build your reputation through verified reviews and ratings from completed projects."
    }
  ];

  const accountTypes = [
    {
      type: "Personal",
      subtitle: "For DIYers & Homeowners",
      price: "Free",
      features: [
        "Browse contractor directory",
        "Request quotes from contractors",
        "Buy & sell surplus materials",
        <>Basic AI <span className="text-[0.85em] opacity-90">(Coming Soon)</span> construction advice</>,
        "Access community forums"
      ],
      icon: Users,
      popular: false
    },
    {
      type: "Business",
      subtitle: "For Commercial Entities",
      price: "Free",
      features: [
        "Everything in Personal",
        "Post contract opportunities",
        "Manage multiple projects",
        "Team collaboration tools",
        "Company profile & branding"
      ],
      icon: Users,
      popular: false
    },
    {
      type: "Contractor",
      subtitle: "For Professional Tradespeople",
      price: "£29",
      period: "/month",
      features: [
        "Everything in Business",
        "Invoicing & payment system",
        "Escrow-protected payments",
        "Contract bidding access",
        "Public contractor profile",
        "Schedule & team management",
        <>AI <span className="text-[0.85em] opacity-90">(Coming Soon)</span> business assistant</>,
        "Loyalty rebate tiers"
      ],
      icon: Crown,
      popular: true
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        {/* How It Works Section */}
        <section className="py-16 px-4">
          <div className="container mx-auto max-w-6xl">
            <div className="text-center mb-12">
              <h1 className="text-4xl md:text-5xl font-bold mb-4">
                How <span className="text-primary">TradeStone</span> Works
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Getting started is simple. Whether you're looking for contractors or offering services, TradeStone streamlines the entire process.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-6 mb-16">
              {steps.map((step, index) => (
                <div key={index} className="text-center">
                  <div className="bg-primary/10 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                    <step.icon className="h-8 w-8 text-primary" />
                  </div>
                  <div className="bg-primary text-primary-foreground rounded-full w-8 h-8 mx-auto mb-3 flex items-center justify-center text-sm font-bold">
                    {step.number}
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
                  <p className="text-sm text-muted-foreground">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Account Types Section */}
        <section className="py-16 px-4 bg-muted/30">
          <div className="container mx-auto max-w-4xl">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Choose Your <span className="text-primary">Account Type</span>
              </h2>
              <p className="text-lg text-muted-foreground">
                Whether you're a DIY enthusiast or professional contractor, we have the right plan for you.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {accountTypes.map((account, index) => (
                <Card key={index} className={`p-8 relative ${account.popular ? 'border-primary shadow-lg' : ''}`}>
                  {account.popular && (
                    <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-primary text-primary-foreground px-3 py-1 rounded-full text-sm font-medium">
                      Most Popular
                    </div>
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
                    onClick={() => navigate('/auth')}
                  >
                    {account.type === 'Contractor' ? 'Start Pro Trial' : 'Get Started Free'}
                  </Button>
                </Card>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default HowItWorks;
