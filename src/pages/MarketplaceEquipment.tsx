import MarketplaceLayout from "@/components/marketplace/MarketplaceLayout";
import MarketplaceListings from "@/components/marketplace/MarketplaceListings";

const MarketplaceEquipment = () => {
  return (
    <MarketplaceLayout>
      <MarketplaceListings category="Equipment" categoryName="Equipment" />
    </MarketplaceLayout>
  );
};

export default MarketplaceEquipment;
