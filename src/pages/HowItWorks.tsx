import Header from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { 
  Users, 
  Crown, 
  CheckCircle2,
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
      icon: Users,
      popular: false,
      free: {
        features: [
          "Browse contractor directory",
          "Request quotes from contractors",
          "Buy & sell surplus materials",
          "Access community forums"
        ]
      },
      paid: null
    },
    {
      type: "Business",
      subtitle: "For Commercial Entities",
      icon: Building2,
      popular: false,
      free: {
        features: [
          "Browse contractor directory",
          "Request quotes",
          "Access community forums"
        ]
      },
      paid: {
        price: "£19",
        period: "/month",
        label: "Business Pro",
        features: [
          "Post contract opportunities",
          "Manage multiple projects",
          "Team collaboration tools",
          "Company profile & branding",
          <>AI <span className="text-[0.85em] opacity-90">(Coming Soon)</span> project assistant</>
        ]
      }
    },
    {
      type: "Contractor",
      subtitle: "For Professional Tradespeople",
      icon: Crown,
      popular: true,
      free: {
        features: [
          "Public contractor profile",
          "Receive quote requests",
          "Access community forums"
        ]
      },
      paid: {
        price: "£29",
        period: "/month",
        label: "Contractor Pro",
        features: [
          "Invoicing & payment system",
          "Escrow-protected payments",
          "Contract bidding access",
          "Schedule & team management",
          <>AI <span className="text-[0.85em] opacity-90">(Coming Soon)</span> business assistant</>,
          "Loyalty rebate tiers"
        ]
      }
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
          <div className="container mx-auto max-w-6xl">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Choose Your <span className="text-primary">Account Type</span>
              </h2>
              <p className="text-lg text-muted-foreground">
                Every account starts free. Upgrade when you're ready for more.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {accountTypes.map((account, index) => (
                <Card key={index} className={`relative overflow-hidden ${account.popular ? 'border-primary shadow-lg' : ''}`}>
                  {account.popular && (
                    <div className="absolute top-0 left-1/2 transform -translate-x-1/2 bg-primary text-primary-foreground px-3 py-1 rounded-b-lg text-sm font-medium z-10">
                      Most Popular
                    </div>
                  )}

                  {/* Header */}
                  <div className={`text-center p-6 pb-4 ${account.popular ? 'pt-10' : ''}`}>
                    <account.icon className={`h-10 w-10 mx-auto mb-3 ${account.popular ? 'text-primary' : 'text-muted-foreground'}`} />
                    <h3 className="text-xl font-bold">{account.type}</h3>
                    <p className="text-sm text-muted-foreground">{account.subtitle}</p>
                  </div>

                  {/* Free Tier */}
                  <div className="px-6 pb-4">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-lg font-bold">Free</span>
                      <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">Always</span>
                    </div>
                    <ul className="space-y-2">
                      {account.free.features.map((feature, i) => (
                        <li key={i} className="flex items-start text-sm">
                          <CheckCircle2 className="h-4 w-4 text-primary mr-2 mt-0.5 flex-shrink-0" />
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Paid Tier */}
                  {account.paid ? (
                    <>
                      <Separator className="mx-6 w-auto" />
                      <div className="px-6 pt-4 pb-6">
                        <div className="flex items-baseline gap-1 mb-1">
                          <span className="text-2xl font-bold">{account.paid.price}</span>
                          <span className="text-sm text-muted-foreground">{account.paid.period}</span>
                        </div>
                        <p className="text-xs font-medium text-primary mb-3">{account.paid.label}</p>
                        <ul className="space-y-2 mb-5">
                          {account.paid.features.map((feature, i) => (
                            <li key={i} className="flex items-start text-sm">
                              <CheckCircle2 className="h-4 w-4 text-primary mr-2 mt-0.5 flex-shrink-0" />
                              <span>{feature}</span>
                            </li>
                          ))}
                        </ul>
                        <Button
                          className={`w-full ${account.popular ? 'hero-gradient' : ''}`}
                          variant={account.popular ? 'default' : 'outline'}
                          onClick={() => navigate('/auth')}
                        >
                          Start Pro Trial
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="px-6 pb-6 pt-2">
                      <Button
                        className="w-full"
                        variant="outline"
                        onClick={() => navigate('/auth')}
                      >
                        Get Started Free
                      </Button>
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* Feature Comparison Table */}
        <section className="py-16 px-4">
          <div className="container mx-auto max-w-6xl">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Feature <span className="text-primary">Comparison</span>
              </h2>
              <p className="text-lg text-muted-foreground">
                See exactly what's included in each plan at a glance.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-4 px-4 font-semibold text-foreground">Feature</th>
                    <th className="text-center py-4 px-4 font-semibold text-foreground">Personal<br/><span className="text-xs font-normal text-muted-foreground">Free</span></th>
                    <th className="text-center py-4 px-4 font-semibold text-foreground">Business<br/><span className="text-xs font-normal text-muted-foreground">Free / £19/mo</span></th>
                    <th className="text-center py-4 px-4 font-semibold text-primary">Contractor<br/><span className="text-xs font-normal text-muted-foreground">Free / £29/mo</span></th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { feature: "Browse contractor directory", personal: true, business: true, contractor: true },
                    { feature: "Request quotes", personal: true, business: true, contractor: false },
                    { feature: "Community forums", personal: true, business: true, contractor: true },
                    { feature: "Buy & sell surplus materials", personal: true, business: false, contractor: false },
                    { feature: "Public contractor profile", personal: false, business: false, contractor: true },
                    { feature: "Receive quote requests", personal: false, business: false, contractor: true },
                    { feature: "Post contract opportunities", personal: false, business: "pro", contractor: false },
                    { feature: "Manage multiple projects", personal: false, business: "pro", contractor: false },
                    { feature: "Team collaboration tools", personal: false, business: "pro", contractor: false },
                    { feature: "Company profile & branding", personal: false, business: "pro", contractor: false },
                    { feature: "Invoicing & payment system", personal: false, business: false, contractor: "pro" },
                    { feature: "Escrow-protected payments", personal: false, business: false, contractor: "pro" },
                    { feature: "Contract bidding access", personal: false, business: false, contractor: "pro" },
                    { feature: "Schedule & team management", personal: false, business: false, contractor: "pro" },
                    { feature: "Loyalty rebate tiers", personal: false, business: false, contractor: "pro" },
                    { feature: "AI assistant (Coming Soon)", personal: false, business: "pro", contractor: "pro" },
                  ].map((row, i) => (
                    <tr key={i} className={`border-b border-border ${i % 2 === 0 ? 'bg-muted/20' : ''}`}>
                      <td className="py-3 px-4 text-sm text-foreground">{row.feature}</td>
                      {[row.personal, row.business, row.contractor].map((val, j) => (
                        <td key={j} className="py-3 px-4 text-center">
                          {val === true ? (
                            <CheckCircle2 className="h-5 w-5 text-primary mx-auto" />
                          ) : val === "pro" ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                              <Crown className="h-3 w-3" /> Pro
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
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
