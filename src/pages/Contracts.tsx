import Header from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, MessageSquare, CheckCircle2, Shield, Clock, Users, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";

const Contracts = () => {
  const [searchTerm, setSearchTerm] = useState("");

  const availableTools = [
    {
      icon: MessageSquare,
      title: "Collaborative Workflows",
      description: "Track revisions, approvals, and communication from first draft through to acceptance.",
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
      description: "Break a job into stages and issue an invoice for each one as it's completed.",
      status: "Available Now"
    },
    {
      icon: Users,
      title: "Multi-Party Agreements",
      description: "Handle contracts involving clients, subcontractors, and suppliers in one place.",
      status: "Coming Soon"
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
              <h1 className="font-heading text-4xl md:text-5xl font-bold mb-4">
                Manage <span className="text-primary">Contracts</span> with Confidence
              </h1>
              <p className="text-lg text-muted-foreground max-w-3xl mx-auto">
                From bid to signature, TradeStone keeps every agreement organised, transparent, and ready for action.
              </p>
            </div>

            <div className="bg-card rounded-lg border p-6 shadow-tradestone mb-10">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="max-w-2xl">
                  <h2 className="font-heading text-2xl font-semibold mb-2">See what&apos;s available</h2>
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

          </div>
        </section>
      </main>
    </div>
  );
};

export default Contracts;
