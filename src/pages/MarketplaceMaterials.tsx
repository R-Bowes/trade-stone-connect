import MarketplaceLayout from "@/components/marketplace/MarketplaceLayout";
import MarketplaceListings from "@/components/marketplace/MarketplaceListings";

const MarketplaceMaterials = () => {
  return (
    <MarketplaceLayout>
      <MarketplaceListings category="Materials" categoryName="Materials" />
    </MarketplaceLayout>
  );
};

export default MarketplaceMaterials;
