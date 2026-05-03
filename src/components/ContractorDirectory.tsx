import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, MapPin, Loader2, Clock3, X } from "lucide-react";
import ContractorCard from "./ContractorCard";
import { useContractors } from "@/hooks/useContractors";
import { CONTRACTOR_TRADES } from "@/constants/trades";

type AvailabilityFilter = "all" | "available" | "unavailable";

const ContractorDirectory = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTrade, setSelectedTrade] = useState<string | undefined>(undefined);
  const [location, setLocation] = useState("");
  const [availability, setAvailability] = useState<AvailabilityFilter>("all");

  const { data: contractorQuery, isLoading } = useContractors(searchTerm, selectedTrade, location);
  const contractors = contractorQuery?.contractors ?? [];

  const trades = [...CONTRACTOR_TRADES];

  const showClearFilters =
    searchTerm.trim() !== "" ||
    selectedTrade !== undefined ||
    location.trim() !== "" ||
    availability !== "all";

  const clearFilters = () => {
    setSearchTerm("");
    setSelectedTrade(undefined);
    setLocation("");
    setAvailability("all");
  };

  const handleTradeChange = (value: string) => {
    setSelectedTrade(value === "all" ? undefined : value);
  };

  const filteredContractors = useMemo(() => {
    return contractors.filter((contractor) => {
      if (availability === "available") return contractor.is_available === true;
      if (availability === "unavailable") return contractor.is_available === false;
      return true;
    });
  }, [availability, contractors]);

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
            <div className="relative lg:flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, company, or TS code..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            <div className="flex items-center justify-end gap-4 min-w-0 lg:min-w-[460px]">
              <Select value={selectedTrade ?? "all"} onValueChange={handleTradeChange}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Select trade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All trades</SelectItem>
                  {trades.map((trade) => (
                    <SelectItem key={trade} value={trade}>{trade}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

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
          </div>

          <div className="mt-4 pt-4 border-t flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={availability} onValueChange={(value: AvailabilityFilter) => setAvailability(value)}>
                <SelectTrigger className="w-[190px] h-8">
                  <div className="flex items-center gap-1 text-xs">
                    <Clock3 className="h-3.5 w-3.5" />
                    <SelectValue placeholder="Availability" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any availability</SelectItem>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="unavailable">Unavailable</SelectItem>
                </SelectContent>
              </Select>

              {showClearFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-1" />
                  Clear filters
                </Button>
              )}
            </div>

            <div className="text-sm text-muted-foreground">
              {filteredContractors.length} contractor{filteredContractors.length !== 1 ? "s" : ""} found
            </div>
          </div>
        </div>

        {/* Results */}
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : filteredContractors.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {filteredContractors.map((contractor) => (
              <ContractorCard
                key={contractor.user_id}
                name={contractor.full_name || "Unknown"}
                company={contractor.company_name || "Independent Contractor"}
                code={contractor.ts_profile_code || ""}
                profileId={contractor.id}
                specialties={contractor.trades && contractor.trades.length > 0 ? contractor.trades : []}
                bioSnippet={contractor.bio || undefined}
                rating={contractor.rating ?? null}
                reviewCount={contractor.review_count ?? null}
                location={contractor.location || ""}
                image={contractor.logo_url || undefined}
                isVerified={contractor.is_verified ?? false}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No contractors found matching your search.</p>
          </div>
        )}

        {filteredContractors.length > 0 && (
          <div className="text-center mt-12">
            <Button variant="outline" size="lg">Load more</Button>
          </div>
        )}
      </div>
    </section>
  );
};

export default ContractorDirectory;