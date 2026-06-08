import { useState } from "react";
import { useHelpSystem, type UserRole } from "./HelpSystemProvider";

interface TutorialStep {
  title: string;
  icon: string;
  body: string;
}

const STEPS: Record<UserRole, TutorialStep[]> = {
  personal: [
    {
      title: "Welcome to TradeStone",
      icon: "ti-home",
      body: "Finding someone you can trust to work on your home shouldn't be complicated. TradeStone connects you with verified tradespeople, handles the quotes, and keeps your job on track from first message to final payment.",
    },
    {
      title: "Find the right person for the job",
      icon: "ti-search",
      body: "Search by trade and location to browse contractors near you. Check their profile, reviews, and availability before you reach out — no cold calls, no guesswork.",
    },
    {
      title: "Get a quote, not a guess",
      icon: "ti-file-text",
      body: "Send an enquiry and contractors come to you with itemised quotes. Accept the one that works, negotiate the start date, or decline — you're in control throughout.",
    },
    {
      title: "Track your job as it happens",
      icon: "ti-circle-check",
      body: "Once work starts, your job moves through clear stages. Your contractor adds photos as they go, you can message them directly, and you sign off when you're satisfied.",
    },
    {
      title: "Pay securely, keep the record",
      icon: "ti-receipt",
      body: "Invoices arrive through TradeStone and are paid with one click. Every transaction is stored in your account — no chasing paper invoices or wondering what you paid and when.",
    },
  ],
  contractor: [
    {
      title: "Welcome to TradeStone",
      icon: "ti-tools",
      body: "TradeStone helps you win work through your profile, manage every job without the admin headache, and get paid on time. Let's get you set up.",
    },
    {
      title: "Your profile is your pitch",
      icon: "ti-certificate",
      body: "Homeowners browse TradeStone before they reach out. A complete profile — trades, service area, photos, and availability — is how they find and choose you. The more detail, the better the leads.",
    },
    {
      title: "Respond to enquiries and win the job",
      icon: "ti-message-question",
      body: "New enquiries land in your dashboard. Review the brief, send a quote with your price and proposed schedule, and the client accepts directly through the platform.",
    },
    {
      title: "Manage work from start to sign-off",
      icon: "ti-layout-columns",
      body: "Every accepted job lives in your dashboard. Update the stage as you progress, add photos, message your client, and keep everything documented in one thread.",
    },
    {
      title: "Invoice and get paid through TradeStone",
      icon: "ti-receipt",
      body: "Raise your invoice when the job's complete. The client pays through TradeStone and the funds transfer to your account — no chasing, no awkward conversations.",
    },
  ],
  business: [
    {
      title: "Welcome to TradeStone",
      icon: "ti-building",
      body: "TradeStone gives you one place to manage your approved contractors, commission work across your portfolio, and stay on top of every site — without the spreadsheets.",
    },
    {
      title: "Complete your company profile",
      icon: "ti-settings",
      body: "Head to Settings and fill in your company details. This is what contractors see when they receive an invitation from you, so make it clear and complete.",
    },
    {
      title: "Build your contractor panel",
      icon: "ti-users-group",
      body: "Invite the contractors you trust to your approved panel. Once they've accepted, they're available to be assigned work across your sites.",
    },
    {
      title: "Raise jobs and approve quotes",
      icon: "ti-circle-check",
      body: "Create a job, assign it to a panel contractor, and review their quote before anything starts. Once approved, the job runs through TradeStone — stage updates, photos, and sign-off all tracked.",
    },
    {
      title: "Stay across your whole portfolio",
      icon: "ti-chart-bar",
      body: "Your dashboard shows open jobs, SLA status, and spend across all your sites at a glance. Drill into any site, check an asset's service history, or pull a spend report.",
    },
  ],
};

export default function TutorialModal() {
  const { activeModal, role, onTutorialComplete, openTutorial } = useHelpSystem();
  const [step, setStep] = useState(0);

  if (activeModal !== "tutorial") return null;

  const steps = STEPS[role];
  const current = steps[step];
  const isLast = step === steps.length - 1;

  const handleNext = () => {
    if (isLast) {
      onTutorialComplete();
      setStep(0);
    } else {
      setStep((s) => s + 1);
    }
  };

  const handleSkip = () => {
    onTutorialComplete();
    setStep(0);
  };

  // Reset step when modal opens (via openTutorial from HelpModal)
  void openTutorial; // referenced so the hook reads from context

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 14,
          border: "0.5px solid #e6e9ef",
          width: "100%",
          maxWidth: 520,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
        }}
      >
        {/* Header */}
        <div
          style={{
            background: "#f7f8fb",
            borderBottom: "1px solid #eef0f4",
            padding: "14px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 700,
              fontSize: 18,
              letterSpacing: "0.03em",
              textTransform: "uppercase",
            }}
          >
            <span style={{ color: "#1e3a5f" }}>TRADE</span>
            <span style={{ color: "#f07820" }}>STONE</span>
          </span>
          <span style={{ fontSize: 12, color: "#9ca3af", fontFamily: "inherit" }}>
            Step {step + 1} of {steps.length}
          </span>
        </div>

        {/* Body */}
        <div
          style={{
            padding: "40px 48px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            gap: 20,
          }}
        >
          {/* Icon */}
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: 14,
              background: "#fff3e8",
              border: "1.5px solid #f0c89a",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <i className={`ti ${current.icon}`} style={{ fontSize: 32, color: "#f07820", lineHeight: 1 }} />
          </div>

          {/* Title */}
          <h2
            style={{
              fontFamily: "'Lexend', sans-serif",
              fontWeight: 600,
              fontSize: 19,
              color: "#1a2744",
              margin: 0,
              lineHeight: 1.3,
              textTransform: "none",
            }}
          >
            {current.title}
          </h2>

          {/* Description */}
          <p
            style={{
              fontFamily: "'Source Serif 4', serif",
              fontSize: 14,
              lineHeight: 1.75,
              color: "#6b7280",
              maxWidth: 420,
              margin: 0,
            }}
          >
            {current.body}
          </p>
        </div>

        {/* Footer */}
        <div
          style={{
            borderTop: "1px solid #eef0f4",
            padding: "14px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexShrink: 0,
          }}
        >
          {/* Skip */}
          <button
            onClick={handleSkip}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#9ca3af",
              fontSize: 13,
              fontFamily: "inherit",
              padding: "6px 0",
            }}
          >
            Skip
          </button>

          {/* Step dots */}
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {steps.map((_, i) => (
              <div
                key={i}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: i === step ? "#f07820" : "#e6e9ef",
                  transition: "background 0.2s",
                }}
              />
            ))}
          </div>

          {/* Next / Get started */}
          <button
            onClick={handleNext}
            style={{
              background: "#f07820",
              color: "#fff",
              border: "none",
              borderRadius: 8,
              padding: "8px 20px",
              fontSize: 13,
              fontFamily: "'Lexend', sans-serif",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {isLast ? "Get started" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
