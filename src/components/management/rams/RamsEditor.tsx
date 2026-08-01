import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, FileDown, Save, Lock, Unlock, ShieldCheck } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import {
  useRams,
  type Hazard,
  type MethodStep,
  type RamsTemplate,
  type RiskLevel,
} from "@/hooks/useRams";

const RISK_LEVELS: RiskLevel[] = ["low", "medium", "high"];

const RISK_COLOR: Record<RiskLevel, string> = {
  low: "bg-green-100 text-green-800 border-green-300",
  medium: "bg-amber-100 text-amber-800 border-amber-300",
  high: "bg-red-100 text-red-800 border-red-300",
};

const STANDARD_PPE = [
  "Hard hat", "Safety boots", "Hi-vis vest", "Safety glasses", "Gloves",
  "Ear protection", "Dust mask/RPE", "Harness", "Face shield",
];

const SIGNER_ROLES = ["Site supervisor", "Project manager", "Client representative", "Other"];

// ── Shared content section: hazards ─────────────────────────────────────────

function HazardsSection({ hazards, onChange }: { hazards: Hazard[]; onChange: (h: Hazard[]) => void }) {
  const update = (i: number, patch: Partial<Hazard>) =>
    onChange(hazards.map((h, idx) => (idx === i ? { ...h, ...patch } : h)));
  const remove = (i: number) => onChange(hazards.filter((_, idx) => idx !== i));
  const add = () =>
    onChange([...hazards, { hazard: "", risk_level: "medium", control_measures: "", residual_risk: "low" }]);

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <h3 className="font-heading text-lg font-bold">Hazards & Risk Assessment</h3>
        {hazards.length === 0 && <p className="text-sm text-muted-foreground">No hazards added yet.</p>}
        {hazards.map((h, i) => (
          <div key={i} className="rounded-md border p-3 space-y-2">
            <div className="flex items-start gap-2">
              <div className="flex-1 space-y-2">
                <Input
                  placeholder="Hazard description"
                  value={h.hazard}
                  onChange={(e) => update(i, { hazard: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Risk before controls</Label>
                    <Select value={h.risk_level} onValueChange={(v) => update(i, { risk_level: v as RiskLevel })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {RISK_LEVELS.map((r) => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Residual risk</Label>
                    <Select value={h.residual_risk} onValueChange={(v) => update(i, { residual_risk: v as RiskLevel })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {RISK_LEVELS.map((r) => <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Textarea
                  placeholder="Control measures"
                  rows={2}
                  value={h.control_measures}
                  onChange={(e) => update(i, { control_measures: e.target.value })}
                />
                <div className="flex gap-1">
                  <Badge variant="outline" className={RISK_COLOR[h.risk_level]}>Before: {h.risk_level}</Badge>
                  <Badge variant="outline" className={RISK_COLOR[h.residual_risk]}>After: {h.residual_risk}</Badge>
                </div>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="h-4 w-4 mr-1" />Add hazard
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Shared content section: method statement ────────────────────────────────

function MethodStepsSection({ steps, onChange }: { steps: MethodStep[]; onChange: (s: MethodStep[]) => void }) {
  const update = (i: number, patch: Partial<MethodStep>) =>
    onChange(steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const remove = (i: number) =>
    onChange(steps.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, step_number: idx + 1 })));
  const add = () =>
    onChange([...steps, { step_number: steps.length + 1, description: "", responsible: "", hazards_addressed: [] }]);

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <h3 className="font-heading text-lg font-bold">Method Statement</h3>
        {steps.length === 0 && <p className="text-sm text-muted-foreground">No method steps added yet.</p>}
        {steps.map((s, i) => (
          <div key={i} className="flex items-start gap-2 rounded-md border p-3">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-bold mt-1">
              {s.step_number}
            </div>
            <div className="flex-1 space-y-2">
              <Textarea
                placeholder="Step description"
                rows={2}
                value={s.description}
                onChange={(e) => update(i, { description: e.target.value })}
              />
              <Input
                placeholder="Responsible person"
                value={s.responsible}
                onChange={(e) => update(i, { responsible: e.target.value })}
              />
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={add}>
          <Plus className="h-4 w-4 mr-1" />Add step
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Shared content section: PPE ──────────────────────────────────────────────

function PpeSection({ ppe, onChange }: { ppe: string[]; onChange: (p: string[]) => void }) {
  const [custom, setCustom] = useState("");
  const toggle = (item: string, checked: boolean) =>
    onChange(checked ? [...ppe, item] : ppe.filter((p) => p !== item));
  const addCustom = () => {
    const trimmed = custom.trim();
    if (!trimmed || ppe.includes(trimmed)) return;
    onChange([...ppe, trimmed]);
    setCustom("");
  };
  const customItems = ppe.filter((p) => !STANDARD_PPE.includes(p));

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <h3 className="font-heading text-lg font-bold">PPE Requirements</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {STANDARD_PPE.map((item) => (
            <label key={item} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={ppe.includes(item)} onCheckedChange={(c) => toggle(item, !!c)} />
              {item}
            </label>
          ))}
        </div>
        {customItems.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {customItems.map((item) => (
              <Badge key={item} variant="secondary" className="gap-1 pr-1">
                {item}
                <button type="button" onClick={() => onChange(ppe.filter((p) => p !== item))}>×</button>
              </Badge>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <Input
            placeholder="Add custom PPE item"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustom(); } }}
          />
          <Button type="button" variant="outline" onClick={addCustom}>Add</Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Template selector (job mode, no RAMS yet) ────────────────────────────────

function TemplateSelector({
  templates, onSelectTemplate, onStartBlank, creating,
}: {
  templates: RamsTemplate[];
  onSelectTemplate: (id: string) => void;
  onStartBlank: () => void;
  creating: boolean;
}) {
  const platformTemplates = templates.filter((t) => t.owner_contractor_id === null);
  const myTemplates = templates.filter((t) => t.owner_contractor_id !== null);

  const grid = (list: RamsTemplate[]) => (
    <div className="grid sm:grid-cols-2 gap-3">
      {list.map((t) => (
        <button
          key={t.id}
          type="button"
          disabled={creating}
          onClick={() => onSelectTemplate(t.id)}
          className="text-left rounded-lg border p-3 hover:border-[#f07820] hover:bg-orange-50/40 transition-colors disabled:opacity-50"
        >
          <div className="font-medium text-sm">{t.name}</div>
          {t.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.description}</p>}
          <Badge variant="outline" className="mt-2 text-[10px]">{t.hazards.length} hazards</Badge>
        </button>
      ))}
    </div>
  );

  return (
    <Card>
      <CardContent className="p-4 space-y-6">
        <div>
          <h3 className="font-heading text-lg font-bold mb-1">Start from a template</h3>
          <p className="text-sm text-muted-foreground">Pick a starting point, then tailor it for this specific job.</p>
        </div>

        <div className="space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">TradeStone Templates</div>
          {platformTemplates.length === 0 ? <p className="text-sm text-muted-foreground">None available.</p> : grid(platformTemplates)}
        </div>

        {myTemplates.length > 0 && (
          <div className="space-y-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">My Templates</div>
            {grid(myTemplates)}
          </div>
        )}

        <Button type="button" variant="outline" onClick={onStartBlank} disabled={creating}>
          {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
          Start from scratch
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Job mode editor ───────────────────────────────────────────────────────────

interface RamsEditorProps {
  jobId: string;
  onSaved?: () => void;
}

export function RamsEditor({ jobId, onSaved }: RamsEditorProps) {
  const { templates, jobRams, loading, createFromTemplate, createBlank, updateJobRams, confirmTailoring, signOff, saveAsTemplate } = useRams(jobId);
  const { toast } = useToast();
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  const [siteAddress, setSiteAddress] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [assessorName, setAssessorName] = useState("");
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [methodSteps, setMethodSteps] = useState<MethodStep[]>([]);
  const [ppe, setPpe] = useState<string[]>([]);
  const [emergencyProcedures, setEmergencyProcedures] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");

  const [tailorName, setTailorName] = useState("");
  const [tailorChecked, setTailorChecked] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateNameInput, setTemplateNameInput] = useState("");

  const [signerName, setSignerName] = useState("");
  const [signerRole, setSignerRole] = useState(SIGNER_ROLES[0]);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("profiles").select("full_name").eq("user_id", user.id).maybeSingle();
      setAssessorName(data?.full_name ?? "");
      setTailorName(data?.full_name ?? "");
    })();
  }, []);

  useEffect(() => {
    if (!jobRams) return;
    setSiteAddress(jobRams.site_address ?? "");
    setJobDescription(jobRams.job_description ?? "");
    setHazards(jobRams.hazards);
    setMethodSteps(jobRams.method_steps);
    setPpe(jobRams.ppe_requirements);
    setEmergencyProcedures(jobRams.emergency_procedures ?? "");
    setAdditionalNotes(jobRams.additional_notes ?? "");
  }, [jobRams]);

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  const handleSelectTemplate = async (templateId: string) => {
    setCreating(true);
    try { await createFromTemplate(jobId, templateId); }
    finally { setCreating(false); }
  };

  const handleStartBlank = async () => {
    setCreating(true);
    try { await createBlank(jobId); }
    finally { setCreating(false); }
  };

  if (!jobRams) {
    return (
      <TemplateSelector
        templates={templates}
        onSelectTemplate={handleSelectTemplate}
        onStartBlank={handleStartBlank}
        creating={creating}
      />
    );
  }

  const readOnly = jobRams.status === "tailored" || jobRams.status === "signed";
  const canTailor = jobRams.status === "draft";

  const handleSaveContent = async () => {
    setSaving(true);
    try {
      await updateJobRams(jobRams.id, {
        site_address: siteAddress || null,
        job_description: jobDescription || null,
        hazards,
        method_steps: methodSteps,
        ppe_requirements: ppe,
        emergency_procedures: emergencyProcedures || null,
        additional_notes: additionalNotes || null,
      });
      toast({ title: "RAMS saved" });
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmTailoring = async () => {
    await handleSaveContent();
    await confirmTailoring(jobRams.id, tailorName);
    toast({ title: "RAMS tailored and locked" });
  };

  const handleUnlock = async () => {
    await updateJobRams(jobRams.id, { tailored_for_job: false, tailored_at: null, tailored_by: null, status: "draft" });
  };

  const handleGeneratePdf = async () => {
    setGeneratingPdf(true);
    try {
      const { url } = await invokeEdgeFunction<{ url: string }>("generate-rams-pdf", {
        body: { job_rams_id: jobRams.id },
      });
      window.open(url, "_blank");
    } catch (err) {
      toast({
        title: "PDF generation failed",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setGeneratingPdf(false);
    }
  };

  const handleSaveAsTemplate = async () => {
    if (!templateNameInput.trim()) return;
    setSavingTemplate(true);
    try {
      await saveAsTemplate(jobRams, templateNameInput.trim());
      setTemplateNameInput("");
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleSignOff = async () => {
    if (!signerName.trim()) return;
    await signOff(jobRams.id, signerName.trim(), signerRole);
    toast({ title: "RAMS signed off" });
  };

  return (
    <div className="space-y-4">
      {/* Job details */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="font-heading text-lg font-bold">Job Details</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Site address</Label>
              <Input value={siteAddress} onChange={(e) => setSiteAddress(e.target.value)} disabled={readOnly} />
            </div>
            <div className="space-y-1">
              <Label>Date of assessment</Label>
              <Input value={format(new Date(), "d MMM yyyy")} disabled />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Job description</Label>
              <Textarea rows={2} value={jobDescription} onChange={(e) => setJobDescription(e.target.value)} disabled={readOnly} />
            </div>
            <div className="space-y-1">
              <Label>Assessor name</Label>
              <Input value={assessorName} onChange={(e) => setAssessorName(e.target.value)} disabled={readOnly} />
            </div>
          </div>
        </CardContent>
      </Card>

      <fieldset disabled={readOnly} className="space-y-4">
        <HazardsSection hazards={hazards} onChange={setHazards} />
        <MethodStepsSection steps={methodSteps} onChange={setMethodSteps} />
        <PpeSection ppe={ppe} onChange={setPpe} />

        <Card>
          <CardContent className="p-4 space-y-2">
            <h3 className="font-heading text-lg font-bold">Emergency Procedures</h3>
            <Textarea rows={3} value={emergencyProcedures} onChange={(e) => setEmergencyProcedures(e.target.value)} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 space-y-2">
            <h3 className="font-heading text-lg font-bold">Additional Notes</h3>
            <Textarea rows={3} value={additionalNotes} onChange={(e) => setAdditionalNotes(e.target.value)} />
          </CardContent>
        </Card>
      </fieldset>

      {!readOnly && (
        <Button type="button" variant="secondary" onClick={handleSaveContent} disabled={saving}>
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          <Save className="h-4 w-4 mr-1" />Save draft
        </Button>
      )}

      {/* Tailoring checkpoint */}
      {canTailor && (
        <Card className="border-amber-400 bg-amber-50">
          <CardContent className="p-4 space-y-3">
            <p className="text-sm text-amber-900">
              I confirm that this risk assessment and method statement has been reviewed and specifically adapted
              for the works at <strong>{siteAddress || "this site"}</strong> on <strong>{format(new Date(), "d MMM yyyy")}</strong>.
              Generic, un-tailored RAMS do not meet HSE requirements.
            </p>
            <div className="space-y-1">
              <Label>Contractor's name</Label>
              <Input value={tailorName} onChange={(e) => setTailorName(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={tailorChecked} onCheckedChange={(c) => setTailorChecked(!!c)} />
              I have reviewed and tailored this RAMS for this specific job
            </label>
            <Button
              type="button"
              disabled={!tailorChecked || !tailorName.trim() || saving}
              onClick={handleConfirmTailoring}
              style={{ backgroundColor: "#f07820", color: "#fff" }}
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirm & Lock
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Post-tailoring actions */}
      {readOnly && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm text-green-700">
              <ShieldCheck className="h-4 w-4" />
              Tailored by {jobRams.tailored_by} on {jobRams.tailored_at ? format(new Date(jobRams.tailored_at), "d MMM yyyy") : "—"}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={handleGeneratePdf} disabled={generatingPdf}>
                {generatingPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileDown className="h-4 w-4 mr-1" />}
                Generate PDF
              </Button>
              {jobRams.status === "tailored" && (
                <Button type="button" variant="outline" onClick={handleUnlock}>
                  <Unlock className="h-4 w-4 mr-1" />Unlock for editing
                </Button>
              )}
              {jobRams.status === "signed" && (
                <Badge className="gap-1" style={{ backgroundColor: "#1a2744", color: "#fff" }}>
                  <Lock className="h-3 w-3" />Signed off
                </Badge>
              )}
            </div>
            <div className="flex gap-2 pt-2 border-t">
              <Input
                placeholder="Template name"
                value={templateNameInput}
                onChange={(e) => setTemplateNameInput(e.target.value)}
                className="max-w-xs"
              />
              <Button type="button" variant="outline" onClick={handleSaveAsTemplate} disabled={savingTemplate || !templateNameInput.trim()}>
                {savingTemplate && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Save as My Template
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sign-off (optional, for B2B) */}
      {jobRams.status === "tailored" && jobRams.pdf_generated_at && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <h3 className="font-heading text-lg font-bold">Sign-off</h3>
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Signer name</Label>
                <Input value={signerName} onChange={(e) => setSignerName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Signer role</Label>
                <Select value={signerRole} onValueChange={setSignerRole}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SIGNER_ROLES.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button type="button" onClick={handleSignOff} disabled={!signerName.trim()}>
              Sign Off
            </Button>
          </CardContent>
        </Card>
      )}

      {jobRams.status === "signed" && (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            Signed off by {jobRams.signed_off_by_name} ({jobRams.signed_off_by_role}) on{" "}
            {jobRams.signed_off_at ? format(new Date(jobRams.signed_off_at), "d MMM yyyy") : "—"}.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Template mode editor (contractor's own template library, Step 5) ────────

interface RamsTemplateEditorProps {
  templateId?: string | null;
  onSaved?: () => void;
}

export function RamsTemplateEditor({ templateId, onSaved }: RamsTemplateEditorProps) {
  const { templates, createTemplate, updateTemplate } = useRams();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const existing = templateId ? templates.find((t) => t.id === templateId) ?? null : null;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [tradeCategory, setTradeCategory] = useState("");
  const [hazards, setHazards] = useState<Hazard[]>([]);
  const [methodSteps, setMethodSteps] = useState<MethodStep[]>([]);
  const [ppe, setPpe] = useState<string[]>([]);
  const [emergencyProcedures, setEmergencyProcedures] = useState("");

  useEffect(() => {
    if (!existing) return;
    setName(existing.name);
    setDescription(existing.description ?? "");
    setTradeCategory(existing.trade_category ?? "");
    setHazards(existing.hazards);
    setMethodSteps(existing.method_steps);
    setPpe(existing.ppe_requirements);
    setEmergencyProcedures(existing.emergency_procedures ?? "");
  }, [existing]);

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const content = {
        name: name.trim(),
        description: description || null,
        trade_category: tradeCategory || null,
        hazards,
        method_steps: methodSteps,
        ppe_requirements: ppe,
        emergency_procedures: emergencyProcedures || null,
      };
      if (existing) {
        await updateTemplate(existing.id, content);
      } else {
        await createTemplate(content);
      }
      toast({ title: "Template saved" });
      onSaved?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="font-heading text-lg font-bold">Template Details</h3>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Template name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Trade category</Label>
              <Input value={tradeCategory} onChange={(e) => setTradeCategory(e.target.value)} placeholder="e.g. Electrical" />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label>Description</Label>
              <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <HazardsSection hazards={hazards} onChange={setHazards} />
      <MethodStepsSection steps={methodSteps} onChange={setMethodSteps} />
      <PpeSection ppe={ppe} onChange={setPpe} />

      <Card>
        <CardContent className="p-4 space-y-2">
          <h3 className="font-heading text-lg font-bold">Emergency Procedures</h3>
          <Textarea rows={3} value={emergencyProcedures} onChange={(e) => setEmergencyProcedures(e.target.value)} />
        </CardContent>
      </Card>

      <Button type="button" onClick={handleSave} disabled={saving || !name.trim()} style={{ backgroundColor: "#f07820", color: "#fff" }}>
        {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
        Save template
      </Button>
    </div>
  );
}
