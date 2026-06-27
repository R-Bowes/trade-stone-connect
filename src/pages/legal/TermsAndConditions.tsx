import { Link } from "react-router-dom";

const sectionHeading = "text-2xl font-semibold mb-3";
const body = "leading-relaxed mb-3";
const heading = { fontFamily: "'Lexend', sans-serif" };

const TermsAndConditions = () => {
  return (
    <div className="min-h-screen bg-white text-[#1a2744]" style={{ fontFamily: "'Lexend', sans-serif" }}>
      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link to="/" className="inline-flex items-center gap-1 text-sm text-[#f07820] hover:underline mb-6">
          <i className="ti ti-arrow-left" />
          Back to TradeStone
        </Link>

        <h1 className="text-4xl font-bold mb-2">Terms &amp; Conditions</h1>
        <p className="text-sm text-slate-500 mb-8">Last updated: 27 June 2026</p>

        <div style={{ fontFamily: "'Source Serif 4', serif" }}>
          <section className="mb-8">
            <h2 className={sectionHeading} style={heading}>1. About Us</h2>
            <p className={body}>
              TradeStone is operated by TradeStone Group Ltd, a company registered in England and Wales (company
              number 17229262), registered office at 82a James Carter Road, Mildenhall, Bury St. Edmunds, England,
              IP28 7DE.
            </p>
          </section>

          <section className="mb-8">
            <h2 className={sectionHeading} style={heading}>2. Definitions</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Platform</strong> — the TradeStone website and services.</li>
              <li><strong>User</strong> — anyone with a TradeStone account.</li>
              <li><strong>Homeowner / Personal User</strong> — an individual user, identified by a TS-P- code.</li>
              <li><strong>Contractor</strong> — a tradesperson or firm offering services, identified by a TS-C- code.</li>
              <li><strong>Business User</strong> — a company or organisation account, identified by a TS-B- code.</li>
              <li><strong>Job</strong> — work undertaken by a Contractor for another User, arranged through the platform.</li>
              <li><strong>Enquiry</strong> — an initial request for work submitted by a User.</li>
              <li><strong>Quote</strong> — a price submitted by a Contractor in response to an Enquiry.</li>
              <li><strong>Invoice</strong> — a request for payment issued through the platform.</li>
              <li><strong>Stripe</strong> — our third-party payment processor.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className={sectionHeading} style={heading}>3. Eligibility</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>You must be at least 18 years old to use TradeStone.</li>
              <li>If registering on behalf of a business, you must have authority to bind that business.</li>
              <li>You must provide accurate and complete information when registering.</li>
              <li>You must not have been previously banned from the platform.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className={sectionHeading} style={heading}>4. Account Registration and Security</h2>
            <p className={body}>
              You are responsible for maintaining the confidentiality of your account credentials and for all activity
              that occurs under your account. Notify us immediately if you suspect unauthorised use of your account.
            </p>
          </section>

          <section className="mb-8">
            <h2 className={sectionHeading} style={heading}>5. The Platform — What We Do and Do Not Do</h2>
            <p className={body}>
              TradeStone is an intermediary platform that connects Homeowners, Business Users, and Contractors. We are
              not an employer, agent, or representative of any Contractor, and we do not employ or directly supervise
              any Contractor. We do not verify Contractor qualifications, licences, or insurance, and Users must carry
              out their own checks before engaging a Contractor.
            </p>
          </section>

          <section className="mb-8">
            <h2 className={sectionHeading} style={heading}>6. Contractor Obligations</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Provide accurate and up-to-date profile information.</li>
              <li>Hold valid public liability insurance.</li>
              <li>Hold any licences required to carry out the trade you offer.</li>
              <li>Comply with applicable health and safety legislation.</li>
              <li>Act professionally towards Homeowners and Business Users.</li>
              <li>Not solicit Users to transact off-platform to avoid platform fees.</li>
              <li>Not post or solicit false or incentivised reviews.</li>
              <li>Honour Quotes submitted through the platform.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className={sectionHeading} style={heading}>7. Business User Obligations</h2>
            <p className={body}>
              Business Users must provide accurate company information, ensure that team members added to their
              account are authorised to act on the company's behalf, and use the platform only for legitimate business
              purposes.
            </p>
          </section>

          <section className="mb-8">
            <h2 className={sectionHeading} style={heading}>8. Jobs, Quotes, and Contracts</h2>
            <p className={body}>
              Any Job, Quote, or Contract formed through the platform is a binding agreement between the relevant
              Users — not between either User and TradeStone. Contractors are solely responsible for accounting for
              and paying any VAT due on their services. Changes to a Job must be agreed in writing via the platform.
            </p>
          </section>

          <section className="mb-8">
            <h2 className={sectionHeading} style={heading}>9. Payments</h2>
            <p className={body}>
              All payments are processed through Stripe. TradeStone automatically deducts a 3.5% platform fee from
              Contractor payouts. Payouts follow Stripe's standard payout schedule. TradeStone does not hold or have
              custody of User funds at any point.
            </p>
          </section>

          <section className="mb-8">
            <h2 className={sectionHeading} style={heading}>10. Fees and Subscriptions</h2>
            <p className={body}>
              Current pricing is published on the platform. Subscription fees are non-refundable. We will give at
              least 30 days' notice of any change to our fees.
            </p>
          </section>

          <section className="mb-8">
            <h2 className={sectionHeading} style={heading}>11. Reviews and Ratings</h2>
            <p className={body}>
              Reviews must be honest and based on genuine experience. False or incentivised reviews are prohibited.
              We reserve the right to remove any review that breaches these Terms.
            </p>
          </section>

          <section className="mb-8">
            <h2 className={sectionHeading} style={heading}>12. Prohibited Uses</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Providing false or misleading information.</li>
              <li>Impersonating any person or entity.</li>
              <li>Harassing, threatening, or abusing other Users.</li>
              <li>Posting harmful, unlawful, or offensive content.</li>
              <li>Circumventing platform fees.</li>
              <li>Scraping or harvesting data from the platform.</li>
              <li>Uploading malware or other malicious code.</li>
              <li>Using the platform for any illegal activity.</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className={sectionHeading} style={heading}>13. Intellectual Property</h2>
            <p className={body}>
              The TradeStone name, logo, and platform are the property of TradeStone Group Ltd. By submitting content
              to the platform, you grant us a licence to use that content as necessary to operate the platform. You
              retain ownership of your content.
            </p>
          </section>

          <section className="mb-8">
            <h2 className={sectionHeading} style={heading}>14. Limitation of Liability</h2>
            <p className={body}>
              Our total liability to you arising out of or in connection with the platform is limited to the higher of
              (a) the fees you have paid us in the 12 months prior to the claim, or (b) £100. We are not liable for any
              indirect or consequential losses. Nothing in these Terms excludes or limits our liability for death,
              personal injury, or fraud.
            </p>
          </section>

          <section className="mb-8">
            <h2 className={sectionHeading} style={heading}>15. Indemnity</h2>
            <p className={body}>
              You agree to indemnify TradeStone against any claims, losses, or damages arising from your breach of
              these Terms or misuse of the platform.
            </p>
          </section>

          <section className="mb-8">
            <h2 className={sectionHeading} style={heading}>16. Suspension and Termination</h2>
            <p className={body}>
              You may close your account at any time. We may suspend or terminate your account for any breach of
              these Terms. Sections 5, 13, 14, 15, 17, and 18 survive termination of your account.
            </p>
          </section>

          <section className="mb-8">
            <h2 className={sectionHeading} style={heading}>17. Disputes Between Users</h2>
            <p className={body}>
              TradeStone is not a party to any dispute between Users. We may facilitate communication between Users
              but do not adjudicate disputes. We will cooperate with Stripe in respect of any payment chargebacks.
            </p>
          </section>

          <section className="mb-8">
            <h2 className={sectionHeading} style={heading}>18. Governing Law</h2>
            <p className={body}>These Terms are governed by the laws of England and Wales.</p>
          </section>

          <section className="mb-8">
            <h2 className={sectionHeading} style={heading}>19. Changes to These Terms</h2>
            <p className={body}>
              We will give at least 14 days' notice of any material changes to these Terms before they take effect.
            </p>
          </section>

          <section className="mb-2">
            <h2 className={sectionHeading} style={heading}>20. Contact</h2>
            <p className={body}>
              For any questions about these Terms, contact us at{" "}
              <a href="mailto:rb.tradestone@gmail.com" className="text-[#f07820] hover:underline">rb.tradestone@gmail.com</a>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default TermsAndConditions;
