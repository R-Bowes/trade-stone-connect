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
    <section className="bg-[#efefef]">
      <div className="bg-[#2f4358] px-4 py-28 md:py-40">
        <div className="mx-auto flex max-w-4xl flex-col items-center text-center text-white">
          <h1 className="mb-5 text-5xl font-bold tracking-tight md:text-6xl">
            Build &amp; Grow with TradeStone
          </h1>
          <p className="max-w-2xl font-serif text-xl text-slate-100">
            Connect with professionals, buy surplus materials, and win contracts with ease.
          </p>
          <Button
            asChild
            className="mt-8 rounded-xl bg-orange-500 px-8 py-6 text-lg font-semibold text-white hover:bg-orange-400"
          >
            <Link to="/auth">Sign up free</Link>
          </Button>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1500px] grid-cols-1 gap-4 px-4 py-5 md:grid-cols-3">
        {quickActions.map((action) => (
          <Link key={action.title} to={action.link}>
            <Card className="flex h-full min-h-36 flex-col items-center justify-center gap-3 rounded-2xl border-zinc-200 bg-[#f8f8f8] p-6 text-center shadow-sm">
              <action.icon className="h-9 w-9 text-orange-500" strokeWidth={1.8} />
              <h3 className="text-2xl font-semibold text-slate-900">{action.title}</h3>
              <p className="text-base text-slate-600">{action.description}</p>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
};

export default HeroSection;
