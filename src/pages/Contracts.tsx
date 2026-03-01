import Header from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, FileText, MessageSquare, CheckCircle2, Shield, Clock, Users, Lock, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

const Contracts = () => {
  const [searchTerm, setSearchTerm] = useState("");

  const contractHighlights = [
    {
      icon: FileText,
      title: <>AI-Assisted Contracts <span className="text-[0.85em] opacity-90">(Coming Soon)</span></>,
      description: <>Generate and review contracts with automated quality checks and suggested terms tailored to each project <span className="text-[0.85em] opacity-90">(Coming Soon)</span>.</>
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

  const availableTools = [
    {
      icon: MessageSquare,
      title: "Collaborative Workflows",
      description: "Track revisions, approvals, and communication from first draft to final signature.",
      status: "Available Now"
    },
    {
      icon: CheckCircle2,
      title: "Compliance & Documentation",
      description: "Organise insurance, certification, and legal paperwork with deadline reminders.",
      status: "Available Now"
    },
    {
      icon: Shield,
      title: "Secure Escrow Payments",
      description: "Protect both sides of a project with milestone-based fund releases.",
      status: "Available Now"
    },
    {
      icon: Clock,
      title: "Milestone Tracking",
      description: "Set clear project phases and monitor work completion before payout.",
      status: "Available Now"
    },
    {
      icon: Users,
      title: "Multi-Party Agreements",
      description: "Handle contracts involving clients, subcontractors, and suppliers in one place.",
      status: "Available Now"
    },
    {
      icon: Sparkles,
      title: "AI-Assisted Contracts",
      description: "Generate and review contract clauses with smart recommendations.",
      status: "Coming Soon"
    }
  ] as const;

  const filteredTools = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return availableTools;

    return availableTools.filter((tool) =>
      `${tool.title} ${tool.description} ${tool.status}`.toLowerCase().includes(query)
    );
  }, [searchTerm]);

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

            <div className="bg-card rounded-lg border p-6 shadow-tradestone mb-10">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="max-w-2xl">
                  <h2 className="text-2xl font-semibold mb-2">See what&apos;s available</h2>
                  <p className="text-muted-foreground">
                    Browse contract tools in a quick, searchable view so you can spot available features at a glance.
                  </p>
                </div>

                <div className="relative w-full lg:w-[360px]">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search contract features..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="mt-4 pt-4 border-t flex items-center justify-between text-sm text-muted-foreground">
                <span>Showing {filteredTools.length} of {availableTools.length} tools</span>
                <Button variant="ghost" size="sm" className="pointer-events-none">
                  <Lock className="h-4 w-4 mr-2" />
                  Pro features highlighted
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-16">
              {filteredTools.map((tool) => (
                <Card key={tool.title} className="p-6 h-full flex flex-col">
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="bg-primary/10 rounded-lg p-3 w-fit">
                      <tool.icon className="h-6 w-6 text-primary" />
                    </div>
                    <Badge variant={tool.status === "Available Now" ? "secondary" : "outline"}>{tool.status}</Badge>
                  </div>
                  <h3 className="text-lg font-semibold mb-3">{tool.title}</h3>
                  <p className="text-muted-foreground">{tool.description}</p>
                </Card>
              ))}
            </div>

            <div className="border-t pt-12">
              <div className="mb-8">
                <h2 className="text-2xl font-bold mb-2">Everything else you still get</h2>
                <p className="text-muted-foreground">
                  The full Contracts experience remains below, now moved down for quicker access to available features first.
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
            </div>

            <div className="bg-muted/30 rounded-2xl p-8 text-center">
              <h2 className="text-2xl font-bold mb-4">Ready to streamline your contracts?</h2>
              <p className="text-muted-foreground mb-6 max-w-2xl mx-auto">
                Join TradeStone Pro to access our full contract management suite, including AI-powered <span className="text-[0.85em] opacity-90">(Coming Soon)</span> reviews and secure payment processing.
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
