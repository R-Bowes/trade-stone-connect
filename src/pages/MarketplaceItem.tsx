import { useParams, Link } from "react-router-dom";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { MapPin, ArrowLeft, Loader2, Package } from "lucide-react";
import { useMarketplaceListing } from "@/hooks/useMarketplaceListings";

const MarketplaceItem = () => {
  const { id } = useParams<{ id: string }>();
  const { data: item, isLoading } = useMarketplaceListing(id || "");

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8 pt-24 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </main>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto px-4 py-8 pt-24">
          <div className="text-center py-12">
            <h1 className="text-2xl font-bold mb-4">Item Not Found</h1>
            <p className="text-muted-foreground mb-6">The item you're looking for doesn't exist.</p>
            <Button asChild>
              <Link to="/marketplace">Back to Marketplace</Link>
            </Button>
          </div>
        </main>
      </div>
    );
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(price);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-8 pt-24">
        {/* Back Button */}
        <Button variant="ghost" className="mb-6" asChild>
          <Link to="/marketplace">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Marketplace
          </Link>
        </Button>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Image Gallery */}
          <div className="space-y-4">
            <div className="aspect-video bg-muted flex items-center justify-center rounded-lg">
              {item.images && item.images.length > 0 ? (
                <img src={item.images[0]} alt={item.title} className="w-full h-full object-cover rounded-lg" />
              ) : (
                <Package className="h-24 w-24 text-muted-foreground" />
              )}
            </div>
            {item.images && item.images.length > 1 && (
              <div className="grid grid-cols-3 gap-2">
                {item.images.slice(1).map((img, index) => (
                  <div 
                    key={index}
                    className="aspect-video bg-muted flex items-center justify-center rounded-lg cursor-pointer hover:opacity-80 transition-opacity overflow-hidden"
                  >
                    <img src={img} alt={`${item.title} ${index + 2}`} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Item Details */}
          <div className="space-y-6">
            <div>
              <div className="flex items-start justify-between mb-2">
                <h1 className="text-3xl font-bold">{item.title}</h1>
                <Badge variant="secondary" className="text-sm">
                  {item.condition}
                </Badge>
              </div>
              <Badge variant="outline">{item.category}</Badge>
            </div>

            <div>
              <p className="text-4xl font-bold text-primary">{formatPrice(item.price)}</p>
              <p className="text-muted-foreground">{item.quantity}</p>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Description</h3>
              <p className="text-muted-foreground">{item.description}</p>
            </div>

            <div className="flex items-center space-x-2 text-muted-foreground">
              <MapPin className="h-4 w-4" />
              <span>{item.location}</span>
            </div>

            {/* Seller Information */}
            <Card className="p-4">
              <h3 className="font-semibold mb-3">Seller Information</h3>
              <div className="space-y-2">
                <p className="text-sm">
                  <span className="font-medium">Seller:</span> {item.seller?.company_name || item.seller?.full_name || "TradeStone Seller"}
                </p>
                <p className="text-xs text-muted-foreground">
                  All communications go through TradeStone's secure messaging system
                </p>
              </div>
            </Card>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <Button className="flex-1">Contact Seller</Button>
              <Button variant="outline" className="flex-1">Save Listing</Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default MarketplaceItem;
