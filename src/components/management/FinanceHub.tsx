import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FinanceDashboard } from "@/components/management/financials/FinanceDashboard";
import { ExpenseList } from "@/components/management/financials/ExpenseList";
import { MileageTracking } from "@/components/management/financials/MileageTracking";
import { ProfitAndLoss } from "@/components/management/financials/ProfitAndLoss";
import { VatPosition } from "@/components/management/financials/VatPosition";
import { JobProfitability } from "@/components/management/financials/JobProfitability";
import { AgedDebtors } from "@/components/management/financials/AgedDebtors";
import { FinanceSettings } from "@/components/management/FinanceSettings";

export function FinanceHub() {
  const [activeTab, setActiveTab] = useState("dashboard");

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList className="ml-6 mt-6 flex w-[calc(100%-1.5rem)] flex-nowrap justify-start overflow-x-auto scrollbar-hide md:w-auto md:inline-flex">
        <TabsTrigger value="dashboard" className="shrink-0">
          <i className="ti ti-layout-dashboard mr-1" /> Dashboard
        </TabsTrigger>
        <TabsTrigger value="expenses" className="shrink-0">
          <i className="ti ti-receipt-2 mr-1" /> Expenses
        </TabsTrigger>
        <TabsTrigger value="mileage" className="shrink-0">
          <i className="ti ti-road mr-1" /> Mileage
        </TabsTrigger>
        <TabsTrigger value="pnl" className="shrink-0">
          <i className="ti ti-report-money mr-1" /> P&amp;L
        </TabsTrigger>
        <TabsTrigger value="vat" className="shrink-0">
          <i className="ti ti-receipt-tax mr-1" /> VAT
        </TabsTrigger>
        <TabsTrigger value="profitability" className="shrink-0">
          <i className="ti ti-chart-bar mr-1" /> Profitability
        </TabsTrigger>
        <TabsTrigger value="debtors" className="shrink-0">
          <i className="ti ti-alert-triangle mr-1" /> Debtors
        </TabsTrigger>
        <TabsTrigger value="settings" className="shrink-0">
          <i className="ti ti-settings mr-1" /> Settings
        </TabsTrigger>
      </TabsList>

      <TabsContent value="dashboard">
        <FinanceDashboard onNavigate={setActiveTab} />
      </TabsContent>
      <TabsContent value="expenses">
        <ExpenseList />
      </TabsContent>
      <TabsContent value="mileage">
        <MileageTracking />
      </TabsContent>
      <TabsContent value="pnl">
        <ProfitAndLoss />
      </TabsContent>
      <TabsContent value="vat">
        <VatPosition />
      </TabsContent>
      <TabsContent value="profitability">
        <JobProfitability />
      </TabsContent>
      <TabsContent value="debtors">
        <AgedDebtors />
      </TabsContent>
      <TabsContent value="settings">
        <FinanceSettings />
      </TabsContent>
    </Tabs>
  );
}
