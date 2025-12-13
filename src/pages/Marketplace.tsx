import MarketplaceLayout from "@/components/marketplace/MarketplaceLayout";
import MarketplaceListings from "@/components/marketplace/MarketplaceListings";

const Marketplace = () => {
  return (
    <MarketplaceLayout>
      <MarketplaceListings categoryName="All Listings" />
    </MarketplaceLayout>
  );
};

export default Marketplace;
