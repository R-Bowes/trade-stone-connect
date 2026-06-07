import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, subMonths } from "date-fns";
import { Loader2 } from "lucide-react";

// invoices.status confirmed: 'draft' | 'sent' | 'paid' | 'overdue' | 'void'

interface InvoiceRow {
  id: string;
  total: number | null;
  paid_date: string | null;
  contractor_id: string | null;
}

interface Props {
  profileId: string;
}

function fmtGbp(n: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(n);
}

function fmtGbpExact(n: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(n);
}

export function BusinessSpendView({ profileId }: Props) {
  const [loading, setLoading] = useState(true);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [contractorMap, setContractorMap] = useState<Record<string, string>>({});

  useEffect(() => { load(); }, [profileId]);

  const load = async () => {
    setLoading(true);

    // All paid invoices for this recipient — going back 24 months to cover the chart
    const since = subMonths(startOfMonth(new Date()), 5).toISOString();
    const { data: rows } = await supabase
      .from("invoices")
      .select("id, total, paid_date, contractor_id")
      .eq("recipient_id", profileId)
      .eq("status", "paid")
      .gte("paid_date", since)
      .order("paid_date", { ascending: false });

    const data: InvoiceRow[] = (rows ?? []).map((r: any) => ({ ...r }));
    setInvoices(data);

    // Hydrate contractor names
    const cIds = [...new Set(data.map((r) => r.contractor_id).filter(Boolean))] as string[];
    if (cIds.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", cIds);
      setContractorMap(Object.fromEntries((profiles ?? []).map((p: any) => [p.id, p.full_name])));
    }

    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const now = new Date();
  const monthStart = startOfMonth(now);

  const mtdTotal = invoices
    .filter((r) => r.paid_date && new Date(r.paid_date) >= monthStart)
    .reduce((acc, r) => acc + (r.total ?? 0), 0);

  // Last 6 months breakdown
  const months: { label: string; start: Date; end: Date }[] = Array.from({ length: 6 }, (_, i) => {
    const start = startOfMonth(subMonths(now, 5 - i));
    const end = i < 5 ? startOfMonth(subMonths(now, 4 - i)) : new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return { label: format(start, "MMM yyyy"), start, end };
  });

  const monthlyRows = months.map(({ label, start, end }) => {
    const bucket = invoices.filter((r) => {
      if (!r.paid_date) return false;
      const d = new Date(r.paid_date);
      return d >= start && d < end;
    });
    return { label, count: bucket.length, total: bucket.reduce((acc, r) => acc + (r.total ?? 0), 0) };
  });

  // By contractor
  const byContractor: Record<string, { name: string; count: number; total: number }> = {};
  invoices.forEach((r) => {
    const key = r.contractor_id ?? "unknown";
    const name = r.contractor_id ? (contractorMap[r.contractor_id] ?? "Unknown contractor") : "Unknown contractor";
    if (!byContractor[key]) byContractor[key] = { name, count: 0, total: 0 };
    byContractor[key].count++;
    byContractor[key].total += r.total ?? 0;
  });
  const contractorRows = Object.values(byContractor).sort((a, b) => b.total - a.total);

  return (
    <div className="p-6 max-w-3xl space-y-6">

      {/* MTD hero */}
      <Card>
        <CardContent className="p-6 flex items-baseline gap-3">
          <span
            className="font-mono font-bold"
            style={{ fontSize: 36, color: "#1a2744" }}
          >
            {fmtGbp(mtdTotal)}
          </span>
          <span className="text-sm text-muted-foreground">paid invoices, {format(monthStart, "MMMM yyyy")}</span>
        </CardContent>
      </Card>

      {/* Last 6 months */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Last 6 months</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground text-xs">
                <th className="text-left py-2.5 px-6 font-medium">Month</th>
                <th className="text-right py-2.5 pr-6 font-medium">Invoices</th>
                <th className="text-right py-2.5 pr-6 font-medium">Total paid</th>
              </tr>
            </thead>
            <tbody>
              {monthlyRows.map(({ label, count, total }) => (
                <tr key={label} className="border-b last:border-0">
                  <td className="py-2.5 px-6 font-medium">{label}</td>
                  <td className="py-2.5 pr-6 text-right text-muted-foreground">{count}</td>
                  <td className="py-2.5 pr-6 text-right font-mono">{total > 0 ? fmtGbpExact(total) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* By contractor */}
      {contractorRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">By contractor</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-xs">
                  <th className="text-left py-2.5 px-6 font-medium">Contractor</th>
                  <th className="text-right py-2.5 pr-6 font-medium">Invoices</th>
                  <th className="text-right py-2.5 pr-6 font-medium">Total paid</th>
                </tr>
              </thead>
              <tbody>
                {contractorRows.map(({ name, count, total }) => (
                  <tr key={name} className="border-b last:border-0">
                    <td className="py-2.5 px-6 font-medium">{name}</td>
                    <td className="py-2.5 pr-6 text-right text-muted-foreground">{count}</td>
                    <td className="py-2.5 pr-6 text-right font-mono">{fmtGbpExact(total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {invoices.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">No paid invoices in this period.</p>
      )}
    </div>
  );
}
