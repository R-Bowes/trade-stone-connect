import Header from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, MessageSquare, CheckCircle2, Shield, Clock, Users } from "lucide-react";

const Contracts = () => {
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
    },
    {
      icon: Shield,
      title: "Secure Escrow Payments",
      description: "Funds are held securely until milestones are met, protecting both contractors and clients."
    },
    {
      icon: Clock,
      title: "Milestone Tracking",
      description: "Break projects into phases with clear deliverables and automatic payment releases."
    },
    {
      icon: Users,
      title: "Multi-Party Agreements",
      description: "Manage contracts involving multiple subcontractors, suppliers, and stakeholders in one place."
    }
  ];

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <section className="py-16 px-4">
          <div className="container mx-auto max-w-6xl">
            <div className="text-center mb-12">
              <h1 className="text-4xl md:text-5xl font-bold mb-4">
                Manage <span className="text-primary">Contracts</span> with Confidence
              </h1>
              <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
                From bid to signature, TradeStone keeps every agreement organised, transparent, and ready for action.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-16">
              {contractHighlights.map((highlight, index) => (
                <Card key={index} className="p-6 h-full flex flex-col hover:shadow-lg transition-tradestone">
                  <div className="bg-primary/10 rounded-lg p-3 w-fit mb-4">
                    <highlight.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-xl font-semibold mb-3">{highlight.title}</h3>
                  <p className="text-muted-foreground flex-1">{highlight.description}</p>
                </Card>
              ))}
            </div>

            <div className="bg-muted/30 rounded-2xl p-8 text-center">
              <h2 className="text-2xl font-bold mb-4">Ready to streamline your contracts?</h2>
              <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
                Join TradeStone Pro to access our full contract management suite, including AI-powered reviews and secure payment processing.
              </p>
              <Button size="lg" className="hero-gradient">
                Get Started with Pro
              </Button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};

export default Contracts;
