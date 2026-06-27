import { Link } from "react-router-dom";

const sectionHeading = "text-2xl font-semibold mb-3";
const body = "leading-relaxed mb-3";
const heading = { fontFamily: "'Lexend', sans-serif" };

const cookieTable = (
  rows: { name: string; provider: string; duration: string; purpose: string }[]
) => (
  <div className="overflow-x-auto mb-4">
    <table className="w-full text-sm border border-slate-200" style={heading}>
      <thead className="bg-slate-50">
        <tr>
          <th className="text-left p-2 border-b border-slate-200">Cookie</th>
          <th className="text-left p-2 border-b border-slate-200">Provider</th>
          <th className="text-left p-2 border-b border-slate-200">Duration</th>
          <th className="text-left p-2 border-b border-slate-200">Purpose</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.name}>
            <td className="p-2 border-b border-slate-100 font-mono text-xs">{row.name}</td>
            <td className="p-2 border-b border-slate-100">{row.provider}</td>
            <td className="p-2 border-b border-slate-100">{row.duration}</td>
            <td className="p-2 border-b border-slate-100">{row.purpose}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

const CookiePolicy = () => {
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

            <h3 className="text-lg font-semibold mb-2 mt-4" style={heading}>Strictly Necessary (no consent needed)</h3>
            {cookieTable([
              { name: "sb-access-token", provider: "Supabase", duration: "Session", purpose: "Maintains your logged-in auth session" },
              { name: "sb-refresh-token", provider: "Supabase", duration: "7 days", purpose: "Refreshes your login session" },
              { name: "__stripe_mid", provider: "Stripe", duration: "1 year", purpose: "Fraud detection" },
              { name: "__stripe_sid", provider: "Stripe", duration: "30 minutes", purpose: "Fraud detection" },
            ])}

            <h3 className="text-lg font-semibold mb-2 mt-6" style={heading}>Analytics (consent required)</h3>
            {cookieTable([
              { name: "_ga", provider: "Google Analytics", duration: "2 years", purpose: "Distinguishes unique users" },
              { name: "_ga_*", provider: "Google Analytics", duration: "2 years", purpose: "Tracks page views" },
              { name: "_gid", provider: "Google Analytics", duration: "24 hours", purpose: "Distinguishes users" },
              { name: "_gcl_au", provider: "Google Tag Manager", duration: "90 days", purpose: "Tracks conversions" },
            ])}

            <h3 className="text-lg font-semibold mb-2 mt-6" style={heading}>Preference (consent required)</h3>
            {cookieTable([
              { name: "ts_cookie_consent", provider: "TradeStone", duration: "1 year", purpose: "Stores your cookie preferences" },
            ])}
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
              <a href="mailto:rb.tradestone@gmail.com" className="text-[#f07820] hover:underline">rb.tradestone@gmail.com</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default CookiePolicy;
