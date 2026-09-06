const barlow = { fontFamily: "'Barlow Condensed', sans-serif" };
const lexend = { fontFamily: "'Lexend', sans-serif" };
const serif = { fontFamily: "'Source Serif 4', serif" };
const mono = { fontFamily: "'Roboto Mono', monospace" };

interface Step {
  number: string;
  label: string;
  description: string;
}

const STEPS: Step[] = [
  {
    number: "01",
    label: "Request quotes",
    description: "Describe the work and send it to contractors by trade and location.",
  },
  {
    number: "02",
    label: "Agree the work",
    description: "Accept a quote, pay the deposit and get the job in the schedule.",
  },
  {
    number: "03",
    label: "Work gets done",
    description: "The job runs to the agreed dates and is marked complete on the platform.",
  },
  {
    number: "04",
    label: "Pay securely",
    description: "The invoice is issued and payment goes through the platform.",
  },
];

const HowItWorksSection = () => {
  return (
    <section className="bg-white px-6 py-20 md:px-12 lg:px-20">
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 flex items-center gap-6">
          <h2
            className="whitespace-nowrap text-3xl font-bold uppercase tracking-wide text-[#1a2744] md:text-4xl"
            style={barlow}
          >
            How It Works
          </h2>
          <span aria-hidden="true" className="h-px flex-1" style={{ backgroundColor: "#1a2744" }} />
        </div>

        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <div key={step.number} className="relative pt-6">
              <span
                aria-hidden="true"
                className="absolute left-0 top-0 h-[2px] w-full"
                style={{ backgroundColor: i === 0 ? "#f07820" : "#1a2744" }}
              />
              <div className="mb-3 text-4xl font-bold" style={{ ...mono, color: "#f07820" }}>
                {step.number}
              </div>
              <h3 className="mb-2 text-lg font-semibold text-[#1a2744]" style={lexend}>
                {step.label}
              </h3>
              <p className="text-base leading-relaxed text-slate-600" style={serif}>
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorksSection;
