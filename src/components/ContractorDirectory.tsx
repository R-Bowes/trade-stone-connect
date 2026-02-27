import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Search, MapPin, SlidersHorizontal, Loader2 } from "lucide-react";
import ContractorCard from "./ContractorCard";
import { useContractors } from "@/hooks/useContractors";

const ContractorDirectory = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTrade, setSelectedTrade] = useState<string | undefined>(undefined);
  const [location, setLocation] = useState("");
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  const { data: contractors, isLoading } = useContractors(searchTerm, selectedTrade, location);

  const trades = [
    "Agricultural Technician",
    "Air-craft Engineer",
    "Automation Technician",
    "Auto Mechanic",
    "Boilermaker",
    "Bricklayer / Mason",
    "Carpentry",
    "Carpenter",
    "Carpet Installer",
    "Concrete Finisher",
    "Construction Inspector",
    "Construction Manager",
    "Consultant",
    "Crane Operator",
    "Drywall Installer / Finisher",
    "Electrician",
    "Energy Efficiency Consultant",
    "Elevator Mechanic",
    "Electrical",
    "Farmer",
    "Flooring Installer",
    "Flooring",
    "Gardener",
    "General Building",
    "Glazier",
    "Heavy Equipment Operator",
    "HVAC Technician (Heating, Ventilation, and Air Conditioning)",
    "Heating",
    "Insulation Worker",
    "Ironworker",
    "Landscaper",
    "Machinist",
    "Mechanical Installer",
    "Painter and Decorator",
    "Painting",
    "Plasterer",
    "Plumber",
    "Plumbing",
    "Rigger",
    "Roofer",
    "Roofing",
    "Scaffolder",
    "Security System Installer",
    "Sheet Metal Worker",
    "Smart Home Technician",
    "Solar Panel Installer",
    "Tiler",
    "Tree Surgeon / Arborist",
    "Welder",
    "Wind Turbine Technician"
  ];

  const handleTradeChange = (value: string) => {
    if (value === "all") {
      setSelectedTrade(undefined);
      return;
    }
    setSelectedTrade(value);
  };

  return (
    <section id="directory" className="py-16 px-4">
      <div className="container mx-auto max-w-6xl">
        {/* Header */}
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Find Trusted <span className="text-primary">Contractors</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Search our verified directory of professional contractors by trade, location, or unique TradeStone code.
          </p>
        </div>

        {/* Search and Filters */}
        <div className="bg-card rounded-lg border p-6 shadow-tradestone mb-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            {/* Search Input */}
            <div className="relative lg:flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, company, or TS code..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="hidden lg:flex lg:items-center lg:justify-end lg:gap-4 lg:min-w-[460px]">
              {/* Trade Filter */}
              <Select value={selectedTrade} onValueChange={handleTradeChange}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Select trade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Trades</SelectItem>
                  {trades.map((trade) => (
                    <SelectItem key={trade} value={trade}>
                      {trade}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Location */}
              <div className="relative w-[220px]">
                <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Location or postcode"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="lg:hidden">
              <Sheet open={isFiltersOpen} onOpenChange={setIsFiltersOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" className="w-full">
                    <SlidersHorizontal className="h-4 w-4 mr-2" />
                    Filters
                  </Button>
                </SheetTrigger>
                <SheetContent side="right" className="w-full sm:max-w-md">
                  <SheetHeader>
                    <SheetTitle>Filters</SheetTitle>
                  </SheetHeader>

                  <div className="space-y-4 mt-6">
                    <Select value={selectedTrade} onValueChange={handleTradeChange}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select trade" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Trades</SelectItem>
                        {trades.map((trade) => (
                          <SelectItem key={trade} value={trade}>
                            {trade}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Location or postcode"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        className="pl-10"
                      />
                    </div>

                    <Button className="w-full" onClick={() => setIsFiltersOpen(false)}>
                      Apply Filters
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>

          {/* Advanced Filters */}
          <div className="flex justify-between items-center mt-4 pt-4 border-t">
            <Button variant="ghost" size="sm">
              <SlidersHorizontal className="h-4 w-4 mr-2" />
              Advanced Filters
            </Button>
            <div className="text-sm text-muted-foreground">
              {contractors?.length || 0} contractors found
            </div>
          </div>
        </div>

        {/* Results Grid */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : contractors && contractors.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {contractors.map((contractor) => (
              <ContractorCard
                key={contractor.user_id}
                name={contractor.full_name || "Unknown"}
                company={contractor.company_name || "Independent Contractor"}
                code={contractor.ts_profile_code || ""}
                specialties={[]}
                rating={0}
                reviewCount={0}
                location=""
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No contractors found. Be the first to register as a Pro!</p>
          </div>
        )}

        {/* Load More */}
        {contractors && contractors.length > 0 && (
          <div className="text-center mt-12">
            <Button variant="outline" size="lg">
              Load More Contractors
            </Button>
          </div>
        )}
      </div>
    </section>
  );
};

export default ContractorDirectory;
