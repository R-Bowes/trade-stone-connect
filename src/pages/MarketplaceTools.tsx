import MarketplaceLayout from "@/components/marketplace/MarketplaceLayout";
import MarketplaceListings from "@/components/marketplace/MarketplaceListings";
import { getItemsByCategory } from "@/data/marketplaceData";

const MarketplaceTools = () => {
  const items = getItemsByCategory("tools");

  return (
    <MarketplaceLayout>
      <MarketplaceListings items={items} categoryName="Tools" />
    </MarketplaceLayout>
  );
};

export default MarketplaceTools;
