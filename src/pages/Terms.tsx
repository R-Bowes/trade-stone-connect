import Header from "@/components/Header";

const Terms = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-12 max-w-4xl">
        <h1 className="text-4xl font-bold mb-8">Terms of Use</h1>
        
        <div className="prose prose-lg max-w-none">
          <p className="text-lg text-muted-foreground mb-8">
            Last updated: {new Date().toLocaleDateString()}
          </p>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">1. Acceptance of Terms</h2>
            <p className="mb-4">
              By accessing and using TradeStone ("the Service"), you accept and agree to be bound by the terms and provision of this agreement. If you do not agree to abide by the above, please do not use this service.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">2. Description of Service</h2>
            <p className="mb-4">
              TradeStone is a platform that connects property owners with qualified contractors for construction, renovation, and maintenance services. Our service includes contractor discovery, quote management, contract facilitation, and a materials marketplace.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">3. User Accounts</h2>
            <p className="mb-4">
              To access certain features of the Service, you must register for an account. You are responsible for maintaining the confidentiality of your account credentials and for all activities that occur under your account.
            </p>
            <ul className="list-disc pl-6 mb-4">
              <li>You must provide accurate and complete information when creating your account</li>
              <li>You must promptly update your account information if it changes</li>
              <li>You are solely responsible for the activity that occurs on your account</li>
              <li>You must notify us immediately of any unauthorized use of your account</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">4. Contractor Responsibilities</h2>
            <p className="mb-4">
              Contractors using TradeStone agree to:
            </p>
            <ul className="list-disc pl-6 mb-4">
              <li>Maintain all required licenses, certifications, and insurance</li>
              <li>Provide accurate information about their services and qualifications</li>
              <li>Respond to quote requests in a timely and professional manner</li>
              <li>Complete contracted work according to agreed specifications and timelines</li>
              <li>Comply with all applicable laws and regulations</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">5. Property Owner Responsibilities</h2>
            <p className="mb-4">
              Property owners using TradeStone agree to:
            </p>
            <ul className="list-disc pl-6 mb-4">
              <li>Provide accurate project information and requirements</li>
              <li>Communicate clearly and professionally with contractors</li>
              <li>Make payments according to agreed terms</li>
              <li>Provide reasonable access to work areas</li>
              <li>Comply with all applicable laws and regulations</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">6. Prohibited Uses</h2>
            <p className="mb-4">
              You may not use TradeStone for any unlawful purposes or to conduct any unlawful activity, including but not limited to:
            </p>
            <ul className="list-disc pl-6 mb-4">
              <li>Fraud, money laundering, or other financial crimes</li>
              <li>Harassment, abuse, or harm to another person</li>
              <li>Impersonating any person or entity</li>
              <li>Violating any laws or regulations</li>
              <li>Interfering with or disrupting the Service</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">7. Payment Terms</h2>
            <p className="mb-4">
              TradeStone may charge fees for certain services. All fees are non-refundable unless otherwise stated. Payment terms will be clearly communicated before any charges are incurred.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">8. Limitation of Liability</h2>
            <p className="mb-4">
              TradeStone serves as a platform to connect users and does not directly provide construction or contracting services. We are not responsible for the quality, safety, legality, or any other aspect of services provided by contractors found through our platform.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">9. Intellectual Property</h2>
            <p className="mb-4">
              The Service and its original content, features, and functionality are and will remain the exclusive property of TradeStone and its licensors. The Service is protected by copyright, trademark, and other laws.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">10. Changes to Terms</h2>
            <p className="mb-4">
              We reserve the right to modify or replace these Terms at any time. We will provide notice of significant changes by posting the new Terms on this page and updating the "Last updated" date.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">11. Contact Information</h2>
            <p className="mb-4">
              If you have any questions about these Terms of Use, please contact us at:
              <br />
              Email: legal@tradestone.com
              <br />
              Address: [Company Address]
            </p>
          </section>
        </div>
      </main>
    </div>
  );
};

export default Terms;