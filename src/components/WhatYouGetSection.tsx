const barlow = { fontFamily: "'Barlow Condensed', sans-serif" };
const lexend = { fontFamily: "'Lexend', sans-serif" };
const serif = { fontFamily: "'Source Serif 4', serif" };

interface Item {
  eyebrow: string;
  headline: string;
  description: string;
}

// Deliberately ungrouped and unsorted by audience — a contractor should see
// what a customer gets, and a business should see what a contractor gets.
// This section is one platform doing many things, not separate lists for
// separate people. Accuracy constraints (do not reword around these):
// - Items 1 and 10 both state job creation follows the deposit — this is
//   deliberate (mint_job_from_quote runs on deposit payment, after a
//   separate confirmation step) and must not simplify to "accepted = booked".
// - Item 6 must not imply funds are held or protected — nothing is held.
// - Item 13 stays on raising work, approvals and job tracking — spend
//   reporting has no site dimension, do not extend this to money.
const ITEMS: Item[] = [
  {
    eyebrow: "Quoting",
    headline: "Price it once.",
    description: "Build the quote, send it, and it turns into a job when it's accepted and the deposit is paid.",
  },
  {
    eyebrow: "No Lead Fees",
    headline: "Stop paying for phone numbers.",
    description: "You don't buy leads here. You keep the job and the customer.",
  },
  {
    eyebrow: "Getting Paid",
    headline: "Straight to your bank.",
    description: "Card payments land in your account through Stripe. No cheques, no cash on the drive.",
  },
  {
    eyebrow: "Written Quotes",
    headline: "A price before anyone starts.",
    description: "The customer sees the price, the date and what's included, in writing, before work begins.",
  },
  {
    eyebrow: "Job Tracking",
    headline: "Know where every job is.",
    description: "Scheduled, in progress, snagging, complete. One board instead of scrolling back through WhatsApp.",
  },
  {
    eyebrow: "Deposits",
    headline: "Take something up front.",
    description: "Request a deposit against the invoice before the work starts.",
  },
  {
    eyebrow: "Overdue",
    headline: "It chases so you don't.",
    description: "Invoices past their due date get flagged automatically, before you've noticed.",
  },
  {
    eyebrow: "Expenses",
    headline: "Stop losing receipts.",
    description: "Log expenses and mileage as you go, so the figures are there when you need them.",
  },
  {
    eyebrow: "References",
    headline: "Every document has a number.",
    description: "Quote, job, invoice, all referenced and all linked. Findable in seconds.",
  },
  {
    eyebrow: "Scheduling",
    headline: "A date agreed at acceptance.",
    description: "The customer picks a slot when they accept the quote, and the job lands in the diary once the deposit is paid.",
  },
  {
    eyebrow: "Snagging",
    headline: "Finish it properly.",
    description: "A stage for the last few bits, so a job isn't \"done\" until it actually is.",
  },
  {
    eyebrow: "Your Team",
    headline: "Everyone on the same job.",
    description: "Add your team so they see the same schedule and the same paperwork you do.",
  },
  {
    eyebrow: "Multi-Site",
    headline: "Every site, one screen.",
    description: "Raise work, approve quotes and track jobs across all your properties without a spreadsheet.",
  },
  {
    eyebrow: "One Login",
    headline: "Not five different apps.",
    description: "Quoting, scheduling, invoicing and payment in one place, under one account.",
  },
];

function ItemCard({ item }: { item: Item }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span aria-hidden="true" className="h-2 w-2 shrink-0" style={{ backgroundColor: "#f07820" }} />
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-500" style={lexend}>
          {item.eyebrow}
        </span>
      </div>
      <h3 className="mb-1.5 text-xl font-bold text-[#1a2744]" style={barlow}>
        {item.headline}
      </h3>
      <p className="text-base leading-relaxed text-slate-600" style={serif}>
        {item.description}
      </p>
    </div>
  );
}

const WhatYouGetSection = () => {
  return (
    <section className="bg-white px-6 py-20 md:px-12 lg:px-20">
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 flex items-center gap-6">
          <h2
            className="whitespace-nowrap text-3xl font-bold uppercase tracking-wide text-[#1a2744] md:text-4xl"
            style={barlow}
          >
            What You Get
          </h2>
          <span aria-hidden="true" className="h-px flex-1" style={{ backgroundColor: "#1a2744" }} />
        </div>

        <div className="grid grid-cols-1 gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {ITEMS.map((item) => (
            <ItemCard key={item.eyebrow} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default WhatYouGetSection;
