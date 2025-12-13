import MarketplaceLayout from "@/components/marketplace/MarketplaceLayout";
import MarketplaceListings from "@/components/marketplace/MarketplaceListings";

const MarketplaceTools = () => {
  return (
    <MarketplaceLayout>
      <MarketplaceListings category="Tools" categoryName="Tools" />
    </MarketplaceLayout>
  );
};

export default MarketplaceTools;
