import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Plus, Edit, Archive, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CONTRACTOR_TRADES } from "@/constants/trades";
import type { WorkOrderPriority } from "@/hooks/useWorkOrders";

type Category = {
  id: string;
  company_id: string;
  name: string;
  trade: string | null;
  default_priority: WorkOrderPriority;
  description: string | null;
  is_active: boolean;
  sort_order: number;
};

type EngagementOption = { id: string; contractor_name: string | null };

type AutoDispatchRule = {
  category: string;
  trade?: string;
  engagement_id: string;
  priority?: WorkOrderPriority;
  auto_create_job?: boolean;
};

const PRIORITY_OPTIONS: WorkOrderPriority[] = ["emergency", "urgent", "routine", "planned"];

const emptyCategoryForm = { name: "", trade: "", default_priority: "routine" as WorkOrderPriority, description: "" };

export function ServiceCategoryManager({ companyId }: { companyId: string }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [rules, setRules] = useState<AutoDispatchRule[]>([]);
  const [defaultConfigId, setDefaultConfigId] = useState<string | null>(null);
  const [engagements, setEngagements] = useState<EngagementOption[]>([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyCategoryForm);
  const [saving, setSaving] = useState(false);

  const [ruleCategory, setRuleCategory] = useState<Category | null>(null);
  const [ruleEngagementId, setRuleEngagementId] = useState("");
  const [rulePriority, setRulePriority] = useState<WorkOrderPriority | "">("");
  const [ruleAutoCreateJob, setRuleAutoCreateJob] = useState(true);
  const [savingRule, setSavingRule] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: catRows }, { data: configRow }, { data: engagementRows }] = await Promise.all([
      (supabase as any).from("service_request_categories").select("*").eq("company_id", companyId).order("sort_order"),
      (supabase as any).from("site_autonomy_config").select("id, auto_dispatch_rules").eq("company_id", companyId).is("site_id", null).maybeSingle(),
      (supabase as any).from("term_engagements").select("id, contractor:profiles!term_engagements_contractor_id_fkey(full_name)").eq("company_id", companyId).eq("status", "active"),
    ]);
    setCategories((catRows ?? []) as Category[]);
    setDefaultConfigId(configRow?.id ?? null);
    setRules((configRow?.auto_dispatch_rules ?? []) as AutoDispatchRule[]);
    setEngagements(((engagementRows ?? []) as any[]).map((e) => ({ id: e.id, contractor_name: e.contractor?.full_name ?? null })));
    setLoading(false);
  };

  useEffect(() => { load(); }, [companyId]);

  const openAdd = () => { setEditingId(null); setForm(emptyCategoryForm); setDialogOpen(true); };
  const openEdit = (c: Category) => {
    setEditingId(c.id);
    setForm({ name: c.name, trade: c.trade ?? "", default_priority: c.default_priority, description: c.description ?? "" });
    setDialogOpen(true);
  };

  const handleSaveCategory = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const payload = {
        company_id: companyId,
        name: form.name.trim(),
        trade: form.trade || null,
        default_priority: form.default_priority,
        description: form.description || null,
      };
      if (editingId) {
        const { error } = await (supabase as any).from("service_request_categories").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("service_request_categories").insert({ ...payload, sort_order: categories.length });
        if (error) throw error;
      }
      toast({ title: "Category saved" });
      setDialogOpen(false);
      await load();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to save category", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const archiveCategory = async (c: Category) => {
    await (supabase as any).from("service_request_categories").update({ is_active: !c.is_active }).eq("id", c.id);
    await load();
  };

  const openRuleDialog = (c: Category) => {
    setRuleCategory(c);
    const existing = rules.find((r) => r.category === c.name);
    setRuleEngagementId(existing?.engagement_id ?? "");
    setRulePriority(existing?.priority ?? "");
    setRuleAutoCreateJob(existing?.auto_create_job ?? true);
  };

  const saveRule = async () => {
    if (!ruleCategory) return;
    setSavingRule(true);
    try {
      const nextRules = rules.filter((r) => r.category !== ruleCategory.name);
      if (ruleEngagementId) {
        nextRules.push({
          category: ruleCategory.name,
          trade: ruleCategory.trade ?? undefined,
          engagement_id: ruleEngagementId,
          priority: rulePriority || undefined,
          auto_create_job: ruleAutoCreateJob,
        });
      }
      // NOT an upsert: UNIQUE(company_id, site_id) doesn't deduplicate when
      // site_id IS NULL, so onConflict:"company_id,site_id" would insert a
      // second default row on every save instead of updating the first
      // (same issue as SiteAutonomySettings.saveDefault). Branch on the
      // row id already loaded. autonomy_level is only defaulted to 2 (the
      // minimum for auto-dispatch to fire at all, per process_auto_dispatch's
      // `autonomy_level < 2` guard) when creating the row for the first
      // time — an existing row's level is left untouched so configuring a
      // rule here never silently downgrades a company already at level 3/4.
      const { error } = defaultConfigId
        ? await (supabase as any).from("site_autonomy_config").update({ auto_dispatch_rules: nextRules }).eq("id", defaultConfigId)
        : await (supabase as any).from("site_autonomy_config").insert({ company_id: companyId, site_id: null, auto_dispatch_rules: nextRules, autonomy_level: 2 });
      if (error) throw error;
      toast({ title: ruleEngagementId ? "Auto-dispatch rule saved" : "Auto-dispatch rule removed" });
      setRuleCategory(null);
      await load();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to save rule", variant: "destructive" });
    } finally {
      setSavingRule(false);
    }
  };

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-heading text-lg font-bold">Service Request Categories</h3>
        <Button size="sm" onClick={openAdd}><Plus className="h-4 w-4 mr-1" />Add Category</Button>
      </div>

      {categories.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-muted-foreground">No categories configured yet.</CardContent></Card>
      ) : (
        <div className="grid gap-2">
          {categories.map((c) => {
            const rule = rules.find((r) => r.category === c.name);
            return (
              <Card key={c.id} className={!c.is_active ? "opacity-50" : ""}>
                <CardContent className="p-3 flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium text-sm">{c.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.trade ?? "Any trade"} · Default priority: {c.default_priority}
                      {rule && <> · <Zap className="h-3 w-3 inline text-blue-600" /> Auto-dispatch configured</>}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="outline" onClick={() => openRuleDialog(c)}>
                      <Zap className="h-3.5 w-3.5 mr-1" />Auto-dispatch
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(c)}><Edit className="h-3.5 w-3.5" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => archiveCategory(c)}><Archive className="h-3.5 w-3.5" /></Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editingId ? "Edit Category" : "Add Category"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} /></div>
            <div className="space-y-1">
              <Label>Trade</Label>
              <Select value={form.trade || "none"} onValueChange={(v) => setForm((f) => ({ ...f, trade: v === "none" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="Any trade" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Any trade</SelectItem>
                  {CONTRACTOR_TRADES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Default priority</Label>
              <Select value={form.default_priority} onValueChange={(v) => setForm((f) => ({ ...f, default_priority: v as WorkOrderPriority }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PRIORITY_OPTIONS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveCategory} disabled={saving || !form.name.trim()}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!ruleCategory} onOpenChange={(o) => { if (!o) setRuleCategory(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Auto-dispatch — {ruleCategory?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Auto-dispatch to</Label>
              <Select value={ruleEngagementId || "none"} onValueChange={(v) => setRuleEngagementId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="No auto-dispatch" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No auto-dispatch</SelectItem>
                  {engagements.map((e) => <SelectItem key={e.id} value={e.id}>{e.contractor_name ?? e.id.slice(0, 8)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {ruleEngagementId && (
              <>
                <div className="space-y-1">
                  <Label>Priority override</Label>
                  <Select value={rulePriority || "none"} onValueChange={(v) => setRulePriority(v === "none" ? "" : v as WorkOrderPriority)}>
                    <SelectTrigger><SelectValue placeholder="Use request priority" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Use request priority</SelectItem>
                      {PRIORITY_OPTIONS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <label className="flex items-center justify-between">
                  <span className="text-sm">Auto-create job</span>
                  <Switch checked={ruleAutoCreateJob} onCheckedChange={setRuleAutoCreateJob} />
                </label>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRuleCategory(null)}>Cancel</Button>
            <Button onClick={saveRule} disabled={savingRule}>
              {savingRule && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
