import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Check, ChevronDown, Trash2 } from "lucide-react";
import { CONTRACTOR_TRADES } from "@/constants/trades";

interface Props {
  companyId: string;
  profileId: string;
}

interface SiteOption {
  id: string;
  name: string;
}

type ResponseKind =
  | "pricing"
  | "references"
  | "methodology"
  | "programme"
  | "subcontracting"
  | "declarations"
  | "rams";

// The seven values tender_response_requirements_kind_check permits, confirmed
// live via pg_constraint.
const RESPONSE_KIND_OPTIONS: { kind: ResponseKind; label: string }[] = [
  { kind: "pricing", label: "Pricing" },
  { kind: "references", label: "References" },
  { kind: "methodology", label: "Methodology statement" },
  { kind: "programme", label: "Programme" },
  { kind: "subcontracting", label: "Subcontracting declaration" },
  { kind: "declarations", label: "Declarations" },
  { kind: "rams", label: "RAMS" },
];

interface ResponseRequirementState {
  kind: ResponseKind;
  referencesCount?: number; // only meaningful when kind === "references"
}

// Verbatim, single source of truth: these six strings are exactly what
// submit_tender_application()'s RED-block matches against (confirmed
// against the live function body via pg_proc.prosrc, not migration text).
// A mismatch here creates a mandatory prequal requirement the RED-block can
// never see -- it silently never blocks submission no matter what the
// contractor's actual compliance is.
const MAPPABLE_PREQUAL_KINDS: { kind: string; label: string }[] = [
  { kind: "public_liability", label: "Public liability insurance" },
  { kind: "employers_liability", label: "Employers' liability insurance" },
  { kind: "trade_cert", label: "Trade certification" },
  { kind: "induction", label: "Site induction" },
  { kind: "nda", label: "NDA" },
  { kind: "terms", label: "Terms accepted" },
];
const OTHER_PREQUAL_KIND = "other";

function prequalKindLabel(kind: string): string {
  return MAPPABLE_PREQUAL_KINDS.find((k) => k.kind === kind)?.label ?? "Other (informational only)";
}

interface PrequalRequirementState {
  // Client-generated (crypto.randomUUID()) the moment a row is added, and
  // reused as the DB row's own id on INSERT -- no local-id-to-server-id
  // reconciliation step needed after a save. tender_prequal_requirements
  // has no CHECK on kind (confirmed live), so "other" free-text rows and,
  // in principle, repeated mappable kinds are both possible -- id, not
  // kind, is this row's real identity.
  id: string;
  kind: string;
  detailText: string;
  mandatory: boolean;
}

interface FormState {
  title: string;
  tenderType: "works" | "term";
  trades: string[];
  siteIds: string[];
  responseDeadline: string; // <input type="datetime-local"> value
  responseRequirements: ResponseRequirementState[];
  prequalRequirements: PrequalRequirementState[];
}

const EMPTY_FORM: FormState = {
  title: "",
  tenderType: "works",
  trades: [],
  siteIds: [],
  responseDeadline: "",
  responseRequirements: [],
  prequalRequirements: [],
};

// ISO timestamptz -> the value a <input type="datetime-local"> can display
// (local time, minute precision, no timezone suffix).
function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// The essentials card only — title, type, trade, sites, deadline. Optional
// sections (scope, budget, requirements, etc.) are a later slice; publish
// is stubbed (disabled button) until the publish-transition slice lands.
//
// Route contract: no ?tender= param = create mode (first Save does an
// INSERT, tender_number omitted so assign_tender_number_trigger mints it
// server-side); ?tender=<id> = resume mode (loads the existing draft,
// subsequent Saves UPDATE). On a successful first save, the URL is swapped
// to the resume form via navigate(..., { replace: true }) so a refresh
// continues editing the same row instead of risking a second draft.
export function BusinessTenderForm({ companyId, profileId }: Props) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const paramTenderId = searchParams.get("tender");
  const { toast } = useToast();

  const [tenderId, setTenderId] = useState<string | null>(paramTenderId);
  const [tenderNumber, setTenderNumber] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  // The site IDs actually persisted in tender_sites as of the last
  // successful save (or [] for a fresh create). Diffed against
  // form.siteIds at save time so only the delta is written — see handleSave.
  const [existingSiteIds, setExistingSiteIds] = useState<string[]>([]);
  // Same idea for the two requirement satellites, but these rows carry a
  // value (config/mandatory) as well as identity, so the diff is
  // three-bucket (added/removed/changed), not two — see handleSave.
  const [existingResponseRequirements, setExistingResponseRequirements] = useState<ResponseRequirementState[]>([]);
  const [existingPrequalById, setExistingPrequalById] = useState<
    Map<string, { kind: string; detailText: string; mandatory: boolean }>
  >(new Map());
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [tradeSearch, setTradeSearch] = useState("");
  const [prequalOpen, setPrequalOpen] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(!!paramTenderId);
  const [saving, setSaving] = useState(false);

  // Company's sites, for the checklist.
  useEffect(() => {
    supabase
      .from("sites")
      .select("id, name")
      .eq("company_id", companyId)
      .order("name")
      .then(({ data }) => setSites(data ?? []));
  }, [companyId]);

  // Resume mode: load the existing draft + its current site selection.
  useEffect(() => {
    if (!paramTenderId) return;

    (async () => {
      const [{ data: tender }, { data: siteLinks }, { data: responseReqs }, { data: prequalReqs }] = await Promise.all([
        supabase
          .from("tenders")
          .select("id, tender_number, title, tender_type, trade_categories, response_deadline")
          .eq("id", paramTenderId)
          .maybeSingle(),
        supabase
          .from("tender_sites")
          .select("site_id")
          .eq("tender_id", paramTenderId),
        supabase
          .from("tender_response_requirements")
          .select("kind, config")
          .eq("tender_id", paramTenderId),
        supabase
          .from("tender_prequal_requirements")
          .select("id, kind, detail, mandatory")
          .eq("tender_id", paramTenderId),
      ]);

      if (tender) {
        const loadedSiteIds = (siteLinks ?? []).map((r) => r.site_id);
        const loadedResponseReqs: ResponseRequirementState[] = (responseReqs ?? []).map((r) => ({
          kind: r.kind as ResponseKind,
          referencesCount:
            r.kind === "references" ? ((r.config as { count?: number } | null)?.count ?? 1) : undefined,
        }));
        const loadedPrequalReqs: PrequalRequirementState[] = (prequalReqs ?? []).map((r) => ({
          id: r.id,
          kind: r.kind,
          detailText: (r.detail as { text?: string } | null)?.text ?? "",
          mandatory: r.mandatory,
        }));

        setForm({
          title: tender.title,
          tenderType: tender.tender_type as "works" | "term",
          trades: tender.trade_categories ?? [],
          siteIds: loadedSiteIds,
          responseDeadline: tender.response_deadline ? toDatetimeLocalValue(tender.response_deadline) : "",
          responseRequirements: loadedResponseReqs,
          prequalRequirements: loadedPrequalReqs,
        });
        setExistingSiteIds(loadedSiteIds);
        setExistingResponseRequirements(loadedResponseReqs);
        setExistingPrequalById(
          new Map(loadedPrequalReqs.map((r) => [r.id, { kind: r.kind, detailText: r.detailText, mandatory: r.mandatory }])),
        );
        setTenderNumber(tender.tender_number);
        if (loadedPrequalReqs.length > 0) setPrequalOpen(true);
      }
      setLoadingExisting(false);
    })();
  }, [paramTenderId]);

  const toggleTrade = (t: string) => {
    setForm((f) => ({
      ...f,
      trades: f.trades.includes(t) ? f.trades.filter((x) => x !== t) : [...f.trades, t],
    }));
  };

  const toggleSite = (id: string) => {
    setForm((f) => ({
      ...f,
      siteIds: f.siteIds.includes(id) ? f.siteIds.filter((x) => x !== id) : [...f.siteIds, id],
    }));
  };

  const filteredTrades = CONTRACTOR_TRADES.filter((t) =>
    t.toLowerCase().includes(tradeSearch.toLowerCase()),
  );

  const toggleResponseKind = (kind: ResponseKind) => {
    setForm((f) => {
      const selected = f.responseRequirements.some((r) => r.kind === kind);
      if (selected) {
        return { ...f, responseRequirements: f.responseRequirements.filter((r) => r.kind !== kind) };
      }
      return {
        ...f,
        responseRequirements: [
          ...f.responseRequirements,
          { kind, ...(kind === "references" ? { referencesCount: 1 } : {}) },
        ],
      };
    });
  };

  const setReferencesCount = (n: number) => {
    const count = Number.isFinite(n) && n > 0 ? Math.floor(n) : 1;
    setForm((f) => ({
      ...f,
      responseRequirements: f.responseRequirements.map((r) =>
        r.kind === "references" ? { ...r, referencesCount: count } : r,
      ),
    }));
  };

  const addPrequalRequirement = (kind: string) => {
    setForm((f) => ({
      ...f,
      prequalRequirements: [
        ...f.prequalRequirements,
        { id: crypto.randomUUID(), kind, detailText: "", mandatory: true },
      ],
    }));
  };

  const updatePrequalRequirement = (id: string, patch: Partial<PrequalRequirementState>) => {
    setForm((f) => ({
      ...f,
      prequalRequirements: f.prequalRequirements.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  };

  const removePrequalRequirement = (id: string) => {
    setForm((f) => ({ ...f, prequalRequirements: f.prequalRequirements.filter((r) => r.id !== id) }));
  };

  const referencesReq = form.responseRequirements.find((r) => r.kind === "references");
  const availableMappablePrequalKinds = MAPPABLE_PREQUAL_KINDS.filter(
    (k) => !form.prequalRequirements.some((r) => r.kind === k.kind),
  );

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast({ title: "Title required", description: "Give the tender a title before saving.", variant: "destructive" });
      return;
    }

    setSaving(true);

    const payload = {
      company_id: companyId,
      created_by: profileId,
      tender_type: form.tenderType,
      title: form.title.trim(),
      trade_categories: form.trades,
      response_deadline: form.responseDeadline ? new Date(form.responseDeadline).toISOString() : null,
    };

    let savedId = tenderId;

    if (tenderId) {
      const { data, error } = await supabase
        .from("tenders")
        .update(payload)
        .eq("id", tenderId)
        .select("id, tender_number")
        .single();
      if (error) {
        toast({ title: "Save failed", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
      setTenderNumber(data.tender_number);
    } else {
      // tender_number is deliberately omitted -- assign_tender_number_trigger
      // (BEFORE INSERT, confirmed live) mints T-{code}-NNNN server-side.
      // status is omitted too and defaults to 'draft'.
      const { data, error } = await supabase
        .from("tenders")
        .insert(payload)
        .select("id, tender_number")
        .single();
      if (error) {
        toast({ title: "Save failed", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
      savedId = data.id;
      setTenderId(data.id);
      setTenderNumber(data.tender_number);
      navigate(`/dashboard/business?view=tender-form&tender=${data.id}`, { replace: true });
    }

    // Sites reconciled by diff against the last known-persisted set, not a
    // blanket delete-then-reinsert: unchanged sites are never touched, and
    // an insert failure can't wipe an existing set out from under a
    // successful delete. On first save existingSiteIds is [], so `removed`
    // is empty and `added` is every selected site -- no special case needed.
    const removed = existingSiteIds.filter((id) => !form.siteIds.includes(id));
    const added = form.siteIds.filter((id) => !existingSiteIds.includes(id));

    if (removed.length) {
      const { error: removeError } = await supabase
        .from("tender_sites")
        .delete()
        .eq("tender_id", savedId!)
        .in("site_id", removed);
      if (removeError) {
        toast({ title: "Sites not saved", description: removeError.message, variant: "destructive" });
        setSaving(false);
        return;
      }
    }

    if (added.length) {
      const { error: addError } = await supabase
        .from("tender_sites")
        .insert(added.map((site_id) => ({ tender_id: savedId!, site_id })));
      if (addError) {
        toast({ title: "Sites not saved", description: addError.message, variant: "destructive" });
        setSaving(false);
        return;
      }
    }

    setExistingSiteIds(form.siteIds);

    // Response requirements: kind is the natural unique key both before and
    // after persistence (at most one row per kind per tender), so this is a
    // by-kind diff -- no client-generated ids needed here, unlike prequal
    // requirements below. "changed" can currently only ever be the
    // references kind (the only one carrying a value that can differ while
    // the kind stays selected), but the diff is written generically in case
    // a future kind gains config too.
    const existingReqByKind = new Map(existingResponseRequirements.map((r) => [r.kind, r]));
    const currentReqByKind = new Map(form.responseRequirements.map((r) => [r.kind, r]));

    const removedKinds = [...existingReqByKind.keys()].filter((k) => !currentReqByKind.has(k));
    const addedKinds = [...currentReqByKind.keys()].filter((k) => !existingReqByKind.has(k));
    const changedKinds = [...currentReqByKind.keys()].filter((k) => {
      if (!existingReqByKind.has(k)) return false;
      return existingReqByKind.get(k)!.referencesCount !== currentReqByKind.get(k)!.referencesCount;
    });

    if (removedKinds.length) {
      const { error: reqRemoveError } = await supabase
        .from("tender_response_requirements")
        .delete()
        .eq("tender_id", savedId!)
        .in("kind", removedKinds);
      if (reqRemoveError) {
        toast({ title: "Requirements not saved", description: reqRemoveError.message, variant: "destructive" });
        setSaving(false);
        return;
      }
    }

    if (addedKinds.length) {
      const { error: reqAddError } = await supabase.from("tender_response_requirements").insert(
        addedKinds.map((k) => ({
          tender_id: savedId!,
          kind: k,
          config: k === "references" ? { count: currentReqByKind.get(k)!.referencesCount ?? 1 } : null,
        })),
      );
      if (reqAddError) {
        toast({ title: "Requirements not saved", description: reqAddError.message, variant: "destructive" });
        setSaving(false);
        return;
      }
    }

    for (const k of changedKinds) {
      const { error: reqUpdateError } = await supabase
        .from("tender_response_requirements")
        .update({ config: { count: currentReqByKind.get(k)!.referencesCount ?? 1 } })
        .eq("tender_id", savedId!)
        .eq("kind", k);
      if (reqUpdateError) {
        toast({ title: "Requirements not saved", description: reqUpdateError.message, variant: "destructive" });
        setSaving(false);
        return;
      }
    }

    setExistingResponseRequirements(form.responseRequirements);

    // Prequal requirements: identity is the row's own id (kind alone isn't
    // unique -- "other" rows can repeat), generated client-side the moment
    // a row is added and reused verbatim as the DB id on INSERT.
    const existingPrequalIds = new Set(existingPrequalById.keys());
    const currentPrequalIds = new Set(form.prequalRequirements.map((r) => r.id));

    const removedPrequalIds = [...existingPrequalIds].filter((id) => !currentPrequalIds.has(id));
    const addedPrequal = form.prequalRequirements.filter((r) => !existingPrequalIds.has(r.id));
    const changedPrequal = form.prequalRequirements.filter((r) => {
      const prev = existingPrequalById.get(r.id);
      if (!prev) return false;
      return prev.kind !== r.kind || prev.mandatory !== r.mandatory || prev.detailText !== r.detailText;
    });

    if (removedPrequalIds.length) {
      const { error: prequalRemoveError } = await supabase
        .from("tender_prequal_requirements")
        .delete()
        .eq("tender_id", savedId!)
        .in("id", removedPrequalIds);
      if (prequalRemoveError) {
        toast({ title: "Prequalification not saved", description: prequalRemoveError.message, variant: "destructive" });
        setSaving(false);
        return;
      }
    }

    if (addedPrequal.length) {
      const { error: prequalAddError } = await supabase.from("tender_prequal_requirements").insert(
        addedPrequal.map((r) => ({
          id: r.id,
          tender_id: savedId!,
          kind: r.kind,
          detail: r.kind === OTHER_PREQUAL_KIND ? { text: r.detailText } : null,
          mandatory: r.mandatory,
        })),
      );
      if (prequalAddError) {
        toast({ title: "Prequalification not saved", description: prequalAddError.message, variant: "destructive" });
        setSaving(false);
        return;
      }
    }

    for (const r of changedPrequal) {
      const { error: prequalUpdateError } = await supabase
        .from("tender_prequal_requirements")
        .update({
          kind: r.kind,
          detail: r.kind === OTHER_PREQUAL_KIND ? { text: r.detailText } : null,
          mandatory: r.mandatory,
        })
        .eq("id", r.id);
      if (prequalUpdateError) {
        toast({ title: "Prequalification not saved", description: prequalUpdateError.message, variant: "destructive" });
        setSaving(false);
        return;
      }
    }

    setExistingPrequalById(
      new Map(form.prequalRequirements.map((r) => [r.id, { kind: r.kind, detailText: r.detailText, mandatory: r.mandatory }])),
    );

    setSaving(false);
    toast({ title: "Draft saved" });
  };

  if (loadingExisting) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard/business?view=tenders")} className="gap-1 -ml-2">
        ← Back to Tenders
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Essentials</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              placeholder="e.g. Reactive M&E maintenance — London portfolio"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label>Type</Label>
            <div className="inline-flex rounded-md border border-border p-0.5">
              {(["works", "term"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, tenderType: type }))}
                  className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                    form.tenderType === type
                      ? "bg-[#1a2744] text-white"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {type === "works" ? "Works" : "Term"}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Trade</Label>
            <Input
              placeholder="Search trades..."
              value={tradeSearch}
              onChange={(e) => setTradeSearch(e.target.value)}
            />
            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto py-1">
              {filteredTrades.length === 0 && (
                <p className="text-sm text-muted-foreground py-1">No trades match your search</p>
              )}
              {filteredTrades.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTrade(t)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border-2 transition-all ${
                    form.trades.includes(t)
                      ? "border-[#f07820] bg-orange-50 text-[#f07820]"
                      : "border-border text-muted-foreground hover:border-foreground/30"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Sites ({form.siteIds.length} selected)</Label>
            {sites.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sites in your company yet.</p>
            ) : (
              <div className="max-h-48 overflow-y-auto border border-border rounded-md p-1">
                {sites.map((s) => (
                  <label
                    key={s.id}
                    className="flex items-center gap-2 cursor-pointer py-1.5 px-2 rounded hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      checked={form.siteIds.includes(s.id)}
                      onChange={() => toggleSite(s.id)}
                      style={{ accentColor: "#f07820", width: 14, height: 14 }}
                    />
                    <span className="text-sm">{s.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Response deadline</Label>
            <Input
              type="datetime-local"
              value={form.responseDeadline}
              onChange={(e) => setForm((f) => ({ ...f, responseDeadline: e.target.value }))}
            />
          </div>
        </CardContent>
      </Card>

      {/* What contractors must submit — accented, open by default */}
      <Card style={{ borderColor: "#f07820", borderWidth: 2 }}>
        <CardHeader>
          <CardTitle className="text-base">What contractors must submit</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {RESPONSE_KIND_OPTIONS.map(({ kind, label }) => {
              const selected = form.responseRequirements.some((r) => r.kind === kind);
              return (
                <button
                  key={kind}
                  type="button"
                  onClick={() => toggleResponseKind(kind)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border-2 transition-all ${
                    selected
                      ? "border-[#f07820] bg-orange-50 text-[#f07820]"
                      : "border-border text-muted-foreground hover:border-foreground/30"
                  }`}
                >
                  {selected && <Check className="h-3.5 w-3.5" />}
                  {label}
                </button>
              );
            })}
          </div>

          {referencesReq && (
            <div className="flex items-center gap-2 pt-1">
              <Label className="text-sm shrink-0">Number of references</Label>
              <Input
                type="number"
                min={1}
                className="w-20"
                value={referencesReq.referencesCount ?? 1}
                onChange={(e) => setReferencesCount(Number(e.target.value))}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Prequalification requirements — collapsible, closed by default */}
      <Card>
        <CardHeader className="cursor-pointer select-none" onClick={() => setPrequalOpen((o) => !o)}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">
              Prequalification requirements
              {form.prequalRequirements.length > 0 && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({form.prequalRequirements.length})
                </span>
              )}
            </CardTitle>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform ${prequalOpen ? "rotate-180" : ""}`}
            />
          </div>
        </CardHeader>
        {prequalOpen && (
          <CardContent className="space-y-3">
            {form.prequalRequirements.map((r) => (
              <div key={r.id} className="flex items-start gap-3 border border-border rounded-md p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{prequalKindLabel(r.kind)}</p>
                  {r.kind === OTHER_PREQUAL_KIND && (
                    <>
                      <Input
                        className="mt-1.5"
                        placeholder="Describe the requirement"
                        value={r.detailText}
                        onChange={(e) => updatePrequalRequirement(r.id, { detailText: e.target.value })}
                      />
                      <p className="text-xs text-amber-600 mt-1.5">
                        {r.mandatory
                          ? "Informational only — this won't block submission automatically, even marked mandatory. You'll need to check it manually."
                          : "Informational only — free-text requirements aren't checked automatically."}
                      </p>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground">{r.mandatory ? "Mandatory" : "Preferred"}</span>
                  <Switch
                    checked={r.mandatory}
                    onCheckedChange={(checked) => updatePrequalRequirement(r.id, { mandatory: checked })}
                  />
                  <Button variant="ghost" size="sm" onClick={() => removePrequalRequirement(r.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}

            <Select key={form.prequalRequirements.length} onValueChange={addPrequalRequirement}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="+ Add a requirement" />
              </SelectTrigger>
              <SelectContent>
                {availableMappablePrequalKinds.map((k) => (
                  <SelectItem key={k.kind} value={k.kind}>
                    {k.label}
                  </SelectItem>
                ))}
                <SelectItem value={OTHER_PREQUAL_KIND}>Other (free text)</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        )}
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground font-mono">
          {tenderNumber ? `Saved as draft · ${tenderNumber}` : "Not yet saved"}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() =>
              navigate(
                `/dashboard/business?view=tenders-stub&mode=publish${tenderId ? `&tender=${tenderId}` : ""}`,
              )
            }
          >
            Publish
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {tenderId ? "Save" : "Save as draft"}
          </Button>
        </div>
      </div>
    </div>
  );
}
