import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { format, differenceInDays } from "date-fns";
import { Loader2, ShieldCheck } from "lucide-react";

// contractor_panel.status confirmed: 'pending' | 'approved' | 'suspended' | 'removed'
const APPROVED_STATUS = "approved";

interface PanelMember {
  contractor_id: string;
  contractor_name: string;
  ts_code: string | null;
}

interface ComplianceItem {
  id: string;
  contractor_id: string;
  name: string;
  type: string;
  issuing_body: string | null;
  reference_number: string | null;
  issued_date: string | null;
  expiry_date: string | null;
  status: string | null;
  alert_sent: boolean | null;
}

interface SlaRule {
  id: string;
  name: string | null;
  applies_to_trade: string | null;
  response_hours: number | null;
  resolution_hours: number | null;
}

interface Props {
  companyId: string;
}

function fmt(iso: string) {
  return format(new Date(iso), "d MMM yyyy");
}

function ExpiryBadge({ expiry }: { expiry: string | null }) {
  if (!expiry) return <span className="text-xs text-muted-foreground">No expiry</span>;
  const days = differenceInDays(new Date(expiry), new Date());
  if (days < 0) {
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">Expired {fmt(expiry)}</span>;
  }
  if (days <= 30) {
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">Expires {fmt(expiry)}</span>;
  }
  return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Valid to {fmt(expiry)}</span>;
}

export function BusinessComplianceView({ companyId }: Props) {
  const [loading, setLoading] = useState(true);
  const [panelMembers, setPanelMembers] = useState<PanelMember[]>([]);
  const [complianceItems, setComplianceItems] = useState<ComplianceItem[]>([]);
  const [slaRules, setSlaRules] = useState<SlaRule[]>([]);

  useEffect(() => { load(); }, [companyId]);

  const load = async () => {
    setLoading(true);

    // Approved panel members for this company
    const { data: panelRows } = await supabase
      .from("contractor_panel")
      .select("contractor_id")
      .eq("company_id", companyId)
      .eq("status", APPROVED_STATUS);

    const contractorIds = (panelRows ?? []).map((r: any) => r.contractor_id as string);

    if (!contractorIds.length) {
      setPanelMembers([]);
      setComplianceItems([]);
      setLoading(false);
      return;
    }

    // Contractor names + TS codes
    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id, full_name, ts_profile_code")
      .in("id", contractorIds);

    const members: PanelMember[] = contractorIds.map((cid) => {
      const p = (profileRows ?? []).find((r: any) => r.id === cid);
      return {
        contractor_id: cid,
        contractor_name: p?.full_name ?? "Unknown contractor",
        ts_code: p?.ts_profile_code ?? null,
      };
    });

    // Compliance items for all panel contractors
    const { data: compRows } = await supabase
      .from("compliance_items")
      .select("id, contractor_id, name, type, issuing_body, reference_number, issued_date, expiry_date, status, alert_sent")
      .in("contractor_id", contractorIds)
      .order("expiry_date", { ascending: true });

    // SLA rules for this company
    const { data: slaRows } = await supabase
      .from("sla_rules")
      .select("id, name, applies_to_trade, response_hours, resolution_hours")
      .eq("company_id", companyId)
      .order("applies_to_trade");

    setPanelMembers(members);
    setComplianceItems((compRows ?? []) as ComplianceItem[]);
    setSlaRules((slaRows ?? []) as SlaRule[]);
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!panelMembers.length) {
    return (
      <div className="p-6 max-w-4xl">
        <Card>
          <CardContent className="p-10 text-center">
            <ShieldCheck className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="font-medium mb-1">No approved panel contractors</p>
            <p className="text-sm text-muted-foreground">Approve contractors in the Panel view to track their compliance here.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl space-y-8">

      {/* Contractor compliance items */}
      <section className="space-y-6">
        <h2 className="font-heading text-lg font-semibold">Contractor compliance</h2>

        {panelMembers.map((member) => {
          const items = complianceItems.filter((c) => c.contractor_id === member.contractor_id);
          const expiringCount = items.filter((c) => {
            if (!c.expiry_date) return false;
            return differenceInDays(new Date(c.expiry_date), new Date()) <= 30;
          }).length;

          return (
            <Card key={member.contractor_id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">{member.contractor_name}</CardTitle>
                    {member.ts_code && (
                      <p className="text-xs text-muted-foreground font-mono mt-0.5">{member.ts_code}</p>
                    )}
                  </div>
                  {expiringCount > 0 && (
                    <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-1 rounded">
                      {expiringCount} expiring soon
                    </span>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {items.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No compliance records on file.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground text-xs">
                          <th className="text-left py-2 pr-4 font-medium">Item</th>
                          <th className="text-left py-2 pr-4 font-medium">Type</th>
                          <th className="text-left py-2 pr-4 font-medium">Issuer</th>
                          <th className="text-left py-2 font-medium">Expiry</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item) => (
                          <tr key={item.id} className="border-b last:border-0">
                            <td className="py-2 pr-4 font-medium">{item.name}</td>
                            <td className="py-2 pr-4 text-muted-foreground capitalize">{item.type.replace(/_/g, " ")}</td>
                            <td className="py-2 pr-4 text-muted-foreground">{item.issuing_body ?? "—"}</td>
                            <td className="py-2"><ExpiryBadge expiry={item.expiry_date ?? null} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </section>

      {/* SLA rules reference */}
      <section className="space-y-4">
        <h2 className="font-heading text-lg font-semibold">SLA rules</h2>

        {slaRules.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-sm text-muted-foreground">
              No SLA rules configured for this company.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="text-left py-3 px-6 font-medium">Rule</th>
                    <th className="text-left py-3 pr-6 font-medium">Applies to</th>
                    <th className="text-left py-3 pr-6 font-medium">Response target</th>
                    <th className="text-left py-3 pr-6 font-medium">Resolution target</th>
                  </tr>
                </thead>
                <tbody>
                  {slaRules.map((rule) => (
                    <tr key={rule.id} className="border-b last:border-0">
                      <td className="py-3 px-6 font-medium">{rule.name ?? "Unnamed rule"}</td>
                      <td className="py-3 pr-6 text-muted-foreground capitalize">
                        {rule.applies_to_trade ? rule.applies_to_trade.replace(/_/g, " ") : "All trades"}
                      </td>
                      <td className="py-3 pr-6 font-mono">
                        {rule.response_hours != null ? `${rule.response_hours}h` : "—"}
                      </td>
                      <td className="py-3 pr-6 font-mono">
                        {rule.resolution_hours != null ? `${rule.resolution_hours}h` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
