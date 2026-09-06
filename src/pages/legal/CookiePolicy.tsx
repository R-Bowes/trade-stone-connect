import { Link } from "react-router-dom";
import { useEffect, useRef } from "react";

const sectionHeading = "text-2xl font-semibold mb-3";
const body = "leading-relaxed mb-3";
const heading = { fontFamily: "'Lexend', sans-serif" };

const CookiePolicy = () => {
  const declarationRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = declarationRef.current;
    if (!container) return;

    // Guard against double-injection under React StrictMode's dev double-mount.
    if (container.querySelector("#CookieDeclaration")) return;

    const script = document.createElement("script");
    script.id = "CookieDeclaration";
    script.src = "https://consent.cookiebot.com/ddc201c2-3ac1-4cde-bbe0-854b34c67650/cd.js";
    script.type = "text/javascript";
    script.async = true;
    container.appendChild(script);

    return () => {
      container.innerHTML = "";
    };
  }, []);

  return (
    <div className="min-h-screen bg-white text-[#1a2744]" style={{ fontFamily: "'Lexend', sans-serif" }}>
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-[#f07820] hover:underline mb-6">
          <i className="ti ti-arrow-left" />
          Back to TradeStone
        </Link>

        <h1 className="text-4xl font-bold mb-2">Cookie Policy</h1>
        <p className="text-sm text-slate-500 mb-8">Last updated: 27 June 2026</p>

        <div style={{ fontFamily: "'Source Serif 4', serif" }}>
          <section className="mb-8">
            <h2 className={sectionHeading} style={heading}>1. What Are Cookies?</h2>
            <p className={body}>
              Cookies are small text files placed on your device when you visit a website. They allow the site to
              recognise your device and remember information about your visit.
            </p>
          </section>

          <section className="mb-8">
            <h2 className={sectionHeading} style={heading}>2. Cookies We Use</h2>

            <div ref={declarationRef} />
          </section>

          <section className="mb-8">
            <h2 className={sectionHeading} style={heading}>3. How We Obtain Consent</h2>
            <p className={body}>
              When you first visit TradeStone, you will see a cookie banner offering the choice to accept all cookies,
              reject non-essential cookies, or customise your preferences. Your choice is recorded for 12 months.
              Non-essential cookie boxes are never pre-ticked, and consent is never implied by continued use of the
              site.
            </p>
          </section>

          <section className="mb-8">
            <h2 className={sectionHeading} style={heading}>4. How to Control Cookies</h2>
            <p className={body}>
              You can update your cookie preferences at any time via the link in the platform footer. You can also
              control cookies through your browser settings (Chrome, Firefox, Safari, Edge), or by installing the{" "}
              <a
                href="https://tools.google.com/dlpage/gaoptout"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#f07820] hover:underline"
              >
                Google Analytics opt-out browser add-on
              </a>.
            </p>
          </section>

          <section className="mb-8">
            <h2 className={sectionHeading} style={heading}>5. Third-Party Cookies</h2>
            <p className={body}>
              For more information on how our third-party providers use cookies, see Stripe's privacy policy at{" "}
              <a href="https://stripe.com/gb/privacy" target="_blank" rel="noopener noreferrer" className="text-[#f07820] hover:underline">
                stripe.com/gb/privacy
              </a>{" "}
              and Google's privacy policy at{" "}
              <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-[#f07820] hover:underline">
                policies.google.com/privacy
              </a>.
            </p>
          </section>

          <section className="mb-8">
            <h2 className={sectionHeading} style={heading}>6. Changes to This Policy</h2>
            <p className={body}>
              We may update this Cookie Policy from time to time. Any changes will be posted on this page with an
              updated "Last updated" date.
            </p>
          </section>

          <section className="mb-2">
            <h2 className={sectionHeading} style={heading}>7. Contact Us</h2>
            <p className={body}>
              If you have any questions about this Cookie Policy, contact us at{" "}
              <a href="mailto:support@tradesltd.co.uk" className="text-[#f07820] hover:underline">support@tradesltd.co.uk</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default CookiePolicy;
