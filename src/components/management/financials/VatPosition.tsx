import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useFinanceSummary, type Period, type QuarterVat } from "@/hooks/useFinanceSummary";
import { downloadCsv, tradestoneCsvFilename } from "@/lib/csvExport";

const PERIOD_LABELS: Record<Period, string> = {
  currentTaxYear: "This tax year",
  previousTaxYear: "Last tax year",
  currentQuarter: "This quarter",
  custom: "Custom range",
};

const gbp = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function PeriodSelector({
  period,
  setPeriod,
  customRange,
  setCustomRange,
}: Pick<ReturnType<typeof useFinanceSummary>, "period" | "setPeriod" | "customRange" | "setCustomRange">) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end gap-3">
      <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
        <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
        <SelectContent>
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <SelectItem key={p} value={p}>{PERIOD_LABELS[p]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {period === "custom" && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs">From</Label>
            <Input
              type="date"
              value={customRange?.start ?? ""}
              onChange={(e) => setCustomRange({ start: e.target.value, end: customRange?.end ?? e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">To</Label>
            <Input
              type="date"
              value={customRange?.end ?? ""}
              onChange={(e) => setCustomRange({ start: customRange?.start ?? e.target.value, end: e.target.value })}
            />
          </div>
        </>
      )}
    </div>
  );
}

export function VatPosition() {
  const { vatPosition, period, setPeriod, customRange, setCustomRange, loading } = useFinanceSummary();

  const handleExport = () => {
    downloadCsv(
      tradestoneCsvFilename("vat_position"),
      ["Quarter", "Output VAT", "Input VAT", "Net VAT"],
      vatPosition.quarterlyBreakdown.map((q: QuarterVat) => [
        q.quarter,
        q.outputVat.toFixed(2),
        q.inputVat.toFixed(2),
        q.netVat.toFixed(2),
      ]),
    );
  };

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading VAT position…</div>;
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-3">
        <div>
          <h2 className="font-heading text-2xl font-bold">VAT Position</h2>
          <p className="text-sm text-muted-foreground">Track your VAT position and prepare for returns</p>
        </div>
        <div className="flex items-center gap-2">
          {vatPosition.vatStatus !== "not_registered" && (
            <PeriodSelector period={period} setPeriod={setPeriod} customRange={customRange} setCustomRange={setCustomRange} />
          )}
          {vatPosition.vatStatus !== "not_registered" && (
            <Button variant="outline" onClick={handleExport}>
              <i className="ti ti-download mr-1" /> Export CSV
            </Button>
          )}
        </div>
      </div>

      {vatPosition.vatStatus === "not_registered" && (
        <Card>
          <CardHeader>
            <CardTitle>VAT registration threshold</CardTitle>
            <CardDescription>
              HMRC requires VAT registration once your taxable turnover exceeds £90,000 in any rolling 12-month period.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-between text-sm">
              <span>Rolling 12-month turnover</span>
              <span className="font-semibold">{gbp(vatPosition.rollingTurnover)}</span>
            </div>
            <div className="h-3 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  vatPosition.thresholdPercentage >= 90
                    ? "bg-red-600"
                    : vatPosition.thresholdPercentage >= 80
                    ? "bg-amber-500"
                    : "bg-green-600"
                }`}
                style={{ width: `${Math.min(100, vatPosition.thresholdPercentage)}%` }}
              />
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>You're {vatPosition.thresholdPercentage.toFixed(1)}% toward the VAT registration threshold</span>
              <span>Threshold: {gbp(vatPosition.vatThreshold)}</span>
            </div>

            {vatPosition.thresholdPercentage >= 90 && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                You're close to the VAT threshold. We'd recommend speaking to an accountant about registering soon.
              </div>
            )}
            {vatPosition.thresholdPercentage >= 80 && vatPosition.thresholdPercentage < 90 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                You're approaching the VAT threshold — worth monitoring your turnover closely.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {vatPosition.vatStatus === "standard" && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Output VAT</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{gbp(vatPosition.outputVat)}</div>
                <p className="text-xs text-muted-foreground">Charged on invoices</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Input VAT</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{gbp(vatPosition.inputVat)}</div>
                <p className="text-xs text-muted-foreground">Reclaimable on expenses</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {vatPosition.netVatOwed >= 0 ? "Net VAT owed" : "Net VAT reclaimable"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${vatPosition.netVatOwed >= 0 ? "text-red-600" : "text-green-600"}`}>
                  {gbp(Math.abs(vatPosition.netVatOwed))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {vatPosition.netVatOwed >= 0
                    ? `You owe HMRC ${gbp(vatPosition.netVatOwed)}`
                    : `HMRC owes you ${gbp(Math.abs(vatPosition.netVatOwed))}`}
                </p>
              </CardContent>
            </Card>
          </div>

          <QuarterlyTable rows={vatPosition.quarterlyBreakdown} />
        </>
      )}

      {vatPosition.vatStatus === "flat_rate" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Flat Rate Scheme</CardTitle>
              <CardDescription>
                Under the Flat Rate Scheme, you cannot reclaim input VAT on most purchases (capital assets over £2,000 are an exception).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span>Flat rate percentage</span>
                <span className="font-semibold">
                  {vatPosition.flatRatePercentage?.toFixed(1) ?? "—"}%
                  {vatPosition.flatRateFirstYearDiscount && " (1% first-year discount applied)"}
                </span>
              </div>
              <div className="flex justify-between text-sm border-t pt-3 font-semibold">
                <span>VAT due to HMRC</span>
                <span>{gbp(vatPosition.flatRateVatDue)}</span>
              </div>
            </CardContent>
          </Card>

          <QuarterlyTable rows={vatPosition.quarterlyBreakdown} />
        </>
      )}
    </div>
  );
}

function QuarterlyTable({ rows }: { rows: { quarter: string; outputVat: number; inputVat: number; netVat: number }[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Quarterly breakdown</CardTitle>
        <CardDescription>For VAT return preparation</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">No data for this period.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Quarter</TableHead>
                <TableHead className="text-right">Output VAT</TableHead>
                <TableHead className="text-right">Input VAT</TableHead>
                <TableHead className="text-right">Net VAT</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.quarter}>
                  <TableCell className="font-medium">{r.quarter}</TableCell>
                  <TableCell className="text-right">{gbp(r.outputVat)}</TableCell>
                  <TableCell className="text-right">{gbp(r.inputVat)}</TableCell>
                  <TableCell className={`text-right ${r.netVat >= 0 ? "" : "text-green-600"}`}>
                    {r.netVat < 0 ? "-" : ""}{gbp(Math.abs(r.netVat))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
