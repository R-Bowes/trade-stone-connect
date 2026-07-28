import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getTaxYear } from "@/hooks/useMileage";

function previousTaxYearLabel(label: string): string {
  const startYear = parseInt(label.split("-")[0], 10) - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

type Props = {
  open: boolean;
  onClose: () => void;
  /** Pre-selects a tax year, e.g. when opened from the P&L tab while viewing a full tax year. */
  defaultTaxYear?: string;
};

export function YearEndPackDialog({ open, onClose, defaultTaxYear }: Props) {
  const { toast } = useToast();
  const [generating, setGenerating] = useState(false);

  const taxYearOptions = useMemo(() => {
    const current = getTaxYear(new Date());
    const previous = previousTaxYearLabel(current);
    const twoBack = previousTaxYearLabel(previous);
    return [previous, twoBack, current];
  }, []);

  const mostRecentCompleted = taxYearOptions[0];
  const [taxYear, setTaxYear] = useState(defaultTaxYear ?? mostRecentCompleted);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke("generate-year-end-pack", {
        body: { tax_year: taxYear },
        headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });

      if (error || !data?.url) {
        throw error ?? new Error("No PDF URL returned");
      }

      window.open(data.url, "_blank");
      toast({ title: "Year-end pack ready", description: `Generated for tax year ${taxYear}.` });
      onClose();
    } catch (err) {
      console.error("Failed to generate year-end pack:", err);
      toast({ title: "Error", description: "Failed to generate the year-end pack", variant: "destructive" });
    }
    setGenerating(false);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Generate Year-End Pack</DialogTitle>
          <DialogDescription>
            A branded PDF summary — income, expenses, P&amp;L, VAT position and aged debtors — for your accountant.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label>Tax year</Label>
          <Select value={taxYear} onValueChange={setTaxYear}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {taxYearOptions.map((ty) => (
                <SelectItem key={ty} value={ty}>{ty}{ty === mostRecentCompleted ? " (most recent completed)" : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleGenerate} disabled={generating}>
            {generating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {generating ? "Generating…" : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
