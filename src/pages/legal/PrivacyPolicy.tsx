import { Link } from "react-router-dom";

const sectionHeading = "text-2xl font-semibold mb-3";
const body = "leading-relaxed mb-3";

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-white text-[#1a2744]" style={{ fontFamily: "'Lexend', sans-serif" }}>
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-[#f07820] hover:underline mb-6">
          <i className="ti ti-arrow-left" />
          Back to TradeStone
        </Link>

        <h1 className="text-4xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-sm text-slate-500 mb-8">Last updated: 27 June 2026</p>

        <div className="border border-slate-200 rounded-lg p-5 mb-10 text-sm space-y-1">
          <p><strong>Company:</strong> TradeStone Group Ltd</p>
          <p><strong>Company No:</strong> 17229262</p>
          <p><strong>Registered Address:</strong> 82a James Carter Road, Mildenhall, Bury St. Edmunds, England, IP28 7DE</p>
          <p><strong>Contact:</strong> <a href="mailto:rb.tradestone@gmail.com" className="text-[#f07820] hover:underline">rb.tradestone@gmail.com</a></p>
          <p><strong>ICO Registration:</strong> C1969229</p>
        </div>

        <div style={{ fontFamily: "'Source Serif 4', serif" }}>
          <section className="mb-8">
            <h2 className={sectionHeading} style={{ fontFamily: "'Lexend', sans-serif" }}>1. Who We Are</h2>
            <p className={body}>
              TradeStone Group Ltd ("TradeStone", "we", "us", "our") operates the TradeStone platform, connecting
              homeowners, businesses, and contractors for trade services across the UK. This policy explains how we
              collect, use, share, and protect your personal data when you use the platform.
            </p>
          </section>

          <section className="mb-8">
            <h2 className={sectionHeading} style={{ fontFamily: "'Lexend', sans-serif" }}>2. Data We Collect</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Account data</strong> — name, email, phone number, password, account type.</li>
              <li><strong>Contractor profile data</strong> — trade, certifications, service area, portfolio, availability, reviews.</li>
              <li><strong>Business account data</strong> — company name, registered address, sites, assets, team members.</li>
              <li><strong>Job and transaction data</strong> — enquiries, quotes, invoices, job history, payment records.</li>
              <li><strong>Technical and usage data</strong> — IP address, device/browser information, pages visited, log data.</li>
              <li><strong>Communications data</strong> — messages exchanged through the platform, support correspondence.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className={sectionHeading} style={{ fontFamily: "'Lexend', sans-serif" }}>3. How We Use Your Data</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>To operate the platform — accounts, jobs, quotes, invoices, payments, messaging.</li>
              <li>To maintain security and prevent fraud or abuse.</li>
              <li>To improve our services and develop new features.</li>
              <li>To comply with legal and regulatory obligations.</li>
              <li>For marketing communications — only where you have given consent, which you may withdraw at any time.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className={sectionHeading} style={{ fontFamily: "'Lexend', sans-serif" }}>4. Who We Share Your Data With</h2>
            <p className={body}>We share data with other users as necessary for the platform to function (e.g. a contractor and customer on the same job), and with the service providers below, who process data on our behalf:</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-slate-200 mb-2" style={{ fontFamily: "'Lexend', sans-serif" }}>
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left p-2 border-b border-slate-200">Provider</th>
                    <th className="text-left p-2 border-b border-slate-200">Purpose</th>
                    <th className="text-left p-2 border-b border-slate-200">Location</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td className="p-2 border-b border-slate-100">Supabase</td><td className="p-2 border-b border-slate-100">Database and authentication</td><td className="p-2 border-b border-slate-100">USA (SCCs in place)</td></tr>
                  <tr><td className="p-2 border-b border-slate-100">Stripe</td><td className="p-2 border-b border-slate-100">Payments</td><td className="p-2 border-b border-slate-100">USA (SCCs in place)</td></tr>
                  <tr><td className="p-2 border-b border-slate-100">Vercel</td><td className="p-2 border-b border-slate-100">Hosting</td><td className="p-2 border-b border-slate-100">USA (SCCs in place)</td></tr>
                  <tr><td className="p-2 border-b border-slate-100">Resend</td><td className="p-2 border-b border-slate-100">Email delivery</td><td className="p-2 border-b border-slate-100">USA (SCCs in place)</td></tr>
                  <tr><td className="p-2">Google Analytics &amp; GTM</td><td className="p-2">Analytics</td><td className="p-2">USA (SCCs in place)</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="mb-8">
            <h2 className={sectionHeading} style={{ fontFamily: "'Lexend', sans-serif" }}>5. International Data Transfers</h2>
            <p className={body}>
              Some of our service providers are based in the United States. Where personal data is transferred outside
              the UK or EEA, we rely on Standard Contractual Clauses (SCCs) approved by the ICO/European Commission to
              ensure your data remains protected to UK GDPR standards.
            </p>
          </section>

          <section className="mb-8">
            <h2 className={sectionHeading} style={{ fontFamily: "'Lexend', sans-serif" }}>6. Payment Data</h2>
            <p className={body}>
              All card payments are processed by Stripe, a PCI DSS Level 1 certified payment provider. TradeStone never
              stores your full card details on our own systems.
            </p>
          </section>

          <section className="mb-8">
            <h2 className={sectionHeading} style={{ fontFamily: "'Lexend', sans-serif" }}>7. How Long We Keep Your Data</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border border-slate-200" style={{ fontFamily: "'Lexend', sans-serif" }}>
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left p-2 border-b border-slate-200">Data type</th>
                    <th className="text-left p-2 border-b border-slate-200">Retention period</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td className="p-2 border-b border-slate-100">Active account data</td><td className="p-2 border-b border-slate-100">Duration of account, plus 30 days</td></tr>
                  <tr><td className="p-2 border-b border-slate-100">Job and transaction records</td><td className="p-2 border-b border-slate-100">7 years (HMRC requirement)</td></tr>
                  <tr><td className="p-2 border-b border-slate-100">Payment records</td><td className="p-2 border-b border-slate-100">7 years</td></tr>
                  <tr><td className="p-2 border-b border-slate-100">Support correspondence</td><td className="p-2 border-b border-slate-100">3 years</td></tr>
                  <tr><td className="p-2 border-b border-slate-100">Marketing consent</td><td className="p-2 border-b border-slate-100">Until withdrawn, plus 1 year</td></tr>
                  <tr><td className="p-2 border-b border-slate-100">Technical logs</td><td className="p-2 border-b border-slate-100">90 days</td></tr>
                  <tr><td className="p-2">Anonymised analytics</td><td className="p-2">Indefinitely</td></tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="mb-8">
            <h2 className={sectionHeading} style={{ fontFamily: "'Lexend', sans-serif" }}>8. Your Rights</h2>
            <p className={body}>Under UK GDPR, you have the right to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Access the personal data we hold about you.</li>
              <li>Request rectification of inaccurate data.</li>
              <li>Request erasure of your data.</li>
              <li>Request restriction of processing.</li>
              <li>Request portability of your data.</li>
              <li>Object to processing.</li>
              <li>Not be subject to decisions based solely on automated processing.</li>
            </ul>
            <p className={body}>
              To exercise any of these rights, contact us at <a href="mailto:rb.tradestone@gmail.com" className="text-[#f07820] hover:underline">rb.tradestone@gmail.com</a>.
              If you remain unhappy with how we have handled your data, you can complain to the Information Commissioner's
              Office at <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer" className="text-[#f07820] hover:underline">ico.org.uk</a>.
            </p>
          </section>

          <section className="mb-8">
            <h2 className={sectionHeading} style={{ fontFamily: "'Lexend', sans-serif" }}>9. Cookies</h2>
            <p className={body}>
              We use cookies and similar technologies as described in our <Link to="/cookies" className="text-[#f07820] hover:underline">Cookie Policy</Link>.
            </p>
          </section>

          <section className="mb-8">
            <h2 className={sectionHeading} style={{ fontFamily: "'Lexend', sans-serif" }}>10. Security</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>All traffic is encrypted in transit via TLS/HTTPS.</li>
              <li>Data is encrypted at rest.</li>
              <li>Row Level Security (RLS) policies restrict access to your data within our database.</li>
              <li>Authentication is handled by Supabase Auth.</li>
              <li>We carry out regular reviews of access keys and permissions.</li>
              <li>Content Security Policy (CSP) headers help protect against common web attacks.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className={sectionHeading} style={{ fontFamily: "'Lexend', sans-serif" }}>11. Children</h2>
            <p className={body}>
              TradeStone is only available to individuals aged 18 and over. We do not knowingly collect personal data
              from anyone under 18.
            </p>
          </section>

          <section className="mb-8">
            <h2 className={sectionHeading} style={{ fontFamily: "'Lexend', sans-serif" }}>12. Changes to This Policy</h2>
            <p className={body}>
              We may update this Privacy Policy from time to time. We will post any changes on this page and update the
              "Last updated" date above.
            </p>
          </section>

          <section className="mb-2">
            <h2 className={sectionHeading} style={{ fontFamily: "'Lexend', sans-serif" }}>13. Contact Us</h2>
            <p className={body}>
              If you have any questions about this Privacy Policy, please contact us at{" "}
              <a href="mailto:rb.tradestone@gmail.com" className="text-[#f07820] hover:underline">rb.tradestone@gmail.com</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
