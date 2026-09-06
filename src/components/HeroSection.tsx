import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDashboardPath } from "@/hooks/useDashboardPath";

const lexend = { fontFamily: "'Lexend', sans-serif" };
const barlow = { fontFamily: "'Barlow Condensed', sans-serif" };
const serif = { fontFamily: "'Source Serif 4', serif" };

interface HeroMessage {
  eyebrow: string;
  tagline: string;
  supporting: string;
}

const MESSAGES: HeroMessage[] = [
  {
    eyebrow: "QUOTE TO PAYMENT",
    tagline: "Quote it. Do it. Get paid for it.",
    supporting: "One place for quotes, scheduling, invoicing and payment.",
  },
  {
    eyebrow: "HIRING BUILDING WORK",
    tagline: "Agree the price before work starts.",
    supporting: "A written quote you accept, a deposit, and a date in the diary.",
  },
  {
    eyebrow: "NO LEAD FEES",
    tagline: "Stop paying for leads that go nowhere.",
    supporting: "5% when a job is paid. Nothing when it isn't.",
  },
  {
    eyebrow: "FOR SITE OPERATORS",
    tagline: "Run every site from one place.",
    supporting: "Quotes, jobs and invoices across multiple properties.",
  },
  {
    eyebrow: "CONTRACTOR ADMIN",
    tagline: "Stop chasing invoices.",
    supporting: "Send it, get paid through the platform, see what's outstanding.",
  },
];

const ROTATE_MS = 6000;

type Audience = "contractor" | "personal";

const HeroSection = () => {
  const navigate = useNavigate();
  const { user, dashboardPath } = useDashboardPath();
  const isLoggedIn = !!user;

  const [index, setIndex] = useState(0);
  const [hoverPaused, setHoverPaused] = useState(false);
  const [focusPaused, setFocusPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const [email, setEmail] = useState("");
  const [audience, setAudience] = useState<Audience>("contractor");

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (reducedMotion || hoverPaused || focusPaused) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % MESSAGES.length);
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [reducedMotion, hoverPaused, focusPaused]);

  const activeIndex = reducedMotion ? 0 : index;
  const message = MESSAGES[activeIndex];

  const handleContinue = () => {
    const params = new URLSearchParams();
    if (email.trim()) params.set("email", email.trim());
    params.set("type", audience);
    navigate(`/auth?${params.toString()}`);
  };

  const segmentBase =
    "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors";
  const segmentActive = "border-[#1a2744] bg-[#1a2744] text-white";
  const segmentInactive = "border-slate-300 bg-white text-slate-600 hover:border-slate-400";

  return (
    <section
      className="grid grid-cols-1 md:grid-cols-2"
      onMouseEnter={() => setHoverPaused(true)}
      onMouseLeave={() => setHoverPaused(false)}
    >
      {/* LEFT — rotating message, paper background */}
      <div className="flex flex-col justify-center bg-[#efefef] px-6 py-16 md:px-12 md:py-0 lg:px-20">
        <div className="mx-auto w-full max-w-xl md:mx-0">
          <div className="flex min-h-[260px] flex-col justify-center md:min-h-[300px]">
            <div key={activeIndex} className={reducedMotion ? undefined : "animate-in fade-in duration-700"}>
              <div className="mb-3 flex items-center gap-2">
                <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0" style={{ backgroundColor: "#f07820" }} />
                <span className="text-xs font-semibold uppercase tracking-widest text-slate-600" style={lexend}>
                  {message.eyebrow}
                </span>
              </div>
              <h1
                className="mb-4 text-4xl font-bold leading-tight text-[#1a2744] md:text-5xl"
                style={barlow}
              >
                {message.tagline}
              </h1>
              <p className="max-w-md text-lg leading-relaxed text-slate-600" style={serif}>
                {message.supporting}
              </p>
            </div>

            {!reducedMotion && (
              <div className="mt-6 flex gap-2">
                {MESSAGES.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-label={`Show message ${i + 1} of ${MESSAGES.length}`}
                    aria-current={i === activeIndex}
                    className="h-2 w-2 rounded-full transition-colors"
                    style={{ backgroundColor: i === activeIndex ? "#f07820" : "#d4d4d8" }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* RIGHT — signup card, full-bleed navy panel */}
      <div className="flex items-center justify-center bg-[#1a2744] px-6 py-16 md:py-24">
        <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-[#f8f8f8] shadow-2xl">
          <div className="h-1.5" style={{ backgroundColor: "#f07820" }} />
          {isLoggedIn ? (
            <div className="p-8">
              <h2 className="mb-6 text-xl font-semibold text-[#1a2744]" style={lexend}>
                Welcome back
              </h2>

              {dashboardPath ? (
                <Button
                  asChild
                  className="w-full rounded-xl bg-orange-500 py-6 text-base font-semibold text-white hover:bg-orange-400"
                >
                  <Link to={dashboardPath}>Go to my dashboard</Link>
                </Button>
              ) : (
                // dashboardPath is null while team-membership status is
                // still resolving (see useDashboardPath) — disabled rather
                // than a guessed link, same rule the Header's own home
                // icon follows.
                <Button
                  disabled
                  className="w-full rounded-xl bg-orange-500 py-6 text-base font-semibold text-white"
                >
                  Go to my dashboard
                </Button>
              )}

              <p className="mt-4 text-center text-sm text-slate-600" style={lexend}>
                <Link to="/contractors" className="font-medium text-[#f07820] hover:underline">
                  Find contractors
                </Link>
              </p>
            </div>
          ) : (
            <div
              className="p-8"
              onFocus={() => setFocusPaused(true)}
              onBlur={() => setFocusPaused(false)}
            >
              <h2 className="mb-1 text-xl font-semibold text-[#1a2744]" style={lexend}>
                Start with an email
              </h2>
              <p className="mb-6 text-sm text-slate-600" style={serif}>
                Takes a minute. Nothing to pay to join.
              </p>

              <label htmlFor="hero-signup-email" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500" style={lexend}>
                Email
              </label>
              <Input
                id="hero-signup-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="mb-5 bg-white"
              />

              <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500" style={lexend}>
                I am
              </span>
              <div className="mb-6 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setAudience("contractor")}
                  className={`${segmentBase} ${audience === "contractor" ? segmentActive : segmentInactive}`}
                >
                  I'm a contractor
                </button>
                <button
                  type="button"
                  onClick={() => setAudience("personal")}
                  className={`${segmentBase} ${audience === "personal" ? segmentActive : segmentInactive}`}
                >
                  I'm hiring
                </button>
              </div>

              <Button
                onClick={handleContinue}
                className="w-full rounded-xl bg-orange-500 py-6 text-base font-semibold text-white hover:bg-orange-400"
              >
                Continue
              </Button>

              <p className="mt-4 text-center text-sm text-slate-600" style={lexend}>
                Already have an account?{" "}
                <Link to="/auth" className="font-medium text-[#f07820] hover:underline">
                  Log in
                </Link>
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
