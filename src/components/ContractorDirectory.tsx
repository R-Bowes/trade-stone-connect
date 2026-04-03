import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Search, MapPin, SlidersHorizontal, Loader2, Star, Clock3, X } from "lucide-react";
import ContractorCard from "./ContractorCard";
import { useContractors } from "@/hooks/useContractors";
import { DEFAULT_TRADE_FILTERS, TRADE_TYPES } from "@/constants/trades";

type RatingFilter = "all" | "4.5" | "4.0";
type AvailabilityFilter = "all" | "available" | "unavailable";

const fallbackTrades = [...DEFAULT_TRADE_FILTERS];
const fallbackLocations = ["Birmingham", "Leeds", "Bristol", "Manchester", "Liverpool", "Nottingham"];
const fallbackBios = [
  "Experienced in residential and light commercial projects with a strong focus on quality finishes.",
  "Reliable contractor delivering clean, on-time work and clear communication from start to finish.",
  "Specialises in renovation, maintenance, and quick-response repair work for homeowners.",
  "Detail-oriented professional known for efficient scheduling and transparent project updates.",
];

const hashValue = (value: string) => {
  return [...value].reduce((total, char) => total + char.charCodeAt(0), 0);
};

const ContractorDirectory = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTrade, setSelectedTrade] = useState<string | undefined>(undefined);
  const [location, setLocation] = useState("");
  const [minRating, setMinRating] = useState<RatingFilter>("all");
  const [availability, setAvailability] = useState<AvailabilityFilter>("all");
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);

  const { data: contractors, isLoading } = useContractors(searchTerm, selectedTrade, location);

  const trades = [...TRADE_TYPES];

  const hasActiveFilters = selectedTrade !== undefined || location !== "" || minRating !== "all" || availability !== "all" || searchTerm !== "";

  const clearFilters = () => {
    setSearchTerm("");
    setSelectedTrade(undefined);
    setLocation("");
    setMinRating("all");
    setAvailability("all");
  };

  const handleTradeChange = (value: string) => {
    if (value === "all") {
      setSelectedTrade(undefined);
      return;
    }
    setSelectedTrade(value);
  };

  const contractorsWithMeta = useMemo(() => {
    return (contractors ?? []).map((contractor) => {
      const seed = hashValue(contractor.user_id ?? contractor.ts_profile_code ?? contractor.full_name ?? "contractor");
      const rating = Number((4 + (seed % 11) / 10).toFixed(1));
      const reviewCount = 10 + (seed % 90);

      // Use real trades array, fall back to single trade, then fallbacks
      const realTrades = contractor.trades && contractor.trades.length > 0
        ? contractor.trades
        : contractor.trade
          ? [contractor.trade]
          : null;
      
      const specialties = realTrades
        ? realTrades
        : [
            selectedTrade ?? fallbackTrades[seed % fallbackTrades.length],
            fallbackTrades[(seed + 2) % fallbackTrades.length],
            fallbackTrades[(seed + 4) % fallbackTrades.length],
          ];

      return {
        ...contractor,
        rating,
        reviewCount,
        specialties,
        bioSnippet: contractor.bio || fallbackBios[seed % fallbackBios.length],
        locationLabel: contractor.location || fallbackLocations[seed % fallbackLocations.length],
        distance: `${(1 + (seed % 14)).toFixed(1)} mi`,
        isAvailable: contractor.is_available ?? true,
      };
    });
  }, [contractors, selectedTrade]);

  const filteredContractors = useMemo(() => {
    return contractorsWithMeta.filter((contractor) => {
      const ratingMatch = minRating === "all" || contractor.rating >= Number(minRating);
      const availabilityMatch =
        availability === "all" ||
        (availability === "available" && contractor.isAvailable) ||
        (availability === "unavailable" && !contractor.isAvailable);

      return ratingMatch && availabilityMatch;
    });
  }, [availability, contractorsWithMeta, minRating]);

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
              <Select value={selectedTrade ?? "all"} onValueChange={handleTradeChange}>
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
                    <Select value={selectedTrade ?? "all"} onValueChange={handleTradeChange}>
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

                    <Select value={minRating} onValueChange={(value: RatingFilter) => setMinRating(value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Minimum rating" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Any rating</SelectItem>
                        <SelectItem value="4.5">4.5+ stars</SelectItem>
                        <SelectItem value="4.0">4.0+ stars</SelectItem>
                      </SelectContent>
                    </Select>

                    <Select value={availability} onValueChange={(value: AvailabilityFilter) => setAvailability(value)}>
                      <SelectTrigger>
                        <SelectValue placeholder="Availability" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Any availability</SelectItem>
                        <SelectItem value="available">Available</SelectItem>
                        <SelectItem value="unavailable">Unavailable</SelectItem>
                      </SelectContent>
                    </Select>

                    <Button className="w-full" onClick={() => setIsFiltersOpen(false)}>
                      Apply Filters
                    </Button>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={minRating} onValueChange={(value: RatingFilter) => setMinRating(value)}>
                <SelectTrigger className="w-[170px] h-8">
                  <div className="flex items-center gap-1 text-xs">
                    <Star className="h-3.5 w-3.5" />
                    <SelectValue placeholder="Rating" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any rating</SelectItem>
                  <SelectItem value="4.5">4.5+ stars</SelectItem>
                  <SelectItem value="4.0">4.0+ stars</SelectItem>
                </SelectContent>
              </Select>

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

              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-1" />
                  Clear filters
                </Button>
              )}
            </div>

            <div className="text-sm text-muted-foreground">{filteredContractors.length} contractors found</div>
          </div>
        </div>

        {/* Results Grid */}
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
                specialties={contractor.specialties}
                bioSnippet={contractor.bioSnippet}
                rating={contractor.rating}
                reviewCount={contractor.reviewCount}
                location={contractor.locationLabel}
                image={contractor.logo_url || undefined}
                distance={contractor.distance}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No contractors found. Be the first to register as a Pro!</p>
          </div>
        )}

        {/* Load More */}
        {filteredContractors.length > 0 && (
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
