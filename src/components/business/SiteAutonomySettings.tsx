import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const LEVEL_DESCRIPTIONS: Record<number, { label: string; description: string }> = {
  1: { label: "Level 1 — Request Only", description: "Site can report issues; FM dispatches manually." },
  2: { label: "Level 2 — Categorised Request", description: "Requests are categorised, may auto-dispatch by rule." },
  3: { label: "Level 3 — Panel Selection", description: "Site can pick a panel contractor covering the site." },
  4: { label: "Level 4 — Full Autonomy", description: "Site can search all of TradeStone and self-dispatch within spend limits." },
};

type SiteOption = { id: string; name: string };

type AutonomyRow = {
  id: string;
  company_id: string;
  site_id: string | null;
  autonomy_level: number;
  max_wo_value: number | null;
  max_monthly_spend: number | null;
  approval_threshold: number | null;
};

interface FormState {
  autonomy_level: number;
  max_wo_value: string;
  max_monthly_spend: string;
  approval_threshold: string;
}

const emptyForm: FormState = { autonomy_level: 1, max_wo_value: "", max_monthly_spend: "", approval_threshold: "" };

export function SiteAutonomySettings({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [defaultRow, setDefaultRow] = useState<AutonomyRow | null>(null);
  const [overrides, setOverrides] = useState<AutonomyRow[]>([]);
  const [defaultForm, setDefaultForm] = useState<FormState>(emptyForm);
  const [savingDefault, setSavingDefault] = useState(false);

  const [editingSite, setEditingSite] = useState<SiteOption | null>(null);
  const [useDefault, setUseDefault] = useState(true);
  const [editForm, setEditForm] = useState<FormState>(emptyForm);
  const [savingSite, setSavingSite] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: siteRows }, { data: configRows }] = await Promise.all([
      supabase.from("sites").select("id, name").eq("company_id", companyId).eq("status", "active").order("name"),
      (supabase as any).from("site_autonomy_config").select("*").eq("company_id", companyId),
    ]);
    setSites((siteRows ?? []) as SiteOption[]);
    const rows = (configRows ?? []) as AutonomyRow[];
    const def = rows.find((r) => r.site_id === null) ?? null;
    setDefaultRow(def);
    setDefaultForm(def ? {
      autonomy_level: def.autonomy_level,
      max_wo_value: def.max_wo_value?.toString() ?? "",
      max_monthly_spend: def.max_monthly_spend?.toString() ?? "",
      approval_threshold: def.approval_threshold?.toString() ?? "",
    } : emptyForm);
    setOverrides(rows.filter((r) => r.site_id !== null));
    setLoading(false);
  };

  useEffect(() => { load(); }, [companyId]);

  const saveDefault = async () => {
    setSavingDefault(true);
    try {
      const payload = {
        company_id: companyId,
        site_id: null,
        autonomy_level: defaultForm.autonomy_level,
        max_wo_value: defaultForm.max_wo_value ? Number(defaultForm.max_wo_value) : null,
        max_monthly_spend: defaultForm.max_monthly_spend ? Number(defaultForm.max_monthly_spend) : null,
        approval_threshold: defaultForm.approval_threshold ? Number(defaultForm.approval_threshold) : null,
      };
      // NOT an upsert: UNIQUE(company_id, site_id) does not deduplicate
      // when site_id IS NULL (Postgres treats NULLs as distinct in unique
      // constraints), so onConflict:"company_id,site_id" would silently
      // insert a second default row on every save instead of updating the
      // first. Branch on the row id we already loaded instead.
      const { error } = defaultRow
        ? await (supabase as any).from("site_autonomy_config").update(payload).eq("id", defaultRow.id)
        : await (supabase as any).from("site_autonomy_config").insert(payload);
      if (error) throw error;
      toast({ title: "Default applied to all sites without a site-specific override" });
      await load();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to save", variant: "destructive" });
    } finally {
      setSavingDefault(false);
    }
  };

  const openEdit = (site: SiteOption) => {
    setEditingSite(site);
    const existing = overrides.find((o) => o.site_id === site.id);
    setUseDefault(!existing);
    setEditForm(existing ? {
      autonomy_level: existing.autonomy_level,
      max_wo_value: existing.max_wo_value?.toString() ?? "",
      max_monthly_spend: existing.max_monthly_spend?.toString() ?? "",
      approval_threshold: existing.approval_threshold?.toString() ?? "",
    } : defaultForm);
  };

  const saveSiteOverride = async () => {
    if (!editingSite) return;
    setSavingSite(true);
    try {
      if (useDefault) {
        await (supabase as any).from("site_autonomy_config").delete().eq("company_id", companyId).eq("site_id", editingSite.id);
      } else {
        const payload = {
          company_id: companyId,
          site_id: editingSite.id,
          autonomy_level: editForm.autonomy_level,
          max_wo_value: editForm.max_wo_value ? Number(editForm.max_wo_value) : null,
          max_monthly_spend: editForm.max_monthly_spend ? Number(editForm.max_monthly_spend) : null,
          approval_threshold: editForm.approval_threshold ? Number(editForm.approval_threshold) : null,
        };
        const { error } = await (supabase as any)
          .from("site_autonomy_config")
          .upsert(payload, { onConflict: "company_id,site_id" });
        if (error) throw error;
      }
      toast({ title: "Site settings saved" });
      setEditingSite(null);
      await load();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to save", variant: "destructive" });
    } finally {
      setSavingSite(false);
    }
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  const levelForSite = (siteId: string) => overrides.find((o) => o.site_id === siteId)?.autonomy_level ?? defaultForm.autonomy_level;

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-4 space-y-4">
          <h3 className="font-heading text-lg font-bold">Company Default Settings</h3>
          <RadioGroup
            value={String(defaultForm.autonomy_level)}
            onValueChange={(v) => setDefaultForm((f) => ({ ...f, autonomy_level: Number(v) }))}
            className="space-y-2"
          >
            {[1, 2, 3, 4].map((lvl) => (
              <label key={lvl} className="flex items-start gap-3 border rounded-md p-3 cursor-pointer">
                <RadioGroupItem value={String(lvl)} className="mt-0.5" />
                <div>
                  <div className="font-medium text-sm">{LEVEL_DESCRIPTIONS[lvl].label}</div>
                  <div className="text-xs text-muted-foreground">{LEVEL_DESCRIPTIONS[lvl].description}</div>
                </div>
              </label>
            ))}
          </RadioGroup>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label>Max WO value (£)</Label>
              <Input type="number" min="0" value={defaultForm.max_wo_value} onChange={(e) => setDefaultForm((f) => ({ ...f, max_wo_value: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Max monthly spend (£)</Label>
              <Input type="number" min="0" value={defaultForm.max_monthly_spend} onChange={(e) => setDefaultForm((f) => ({ ...f, max_monthly_spend: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>Approval threshold (£)</Label>
              <Input type="number" min="0" value={defaultForm.approval_threshold} onChange={(e) => setDefaultForm((f) => ({ ...f, approval_threshold: e.target.value }))} />
            </div>
          </div>

          <Button onClick={saveDefault} disabled={savingDefault}>
            {savingDefault && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Apply to all sites without overrides
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="p-4 pb-0"><h3 className="font-heading text-lg font-bold">Per-Site Overrides</h3></div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Site</TableHead>
                <TableHead>Level</TableHead>
                <TableHead>Spend limit</TableHead>
                <TableHead>Override</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sites.map((s) => {
                const override = overrides.find((o) => o.site_id === s.id);
                return (
                  <TableRow key={s.id} className="cursor-pointer" onClick={() => openEdit(s)}>
                    <TableCell>{s.name}</TableCell>
                    <TableCell><Badge variant="outline">Level {levelForSite(s.id)}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {(override?.max_wo_value ?? defaultRow?.max_wo_value) ? `£${(override?.max_wo_value ?? defaultRow?.max_wo_value)!.toFixed(2)}` : "—"}
                    </TableCell>
                    <TableCell>{override ? <Badge>Custom</Badge> : <Badge variant="outline">Default</Badge>}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editingSite} onOpenChange={(o) => { if (!o) setEditingSite(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingSite?.name} — Autonomy Settings</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <label className="flex items-center justify-between">
              <span className="text-sm">Use company default</span>
              <Switch checked={useDefault} onCheckedChange={setUseDefault} />
            </label>
            {!useDefault && (
              <>
                <RadioGroup value={String(editForm.autonomy_level)} onValueChange={(v) => setEditForm((f) => ({ ...f, autonomy_level: Number(v) }))} className="space-y-2">
                  {[1, 2, 3, 4].map((lvl) => (
                    <label key={lvl} className="flex items-start gap-3 border rounded-md p-2 cursor-pointer">
                      <RadioGroupItem value={String(lvl)} className="mt-0.5" />
                      <div className="text-sm">{LEVEL_DESCRIPTIONS[lvl].label}</div>
                    </label>
                  ))}
                </RadioGroup>
                <div className="grid grid-cols-1 gap-3">
                  <div className="space-y-1">
                    <Label>Max WO value (£)</Label>
                    <Input type="number" min="0" value={editForm.max_wo_value} onChange={(e) => setEditForm((f) => ({ ...f, max_wo_value: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Max monthly spend (£)</Label>
                    <Input type="number" min="0" value={editForm.max_monthly_spend} onChange={(e) => setEditForm((f) => ({ ...f, max_monthly_spend: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Approval threshold (£)</Label>
                    <Input type="number" min="0" value={editForm.approval_threshold} onChange={(e) => setEditForm((f) => ({ ...f, approval_threshold: e.target.value }))} />
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingSite(null)}>Cancel</Button>
            <Button onClick={saveSiteOverride} disabled={savingSite}>
              {savingSite && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
