import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, CheckCircle2, Circle, Trash2 } from "lucide-react";

interface Props {
  tenderId: string;
  onBack: () => void;
}

type RequirementKind = "pricing_schedule" | "references" | "methodology" | "programme" | "subcontracting" | "declarations" | "rams";

// Verbatim mirror of RESPONSE_KIND_OPTIONS in BusinessTenderForm.tsx / the
// duplicate already kept in ContractorTenderBrief.tsx -- same seven values
// tender_response_requirements_kind_check permits ('pricing' renamed to
// 'pricing_schedule' in 20260713130000). See the brief's comment for why
// this stays duplicated rather than shared.
const REQUIREMENT_LABELS: Record<RequirementKind, string> = {
  pricing_schedule: "Pricing schedule",
  references: "References",
  methodology: "Methodology statement",
  programme: "Programme",
  subcontracting: "Subcontracting declaration",
  declarations: "Declarations",
  rams: "RAMS",
};

// Canonical display order -- stable regardless of the order requirement
// rows were created in.
const REQUIREMENT_ORDER: RequirementKind[] = ["references", "methodology", "pricing_schedule", "programme", "subcontracting", "declarations", "rams"];

// This slice builds cover note (always present, not requirement-gated),
// references, methodology, and pricing_schedule. Everything else renders a
// placeholder step so the stepper's shape is correct, but isn't counted
// toward completeness (see the completeness-meter design note below) since
// there's nothing the contractor can actually do about it yet.
const BUILT_KINDS: Set<RequirementKind> = new Set(["references", "methodology", "pricing_schedule"]);

// Verbatim mirror of the unit palette in BusinessTenderForm.tsx -- fixed,
// no custom units, same comparability lock as the column palette below.
const PRICING_UNIT_LABELS: Record<string, string> = {
  item: "Per item",
  job: "Per job",
  hour: "Per hour",
  day: "Per day",
  visit: "Per visit",
  sqm: "Per m²",
  metre: "Per metre",
  cubic_metre: "Per m³",
  fixed: "Fixed price",
};

interface PricingScheduleRow {
  id: string;
  label: string;
  unit: string;
  // Business-specified, read-only in this grid -- the contractor's only
  // editable cell is rate. Present only when the matching column was
  // toggled active on the business side.
  priority?: string;
  quantity?: string;
  leadTime?: string;
  frequency?: string;
  notes?: string;
}

interface PricingScheduleConfig {
  rows: PricingScheduleRow[];
  columns: ("quantity" | "leadTime" | "frequency" | "slaPriority" | "notes")[];
}

interface ResponseRequirementRow {
  kind: RequirementKind;
  config: { count?: number } | PricingScheduleConfig | null;
}

interface ReferenceRowState {
  // Client-generated (crypto.randomUUID()) the moment a row is added, reused
  // as the DB id on INSERT -- same idiom as BusinessTenderForm's prequal
  // requirements, needed here because (unlike tender_sites' pure
  // set-membership) a reference row's content can change while its identity
  // persists, so the diff needs a stable key beyond "which rows exist".
  id: string;
  clientName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  projectSummary: string;
}

interface ExistingReferenceSnapshot {
  clientName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  projectSummary: string;
}

interface FormState {
  coverNote: string;
  methodology: string;
  references: ReferenceRowState[];
  // Keyed by the config row's stable id -- string (not number) since it's a
  // controlled input value; parsed to a number (or null) only at save time.
  priceLines: Record<string, string>;
}

function contactToFields(contact: unknown): { contactName: string; contactEmail: string; contactPhone: string } {
  const c = (contact as { name?: string | null; email?: string | null; phone?: string | null } | null) ?? {};
  return { contactName: c.name ?? "", contactEmail: c.email ?? "", contactPhone: c.phone ?? "" };
}

function fieldsToContact(r: ReferenceRowState): { name: string | null; email: string | null; phone: string | null } | null {
  if (!r.contactName.trim() && !r.contactEmail.trim() && !r.contactPhone.trim()) return null;
  return {
    name: r.contactName.trim() || null,
    email: r.contactEmail.trim() || null,
    phone: r.contactPhone.trim() || null,
  };
}

function parseRate(v: string | undefined): number | null {
  if (!v || !v.trim()) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function ContractorApplicationStepper({ tenderId, onBack }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [applicationNumber, setApplicationNumber] = useState<string | null>(null);
  const [tenderTitle, setTenderTitle] = useState<string | null>(null);
  const [requirementRows, setRequirementRows] = useState<ResponseRequirementRow[]>([]);

  const [form, setForm] = useState<FormState>({ coverNote: "", methodology: "", references: [], priceLines: {} });
  const [existingReferencesById, setExistingReferencesById] = useState<Map<string, ExistingReferenceSnapshot>>(new Map());

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    // Idempotent: returns the existing draft id on resume, creates one on
    // first entry. No client INSERT policy exists on tender_applications --
    // this RPC is the only creation path (create_tender_application_draft(),
    // 20260710180000). Also the sole guard against a passed deadline / an
    // already-submitted application -- both surface here as an exception.
    const { data: appId, error: rpcError } = await supabase.rpc("create_tender_application_draft", {
      p_tender_id: tenderId,
    });
    if (rpcError || !appId) {
      setLoadError(rpcError?.message ?? "Could not start this application.");
      setLoading(false);
      return;
    }
    setApplicationId(appId);

    const [{ data: tenderRow }, { data: appRow }, { data: reqRows }, { data: refRows }, { data: priceRows }] = await Promise.all([
      supabase.from("tenders").select("title").eq("id", tenderId).maybeSingle(),
      supabase.from("tender_applications").select("application_number, cover_note, methodology").eq("id", appId).maybeSingle(),
      supabase.from("tender_response_requirements").select("kind, config").eq("tender_id", tenderId),
      supabase.from("tender_application_references").select("id, client_name, contact, project_summary").eq("application_id", appId),
      supabase.from("tender_application_price_lines").select("row_id, rate").eq("application_id", appId),
    ]);

    setTenderTitle(tenderRow?.title ?? null);
    setApplicationNumber(appRow?.application_number ?? null);
    setRequirementRows((reqRows ?? []) as ResponseRequirementRow[]);

    const loadedReferences: ReferenceRowState[] = (refRows ?? []).map((r) => {
      const { contactName, contactEmail, contactPhone } = contactToFields(r.contact);
      return {
        id: r.id,
        clientName: r.client_name,
        contactName,
        contactEmail,
        contactPhone,
        projectSummary: r.project_summary ?? "",
      };
    });

    const loadedPriceLines: Record<string, string> = {};
    for (const r of priceRows ?? []) {
      loadedPriceLines[r.row_id] = r.rate != null ? String(r.rate) : "";
    }

    setForm({
      coverNote: appRow?.cover_note ?? "",
      methodology: appRow?.methodology ?? "",
      references: loadedReferences,
      priceLines: loadedPriceLines,
    });
    setExistingReferencesById(
      new Map(
        loadedReferences.map((r) => [
          r.id,
          { clientName: r.clientName, contactName: r.contactName, contactEmail: r.contactEmail, contactPhone: r.contactPhone, projectSummary: r.projectSummary },
        ]),
      ),
    );

    setLoading(false);
  }, [tenderId]);

  useEffect(() => { load(); }, [load]);

  const referencesRequirement = requirementRows.find((r) => r.kind === "references");
  const referencesRequiredCount = (referencesRequirement?.config as { count?: number } | null)?.count ?? 1;
  const methodologyRequired = requirementRows.some((r) => r.kind === "methodology");
  const pricingRequirement = requirementRows.find((r) => r.kind === "pricing_schedule");
  const pricingConfig = pricingRequirement?.config as PricingScheduleConfig | null | undefined;

  const orderedSteps = [...requirementRows].sort(
    (a, b) => REQUIREMENT_ORDER.indexOf(a.kind) - REQUIREMENT_ORDER.indexOf(b.kind),
  );

  // Completeness meter deliberately excludes placeholder (not-yet-built)
  // kinds from the denominator -- confirmed design call: a tender requiring
  // pricing shouldn't leave the meter permanently short of 100% for a
  // section the contractor has no way to act on yet this slice.
  const referencesComplete = form.references.filter((r) => r.clientName.trim()).length >= referencesRequiredCount;
  const methodologyComplete = form.methodology.trim().length > 0;
  const coverNoteComplete = form.coverNote.trim().length > 0;
  const pricedRowCount = pricingConfig ? pricingConfig.rows.filter((row) => form.priceLines[row.id]?.trim()).length : 0;
  const pricingComplete = !!pricingConfig && pricingConfig.rows.length > 0 && pricedRowCount >= pricingConfig.rows.length;

  const trackedSections: { key: string; complete: boolean }[] = [
    { key: "cover_note", complete: coverNoteComplete },
    ...(referencesRequirement ? [{ key: "references", complete: referencesComplete }] : []),
    ...(methodologyRequired ? [{ key: "methodology", complete: methodologyComplete }] : []),
    ...(pricingRequirement ? [{ key: "pricing_schedule", complete: pricingComplete }] : []),
  ];
  const completedCount = trackedSections.filter((s) => s.complete).length;

  const addReferenceRow = () => {
    setForm((f) => ({
      ...f,
      references: [
        ...f.references,
        { id: crypto.randomUUID(), clientName: "", contactName: "", contactEmail: "", contactPhone: "", projectSummary: "" },
      ],
    }));
  };

  const updateReferenceRow = (id: string, patch: Partial<ReferenceRowState>) => {
    setForm((f) => ({
      ...f,
      references: f.references.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  };

  const setRate = (rowId: string, value: string) => {
    setForm((f) => ({ ...f, priceLines: { ...f.priceLines, [rowId]: value } }));
  };

  const removeReferenceRow = (id: string) => {
    setForm((f) => ({ ...f, references: f.references.filter((r) => r.id !== id) }));
  };

  const handleSave = async (): Promise<boolean> => {
    if (!applicationId) return false;
    setSaving(true);

    const { error: appUpdateError } = await supabase
      .from("tender_applications")
      .update({
        cover_note: form.coverNote.trim() || null,
        methodology: form.methodology.trim() || null,
      })
      .eq("id", applicationId);
    if (appUpdateError) {
      toast({ title: "Save failed", description: appUpdateError.message, variant: "destructive" });
      setSaving(false);
      return false;
    }

    // References: three-bucket diff (added/removed/changed) against the
    // last persisted snapshot -- content can change per row while its
    // identity persists, same reasoning as prequal requirements in
    // BusinessTenderForm.tsx, not the pure set-membership diff sites use.
    const existingIds = new Set(existingReferencesById.keys());
    const currentIds = new Set(form.references.map((r) => r.id));

    const removedIds = [...existingIds].filter((id) => !currentIds.has(id));
    const added = form.references.filter((r) => !existingIds.has(r.id));
    const changed = form.references.filter((r) => {
      const prev = existingReferencesById.get(r.id);
      if (!prev) return false;
      return (
        prev.clientName !== r.clientName ||
        prev.contactName !== r.contactName ||
        prev.contactEmail !== r.contactEmail ||
        prev.contactPhone !== r.contactPhone ||
        prev.projectSummary !== r.projectSummary
      );
    });

    if (removedIds.length) {
      const { error: removeError } = await supabase
        .from("tender_application_references")
        .delete()
        .eq("application_id", applicationId)
        .in("id", removedIds);
      if (removeError) {
        toast({ title: "References not saved", description: removeError.message, variant: "destructive" });
        setSaving(false);
        return false;
      }
    }

    if (added.length) {
      const { error: addError } = await supabase.from("tender_application_references").insert(
        added.map((r) => ({
          id: r.id,
          application_id: applicationId,
          client_name: r.clientName.trim(),
          contact: fieldsToContact(r),
          project_summary: r.projectSummary.trim() || null,
        })),
      );
      if (addError) {
        toast({ title: "References not saved", description: addError.message, variant: "destructive" });
        setSaving(false);
        return false;
      }
    }

    for (const r of changed) {
      const { error: updateError } = await supabase
        .from("tender_application_references")
        .update({
          client_name: r.clientName.trim(),
          contact: fieldsToContact(r),
          project_summary: r.projectSummary.trim() || null,
        })
        .eq("id", r.id);
      if (updateError) {
        toast({ title: "References not saved", description: updateError.message, variant: "destructive" });
        setSaving(false);
        return false;
      }
    }

    setExistingReferencesById(
      new Map(
        form.references.map((r) => [
          r.id,
          { clientName: r.clientName, contactName: r.contactName, contactEmail: r.contactEmail, contactPhone: r.contactPhone, projectSummary: r.projectSummary },
        ]),
      ),
    );

    // Pricing schedule: row identity is entirely business-defined
    // (pricingConfig.rows), never contractor-editable -- so this is a plain
    // per-row upsert keyed on (application_id, row_id), not a diff. Every
    // row is written every save, including a null rate for an emptied cell.
    if (pricingConfig && pricingConfig.rows.length > 0) {
      const { error: priceError } = await supabase.from("tender_application_price_lines").upsert(
        pricingConfig.rows.map((row) => ({
          application_id: applicationId,
          row_id: row.id,
          rate: parseRate(form.priceLines[row.id]),
        })),
        { onConflict: "application_id,row_id" },
      );
      if (priceError) {
        toast({ title: "Pricing not saved", description: priceError.message, variant: "destructive" });
        setSaving(false);
        return false;
      }
    }

    setSaving(false);
    toast({ title: "Draft saved" });
    return true;
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-6 max-w-2xl">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1 -ml-2 mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to tender
        </Button>
        <Card>
          <CardContent className="p-10 text-center">
            <p className="text-muted-foreground">{loadError}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1 -ml-2">
        <ArrowLeft className="h-4 w-4" /> Back to tender
      </Button>

      <div>
        <p className="text-sm text-muted-foreground font-mono">{applicationNumber}</p>
        <h1 className="font-heading text-2xl font-bold">{tenderTitle ?? "Application"}</h1>
      </div>

      {/* Completeness meter */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between">
          <p className="text-sm font-medium">
            {completedCount} of {trackedSections.length} section{trackedSections.length === 1 ? "" : "s"} complete
          </p>
          <div className="flex items-center gap-1.5">
            {trackedSections.map((s) => (
              <div
                key={s.key}
                className={`h-2 w-8 rounded-full ${s.complete ? "bg-green-500" : "bg-gray-200"}`}
              />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Cover note — always present, not requirement-gated */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            {coverNoteComplete ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
            Cover note
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Introduce your bid — why you, in brief..."
            rows={5}
            value={form.coverNote}
            onChange={(e) => setForm((f) => ({ ...f, coverNote: e.target.value }))}
          />
        </CardContent>
      </Card>

      {/* Requirement-driven sections, in canonical order */}
      {orderedSteps.map((req) => {
        if (req.kind === "references") {
          return (
            <Card key="references">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  {referencesComplete ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
                  References
                  <span className="text-xs font-normal text-muted-foreground">
                    ({form.references.length} of {referencesRequiredCount} required)
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {form.references.map((r, i) => (
                  <div key={r.id} className="border border-border rounded-md p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Reference {i + 1}</p>
                      <Button variant="ghost" size="sm" onClick={() => removeReferenceRow(r.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Client name</Label>
                      <Input
                        value={r.clientName}
                        onChange={(e) => updateReferenceRow(r.id, { clientName: e.target.value })}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Contact name</Label>
                        <Input value={r.contactName} onChange={(e) => updateReferenceRow(r.id, { contactName: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Contact email</Label>
                        <Input type="email" value={r.contactEmail} onChange={(e) => updateReferenceRow(r.id, { contactEmail: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Contact phone</Label>
                        <Input value={r.contactPhone} onChange={(e) => updateReferenceRow(r.id, { contactPhone: e.target.value })} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Project summary</Label>
                      <Textarea
                        rows={2}
                        value={r.projectSummary}
                        onChange={(e) => updateReferenceRow(r.id, { projectSummary: e.target.value })}
                      />
                    </div>
                  </div>
                ))}

                {form.references.length < referencesRequiredCount && (
                  <Button type="button" size="sm" variant="outline" onClick={addReferenceRow}>
                    + Add reference
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        }

        if (req.kind === "methodology") {
          return (
            <Card key="methodology">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  {methodologyComplete ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
                  Methodology statement
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  placeholder="Describe how you'll approach the work..."
                  rows={6}
                  value={form.methodology}
                  onChange={(e) => setForm((f) => ({ ...f, methodology: e.target.value }))}
                />
              </CardContent>
            </Card>
          );
        }

        if (req.kind === "pricing_schedule" && pricingConfig) {
          return (
            <Card key="pricing_schedule">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  {pricingComplete ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
                  Pricing schedule
                  <span className="text-xs font-normal text-muted-foreground">
                    ({pricedRowCount} of {pricingConfig.rows.length} priced)
                  </span>
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Structure set by the business — you can only enter your rate.
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                {pricingConfig.rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No line items have been set up for this tender.</p>
                ) : (
                  pricingConfig.rows.map((row, i) => (
                    <div key={row.id} className="border border-border rounded-md p-3 space-y-2">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
                            {i + 1}. {row.label || "Untitled line item"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {PRICING_UNIT_LABELS[row.unit] ?? row.unit}
                            {pricingConfig.columns.includes("slaPriority") && row.priority && ` · ${row.priority}`}
                            {pricingConfig.columns.includes("quantity") && row.quantity && ` · Qty ${row.quantity}`}
                            {pricingConfig.columns.includes("leadTime") && row.leadTime && ` · Lead time ${row.leadTime}`}
                            {pricingConfig.columns.includes("frequency") && row.frequency && ` · ${row.frequency}`}
                          </p>
                          {pricingConfig.columns.includes("notes") && row.notes && (
                            <p className="text-xs text-muted-foreground italic mt-0.5">{row.notes}</p>
                          )}
                        </div>
                        {pricingConfig.columns.includes("slaPriority") && row.priority && (
                          <Badge variant="outline" className="text-xs shrink-0">{row.priority}</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs shrink-0">Your rate (£)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          className="w-32"
                          value={form.priceLines[row.id] ?? ""}
                          onChange={(e) => setRate(row.id, e.target.value)}
                        />
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          );
        }

        // Placeholder for kinds not yet built (programme/subcontracting/
        // declarations/rams). Not counted in the completeness meter — see
        // trackedSections above.
        return (
          <Card key={req.kind} className="opacity-70">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Circle className="h-4 w-4 text-muted-foreground" />
                {REQUIREMENT_LABELS[req.kind]}
                <Badge variant="outline" className="text-xs font-normal">Coming soon</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">This section isn't built yet — check back before submitting.</p>
            </CardContent>
          </Card>
        );
      })}

      <div className="flex items-center justify-between pt-2 border-t">
        <p className="text-sm text-muted-foreground">Not ready to submit — pricing and submission are still being built.</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" disabled title="Coming in 2c">
            Submit application
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Save draft
          </Button>
        </div>
      </div>
    </div>
  );
}
