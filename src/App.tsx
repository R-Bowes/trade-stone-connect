import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useParams, useLocation } from "react-router-dom";
import { useEffect } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
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
import PrivacyPolicy from "./pages/legal/PrivacyPolicy";
import TermsAndConditions from "./pages/legal/TermsAndConditions";
import CookiePolicy from "./pages/legal/CookiePolicy";
import Footer from "./components/Footer";
import NotFound from "./pages/NotFound";
import Dashboard from "./pages/Dashboard";
import HomeownerDashboard from "./pages/HomeownerDashboard";
import BusinessDashboard from "./pages/BusinessDashboard";
import ContractorDashboard from "./pages/ContractorDashboard";
import About from "./pages/About";
import Notifications from "./pages/Notifications";
import AdminDashboard from "@/pages/AdminDashboard";
import AdminLogin from "@/pages/AdminLogin";
import ContractorOnboarding from "./pages/ContractorOnboarding";
import PayInvoicePage from "./pages/PayInvoicePage";
import ResetPassword from "./components/ui/ResetPassword";
import BusinessSettings from "./pages/BusinessSettings";
import Projects from "./pages/Projects";
import TenderDetail from "./pages/TenderDetail";
import ProposalReview from "./pages/ProposalReview";
import ProjectDelivery from "./pages/ProjectDelivery";
import InvitePage from "./pages/InvitePage";

const queryClient = new QueryClient();

const RedirectToContractor = () => {
  const { code } = useParams<{ code: string }>();
  return <Navigate to={`/contractor/${code}`} replace />;
};

function usePageTracking() {
  const location = useLocation();
  useEffect(() => {
    if (typeof window.gtag !== "undefined") {
      window.gtag("config", "G-67CCVE770P", {
        page_path: location.pathname + location.search,
      });
    }
  }, [location]);
}

const PageTracker = () => {
  usePageTracking();
  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <PageTracker />
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<Index />} />
          <Route path="/contractors" element={<Contractors />} />
          <Route path="/contracts" element={<Contracts />} />
          <Route path="/how-it-works" element={<HowItWorks />} />
          <Route path="/c/:code" element={<RedirectToContractor />} />
          <Route path="/contractor/:code" element={<ContractorProfile />} />
          <Route path="/hire/:slug" element={<ContractorProfile />} />
          <Route path="/business" element={<BusinessManagement />} />
          <Route path="/marketplace" element={<Marketplace />} />
          <Route path="/marketplace/materials" element={<MarketplaceMaterials />} />
          <Route path="/marketplace/equipment" element={<MarketplaceEquipment />} />
          <Route path="/marketplace/tools" element={<MarketplaceTools />} />
          <Route path="/marketplace/item/:id" element={<MarketplaceItem />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/login" element={<Auth />} />
          <Route path="/terms" element={<TermsAndConditions />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
          <Route path="/cookies" element={<CookiePolicy />} />
          <Route path="/about" element={<About />} />
          <Route path="/pay/:invoiceId" element={<PayInvoicePage />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/invite" element={<InvitePage />} />

          {/* Protected routes */}
          <Route path="/notifications" element={<ProtectedRoute><Notifications /></ProtectedRoute>} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/dashboard/homeowner" element={<ProtectedRoute requiredRole="personal"><HomeownerDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/personal" element={<Navigate to="/dashboard/homeowner" replace />} />
          <Route path="/dashboard/business" element={<ProtectedRoute requiredRole="business"><BusinessDashboard /></ProtectedRoute>} />
          <Route path="/dashboard/business/settings" element={<ProtectedRoute requiredRole="business"><BusinessSettings /></ProtectedRoute>} />
          <Route path="/dashboard/contractor" element={<ProtectedRoute requiredRole="contractor"><ContractorDashboard /></ProtectedRoute>} />
          <Route path="/onboarding/contractor" element={<ProtectedRoute><ContractorOnboarding /></ProtectedRoute>} />
          <Route path="/projects" element={<ProtectedRoute><Projects /></ProtectedRoute>} />
          <Route path="/projects/:id" element={<ProtectedRoute><TenderDetail /></ProtectedRoute>} />
          <Route path="/projects/:id/proposals" element={<ProtectedRoute><ProposalReview /></ProtectedRoute>} />
          <Route path="/projects/:id/delivery" element={<ProtectedRoute><ProjectDelivery /></ProtectedRoute>} />

          {/* Admin */}
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin" element={<AdminDashboard />} />

          {/* Catch-all */}
          <Route path="*" element={<NotFound />} />
        </Routes>
        <Footer />
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;