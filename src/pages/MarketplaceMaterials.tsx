import MarketplaceLayout from "@/components/marketplace/MarketplaceLayout";
import MarketplaceListings from "@/components/marketplace/MarketplaceListings";
import { getItemsByCategory } from "@/data/marketplaceData";

const MarketplaceMaterials = () => {
  const items = getItemsByCategory("materials");

  return (
    <MarketplaceLayout>
      <MarketplaceListings items={items} categoryName="Materials" />
    </MarketplaceLayout>
  );
};

export default MarketplaceMaterials;
