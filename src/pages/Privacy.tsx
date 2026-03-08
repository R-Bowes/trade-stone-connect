import Header from "@/components/Header";
import SiteFooter from "@/components/SiteFooter";
import { Link } from "react-router-dom";

const Privacy = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="container mx-auto px-4 py-12 max-w-4xl flex-1">
        <h1 className="text-4xl font-bold mb-2">Privacy Policy</h1>
        <p className="text-muted-foreground mb-8">Effective Date: 8 March 2026 &nbsp;|&nbsp; Last Updated: 8 March 2026</p>

        <div className="prose prose-lg max-w-none space-y-10 text-foreground">

          {/* 1 */}
          <section>
            <h2 className="text-2xl font-semibold mb-4">1. Introduction &amp; Data Controller</h2>
            <p>This Privacy Policy explains how TradeStone ("<strong>TradeStone</strong>," "<strong>we</strong>," "<strong>us</strong>," or "<strong>our</strong>") collects, uses, shares, retains, and protects your personal data when you access or use the TradeStone platform, website, mobile applications, and all associated services (collectively, the "<strong>Platform</strong>").</p>
            <p>TradeStone is the data controller for the purposes of the UK General Data Protection Regulation (UK GDPR), the Data Protection Act 2018, and, where applicable, the EU General Data Protection Regulation (EU GDPR). Our registered address is:</p>
            <p className="pl-4 border-l-2 border-primary/30">
              TradeStone Ltd<br />
              [Registered Address]<br />
              United Kingdom<br />
              Data Protection Officer: <a href="mailto:dpo@tradestone.com" className="text-primary hover:underline">dpo@tradestone.com</a>
            </p>
            <p>By using the Platform, you acknowledge that you have read and understood this Privacy Policy. If you do not agree, you must discontinue use of the Platform immediately. This Privacy Policy should be read alongside our <Link to="/terms" className="text-primary hover:underline">Terms of Use</Link>.</p>
          </section>

          {/* 2 */}
          <section>
            <h2 className="text-2xl font-semibold mb-4">2. Definitions</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>"Personal Data"</strong> means any information relating to an identified or identifiable natural person as defined by Article 4(1) UK GDPR.</li>
              <li><strong>"Processing"</strong> means any operation performed on Personal Data, including collection, recording, organisation, storage, retrieval, use, disclosure, or erasure.</li>
              <li><strong>"Special Category Data"</strong> means Personal Data revealing racial or ethnic origin, political opinions, religious beliefs, trade union membership, genetic or biometric data, health data, or data concerning a person's sex life or sexual orientation.</li>
              <li><strong>"Data Subject"</strong> means you — any individual whose Personal Data is processed by TradeStone.</li>
              <li><strong>"Sub-processor"</strong> means any third party engaged by TradeStone to process Personal Data on our behalf.</li>
            </ul>
          </section>

          {/* 3 */}
          <section>
            <h2 className="text-2xl font-semibold mb-4">3. Personal Data We Collect</h2>

            <h3 className="text-xl font-semibold mb-3 mt-6">3.1 Data You Provide Directly</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Identity Data:</strong> Full name, date of birth, government-issued identification (where required for contractor verification).</li>
              <li><strong>Contact Data:</strong> Email address, telephone number, postal address, business address.</li>
              <li><strong>Account Data:</strong> Username, encrypted password hash, account type (personal, business, or contractor), company name, TradeStone profile code.</li>
              <li><strong>Professional Data:</strong> Trade qualifications, certifications, insurance documentation, portfolio photographs, project descriptions.</li>
              <li><strong>Financial Data:</strong> Bank account details (for contractor payouts), payment card information (processed exclusively by PCI-DSS-compliant third-party processors — we never store full card numbers).</li>
              <li><strong>Communications Data:</strong> Messages sent through the Platform's messaging system, quote requests, invoice details, contract terms.</li>
              <li><strong>Marketplace Data:</strong> Listings, item descriptions, pricing, condition, photographs, and location data for marketplace transactions.</li>
              <li><strong>CRM Data:</strong> Client records created by contractors, including client names, contact details, activity logs, and revenue data.</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 mt-6">3.2 Data Collected Automatically</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Device &amp; Technical Data:</strong> IP address, browser type and version, operating system, device identifiers, screen resolution, language preferences.</li>
              <li><strong>Usage Data:</strong> Pages visited, features used, clickstream data, session duration, referring URLs, search queries within the Platform.</li>
              <li><strong>Location Data:</strong> Approximate geographic location derived from IP address; precise location only if you grant explicit permission.</li>
              <li><strong>Cookie &amp; Tracking Data:</strong> Data collected via cookies, web beacons, pixel tags, and similar technologies (see Section 10).</li>
              <li><strong>Log Data:</strong> Server logs recording access times, error reports, and API call metadata.</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 mt-6">3.3 Data from Third Parties</h3>
            <ul className="list-disc pl-6 space-y-1">
              <li><strong>Authentication Providers:</strong> If you sign in via a third-party service, we receive your name, email, and profile picture as authorised by that provider.</li>
              <li><strong>Payment Processors:</strong> Transaction confirmation, refund status, and dispute information from Stripe or other payment processors.</li>
              <li><strong>Public Sources:</strong> Companies House records, professional body registrations, and publicly available reviews for contractor verification.</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 mt-6">3.4 Special Category Data</h3>
            <p>We do not intentionally collect Special Category Data. If such data is inadvertently provided (e.g., within free-text fields), we will delete it upon discovery unless a lawful basis for processing applies.</p>
          </section>

          {/* 4 */}
          <section>
            <h2 className="text-2xl font-semibold mb-4">4. Lawful Bases for Processing</h2>
            <p>We process your Personal Data only where we have a valid lawful basis under Article 6 UK GDPR:</p>

            <div className="overflow-x-auto mt-4">
              <table className="w-full text-sm border border-border rounded">
                <thead>
                  <tr className="bg-muted">
                    <th className="text-left p-3 font-semibold border-b border-border">Purpose</th>
                    <th className="text-left p-3 font-semibold border-b border-border">Lawful Basis</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border">
                    <td className="p-3">Account creation and management</td>
                    <td className="p-3">Performance of contract (Art. 6(1)(b))</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="p-3">Facilitating quotes, invoices, contracts, and payments</td>
                    <td className="p-3">Performance of contract (Art. 6(1)(b))</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="p-3">Fraud prevention and platform security</td>
                    <td className="p-3">Legitimate interest (Art. 6(1)(f))</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="p-3">Compliance with legal obligations (tax, anti-money laundering)</td>
                    <td className="p-3">Legal obligation (Art. 6(1)(c))</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="p-3">Product improvement and analytics</td>
                    <td className="p-3">Legitimate interest (Art. 6(1)(f))</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="p-3">Marketing communications</td>
                    <td className="p-3">Consent (Art. 6(1)(a))</td>
                  </tr>
                  <tr>
                    <td className="p-3">Sharing contact data between transacting parties</td>
                    <td className="p-3">Performance of contract / Legitimate interest</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-4">Where we rely on legitimate interest, we have conducted a Legitimate Interest Assessment (LIA) to ensure our interests do not override your fundamental rights and freedoms. You may request a copy of any LIA by contacting our DPO.</p>
          </section>

          {/* 5 */}
          <section>
            <h2 className="text-2xl font-semibold mb-4">5. How We Use Your Personal Data</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Platform Operation:</strong> Creating and maintaining your account; authenticating logins; processing quotes, invoices, and contracts; enabling messaging between users.</li>
              <li><strong>Marketplace Services:</strong> Displaying listings to other users; facilitating buyer-seller communications through the Platform's private messaging system (email and phone are never publicly displayed on marketplace listings).</li>
              <li><strong>Privacy-Preserving Profile Display:</strong> Public contractor profiles display only non-sensitive information (name, company, trade specialisms). Contact details are disclosed only through authorised Platform workflows such as accepted quotes, invoices, or direct messaging.</li>
              <li><strong>Financial Processing:</strong> Processing payments, issuing invoices, calculating transaction fees, generating financial reports, and facilitating contractor payouts.</li>
              <li><strong>Schedule &amp; CRM:</strong> Managing contractor schedules, availability, team members, timesheets, and client relationship data.</li>
              <li><strong>Communications:</strong> Sending transactional emails (quote notifications, invoice alerts, contract updates); with your consent, sending marketing communications.</li>
              <li><strong>Safety &amp; Security:</strong> Detecting and preventing fraud, abuse, and security incidents; rate-limiting requests; enforcing our Terms of Use.</li>
              <li><strong>Analytics &amp; Improvement:</strong> Analysing usage patterns to improve the Platform; conducting A/B testing; debugging technical issues.</li>
              <li><strong>Legal Compliance:</strong> Fulfilling tax reporting obligations, responding to lawful data requests, and maintaining records as required by law.</li>
            </ul>
          </section>

          {/* 6 */}
          <section>
            <h2 className="text-2xl font-semibold mb-4">6. Data Sharing &amp; Disclosure</h2>
            <p>We never sell your Personal Data. We share it only in the following circumstances:</p>

            <h3 className="text-xl font-semibold mb-3 mt-6">6.1 With Other Platform Users</h3>
            <p>When you engage in a transaction (quote, invoice, contract, or marketplace purchase), relevant contact and project information is shared with the other party to the extent necessary to fulfil the transaction. Your email and phone number are never publicly visible on your profile or marketplace listings.</p>

            <h3 className="text-xl font-semibold mb-3 mt-6">6.2 Sub-processors &amp; Service Providers</h3>
            <p>We engage carefully vetted sub-processors who process data solely on our instructions and under contractual obligations compliant with Article 28 UK GDPR:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li><strong>Supabase Inc.</strong> — Database hosting, authentication, and edge functions (US, with EU data residency options; Standard Contractual Clauses in place).</li>
              <li><strong>Stripe Inc.</strong> — Payment processing (PCI-DSS Level 1 certified).</li>
              <li><strong>hCaptcha (Intuition Machines Inc.)</strong> — Bot prevention and CAPTCHA verification.</li>
              <li><strong>Email Service Providers</strong> — Transactional email delivery (e.g., quote notifications, invoice alerts).</li>
              <li><strong>Cloud Hosting Providers</strong> — Application hosting, CDN, and static asset delivery.</li>
            </ul>
            <p className="mt-2">A complete, current list of sub-processors is available upon request to <a href="mailto:dpo@tradestone.com" className="text-primary hover:underline">dpo@tradestone.com</a>.</p>

            <h3 className="text-xl font-semibold mb-3 mt-6">6.3 Legal &amp; Regulatory Disclosure</h3>
            <p>We may disclose your Personal Data where required by law, regulation, legal process, or governmental request, including:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li>Court orders, subpoenas, or statutory obligations.</li>
              <li>HMRC or other tax authority requirements.</li>
              <li>Anti-money laundering (AML) or counter-terrorism financing obligations.</li>
              <li>To protect the rights, property, or safety of TradeStone, our users, or the public.</li>
            </ul>

            <h3 className="text-xl font-semibold mb-3 mt-6">6.4 Business Transfers</h3>
            <p>In the event of a merger, acquisition, reorganisation, or sale of assets, your Personal Data may be transferred to the successor entity. We will notify you before your data becomes subject to a different privacy policy.</p>
          </section>

          {/* 7 */}
          <section>
            <h2 className="text-2xl font-semibold mb-4">7. International Data Transfers</h2>
            <p>Your Personal Data may be transferred to and processed in countries outside the United Kingdom and the European Economic Area (EEA), including the United States. Where such transfers occur, we ensure an adequate level of protection through one or more of the following safeguards:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li><strong>Adequacy Decisions:</strong> Transfers to countries recognised by the UK Secretary of State or European Commission as providing adequate data protection.</li>
              <li><strong>Standard Contractual Clauses (SCCs):</strong> Approved contractual clauses ensuring the recipient provides equivalent data protection standards.</li>
              <li><strong>UK International Data Transfer Agreement (IDTA):</strong> Where required, we execute the UK Addendum to SCCs or the standalone IDTA.</li>
              <li><strong>Supplementary Measures:</strong> Encryption in transit (TLS 1.2+) and at rest (AES-256), access controls, and data minimisation as additional safeguards.</li>
            </ul>
            <p className="mt-2">You may obtain a copy of the relevant transfer safeguards by contacting our DPO.</p>
          </section>

          {/* 8 */}
          <section>
            <h2 className="text-2xl font-semibold mb-4">8. Data Retention</h2>
            <p>We retain Personal Data only for as long as necessary to fulfil the purposes outlined in this Policy, unless a longer retention period is required or permitted by law:</p>
            <div className="overflow-x-auto mt-4">
              <table className="w-full text-sm border border-border rounded">
                <thead>
                  <tr className="bg-muted">
                    <th className="text-left p-3 font-semibold border-b border-border">Data Category</th>
                    <th className="text-left p-3 font-semibold border-b border-border">Retention Period</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border">
                    <td className="p-3">Account &amp; profile data</td>
                    <td className="p-3">Duration of account + 2 years after deletion request</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="p-3">Contracts, invoices &amp; financial records</td>
                    <td className="p-3">7 years (UK tax &amp; accounting obligations)</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="p-3">Messages &amp; communications</td>
                    <td className="p-3">Duration of account + 1 year after deletion</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="p-3">Marketplace listings</td>
                    <td className="p-3">Duration of listing + 1 year after removal</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="p-3">Server &amp; access logs</td>
                    <td className="p-3">90 days (rolling)</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="p-3">CAPTCHA verification tokens</td>
                    <td className="p-3">Session duration only</td>
                  </tr>
                  <tr>
                    <td className="p-3">Cookie &amp; analytics data</td>
                    <td className="p-3">As specified in Section 10</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-4">Upon expiry of the retention period, data is securely deleted or irreversibly anonymised within 30 days.</p>
          </section>

          {/* 9 */}
          <section>
            <h2 className="text-2xl font-semibold mb-4">9. Data Security</h2>
            <p>We implement appropriate technical and organisational measures in accordance with Article 32 UK GDPR, including but not limited to:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li><strong>Encryption:</strong> All data in transit is encrypted via TLS 1.2 or higher. Data at rest is encrypted using AES-256.</li>
              <li><strong>Authentication:</strong> Passwords are hashed using bcrypt with appropriate cost factors. Multi-factor authentication is supported. CAPTCHA verification prevents automated abuse.</li>
              <li><strong>Access Controls:</strong> Role-based access controls (RBAC) enforced through Row-Level Security (RLS) policies at the database level. Staff access follows the principle of least privilege.</li>
              <li><strong>Infrastructure:</strong> Hosted on SOC 2 Type II certified infrastructure with automatic failover and redundancy.</li>
              <li><strong>Monitoring:</strong> Real-time intrusion detection, automated security scanning, rate limiting on API endpoints, and continuous vulnerability assessment.</li>
              <li><strong>Incident Response:</strong> Documented incident response plan with defined roles and escalation procedures. Data breaches will be reported to the ICO within 72 hours of discovery where required by Article 33 UK GDPR, and affected individuals notified without undue delay where the breach poses a high risk to rights and freedoms.</li>
              <li><strong>Privacy by Design:</strong> Public-facing profiles use a security-defined database view that exposes only non-sensitive fields (name, company), ensuring contact details are never inadvertently disclosed.</li>
            </ul>
            <p className="mt-2">No system can guarantee absolute security. If you suspect any security breach, contact us immediately at <a href="mailto:security@tradestone.com" className="text-primary hover:underline">security@tradestone.com</a>.</p>
          </section>

          {/* 10 */}
          <section>
            <h2 className="text-2xl font-semibold mb-4">10. Cookies &amp; Tracking Technologies</h2>

            <h3 className="text-xl font-semibold mb-3 mt-6">10.1 Types of Cookies We Use</h3>
            <div className="overflow-x-auto mt-2">
              <table className="w-full text-sm border border-border rounded">
                <thead>
                  <tr className="bg-muted">
                    <th className="text-left p-3 font-semibold border-b border-border">Category</th>
                    <th className="text-left p-3 font-semibold border-b border-border">Purpose</th>
                    <th className="text-left p-3 font-semibold border-b border-border">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border">
                    <td className="p-3 font-medium">Strictly Necessary</td>
                    <td className="p-3">Authentication session, CSRF protection, CAPTCHA validation, cookie consent preferences</td>
                    <td className="p-3">Session / up to 1 year</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="p-3 font-medium">Functional</td>
                    <td className="p-3">User preferences, onboarding tour completion status, theme preferences</td>
                    <td className="p-3">Up to 1 year</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="p-3 font-medium">Analytics</td>
                    <td className="p-3">Aggregated usage statistics, page view counts, feature adoption metrics</td>
                    <td className="p-3">Up to 2 years</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-medium">Marketing</td>
                    <td className="p-3">Advertising effectiveness measurement (only with explicit consent)</td>
                    <td className="p-3">Up to 1 year</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <h3 className="text-xl font-semibold mb-3 mt-6">10.2 Managing Cookies</h3>
            <p>You can manage cookie preferences through your browser settings or our cookie consent banner. Disabling strictly necessary cookies may impair Platform functionality. We honour "Do Not Track" browser signals where technically feasible.</p>

            <h3 className="text-xl font-semibold mb-3 mt-6">10.3 Local Storage</h3>
            <p>We use browser local storage for non-sensitive functional preferences (e.g., onboarding tour completion status, UI preferences). This data remains on your device and is not transmitted to our servers.</p>
          </section>

          {/* 11 */}
          <section>
            <h2 className="text-2xl font-semibold mb-4">11. Your Rights Under UK/EU GDPR</h2>
            <p>You have the following rights, exercisable free of charge (subject to statutory exceptions):</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li><strong>Right of Access (Art. 15):</strong> Obtain confirmation of whether your data is processed and request a copy. We will respond within one month (extendable by two months for complex requests).</li>
              <li><strong>Right to Rectification (Art. 16):</strong> Request correction of inaccurate data or completion of incomplete data, either through your account settings or by contacting us.</li>
              <li><strong>Right to Erasure (Art. 17):</strong> Request deletion of your data where it is no longer necessary, you withdraw consent, or processing is unlawful. Certain data may be retained where a legal obligation overrides (e.g., financial records for tax purposes).</li>
              <li><strong>Right to Restriction (Art. 18):</strong> Request that we restrict processing while we verify the accuracy of your data, assess an objection, or if processing is unlawful but you oppose erasure.</li>
              <li><strong>Right to Data Portability (Art. 20):</strong> Receive your Personal Data in a structured, commonly used, machine-readable format (JSON or CSV) and transmit it to another controller.</li>
              <li><strong>Right to Object (Art. 21):</strong> Object to processing based on legitimate interests, including profiling. We will cease processing unless we demonstrate compelling legitimate grounds. You have an absolute right to object to direct marketing at any time.</li>
              <li><strong>Rights Related to Automated Decision-Making (Art. 22):</strong> We do not currently make decisions based solely on automated processing that produce legal or similarly significant effects. If this changes, you will have the right to obtain human intervention, express your point of view, and contest the decision.</li>
              <li><strong>Right to Withdraw Consent:</strong> Where processing is based on consent, you may withdraw consent at any time without affecting the lawfulness of processing prior to withdrawal.</li>
            </ul>
            <p className="mt-4">To exercise any of these rights, contact our DPO at <a href="mailto:dpo@tradestone.com" className="text-primary hover:underline">dpo@tradestone.com</a>. We will verify your identity before processing your request and respond within the statutory timeframe.</p>
          </section>

          {/* 12 */}
          <section>
            <h2 className="text-2xl font-semibold mb-4">12. Children's Privacy</h2>
            <p>The Platform is not directed at individuals under the age of 18. We do not knowingly collect Personal Data from children. If we discover that a child under 18 has provided Personal Data without verified parental consent, we will delete that data promptly. If you believe a child has provided us with their data, please contact our DPO immediately.</p>
          </section>

          {/* 13 */}
          <section>
            <h2 className="text-2xl font-semibold mb-4">13. Data Protection Impact Assessments</h2>
            <p>Where processing is likely to result in a high risk to the rights and freedoms of individuals, we conduct Data Protection Impact Assessments (DPIAs) in accordance with Article 35 UK GDPR. This includes, but is not limited to, any large-scale processing of financial data, introduction of new tracking technologies, or significant changes to data-sharing arrangements.</p>
          </section>

          {/* 14 */}
          <section>
            <h2 className="text-2xl font-semibold mb-4">14. Third-Party Links &amp; Integrations</h2>
            <p>The Platform may contain links to third-party websites, services, or integrations. We are not responsible for the privacy practices of those third parties. We encourage you to read the privacy policies of any third-party service you interact with. Connecting a third-party account (e.g., social login) is voluntary, and you may revoke access at any time through the third party's account settings.</p>
          </section>

          {/* 15 */}
          <section>
            <h2 className="text-2xl font-semibold mb-4">15. Marketing &amp; Communications</h2>
            <p>We will only send you marketing communications where you have given explicit opt-in consent or where we have a legitimate interest (existing customer, similar products/services) and provide an easy opt-out mechanism in every communication.</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li><strong>Transactional Communications:</strong> Emails related to your account, quotes, invoices, and contracts are sent as necessary for service delivery and are not considered marketing.</li>
              <li><strong>Opting Out:</strong> You may unsubscribe from marketing emails at any time via the unsubscribe link in every email or through your account settings.</li>
              <li><strong>SMS:</strong> We will not send SMS marketing without your explicit prior consent.</li>
            </ul>
          </section>

          {/* 16 */}
          <section>
            <h2 className="text-2xl font-semibold mb-4">16. Changes to This Policy</h2>
            <p>We may update this Privacy Policy periodically to reflect changes in our practices, legal requirements, or Platform features. Changes will be communicated as follows:</p>
            <ul className="list-disc pl-6 space-y-1 mt-2">
              <li><strong>Material Changes:</strong> Notified via email to your registered address and a prominent banner on the Platform at least 30 days before the changes take effect.</li>
              <li><strong>Minor Changes:</strong> Updated on this page with a revised "Last Updated" date.</li>
            </ul>
            <p className="mt-2">Continued use of the Platform after the effective date of a revised Privacy Policy constitutes acceptance of the updated terms. If you do not agree with the changes, you must delete your account before the effective date.</p>
          </section>

          {/* 17 */}
          <section>
            <h2 className="text-2xl font-semibold mb-4">17. Complaints &amp; Supervisory Authority</h2>
            <p>If you believe your data protection rights have been infringed, you have the right to lodge a complaint with the relevant supervisory authority:</p>
            <ul className="list-disc pl-6 space-y-2 mt-2">
              <li>
                <strong>United Kingdom:</strong> Information Commissioner's Office (ICO)<br />
                Website: <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">ico.org.uk</a><br />
                Telephone: 0303 123 1113
              </li>
              <li>
                <strong>European Union:</strong> Your local Data Protection Authority (a list is maintained at <a href="https://edpb.europa.eu" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">edpb.europa.eu</a>).
              </li>
            </ul>
            <p className="mt-2">We encourage you to contact our DPO first so we can attempt to resolve your concern directly.</p>
          </section>

          {/* 18 */}
          <section>
            <h2 className="text-2xl font-semibold mb-4">18. Contact Us</h2>
            <p>For any questions, concerns, or requests relating to this Privacy Policy or our data processing practices, please contact us:</p>
            <div className="bg-muted/50 rounded-lg p-6 mt-4 space-y-2">
              <p><strong>Data Protection Officer</strong></p>
              <p>TradeStone Ltd</p>
              <p>Email: <a href="mailto:dpo@tradestone.com" className="text-primary hover:underline">dpo@tradestone.com</a></p>
              <p>General Privacy Enquiries: <a href="mailto:privacy@tradestone.com" className="text-primary hover:underline">privacy@tradestone.com</a></p>
              <p>Security Issues: <a href="mailto:security@tradestone.com" className="text-primary hover:underline">security@tradestone.com</a></p>
              <p>Post: [Registered Address], United Kingdom</p>
            </div>
          </section>

          <section className="border-t border-border pt-6 mt-10">
            <p className="text-sm text-muted-foreground">
              <strong>Disclaimer:</strong> This Privacy Policy is provided for informational purposes and represents TradeStone's commitment to data protection. It does not constitute legal advice. We recommend consulting a qualified data protection solicitor for advice specific to your circumstances. This policy is governed by the laws of England and Wales.
            </p>
          </section>

        </div>
      </main>
      <SiteFooter />
    </div>
  );
};

export default Privacy;