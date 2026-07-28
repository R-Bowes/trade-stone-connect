import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FinanceSettings } from "@/components/management/FinanceSettings";
import { MileageTracking } from "@/components/management/financials/MileageTracking";

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
      </TabsList>

      <TabsContent value="settings">
        <FinanceSettings />
      </TabsContent>
      <TabsContent value="mileage">
        <MileageTracking />
      </TabsContent>
    </Tabs>
  );
}
