import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, MapPin, SlidersHorizontal } from "lucide-react";
import ContractorCard from "./ContractorCard";

const ContractorDirectory = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTrade, setSelectedTrade] = useState<string | undefined>(
    undefined
  );
  const [location, setLocation] = useState("");

  // Mock contractor data
  const contractors = [
    {
      name: "Mike Johnson",
      company: "Johnson Plumbing Ltd",
      code: "A7K9M2",
      specialties: ["Plumbing", "Heating", "Boiler Repair"],
      rating: 4.8,
      reviewCount: 127,
      location: "Central London",
      distance: "2.3 miles"
    },
    {
      name: "Sarah Chen",
      company: "Elite Electrical Services",
      code: "B8N4P6",
      specialties: ["Electrical", "Smart Home", "Solar Panels"],
      rating: 4.9,
      reviewCount: 89,
      location: "North London", 
      distance: "4.1 miles"
    },
    {
      name: "David Wilson",
      company: "Wilson Roofing Co",
      code: "C5R7T1",
      specialties: ["Roofing", "Gutters", "Chimney Repair", "Tiles", "Slates"],
      rating: 4.7,
      reviewCount: 203,
      location: "South London",
      distance: "6.8 miles"
    },
    {
      name: "Emma Rodriguez",
      company: "Rodriguez General Works",
      code: "D9F3H8",
      specialties: ["General Building", "Extensions", "Renovations"],
      rating: 4.6,
      reviewCount: 156,
      location: "West London",
      distance: "8.2 miles"
    }
  ];

  const trades = [
    "Plumbing",
    "Electrical",
    "Roofing",
    "General Building",
    "Heating",
    "Carpentry",
    "Painting",
    "Flooring",
    "Tiling"
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
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Search Input */}
            <div className="md:col-span-2 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, company, or TS code..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Trade Filter */}
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

            {/* Location */}
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Location or postcode"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Advanced Filters */}
          <div className="flex justify-between items-center mt-4 pt-4 border-t">
            <Button variant="ghost" size="sm">
              <SlidersHorizontal className="h-4 w-4 mr-2" />
              Advanced Filters
            </Button>
            <div className="text-sm text-muted-foreground">
              {contractors.length} contractors found
            </div>
          </div>
        </div>

        {/* Results Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {contractors.map((contractor, index) => (
            <ContractorCard
              key={index}
              {...contractor}
            />
          ))}
        </div>

        {/* Load More */}
        <div className="text-center mt-12">
          <Button variant="outline" size="lg">
            Load More Contractors
          </Button>
        </div>
      </div>
    </section>
  );
};

export default ContractorDirectory;