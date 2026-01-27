import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Contractors from "./pages/Contractors";
import Contracts from "./pages/Contracts";
import HowItWorks from "./pages/HowItWorks";
import ContractorProfile from "./pages/ContractorProfile";
import BusinessManagement from "./pages/BusinessManagement";
import Marketplace from "./pages/Marketplace";
import MarketplaceMaterials from "./pages/MarketplaceMaterials";
import MarketplaceEquipment from "./pages/MarketplaceEquipment";
import MarketplaceTools from "./pages/MarketplaceTools";
import MarketplaceItem from "./pages/MarketplaceItem";
import Auth from "./pages/Auth";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import NotFound from "./pages/NotFound";
import Dashboard from "./pages/Dashboard";
import PersonalDashboard from "./pages/PersonalDashboard";
import BusinessDashboard from "./pages/BusinessDashboard";
import ContractorDashboard from "./pages/ContractorDashboard";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/contractors" element={<Contractors />} />
          <Route path="/contracts" element={<Contracts />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/contractor/:code" element={<ContractorProfile />} />
          <Route path="/business" element={<BusinessManagement />} />
          <Route path="/marketplace" element={<Marketplace />} />
          <Route path="/marketplace/materials" element={<MarketplaceMaterials />} />
          <Route path="/marketplace/equipment" element={<MarketplaceEquipment />} />
          <Route path="/marketplace/tools" element={<MarketplaceTools />} />
          <Route path="/marketplace/item/:id" element={<MarketplaceItem />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          {/* Dashboard routes - auto-redirects based on user type */}
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/dashboard/personal" element={<PersonalDashboard />} />
          <Route path="/dashboard/business" element={<BusinessDashboard />} />
          <Route path="/dashboard/contractor" element={<ContractorDashboard />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
