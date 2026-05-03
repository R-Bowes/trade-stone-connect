import Header from "@/components/Header";
import SiteFooter from "@/components/SiteFooter";
import { Link } from "react-router-dom";

const Terms = () => {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="container mx-auto px-4 py-12 max-w-4xl flex-1">
        <h1 className="text-4xl font-bold mb-2">Terms of Use</h1>
        <p className="text-sm text-muted-foreground mb-1">
          Effective Date: 1 March 2025
        </p>
        <p className="text-sm text-muted-foreground mb-8">
          Last Revised: 8 March 2026
        </p>

        <div className="prose prose-lg max-w-none text-foreground [&_h2]:text-foreground [&_h3]:text-foreground [&_p]:text-muted-foreground [&_li]:text-muted-foreground [&_strong]:text-foreground">

          <p className="text-base font-semibold border-l-4 border-primary pl-4 mb-8">
            PLEASE READ THESE TERMS CAREFULLY BEFORE USING THE TRADESTONE PLATFORM. BY ACCESSING OR USING THE SERVICE, YOU AGREE TO BE BOUND BY THESE TERMS. IF YOU DO NOT AGREE, DO NOT ACCESS OR USE THE SERVICE.
          </p>

          {/* 1 */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">1. Definitions</h2>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li><strong>"Platform"</strong> or <strong>"Service"</strong> means the TradeStone website, mobile applications, APIs, and all related services operated by TradeStone Ltd ("Company", "we", "us", or "our").</li>
              <li><strong>"User"</strong> means any individual or entity that accesses or uses the Platform, including Contractors, Property Owners, Business Users, and Marketplace Sellers/Buyers.</li>
              <li><strong>"Contractor"</strong> means a User who lists services on the Platform for hire.</li>
              <li><strong>"Client"</strong> or <strong>"Property Owner"</strong> means a User who engages or seeks to engage Contractors through the Platform.</li>
              <li><strong>"Content"</strong> means all text, images, data, files, listings, reviews, messages, and other materials uploaded, submitted, or transmitted through the Platform.</li>
              <li><strong>"Marketplace"</strong> means the section of the Platform where Users may list and purchase materials, tools, and equipment.</li>
              <li><strong>"Quote"</strong> means a formal price estimate submitted by a Contractor to a Client through the Platform.</li>
              <li><strong>"Contract"</strong> means any agreement formed between a Contractor and Client facilitated through the Platform.</li>
            </ul>
          </section>

          {/* 2 */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">2. Acceptance of Terms</h2>
            <p className="mb-4">
              2.1. By creating an account, accessing, or using the Platform in any way, you represent and warrant that you have read, understood, and agree to be bound by these Terms of Use ("Terms"), our <Link to="/privacy" className="text-primary underline">Privacy Policy</Link>, and any additional guidelines or policies referenced herein, all of which are incorporated by reference.
            </p>
            <p className="mb-4">
              2.2. If you are using the Platform on behalf of a business, organisation, or other entity, you represent and warrant that you have the authority to bind that entity to these Terms, and "you" refers to both you individually and that entity.
            </p>
            <p className="mb-4">
              2.3. You must be at least 18 years of age to use the Platform. By using the Platform, you represent and warrant that you meet this age requirement.
            </p>
            <p className="mb-4">
              2.4. We reserve the right to modify these Terms at any time. Material changes will be notified via email or prominent notice on the Platform at least 14 days before taking effect. Your continued use after the effective date constitutes acceptance of the modified Terms.
            </p>
          </section>

          {/* 3 */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">3. Account Registration and Security</h2>
            <p className="mb-4">
              3.1. To access certain features, you must create an account. You agree to provide accurate, current, and complete information during registration and to update such information to keep it accurate, current, and complete.
            </p>
            <p className="mb-4">
              3.2. You are solely responsible for safeguarding your account credentials (including passwords, API keys, and authentication tokens) and for all activities that occur under your account.
            </p>
            <p className="mb-4">
              3.3. You must immediately notify us at <strong>security@tradestone.com</strong> of any unauthorised access to or use of your account, or any other breach of security.
            </p>
            <p className="mb-4">
              3.4. We reserve the right to suspend or terminate any account that we reasonably believe has been compromised, is being used fraudulently, or is in violation of these Terms.
            </p>
            <p className="mb-4">
              3.5. You may not create multiple accounts for the same individual or entity, share your account credentials with third parties, or use another User's account without express permission.
            </p>
          </section>

          {/* 4 */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">4. Description of Service</h2>
            <p className="mb-4">
              4.1. TradeStone is a technology platform that facilitates connections between property owners and qualified contractors for construction, renovation, and maintenance services. The Platform provides tools for contractor discovery, quote management, invoicing, contract facilitation, scheduling, team management, CRM, and a marketplace for surplus materials, tools, and equipment.
            </p>
            <p className="mb-4">
              4.2. <strong>TradeStone is not a party to any contract between Users.</strong> We do not employ, endorse, guarantee, or recommend any Contractor, and we do not guarantee the quality, safety, legality, or completion of any work performed.
            </p>
            <p className="mb-4">
              4.3. We do not provide construction, contracting, architectural, engineering, or any other professional services. All services advertised on the Platform are provided by independent third-party Contractors.
            </p>
          </section>

          {/* 5 */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">5. Contractor Obligations</h2>
            <p className="mb-4">Contractors using the Platform represent, warrant, and agree that they shall:</p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Hold and maintain all licences, certifications, permits, and insurance required by applicable law for the services they offer, and provide proof thereof upon request.</li>
              <li>Provide accurate, truthful, and non-misleading information about their qualifications, experience, services, and pricing.</li>
              <li>Respond to quote requests and client communications in a timely and professional manner.</li>
              <li>Perform all contracted work in accordance with agreed specifications, timelines, and applicable building codes, standards, and regulations.</li>
              <li>Maintain appropriate public liability insurance with a minimum coverage of £1,000,000 (or equivalent) for the duration of any work undertaken.</li>
              <li>Not subcontract work to unlicensed or uninsured persons without prior written disclosure to the Client.</li>
              <li>Comply with all applicable health and safety legislation, including but not limited to the Health and Safety at Work Act 1974 and Construction (Design and Management) Regulations 2015 (or equivalent in your jurisdiction).</li>
              <li>Promptly report any safety incidents, property damage, or material disputes to both the Client and TradeStone.</li>
            </ul>
            <p className="mb-4">
              5.2. Failure to comply with these obligations may result in immediate account suspension, removal from the Platform, and forfeiture of any pending payments or fees.
            </p>
          </section>

          {/* 6 */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">6. Client and Property Owner Obligations</h2>
            <p className="mb-4">Clients using the Platform agree that they shall:</p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Provide accurate, complete, and truthful project descriptions, specifications, and requirements.</li>
              <li>Communicate clearly and professionally with Contractors and respond to communications in a timely manner.</li>
              <li>Make payments in accordance with agreed terms and within the timeframes specified in accepted Quotes or Contracts.</li>
              <li>Provide safe and reasonable access to work areas, and disclose any known hazards or restrictions.</li>
              <li>Obtain all necessary permissions, consents, and planning approvals required for the work.</li>
              <li>Not solicit Contractors found through the Platform for work outside the Platform in order to circumvent fees.</li>
              <li>Inspect and accept or formally dispute completed work within 14 days of notification of completion.</li>
            </ul>
          </section>

          {/* 7 */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">7. Fees, Payments, and Transaction Terms</h2>
            <p className="mb-4">
              7.1. TradeStone may charge fees for use of the Platform, including but not limited to listing fees, transaction fees, subscription fees, and premium feature fees. All applicable fees will be clearly disclosed before you incur them.
            </p>
            <p className="mb-4">
              7.2. All fees are stated exclusive of VAT (or applicable sales tax) unless otherwise specified. You are responsible for all applicable taxes.
            </p>
            <p className="mb-4">
              7.3. Fees are non-refundable unless (a) required by applicable law, (b) we have materially failed to provide the Service, or (c) otherwise stated in writing.
            </p>
            <p className="mb-4">
              7.4. For transactions facilitated through the Platform, TradeStone charges a <strong>3.5% transaction fee</strong> on each invoice payment processed via the Platform. This fee is automatically deducted from the payment amount before settlement to the Contractor. The transaction fee is earned at the point of transaction and is non-refundable.
            </p>
            <p className="mb-4">
              7.5. <strong>Payment disputes between Users:</strong> TradeStone is not liable for payment disputes between Contractors and Clients. Users are encouraged to resolve disputes directly. TradeStone may, at its sole discretion, mediate disputes but is under no obligation to do so.
            </p>
            <p className="mb-4">
              7.6. We reserve the right to modify our fee structure with 30 days' prior notice. Continued use of the Platform after the effective date of fee changes constitutes acceptance of the new fees.
            </p>
          </section>

          {/* 8 */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">8. Marketplace Terms</h2>
            <p className="mb-4">
              8.1. The Marketplace enables Users to list and purchase surplus materials, tools, and equipment. TradeStone does not take possession of, inspect, or guarantee the quality, condition, safety, or legality of any item listed.
            </p>
            <p className="mb-4">
              8.2. Sellers represent and warrant that: (a) they have legal title to and the right to sell all listed items; (b) item descriptions are accurate and not misleading; (c) items comply with all applicable safety standards and regulations; (d) they will fulfil orders promptly and in accordance with the listing terms.
            </p>
            <p className="mb-4">
              8.3. Buyers acknowledge that they purchase items at their own risk and should independently verify the condition and suitability of items before purchase.
            </p>
            <p className="mb-4">
              8.4. TradeStone reserves the right to remove any listing that violates these Terms, is reported as fraudulent, or is deemed inappropriate at our sole discretion.
            </p>
          </section>

          {/* 9 */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">9. User Content and Intellectual Property</h2>
            <p className="mb-4">
              9.1. You retain ownership of Content you submit to the Platform. By submitting Content, you grant TradeStone a worldwide, non-exclusive, royalty-free, sublicensable, transferable licence to use, reproduce, modify, distribute, display, and create derivative works from your Content solely for the purpose of operating, improving, and promoting the Platform.
            </p>
            <p className="mb-4">
              9.2. You represent and warrant that: (a) you own or have the necessary rights to submit your Content; (b) your Content does not infringe any third party's intellectual property, privacy, or other rights; (c) your Content does not contain any defamatory, obscene, or unlawful material.
            </p>
            <p className="mb-4">
              9.3. The Platform, including its design, software, logos, trademarks, text, graphics, and other materials (excluding User Content), is the exclusive property of TradeStone and is protected by copyright, trademark, and other intellectual property laws.
            </p>
            <p className="mb-4">
              9.4. You may not copy, reproduce, distribute, modify, create derivative works from, publicly display, reverse engineer, or exploit any part of the Platform without our prior written consent.
            </p>
          </section>

          {/* 10 */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">10. Prohibited Conduct</h2>
            <p className="mb-4">You agree not to:</p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Use the Platform for any unlawful purpose or in violation of any applicable laws or regulations.</li>
              <li>Engage in fraud, misrepresentation, money laundering, or any other financial crime.</li>
              <li>Harass, threaten, abuse, defame, or discriminate against any User or third party.</li>
              <li>Impersonate any person or entity, or falsely state or misrepresent your affiliation with any person or entity.</li>
              <li>Submit false, misleading, or deceptive information, reviews, or Content.</li>
              <li>Attempt to gain unauthorised access to the Platform, other Users' accounts, or computer systems connected to the Platform.</li>
              <li>Use any automated means (including bots, scrapers, crawlers, or spiders) to access, collect data from, or interact with the Platform without our prior written consent.</li>
              <li>Interfere with, disrupt, or attempt to compromise the integrity or performance of the Platform or its underlying infrastructure.</li>
              <li>Introduce malware, viruses, Trojan horses, worms, or other harmful code or materials.</li>
              <li>Circumvent, disable, or interfere with security features of the Platform.</li>
              <li>Use the Platform to send unsolicited communications (spam) or for purposes unrelated to the Platform's intended use.</li>
              <li>Attempt to circumvent Platform fees by arranging transactions or communications outside the Platform with Users discovered through the Platform.</li>
              <li>Manipulate ratings, reviews, or any feedback system on the Platform.</li>
            </ul>
          </section>

          {/* 11 */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">11. Disclaimers and Limitation of Liability</h2>
            <p className="mb-4 font-semibold uppercase text-sm">
              11.1. THE PLATFORM IS PROVIDED ON AN "AS IS" AND "AS AVAILABLE" BASIS WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT.
            </p>
            <p className="mb-4">
              11.2. TradeStone does not warrant that: (a) the Platform will be uninterrupted, timely, secure, or error-free; (b) any results obtained from the Platform will be accurate or reliable; (c) any Contractor found through the Platform will be competent, licensed, insured, or trustworthy; (d) any defects in the Platform will be corrected.
            </p>
            <p className="mb-4">
              11.3. You acknowledge and agree that TradeStone is a platform provider only. We are not responsible for and expressly disclaim all liability arising from:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>The quality, safety, legality, or any other aspect of services provided by Contractors.</li>
              <li>Any property damage, personal injury, death, or financial loss arising from work arranged through the Platform.</li>
              <li>The accuracy, completeness, or reliability of any User Content, listings, quotes, or reviews.</li>
              <li>Any disputes, claims, or damages arising from transactions between Users.</li>
              <li>Items listed, sold, or purchased through the Marketplace.</li>
            </ul>
            <p className="mb-4 font-semibold uppercase text-sm">
              11.4. TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL TRADESTONE, ITS DIRECTORS, OFFICERS, EMPLOYEES, AGENTS, AFFILIATES, OR LICENSORS BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, PUNITIVE, OR EXEMPLARY DAMAGES, INCLUDING BUT NOT LIMITED TO DAMAGES FOR LOSS OF PROFITS, GOODWILL, DATA, OR OTHER INTANGIBLE LOSSES, REGARDLESS OF THE THEORY OF LIABILITY (CONTRACT, TORT, NEGLIGENCE, STRICT LIABILITY, OR OTHERWISE), EVEN IF TRADESTONE HAS BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.
            </p>
            <p className="mb-4 font-semibold">
              11.5. TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, TRADESTONE'S TOTAL AGGREGATE LIABILITY TO YOU FOR ALL CLAIMS ARISING FROM OR RELATING TO THESE TERMS OR THE USE OF THE PLATFORM SHALL NOT EXCEED THE GREATER OF: (A) THE TOTAL FEES PAID BY YOU TO TRADESTONE IN THE TWELVE (12) MONTHS PRECEDING THE EVENT GIVING RISE TO THE CLAIM; OR (B) ONE HUNDRED POUNDS STERLING (£100).
            </p>
            <p className="mb-4">
              11.6. Nothing in these Terms excludes or limits liability for: (a) death or personal injury caused by our negligence; (b) fraud or fraudulent misrepresentation; or (c) any other liability that cannot be excluded or limited by applicable law.
            </p>
          </section>

          {/* 12 */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">12. Indemnification</h2>
            <p className="mb-4">
              12.1. You agree to indemnify, defend, and hold harmless TradeStone, its directors, officers, employees, agents, affiliates, successors, and assigns from and against any and all claims, demands, actions, liabilities, losses, damages, costs, and expenses (including reasonable legal fees) arising from or related to:
            </p>
            <ul className="list-disc pl-6 mb-4 space-y-2">
              <li>Your use of, or inability to use, the Platform.</li>
              <li>Your violation of these Terms or any applicable law or regulation.</li>
              <li>Your Content or any material you submit, post, or transmit through the Platform.</li>
              <li>Any services you provide or receive through the Platform.</li>
              <li>Any transaction you enter into with another User.</li>
              <li>Any claim that your Content or conduct infringes or violates the rights of any third party.</li>
              <li>Your breach of any representation or warranty in these Terms.</li>
            </ul>
          </section>

          {/* 13 */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">13. Dispute Resolution</h2>
            <p className="mb-4">
              13.1. <strong>Between Users:</strong> Disputes between Users (including between Contractors and Clients) are to be resolved directly between the parties. TradeStone may, at its sole discretion, offer mediation services but is not obligated to do so and accepts no liability for the outcome of any dispute.
            </p>
            <p className="mb-4">
              13.2. <strong>With TradeStone:</strong> Any dispute, claim, or controversy arising out of or relating to these Terms or the Platform shall first be submitted to good-faith negotiation for a period of 30 days. If unresolved, disputes shall be submitted to binding arbitration administered under the rules of the London Court of International Arbitration (LCIA), unless you are a consumer entitled to bring proceedings in your local courts.
            </p>
            <p className="mb-4">
              13.3. <strong>Class Action Waiver:</strong> To the fullest extent permitted by law, you agree that any dispute resolution proceedings will be conducted only on an individual basis and not as a class, consolidated, or representative action.
            </p>
            <p className="mb-4">
              13.4. Nothing in this section prevents either party from seeking injunctive or other equitable relief from a court of competent jurisdiction to prevent the actual or threatened infringement of intellectual property rights.
            </p>
          </section>

          {/* 14 */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">14. Termination</h2>
            <p className="mb-4">
              14.1. You may terminate your account at any time by contacting us at <strong>support@tradestone.com</strong>. Termination does not relieve you of any obligations incurred prior to termination, including payment obligations.
            </p>
            <p className="mb-4">
              14.2. We may suspend or terminate your account immediately, without prior notice or liability, for any reason, including but not limited to: (a) breach of these Terms; (b) fraudulent, abusive, or illegal activity; (c) extended inactivity; (d) upon request by law enforcement or government agencies.
            </p>
            <p className="mb-4">
              14.3. Upon termination: (a) your right to access and use the Platform immediately ceases; (b) we may delete your account data in accordance with our Privacy Policy; (c) any licences granted to you under these Terms are immediately revoked; (d) provisions that by their nature should survive termination shall survive (including Sections 9, 11, 12, 13, and 17).
            </p>
          </section>

          {/* 15 */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">15. Privacy and Data Protection</h2>
            <p className="mb-4">
              15.1. Your use of the Platform is subject to our <Link to="/privacy" className="text-primary underline">Privacy Policy</Link>, which describes how we collect, use, store, and share your personal data. By using the Platform, you consent to the practices described therein.
            </p>
            <p className="mb-4">
              15.2. We process personal data in accordance with the UK General Data Protection Regulation (UK GDPR), the Data Protection Act 2018, and other applicable data protection legislation.
            </p>
            <p className="mb-4">
              15.3. Where you share personal data of third parties (e.g., client contact details) through the Platform, you represent and warrant that you have obtained all necessary consents and have a lawful basis for sharing such data.
            </p>
          </section>

          {/* 16 */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">16. Communications</h2>
            <p className="mb-4">
              16.1. By creating an account, you consent to receive electronic communications from TradeStone, including service announcements, administrative messages, and (where you have opted in) marketing communications.
            </p>
            <p className="mb-4">
              16.2. You may opt out of marketing communications at any time, but you may not opt out of service-related communications necessary for the operation of your account.
            </p>
            <p className="mb-4">
              16.3. All communications between Users through the Platform may be monitored and recorded for quality assurance, dispute resolution, and compliance purposes.
            </p>
          </section>

          {/* 17 */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">17. General Provisions</h2>
            <p className="mb-4">
              <strong>17.1. Governing Law.</strong> These Terms shall be governed by and construed in accordance with the laws of England and Wales, without regard to conflict of law principles. Subject to Section 13, the courts of England and Wales shall have exclusive jurisdiction.
            </p>
            <p className="mb-4">
              <strong>17.2. Entire Agreement.</strong> These Terms, together with the Privacy Policy and any other policies referenced herein, constitute the entire agreement between you and TradeStone and supersede all prior agreements, understandings, and representations.
            </p>
            <p className="mb-4">
              <strong>17.3. Severability.</strong> If any provision of these Terms is found to be invalid, illegal, or unenforceable, the remaining provisions shall continue in full force and effect. The invalid provision shall be modified to the minimum extent necessary to make it valid and enforceable.
            </p>
            <p className="mb-4">
              <strong>17.4. Waiver.</strong> No waiver of any provision of these Terms shall be deemed a further or continuing waiver of such provision or any other provision. Our failure to exercise or enforce any right or provision shall not constitute a waiver of such right or provision.
            </p>
            <p className="mb-4">
              <strong>17.5. Assignment.</strong> You may not assign or transfer your rights or obligations under these Terms without our prior written consent. We may assign our rights and obligations without restriction.
            </p>
            <p className="mb-4">
              <strong>17.6. Force Majeure.</strong> TradeStone shall not be liable for any failure or delay in performance resulting from circumstances beyond our reasonable control, including but not limited to natural disasters, pandemics, war, terrorism, government actions, power failures, internet disruptions, or cyberattacks.
            </p>
            <p className="mb-4">
              <strong>17.7. No Agency.</strong> Nothing in these Terms creates a partnership, joint venture, agency, franchise, or employment relationship between you and TradeStone. Contractors are independent third parties and not employees, agents, or representatives of TradeStone.
            </p>
            <p className="mb-4">
              <strong>17.8. Third-Party Rights.</strong> These Terms do not confer any rights on any third party under the Contracts (Rights of Third Parties) Act 1999 or equivalent legislation.
            </p>
            <p className="mb-4">
              <strong>17.9. Headings.</strong> Section headings are for convenience only and shall not affect the interpretation of these Terms.
            </p>
          </section>

          {/* 18 */}
          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">18. Contact Information</h2>
            <p className="mb-4">
              For questions, concerns, or complaints about these Terms of Use, please contact us:
            </p>
            <ul className="list-none pl-0 mb-4 space-y-1">
              <li><strong>Email:</strong> legal@tradestone.com</li>
              <li><strong>Support:</strong> support@tradestone.com</li>
              <li><strong>Security:</strong> security@tradestone.com</li>
            </ul>
          </section>

        </div>
      </main>
      <SiteFooter />
    </div>
  );
};

export default Terms;

