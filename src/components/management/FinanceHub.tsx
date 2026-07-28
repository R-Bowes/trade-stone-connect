import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FinanceSettings } from "@/components/management/FinanceSettings";
import { MileageTracking } from "@/components/management/financials/MileageTracking";
import { ProfitAndLoss } from "@/components/management/financials/ProfitAndLoss";
import { VatPosition } from "@/components/management/financials/VatPosition";

export function FinanceHub() {
  return (
    <Tabs defaultValue="settings">
      <TabsList className="ml-6 mt-6">
        <TabsTrigger value="settings">
          <i className="ti ti-settings mr-1" /> Settings
        </TabsTrigger>
        <TabsTrigger value="mileage">
          <i className="ti ti-road mr-1" /> Mileage
        </TabsTrigger>
        <TabsTrigger value="pnl">
          <i className="ti ti-report-money mr-1" /> P&amp;L
        </TabsTrigger>
        <TabsTrigger value="vat">
          <i className="ti ti-receipt-tax mr-1" /> VAT
        </TabsTrigger>
      </TabsList>

      <TabsContent value="settings">
        <FinanceSettings />
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
    </Tabs>
  );
}
