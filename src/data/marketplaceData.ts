export interface MarketplaceItem {
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

export const mockItems: MarketplaceItem[] = [
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
  },
  {
    id: "7",
    title: "Cordless Drill Set",
    price: "£120",
    seller: "Pro Tools Direct",
    location: "East London",
    condition: "New",
    quantity: "1 set",
    image: "🔨",
    description: "Professional cordless drill with multiple attachments, two batteries, and carrying case. 18V lithium-ion for extended use.",
    category: "Tools",
    images: ["🔨", "🔨", "🔨"],
    sellerContact: {
      email: "sales@protoolsdirect.com",
      phone: "Contact through TradeStone"
    }
  },
  {
    id: "8",
    title: "Scaffolding Set",
    price: "£2,500",
    seller: "Build Right Supplies",
    location: "West London",
    condition: "Used - Good",
    quantity: "Full set",
    image: "🪜",
    description: "Complete scaffolding set for two-story buildings. Includes all connectors, platforms, and safety rails. Recently inspected and certified.",
    category: "Equipment",
    images: ["🪜", "🪜", "🪜"],
    sellerContact: {
      email: "info@buildrightuk.com",
      phone: "Contact through TradeStone"
    }
  }
];

export const getItemsByCategory = (category?: string) => {
  if (!category || category === "all") return mockItems;
  return mockItems.filter(item => item.category.toLowerCase() === category.toLowerCase());
};

export const getItemById = (id: string) => {
  return mockItems.find(item => item.id === id);
};
