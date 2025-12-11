import { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import Header from "@/components/Header";
import { cn } from "@/lib/utils";

interface MarketplaceLayoutProps {
  children: ReactNode;
}

const categories = [
  { name: "All", path: "/marketplace" },
  { name: "Materials", path: "/marketplace/materials" },
  { name: "Equipment", path: "/marketplace/equipment" },
  { name: "Tools", path: "/marketplace/tools" },
];

const MarketplaceLayout = ({ children }: MarketplaceLayoutProps) => {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-8 pt-24">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Marketplace</h1>
          <p className="text-muted-foreground">Buy and sell construction materials, tools, and equipment</p>
        </div>

        {/* Category Tabs */}
        <nav className="flex gap-2 mb-8 border-b border-border pb-4 overflow-x-auto">
          {categories.map((category) => (
            <Link
              key={category.path}
              to={category.path}
              className={cn(
                "px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap",
                location.pathname === category.path
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted hover:bg-muted/80 text-muted-foreground"
              )}
            >
              {category.name}
            </Link>
          ))}
        </nav>

        {children}
      </main>
    </div>
  );
};

export default MarketplaceLayout;
