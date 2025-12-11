import MarketplaceLayout from "@/components/marketplace/MarketplaceLayout";
import MarketplaceListings from "@/components/marketplace/MarketplaceListings";
import { getItemsByCategory } from "@/data/marketplaceData";

const MarketplaceEquipment = () => {
  const items = getItemsByCategory("equipment");

  return (
    <MarketplaceLayout>
      <MarketplaceListings items={items} categoryName="Equipment" />
    </MarketplaceLayout>
  );
};

export default MarketplaceEquipment;
