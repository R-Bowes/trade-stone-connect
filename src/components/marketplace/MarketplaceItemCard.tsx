import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Package } from "lucide-react";
import { MarketplaceListing } from "@/hooks/useMarketplaceListings";

interface MarketplaceItemCardProps {
  item: MarketplaceListing;
}

const MarketplaceItemCard = ({ item }: MarketplaceItemCardProps) => {
  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(price);
  };

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-tradestone">
      <Link to={`/marketplace/item/${item.id}`}>
        <div className="aspect-video bg-muted flex items-center justify-center cursor-pointer overflow-hidden">
          {item.images && item.images.length > 0 ? (
            <img src={item.images[0]} alt={item.title} className="w-full h-full object-cover" />
          ) : (
            <Package className="h-12 w-12 text-muted-foreground" />
          )}
        </div>
      </Link>
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-semibold text-lg">{item.title}</h3>
          <Badge variant="secondary">{item.condition}</Badge>
        </div>
        <p className="text-2xl font-bold text-primary mb-2">{formatPrice(item.price)}</p>
        <p className="text-sm text-muted-foreground mb-1">{item.quantity}</p>
        <div className="flex items-center space-x-1 text-sm text-muted-foreground mb-3">
          <MapPin className="h-3 w-3" />
          <span>{item.location}</span>
        </div>
        <Button 
          className="w-full" 
          variant="outline" 
          size="sm"
          asChild
        >
          <Link to={`/marketplace/item/${item.id}`}>View Details</Link>
        </Button>
      </div>
    </Card>
  );
};

export default MarketplaceItemCard;
