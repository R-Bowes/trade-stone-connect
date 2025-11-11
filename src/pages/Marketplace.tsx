import { useState } from "react";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Search, Filter } from "lucide-react";

interface MarketplaceItem {
  id: string;
  title: string;
  price: string;
  seller: string;
  location: string;
  condition: string;
  quantity: string;
  image: string;
  description: string;
  category: string;
  images: string[];
  sellerContact: {
    email: string;
    phone: string;
  };
}

const mockItems: MarketplaceItem[] = [
  {
    id: "1",
    title: "Premium Oak Flooring",
    price: "£850",
    seller: "Johnson Building Supplies",
    location: "Central London",
    condition: "New",
    quantity: "45 sqm",
    image: "🪵",
    description: "High-quality premium oak flooring, perfect for residential or commercial projects. Each plank is carefully selected and finished to the highest standards.",
    category: "Materials",
    images: ["🪵", "🪵", "🪵"],
    sellerContact: {
      email: "contact@johnson-supplies.com",
      phone: "Contact through TradeStone"
    }
  },
  {
    id: "2",
    title: "Industrial Cement Mixer",
    price: "£450",
    seller: "Elite Equipment Rentals",
    location: "North London",
    condition: "Used - Excellent",
    quantity: "1 unit",
    image: "🏗️",
    description: "Professional-grade cement mixer, recently serviced and in excellent working condition. Perfect for medium to large construction projects.",
    category: "Equipment",
    images: ["🏗️", "🏗️", "🏗️"],
    sellerContact: {
      email: "info@elite-equipment.com",
      phone: "Contact through TradeStone"
    }
  },
  {
    id: "3",
    title: "Reclaimed Victorian Bricks",
    price: "£320",
    seller: "Heritage Materials Ltd",
    location: "South London",
    condition: "Reclaimed",
    quantity: "500 bricks",
    image: "🧱",
    description: "Authentic Victorian-era bricks, carefully reclaimed from period properties. Perfect for restoration projects or adding character to new builds.",
    category: "Materials",
    images: ["🧱", "🧱", "🧱"],
    sellerContact: {
      email: "sales@heritage-materials.co.uk",
      phone: "Contact through TradeStone"
    }
  },
  {
    id: "4",
    title: "Professional Tile Cutter",
    price: "£180",
    seller: "Wilson Tool Hire",
    location: "West London",
    condition: "Used - Good",
    quantity: "1 unit",
    image: "🔧",
    description: "Heavy-duty tile cutter suitable for ceramic, porcelain, and natural stone tiles. Includes spare blades and carrying case.",
    category: "Tools",
    images: ["🔧", "🔧", "🔧"],
    sellerContact: {
      email: "hire@wilson-tools.com",
      phone: "Contact through TradeStone"
    }
  },
  {
    id: "5",
    title: "Exterior White Paint",
    price: "£95",
    seller: "Paint & Decor Surplus",
    location: "East London",
    condition: "New",
    quantity: "25L",
    image: "🎨",
    description: "Professional-grade exterior masonry paint in brilliant white. Weather-resistant and provides excellent coverage. Sealed and unopened.",
    category: "Materials",
    images: ["🎨", "🎨", "🎨"],
    sellerContact: {
      email: "surplus@paintdecor.co.uk",
      phone: "Contact through TradeStone"
    }
  },
  {
    id: "6",
    title: "Steel I-Beams (6m)",
    price: "£1,200",
    seller: "Metro Steel & Iron",
    location: "Central London",
    condition: "New",
    quantity: "8 beams",
    image: "⚙️",
    description: "Heavy-duty steel I-beams, 6 meters in length. Ideal for structural support in commercial and residential construction. Certified and ready for immediate use.",
    category: "Materials",
    images: ["⚙️", "⚙️", "⚙️"],
    sellerContact: {
      email: "orders@metrosteel.com",
      phone: "Contact through TradeStone"
    }
  }
];

const Marketplace = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedCondition, setSelectedCondition] = useState("all");
  const [selectedItem, setSelectedItem] = useState<MarketplaceItem | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const filteredItems = mockItems.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         item.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === "all" || item.category === selectedCategory;
    const matchesCondition = selectedCondition === "all" || item.condition === selectedCondition;
    
    return matchesSearch && matchesCategory && matchesCondition;
  });

  const handleViewDetails = (item: MarketplaceItem) => {
    setSelectedItem(item);
    setIsDialogOpen(true);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-8 pt-24">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Marketplace</h1>
          <p className="text-muted-foreground">Buy and sell construction materials, tools, and equipment</p>
        </div>

        {/* Filters Section */}
        <Card className="p-6 mb-8">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search listings..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-full md:w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="Materials">Materials</SelectItem>
                <SelectItem value="Equipment">Equipment</SelectItem>
                <SelectItem value="Tools">Tools</SelectItem>
              </SelectContent>
            </Select>

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
            <Card key={item.id} className="overflow-hidden hover:shadow-lg transition-tradestone cursor-pointer">
              <div 
                className="aspect-video bg-muted flex items-center justify-center text-6xl"
                onClick={() => handleViewDetails(item)}
              >
                {item.image}
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-lg">{item.title}</h3>
                  <Badge variant="secondary">{item.condition}</Badge>
                </div>
                <p className="text-2xl font-bold text-primary mb-2">{item.price}</p>
                <p className="text-sm text-muted-foreground mb-1">{item.quantity}</p>
                <div className="flex items-center space-x-1 text-sm text-muted-foreground mb-3">
                  <MapPin className="h-3 w-3" />
                  <span>{item.location}</span>
                </div>
                <p className="text-sm font-medium mb-3">{item.seller}</p>
                <Button 
                  className="w-full" 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleViewDetails(item)}
                >
                  View Details
                </Button>
              </div>
            </Card>
          ))}
        </div>

        {filteredItems.length === 0 && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No listings found matching your criteria</p>
          </div>
        )}
      </main>

      {/* Item Details Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          {selectedItem && (
            <>
              <DialogHeader>
                <DialogTitle className="text-2xl">{selectedItem.title}</DialogTitle>
              </DialogHeader>
              
              <div className="space-y-6">
                {/* Image Gallery */}
                <div className="grid grid-cols-3 gap-2">
                  {selectedItem.images.map((img, index) => (
                    <div 
                      key={index}
                      className="aspect-video bg-muted flex items-center justify-center text-4xl rounded-lg"
                    >
                      {img}
                    </div>
                  ))}
                </div>

                {/* Price and Status */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-3xl font-bold text-primary">{selectedItem.price}</p>
                    <p className="text-sm text-muted-foreground">{selectedItem.quantity}</p>
                  </div>
                  <Badge variant="secondary" className="text-sm">
                    {selectedItem.condition}
                  </Badge>
                </div>

                {/* Description */}
                <div>
                  <h3 className="font-semibold mb-2">Description</h3>
                  <p className="text-muted-foreground">{selectedItem.description}</p>
                </div>

                {/* Details */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-semibold mb-1">Category</p>
                    <p className="text-sm text-muted-foreground">{selectedItem.category}</p>
                  </div>
                  <div>
                    <p className="text-sm font-semibold mb-1">Location</p>
                    <div className="flex items-center space-x-1 text-sm text-muted-foreground">
                      <MapPin className="h-3 w-3" />
                      <span>{selectedItem.location}</span>
                    </div>
                  </div>
                </div>

                {/* Seller Information */}
                <div className="border-t pt-4">
                  <h3 className="font-semibold mb-3">Seller Information</h3>
                  <div className="space-y-2">
                    <p className="text-sm">
                      <span className="font-medium">Seller:</span> {selectedItem.seller}
                    </p>
                    <p className="text-sm">
                      <span className="font-medium">Contact:</span> {selectedItem.sellerContact.phone}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      All communications go through TradeStone's secure messaging system
                    </p>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <Button className="flex-1">Contact Seller</Button>
                  <Button variant="outline" className="flex-1">Save Listing</Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Marketplace;
