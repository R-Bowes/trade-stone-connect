import Header from "@/components/Header";
import SiteFooter from "@/components/SiteFooter";

const About = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <section className="container mx-auto max-w-5xl px-4 py-14">
          <div className="mb-10 text-center">
            <h1 className="mb-4 text-4xl font-bold md:text-5xl">About TradeStone</h1>
            <p className="mx-auto max-w-3xl text-lg text-muted-foreground">
              TradeStone helps homeowners, businesses, and professional contractors find each other,
              collaborate clearly, and manage work from first enquiry to final payment.
            </p>
          </div>

          <div className="grid gap-8 md:grid-cols-2">
            <article className="rounded-xl border bg-card p-6 shadow-sm">
              <h2 className="mb-3 text-2xl font-semibold">How to use the website</h2>
              <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
                <li>Create an account and choose the profile type that fits your goals.</li>
                <li>Complete your profile so other users can trust your identity and capabilities.</li>
                <li>Search for contractors, contracts, or marketplace listings using filters.</li>
                <li>Send quote requests, review responses, and agree the scope of work.</li>
                <li>Manage communication, timelines, invoices, and payments in one place.</li>
              </ol>
            </article>

            <article className="rounded-xl border bg-card p-6 shadow-sm">
              <h2 className="mb-3 text-2xl font-semibold">How TradeStone works</h2>
              <ul className="space-y-2 text-muted-foreground">
                <li><strong>Discovery:</strong> Users can browse vetted contractor profiles and opportunities.</li>
                <li><strong>Matching:</strong> Project owners submit requests, then compare quotes and availability.</li>
                <li><strong>Agreement:</strong> Parties define terms, milestones, and responsibilities before work begins.</li>
                <li><strong>Delivery:</strong> Progress, messages, and schedules are tracked through dashboards.</li>
                <li><strong>Payment:</strong> Invoicing and payments are recorded to create a clear audit trail.</li>
              </ul>
            </article>
          </div>

          <section className="mt-10 rounded-xl border bg-card p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-semibold">What each profile does</h2>

            <div className="grid gap-6 md:grid-cols-3">
              <article>
                <h3 className="mb-2 text-lg font-semibold">Personal profile</h3>
                <p className="text-sm text-muted-foreground">
                  Built for homeowners and individual clients. Personal users can search the contractor
                  directory, request quotes, and purchase or sell materials in the marketplace.
                </p>
              </article>

              <article>
                <h3 className="mb-2 text-lg font-semibold">Business profile</h3>
                <p className="text-sm text-muted-foreground">
                  Designed for companies managing projects at scale. Business users can coordinate teams,
                  manage multiple jobs, post opportunities, and track operational activity.
                </p>
              </article>

              <article>
                <h3 className="mb-2 text-lg font-semibold">Contractor profile</h3>
                <p className="text-sm text-muted-foreground">
                  For trade professionals and contracting firms. Contractors can showcase services,
                  receive quote requests, manage schedules, issue invoices, and handle payments.
                </p>
              </article>
            </div>
          </section>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
};

export default About;
