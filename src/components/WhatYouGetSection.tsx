const barlow = { fontFamily: "'Barlow Condensed', sans-serif" };
const lexend = { fontFamily: "'Lexend', sans-serif" };
const serif = { fontFamily: "'Source Serif 4', serif" };

interface Item {
  label: string;
  description: string;
}

const CONTRACTOR_ITEMS: Item[] = [
  { label: "Quoting", description: "Issue quotes against a customer's request and track acceptance." },
  { label: "Scheduling", description: "Book accepted jobs into dates once the deposit is paid." },
  { label: "Invoicing", description: "Raise the invoice on completion and get paid through the platform." },
  { label: "Expenses", description: "Record job costs where the job already lives." },
  { label: "Mileage", description: "Log travel per job instead of reconstructing it later." },
  { label: "VAT", description: "VAT tools built on the invoices and expenses you already entered." },
];

// Wording constraints (non-negotiable):
// - "Multiple quotes" must not claim a side-by-side comparison view — none exists.
// - "Staged payments" must not imply funds are held — accept-quote uses a Stripe
//   destination charge and transfers immediately; stages schedule invoices only.
const CUSTOMER_ITEMS: Item[] = [
  { label: "Browse", description: "Find contractors by trade and by location." },
  { label: "Multiple quotes", description: "Receive quotes from more than one contractor for the same request." },
  { label: "Secure payment", description: "Deposits and invoices are paid through the platform." },
  { label: "Staged payments", description: "Larger jobs can be invoiced in stages as work is completed." },
];

function Column({ eyebrow, title, items }: { eyebrow: string; title: string; items: Item[] }) {
  return (
    <div>
      <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-slate-500" style={lexend}>
        {eyebrow}
      </span>
      <h3 className="mb-6 text-2xl font-bold text-[#1a2744] md:text-3xl" style={barlow}>
        {title}
      </h3>
      <dl className="space-y-5">
        {items.map((item) => (
          <div key={item.label}>
            <dt className="mb-1 text-base font-semibold text-[#1a2744]" style={lexend}>
              {item.label}
            </dt>
            <dd className="text-base leading-relaxed text-slate-600" style={serif}>
              {item.description}
            </dd>
          </div>
        ))}
      </dl>
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

        <div className="grid grid-cols-1 gap-12 md:grid-cols-2 md:gap-16">
          <Column eyebrow="For Contractors" title="Replace the spreadsheet" items={CONTRACTOR_ITEMS} />
          <Column eyebrow="For Customers" title="Hire without the guesswork" items={CUSTOMER_ITEMS} />
        </div>
      </div>
    </section>
  );
};

export default WhatYouGetSection;
