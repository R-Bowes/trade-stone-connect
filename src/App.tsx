import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
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
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
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

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
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
          <Route path="/login" element={<Auth />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
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
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
