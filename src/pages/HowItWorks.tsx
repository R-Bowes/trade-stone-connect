import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Users, Building2, Hammer, Sparkles } from "lucide-react";
import { useNavigate } from "react-router-dom";

// font-heading (Tailwind utility) resolves to Space Grotesk per
// tailwind.config.ts, not Barlow Condensed — inline style is the reliable
// way to get the brand display face, matching Header.tsx/Footer.tsx/the
// homepage sections.
const barlow = { fontFamily: "'Barlow Condensed', sans-serif" };
const lexend = { fontFamily: "'Lexend', sans-serif" };
const serif = { fontFamily: "'Source Serif 4', serif" };

const ACCOUNT_TYPES = [
  {
    id: "personal",
    icon: Users,
    title: "Personal",
    line: "Get quotes, hire a contractor, and pay for work on your own home.",
  },
  {
    id: "business",
    icon: Building2,
    title: "Business",
    line: "Raise requests against your sites and manage a panel of contractors.",
  },
  {
    id: "contractor",
    icon: Hammer,
    title: "Contractor",
    line: "Win work, quote, and run the admin side of your trade business.",
  },
];

const PERSONAL_STEPS = [
  {
    title: "Find a contractor",
    description: "Search by trade, location, or a contractor's TS code.",
  },
  {
    title: "Send an enquiry",
    description: "Describe the work you need done.",
  },
  {
    title: "Receive a quote",
    description: "The contractor sends a written quote for the job.",
  },
  {
    title: "Accept it and pick a date",
    description: "Agree a date with the contractor once you've accepted.",
  },
  {
    title: "Pay the deposit",
    description:
      "This is what actually confirms the job — it's a deliberate step you take, not something that happens automatically once a date is agreed.",
  },
  {
    title: "The work happens",
    description: "The job runs to the date you agreed.",
  },
  {
    title: "Pay the invoice",
    description: "The contractor issues an invoice on completion, paid through the platform.",
  },
];

const BUSINESS_FEATURES = [
  {
    title: "Team, invited your way",
    description:
      "A company account with team members invited by link or TS code, each given coverage — nationally, by site group, or to a single site.",
  },
  {
    title: "Sites and an asset register",
    description:
      "Create sites and record assets against them — category, make, model, serial number, install date.",
  },
  {
    title: "Requests tied to a site",
    description: "Raise a request against a specific site and asset, not just a general job description.",
  },
  {
    title: "A contractor panel",
    description: "Invite contractors onto your panel, approve or suspend them, and view their prequalification.",
  },
  {
    title: "Jobs by site",
    description: "Your jobs list filters by site, so you can see what's happening at each property.",
  },
  {
    title: "Work orders and service requests",
    description: "Dispatch work orders and track service requests through to completion.",
  },
  {
    title: "Invoices and spend",
    description:
      "Invoices come through the same platform payment flow as any other account. Spend is broken down by month and by contractor.",
  },
];

const CONTRACTOR_FEATURES = [
  {
    title: "Enquiries in one place",
    description: "Receive enquiries from homeowners and businesses.",
  },
  {
    title: "Quotes you can track",
    description: "Send quotes and see when they're accepted.",
  },
  {
    title: "Jobs, once the deposit lands",
    description: "A job is scheduled once the customer's deposit is paid.",
  },
  {
    title: "RAMS and checklists",
    description: "Reusable risk assessment, method statement, and checklist templates you can start a job from.",
  },
  {
    title: "Team, availability, timesheets",
    description: "Add team members, see who's working, and track hours against each job.",
  },
  {
    title: "My Kit",
    description: "Track your tools, materials, and what's out on site.",
  },
  {
    title: "Invoicing, expenses, mileage, VAT",
    description: "Raise invoices, record job costs, log travel, and handle VAT on the figures you've already entered.",
  },
  {
    title: "CRM, photos, documents",
    description: "Keep a record of clients, job photos, and the certificates and documents your work generates.",
  },
  {
    title: "A shareable public profile",
    description: "A public profile with a link you can share directly, separate from the contractor directory.",
  },
];

const HowItWorks = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white">
      <Header />
      <main>
        {/* Intro */}
        <section className="px-6 pt-16 pb-10 md:px-12 lg:px-20">
          <div className="mx-auto max-w-3xl">
            <h1 className="mb-5 text-4xl font-bold text-[#1a2744] md:text-5xl" style={barlow}>
              How TradeStone Works
            </h1>
            <p className="text-lg leading-relaxed text-slate-700" style={serif}>
              TradeStone is a platform for getting building work quoted, agreed, done and paid
              for — with the contractor's own admin tools built in alongside it.
            </p>
          </div>
        </section>

        {/* Which account is right for you — top of page, doubles as nav */}
        <section className="border-y border-slate-200 bg-[#f8f8f8] px-6 py-12 md:px-12 lg:px-20">
          <div className="mx-auto max-w-5xl">
            <h2 className="mb-6 text-xs font-semibold uppercase tracking-widest text-slate-500" style={lexend}>
              Which account is right for you?
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {ACCOUNT_TYPES.map((account) => (
                <a
                  key={account.id}
                  href={`#${account.id}`}
                  className="group flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-6 transition-colors hover:border-[#f07820]"
                >
                  <account.icon className="h-7 w-7 text-[#f07820]" strokeWidth={1.8} />
                  <h3 className="text-xl font-bold text-[#1a2744]" style={barlow}>
                    {account.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-slate-600" style={serif}>
                    {account.line}
                  </p>
                  <span
                    className="mt-auto text-sm font-medium text-[#f07820] group-hover:underline"
                    style={lexend}
                  >
                    Read more ↓
                  </span>
                </a>
              ))}
            </div>
          </div>
        </section>

        {/* PERSONAL */}
        <section id="personal" className="scroll-mt-20 px-6 py-16 md:px-12 lg:px-20">
          <div className="mx-auto max-w-3xl">
            <div className="mb-8 flex items-center gap-3">
              <Users className="h-7 w-7 text-[#f07820]" strokeWidth={1.8} />
              <h2 className="text-3xl font-bold text-[#1a2744] md:text-4xl" style={barlow}>
                Personal
              </h2>
            </div>
            <p className="mb-8 text-sm font-medium uppercase tracking-wide text-slate-500" style={lexend}>
              For homeowners
            </p>

            <ol className="space-y-6">
              {PERSONAL_STEPS.map((step, i) => (
                <li key={step.title} className="flex gap-4">
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                    style={{ ...lexend, backgroundColor: "#1a2744", color: "#fff" }}
                  >
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="mb-1 font-semibold text-[#1a2744]" style={lexend}>
                      {step.title}
                    </h3>
                    <p className="leading-relaxed text-slate-600" style={serif}>
                      {step.description}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* BUSINESS */}
        <section id="business" className="scroll-mt-20 bg-[#f8f8f8] px-6 py-16 md:px-12 lg:px-20">
          <div className="mx-auto max-w-3xl">
            <div className="mb-8 flex items-center gap-3">
              <Building2 className="h-7 w-7 text-[#f07820]" strokeWidth={1.8} />
              <h2 className="text-3xl font-bold text-[#1a2744] md:text-4xl" style={barlow}>
                Business
              </h2>
            </div>
            <p className="mb-8 text-sm font-medium uppercase tracking-wide text-slate-500" style={lexend}>
              For property managers, landlords and facilities teams
            </p>

            <div className="space-y-6">
              {BUSINESS_FEATURES.map((feature) => (
                <div key={feature.title}>
                  <h3 className="mb-1 font-semibold text-[#1a2744]" style={lexend}>
                    {feature.title}
                  </h3>
                  <p className="leading-relaxed text-slate-600" style={serif}>
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>

            <p className="mt-8 rounded-lg border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-600" style={serif}>
              Work is site-scoped — jobs and requests are tied to the site and asset they belong
              to. Spend reporting is company-wide, broken down by month and by contractor, rather
              than by site.
            </p>
          </div>
        </section>

        {/* CONTRACTOR */}
        <section id="contractor" className="scroll-mt-20 px-6 py-16 md:px-12 lg:px-20">
          <div className="mx-auto max-w-3xl">
            <div className="mb-8 flex items-center gap-3">
              <Hammer className="h-7 w-7 text-[#f07820]" strokeWidth={1.8} />
              <h2 className="text-3xl font-bold text-[#1a2744] md:text-4xl" style={barlow}>
                Contractor
              </h2>
            </div>
            <p className="mb-8 text-sm font-medium uppercase tracking-wide text-slate-500" style={lexend}>
              For trade businesses
            </p>

            <div className="space-y-6">
              {CONTRACTOR_FEATURES.map((feature) => (
                <div key={feature.title}>
                  <h3 className="mb-1 font-semibold text-[#1a2744]" style={lexend}>
                    {feature.title}
                  </h3>
                  <p className="leading-relaxed text-slate-600" style={serif}>
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>

            <p className="mt-6 leading-relaxed text-slate-600" style={serif}>
              Reviews from completed jobs build your profile over time.
            </p>
          </div>
        </section>

        {/* Messaging */}
        <section className="border-y border-slate-200 bg-[#f8f8f8] px-6 py-12 md:px-12 lg:px-20">
          <div className="mx-auto max-w-3xl">
            <h2 className="mb-3 text-xl font-bold text-[#1a2744]" style={barlow}>
              Messaging
            </h2>
            <p className="leading-relaxed text-slate-600" style={serif}>
              Messaging is attached to a job or enquiry, for everyone on the platform — there's no
              general inbox, and no way to message a contractor before there's a live enquiry
              between you.
            </p>
          </div>
        </section>

        {/* Pricing */}
        <section className="px-6 py-16 md:px-12 lg:px-20" style={{ backgroundColor: "#533B31" }}>
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="mb-4 text-3xl font-bold text-white md:text-4xl" style={barlow}>
              Simple Pricing
            </h2>
            <p className="text-lg leading-relaxed text-slate-200" style={serif}>
              TradeStone charges 5% of the value of completed payments, deducted automatically
              when you get paid. There are no subscriptions, no listing fees and no lead fees. If
              you don't get paid, we don't get paid.
            </p>
          </div>
        </section>

        {/* Coming soon — clearly separated, not mixed into any journey above */}
        <section className="px-6 py-16 md:px-12 lg:px-20">
          <div className="mx-auto max-w-3xl">
            <div className="rounded-xl border border-dashed border-slate-300 p-8">
              <div className="mb-3 flex items-center gap-3">
                <Sparkles className="h-6 w-6 text-slate-400" strokeWidth={1.8} />
                <h2 className="text-xl font-bold text-[#1a2744]" style={barlow}>
                  Coming soon
                </h2>
              </div>
              <p className="leading-relaxed text-slate-600" style={serif}>
                <span className="font-semibold text-[#1a2744]">AI-assisted contracts</span> —
                generating and reviewing contract clauses with smart recommendations.
              </p>
            </div>
          </div>
        </section>

        <div className="px-6 pb-20 text-center md:px-12 lg:px-20">
          <Button size="lg" className="bg-orange-500 text-white hover:bg-orange-400" onClick={() => navigate("/auth")}>
            Get Started Today
          </Button>
        </div>
      </main>
    </div>
  );
};

export default HowItWorks;
