import Header from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Users,
  Hammer,
  UserPlus,
  Search,
  Handshake,
  CreditCard,
  Star,
  Building2
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
      description: "Find contractors by trade, location, or code, and view their profile, ratings, and reviews."
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
      description: "Manage projects, communicate securely, and get paid directly by your client through Stripe."
    },
    {
      number: "5",
      icon: Star,
      title: "Rate & Review",
      description: "Build your reputation through reviews and ratings from completed projects."
    }
  ];

  const accountTypes = [
    {
      type: "Personal",
      icon: Users,
      description: "For homeowners getting work done on their own property. Request quotes and hire a contractor directly."
    },
    {
      type: "Business",
      icon: Building2,
      description: "For property managers, landlords and facilities teams. Manage work across multiple sites, from request through to payment."
    },
    {
      type: "Contractor",
      icon: Hammer,
      description: "For trade businesses. Receive enquiries, send quotes, and get paid for the work you do."
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
              <h1 className="font-heading text-4xl md:text-5xl font-bold mb-4">
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

        {/* Simple Pricing Section */}
        <section className="py-16 px-4 bg-muted/30">
          <div className="container mx-auto max-w-6xl">
            <div className="text-center">
              <h2 className="font-heading text-3xl md:text-4xl font-bold mb-4">
                Simple <span className="text-primary">Pricing</span>
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                TradeStone charges 5% of the value of completed payments, deducted automatically when you get paid. There are no subscriptions, no listing fees and no lead fees. If you don't get paid, we don't get paid.
              </p>
            </div>
          </div>
        </section>

        {/* Which Account Is Right For You Section */}
        <section className="py-16 px-4">
          <div className="container mx-auto max-w-6xl">
            <div className="text-center mb-12">
              <h2 className="font-heading text-3xl md:text-4xl font-bold mb-4">
                Which Account Is <span className="text-primary">Right For You?</span>
              </h2>
              <p className="text-lg text-muted-foreground">
                Every account type has a different focus. Compare what each one gives you.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {accountTypes.map((account, index) => (
                <Card key={index} className="text-center p-6">
                  <div className="bg-primary/10 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                    <account.icon className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="text-xl font-bold mb-2">{account.type}</h3>
                  <p className="text-sm text-muted-foreground">{account.description}</p>
                </Card>
              ))}
            </div>

            <div className="text-center mt-10">
              <Button size="lg" className="hero-gradient" onClick={() => navigate('/auth')}>
                Get Started Today
              </Button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default HowItWorks;
