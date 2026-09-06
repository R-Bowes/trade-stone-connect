const barlow = { fontFamily: "'Barlow Condensed', sans-serif" };
const lexend = { fontFamily: "'Lexend', sans-serif" };
const serif = { fontFamily: "'Source Serif 4', serif" };
const mono = { fontFamily: "'Roboto Mono', monospace" };

const NO_FEES = ["LISTING FEES", "LEAD FEES", "SUBSCRIPTION"];

const PricingSection = () => {
  return (
    <section id="pricing" className="scroll-mt-20 px-6 py-20 md:px-12 lg:px-20" style={{ backgroundColor: "#533B31" }}>
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 md:grid-cols-2 md:gap-16">
        <div>
          <span className="mb-4 block text-xs font-semibold uppercase tracking-widest" style={{ ...lexend, color: "#f07820" }}>
            Pricing
          </span>
          <div className="mb-4 flex flex-wrap items-baseline gap-4">
            <span className="text-7xl font-bold md:text-8xl" style={{ ...mono, color: "#f07820" }}>
              5%
            </span>
            <span className="text-2xl font-bold uppercase tracking-wide text-white md:text-3xl" style={barlow}>
              Of Completed Payments
            </span>
          </div>
          <p className="max-w-md text-lg leading-relaxed text-slate-200" style={serif}>
            Charged when a job is paid through TradeStone. If no money moves, TradeStone takes nothing.
          </p>
        </div>

        <div>
          <div className="divide-y divide-white/20 border-y border-white/20">
            {NO_FEES.map((label) => (
              <div key={label} className="flex items-center gap-4 py-5">
                <span className="text-2xl font-bold" style={{ ...mono, color: "#f07820" }}>
                  NO
                </span>
                <span className="text-xl font-semibold uppercase tracking-wide text-white" style={barlow}>
                  {label}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-6 text-base leading-relaxed text-slate-200" style={serif}>
            Contractors pay nothing to be on the platform or to quote for work.
          </p>
        </div>
      </div>
    </section>
  );
};

export default PricingSection;
