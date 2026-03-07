import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ShoppingCart, UserRound, FileText } from "lucide-react";
import { Link } from "react-router-dom";

const quickActions = [
  {
    icon: ShoppingCart,
    title: "Buy Materials",
    description: "Find surplus tools & materials near you.",
    link: "/marketplace",
  },
  {
    icon: UserRound,
    title: "Hire Contractors",
    description: "Browse verified professionals.",
    link: "/contractors",
  },
  {
    icon: FileText,
    title: "Apply for Contracts",
    description: "Bid on government and private jobs.",
    link: "/contracts",
  },
];

const HeroSection = () => {
  return (
    <section className="bg-[#efefef] pb-12 md:pb-20">
      <div className="relative overflow-hidden bg-[#2f4358] px-4 py-32 md:py-44">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "repeating-linear-gradient(-28deg, rgba(249,115,22,0.16) 0px, rgba(249,115,22,0.16) 14px, transparent 14px, transparent 44px)",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 top-10 h-64 w-64 rounded-full bg-orange-400/25 blur-3xl"
        />

        <div className="relative mx-auto flex max-w-4xl flex-col items-center text-center text-white">
          <h1 className="mb-6 font-heading text-5xl font-extrabold tracking-tight md:text-6xl">
            Build &amp; Grow with TradeStone
          </h1>
          <p className="max-w-2xl text-xl leading-relaxed text-slate-100 md:text-[1.4rem]">
            Connect with professionals, buy surplus materials, and win contracts with ease.
          </p>
          <Button
            asChild
            className="mt-10 rounded-xl bg-orange-500 px-8 py-6 text-lg font-semibold text-white hover:bg-orange-400"
          >
            <Link to="/auth">Sign up free</Link>
          </Button>
        </div>
      </div>

      <div className="mx-auto mt-8 grid max-w-[1500px] grid-cols-1 gap-6 px-4 md:mt-12 md:grid-cols-3">
        {quickActions.map((action) => (
          <Link key={action.title} to={action.link}>
            <Card className="flex h-full min-h-40 flex-col items-center justify-center gap-3 rounded-2xl border-zinc-200 bg-[#f8f8f8] p-7 text-center shadow-sm transition-transform duration-200 hover:-translate-y-1">
              <action.icon className="h-9 w-9 text-orange-500" strokeWidth={1.8} />
              <h3 className="font-heading text-2xl font-bold text-slate-900">{action.title}</h3>
              <p className="text-base text-slate-600">{action.description}</p>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
};

export default HeroSection;
