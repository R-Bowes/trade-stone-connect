import Header from "@/components/Header";
import SiteFooter from "@/components/SiteFooter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Briefcase,
  Building2,
  CalendarClock,
  CheckCircle2,
  FileCheck2,
  Home,
  MessageSquare,
  Search,
  ShieldCheck,
  Truck,
  UserRound,
  Wrench,
} from "lucide-react";
import { Link } from "react-router-dom";

const userJourneys = [
  {
    title: "Personal",
    subtitle: "Homeowners and individual clients",
    icon: Home,
    tone: "from-sky-500/10 to-sky-100/70",
    steps: [
      {
        title: "Define your job",
        description: "Post your project details, timing, and budget so contractors can quote accurately.",
        icon: FileCheck2,
      },
      {
        title: "Compare verified pros",
        description: "Review profiles, ratings, and response speed before inviting shortlisted contractors.",
        icon: Search,
      },
      {
        title: "Approve milestones",
        description: "Confirm scope and milestone payments, then track progress and messages in one place.",
        icon: CheckCircle2,
      },
    ],
    highlights: ["Quote requests", "Milestone tracking", "Clear payment records"],
  },
  {
    title: "Business",
    subtitle: "Property teams and growing companies",
    icon: Building2,
    tone: "from-violet-500/10 to-violet-100/70",
    steps: [
      {
        title: "Standardise project intake",
        description: "Capture every request with shared templates so your team scopes work consistently.",
        icon: Briefcase,
      },
      {
        title: "Coordinate multiple sites",
        description: "Assign teams, align schedules, and keep client communications tied to each project.",
        icon: CalendarClock,
      },
      {
        title: "Control spend and compliance",
        description: "Monitor invoices and contracts centrally for stronger budget and delivery oversight.",
        icon: ShieldCheck,
      },
    ],
    highlights: ["Team coordination", "Multi-job visibility", "Operational controls"],
  },
  {
    title: "Contractor",
    subtitle: "Tradespeople and specialist firms",
    icon: Wrench,
    tone: "from-orange-500/10 to-orange-100/70",
    steps: [
      {
        title: "Showcase your expertise",
        description: "Build a profile with trade skills, photos, and verified reviews to win trust fast.",
        icon: UserRound,
      },
      {
        title: "Respond with confidence",
        description: "Send structured quotes, agree schedules, and confirm scope before work begins.",
        icon: MessageSquare,
      },
      {
        title: "Deliver and get paid",
        description: "Track milestones, issue invoices, and close projects with a complete audit trail.",
        icon: Truck,
      },
    ],
    highlights: ["Profile visibility", "Quote workflow", "Invoice and payment history"],
  },
];

const About = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <section className="container mx-auto max-w-6xl px-4 py-14">
          <div className="mx-auto mb-12 max-w-3xl text-center">
            <Badge variant="secondary" className="mb-4">How It Works</Badge>
            <h1 className="mb-4 text-4xl font-bold tracking-tight md:text-5xl">TradeStone by user type</h1>
            <p className="text-lg text-muted-foreground">
              Pick your profile and follow a purpose-built flow. Every account type gets a tailored
              path from planning to payment — without duplicated steps or guesswork.
            </p>
          </div>

          <div className="space-y-8">
            {userJourneys.map((journey) => {
              const JourneyIcon = journey.icon;

              return (
                <Card key={journey.title} className="overflow-hidden border bg-card/80 shadow-sm">
                  <div className={`bg-gradient-to-r ${journey.tone} px-6 py-5`}>
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="rounded-full border bg-background/90 p-2.5">
                          <JourneyIcon className="h-5 w-5 text-foreground" />
                        </span>
                        <div>
                          <h2 className="text-2xl font-semibold">{journey.title}</h2>
                          <p className="text-sm text-muted-foreground">{journey.subtitle}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {journey.highlights.map((highlight) => (
                          <Badge key={highlight} variant="outline" className="bg-background/70">
                            {highlight}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 p-6 md:grid-cols-3">
                    {journey.steps.map((step, index) => {
                      const StepIcon = step.icon;

                      return (
                        <article key={step.title} className="rounded-xl border bg-background p-4">
                          <div className="mb-3 flex items-center gap-3">
                            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                              {index + 1}
                            </span>
                            <StepIcon className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <h3 className="mb-2 text-base font-semibold">{step.title}</h3>
                          <p className="text-sm text-muted-foreground">{step.description}</p>
                        </article>
                      );
                    })}
                  </div>
                </Card>
              );
            })}
          </div>

          <section className="mt-12 rounded-xl border bg-card p-6 text-center shadow-sm md:p-8">
            <h2 className="text-2xl font-semibold">Ready to choose your path?</h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground md:text-base">
              Create an account and select Personal, Business, or Contractor to unlock the workflow
              designed for your projects.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-3">
              <Button asChild>
                <Link to="/auth">Create account</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/contractors">Explore contractors</Link>
              </Button>
            </div>
          </section>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
};

export default About;
