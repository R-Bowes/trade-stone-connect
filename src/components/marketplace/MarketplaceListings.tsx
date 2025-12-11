import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";
import MarketplaceItemCard from "./MarketplaceItemCard";
import { MarketplaceItem } from "@/data/marketplaceData";

interface MarketplaceListingsProps {
  items: MarketplaceItem[];
  categoryName: string;
}

const MarketplaceListings = ({ items, categoryName }: MarketplaceListingsProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCondition, setSelectedCondition] = useState("all");

  const filteredItems = items.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         item.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCondition = selectedCondition === "all" || item.condition === selectedCondition;
    
    return matchesSearch && matchesCondition;
  });

  return (
    <>
      {/* Filters Section */}
      <Card className="p-6 mb-8">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={`Search ${categoryName.toLowerCase()}...`}
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <Select value={selectedCondition} onValueChange={setSelectedCondition}>
            <SelectTrigger className="w-full md:w-[180px]">
              <SelectValue placeholder="Condition" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Conditions</SelectItem>
              <SelectItem value="New">New</SelectItem>
              <SelectItem value="Used - Excellent">Used - Excellent</SelectItem>
              <SelectItem value="Used - Good">Used - Good</SelectItem>
              <SelectItem value="Reclaimed">Reclaimed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* Results Count */}
      <div className="mb-4">
        <p className="text-sm text-muted-foreground">
          Showing {filteredItems.length} {filteredItems.length === 1 ? 'listing' : 'listings'}
        </p>
      </div>

      {/* Listings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredItems.map((item) => (
          <MarketplaceItemCard key={item.id} item={item} />
        ))}
      </div>

      {filteredItems.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No listings found matching your criteria</p>
        </div>
      )}
    </>
  );
};

export default MarketplaceListings;
