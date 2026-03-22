import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DollarSign,
  Users,
  FileText,
  Clock,
  Plus,
  Eye,
  Edit,
  Send,
  Filter,
  MessageCircle,
  Star,
  Mail,
  Loader2,
  Hammer,
  HelpCircle
} from "lucide-react";
import { useOnboardingTour, type TourStep } from "@/hooks/useOnboardingTour";
import { OnboardingTour } from "@/components/OnboardingTour";
import type { User } from "@supabase/supabase-js";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import { StripeConnect } from "@/components/management/StripeConnect";
import { ProfileManagement } from "@/components/management/ProfileManagement";
import { PhotoGallery } from "@/components/management/PhotoGallery";
import { TeamManagement } from "@/components/management/TeamManagement";
import { TimesheetManagement } from "@/components/management/TimesheetManagement";
import { ContractManagement } from "@/components/management/ContractManagement";
import { ScheduleManagement } from "@/components/management/ScheduleManagement";
import { CRMManagement } from "@/components/management/CRMManagement";
import { FinancialsManagement } from "@/components/management/FinancialsManagement";
import { InvoiceManagement } from "@/components/management/InvoiceManagement";
import { DocumentManagement } from "@/components/management/DocumentManagement";
import { JobManagement } from "@/components/management/JobManagement";
import type { Database } from "@/integrations/supabase/types";

type Quote = Database["public"]["Tables"]["quotes"]["Row"];
type QuoteStatus = NonNullable<Quote["status"]>;
type Invoice = Database["public"]["Tables"]["invoices"]["Row"];
type Job = Database["public"]["Tables"]["jobs"]["Row"];

const contractorDashboardViews = [
  { value: "dashboard", label: "Dashboard" },
  { value: "quotes", label: "Quotes" },
  { value: "jobs", label: "Jobs" },
  { value: "invoices", label: "Invoices" },
  { value: "projects", label: "Projects" },
  { value: "contracts", label: "Contracts" },
  { value: "team", label: "Team" },
  { value: "timesheets", label: "Timesheets" },
  { value: "photos", label: "Photos" },
  { value: "documents", label: "Documents" },
  { value: "financials", label: "Financials" },
  { value: "schedule", label: "Schedule" },
  { value: "clients", label: "CRM" },
  { value: "profile", label: "Profile" },
] as const;

const ContractorDashboard = () => {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileIncomplete, setProfileIncomplete] = useState(false);

  const [dashboardData, setDashboardData] = useState({
    monthlyRevenue: 0,
    activeJobs: 0,
    pendingInvoicesTotal: 0,
    pendingInvoicesCount: 0,
    clientCount: 0,
  });
  const [recentInvoices, setRecentInvoices] = useState<Partial<Invoice>[]>([]);
  const [activeJobs, setActiveJobs] = useState<Partial<Job>[]>([]);

  const { toast } = useToast();
  const navigate = useNavigate();

  const tourSteps: TourStep[] = useMemo(() => [
    {
      target: '[data-tour="dashboard-header"]',
      title: "Welcome to Your Dashboard!",
      description: "This is your command centre. Get an overview of your revenue, projects, invoices, and clients all in one place.",
      placement: "bottom",
    },
    {
      target: '[data-tour="tab-quotes"]',
      title: "Quote Requests",
      description: "Receive and manage quote requests from potential clients. Track their status and respond quickly to win more work.",
      placement: "bottom",
      action: () => setActiveTab("quotes"),
    },
    {
      tar
