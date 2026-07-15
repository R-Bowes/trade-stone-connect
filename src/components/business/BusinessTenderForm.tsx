import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Check, ChevronDown, Trash2, FileText, Upload } from "lucide-react";
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
  | "pricing_schedule"
  | "references"
  | "methodology"
  | "programme"
  | "subcontracting"
  | "declarations"
  | "rams";

// The seven values tender_response_requirements_kind_check permits, confirmed
// live via pg_constraint. 'pricing' was renamed to 'pricing_schedule' in
// 20260713130000 -- it had no defined shape or server behaviour before that,
// so this is the same slot, not a new one.
const RESPONSE_KIND_OPTIONS: { kind: ResponseKind; label: string }[] = [
  { kind: "pricing_schedule", label: "Pricing schedule" },
  { kind: "references", label: "References" },
  { kind: "methodology", label: "Methodology statement" },
  { kind: "programme", label: "Programme" },
  { kind: "subcontracting", label: "Subcontracting declaration" },
  { kind: "declarations", label: "Declarations" },
  { kind: "rams", label: "RAMS" },
];

// Fixed unit palette -- comparability is a locked fairness principle, no
// custom units any more than custom columns.
const PRICING_UNIT_OPTIONS: { value: string; label: string }[] = [
  { value: "item", label: "Per item" },
  { value: "job", label: "Per job" },
  { value: "hour", label: "Per hour" },
  { value: "day", label: "Per day" },
  { value: "visit", label: "Per visit" },
  { value: "sqm", label: "Per m²" },
  { value: "metre", label: "Per metre" },
  { value: "cubic_metre", label: "Per m³" },
  { value: "fixed", label: "Fixed price" },
];

const PRICING_PRIORITY_OPTIONS = ["P1", "P2", "P3", "Standard"];

// Fixed column palette. Rate and Unit are always present (not toggles);
// everything here is optional. Locked: no custom columns, ever -- keeps
// bids comparable line-for-line across contractors.
type PricingColumn = "quantity" | "leadTime" | "frequency" | "slaPriority" | "notes";
const PRICING_COLUMN_OPTIONS: { value: PricingColumn; label: string }[] = [
  { value: "quantity", label: "Quantity" },
  { value: "leadTime", label: "Lead time" },
  { value: "frequency", label: "Frequency" },
  { value: "slaPriority", label: "SLA priority" },
  { value: "notes", label: "Notes" },
];

interface PricingScheduleRow {
  // Client-generated (crypto.randomUUID()) the moment a row is added, reused
  // verbatim as the id persisted in config.rows[].id. Stable across edits
  // because the contractor's tender_application_price_lines rows key to it
  // -- renaming a row's label later must not orphan a contractor's already
  // -entered rate, so the id is never regenerated on edit, only on create.
  id: string;
  label: string;
  unit: string;
  // All business-specified, read-only for the contractor -- the grid's only
  // contractor-editable cell is the rate (tender_application_price_lines).
  // Populated only when the matching column is toggled active.
  priority?: string;
  quantity?: string;
  leadTime?: string;
  frequency?: string;
  notes?: string;
}

interface PricingScheduleConfig {
  rows: PricingScheduleRow[];
  columns: PricingColumn[];
}

interface ResponseRequirementState {
  kind: ResponseKind;
  referencesCount?: number; // only meaningful when kind === "references"
  pricingSchedule?: PricingScheduleConfig; // only meaningful when kind === "pricing_schedule"
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

type BidVisibility = "sealed" | "open";
type Distribution = "invite" | "open";

interface FormState {
  title: string;
  tenderType: "works" | "term";
  trades: string[];
  siteIds: string[];
  responseDeadline: string; // <input type="datetime-local"> value
  responseRequirements: ResponseRequirementState[];
  prequalRequirements: PrequalRequirementState[];
  scopeDescription: string;
  slaRuleSetId: string | null;
  bidVisibility: BidVisibility;
  distribution: Distribution;
  invitedContractorIds: string[];
}

const EMPTY_FORM: FormState = {
  title: "",
  tenderType: "works",
  trades: [],
  siteIds: [],
  responseDeadline: "",
  responseRequirements: [],
  prequalRequirements: [],
  scopeDescription: "",
  slaRuleSetId: null,
  bidVisibility: "sealed",
  distribution: "invite",
  invitedContractorIds: [],
};

interface TenderDocument {
  id: string;
  file_path: string;
  label: string | null;
}

interface SlaRuleOption {
  id: string;
  name: string;
  priority: string;
  response_hours: number;
  resolution_hours: number;
}

interface PanelContractorOption {
  contractor_id: string;
  contractor_name: string;
  contractor_trades: string[] | null;
}

// ISO timestamptz -> the value a <input type="datetime-local"> can display
// (local time, minute precision, no timezone suffix).
function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Essentials, response/prequal requirements, scope + documents, SLA
// expectations, and bidding + distribution. Budget fields (budget_min/max/
// visible) are still a later slice; publish is stubbed (disabled button)
// until the publish-transition slice lands.
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
  // Same idea again for the invite roster -- two-bucket diff like sites,
  // since a tender_invitations row carries no editable value of its own
  // (just tender_id/contractor_id identity) once created.
  const [existingInvitedContractorIds, setExistingInvitedContractorIds] = useState<string[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [tradeSearch, setTradeSearch] = useState("");
  const [prequalOpen, setPrequalOpen] = useState(false);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [slaOpen, setSlaOpen] = useState(false);
  const [distributionOpen, setDistributionOpen] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(!!paramTenderId);
  const [saving, setSaving] = useState(false);

  const [documents, setDocuments] = useState<TenderDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [slaRules, setSlaRules] = useState<SlaRuleOption[]>([]);
  const [panelContractors, setPanelContractors] = useState<PanelContractorOption[]>([]);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Company's sites, for the checklist.
  useEffect(() => {
    supabase
      .from("sites")
      .select("id, name")
      .eq("company_id", companyId)
      .order("name")
      .then(({ data }) => setSites(data ?? []));
  }, [companyId]);

  // Company's SLA rule sets, for the SLA expectations picker.
  useEffect(() => {
    supabase
      .from("sla_rules")
      .select("id, name, priority, response_hours, resolution_hours")
      .eq("company_id", companyId)
      .order("name")
      .then(({ data }) => setSlaRules(data ?? []));
  }, [companyId]);

  // Approved panel contractors, for the invite-mode distribution picker --
  // same query shape as BusinessPrequalView.loadContractors.
  useEffect(() => {
    (async () => {
      const { data: panelRows } = await supabase
        .from("contractor_panel")
        .select("contractor_id")
        .eq("company_id", companyId)
        .eq("status", "approved");

      const ids = (panelRows ?? []).map((r) => r.contractor_id as string).filter(Boolean);
      if (!ids.length) {
        setPanelContractors([]);
        return;
      }

      const { data: profileRows } = await supabase
        .from("profiles")
        .select("id, full_name, trades")
        .in("id", ids);

      setPanelContractors(
        ids.map((id) => {
          const p = (profileRows ?? []).find((row) => row.id === id);
          return {
            contractor_id: id,
            contractor_name: p?.full_name ?? "Unknown contractor",
            contractor_trades: p?.trades ?? null,
          };
        }),
      );
    })();
  }, [companyId]);

  // Resume mode: load the existing draft + its current site selection.
  useEffect(() => {
    if (!paramTenderId) return;

    (async () => {
      const [
        { data: tender },
        { data: siteLinks },
        { data: responseReqs },
        { data: prequalReqs },
        { data: docs },
        { data: invitations },
      ] = await Promise.all([
        supabase
          .from("tenders")
          .select(
            "id, tender_number, title, tender_type, trade_categories, response_deadline, scope_description, sla_rule_set_id, bid_visibility, distribution",
          )
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
        supabase
          .from("tender_documents")
          .select("id, file_path, label")
          .eq("tender_id", paramTenderId),
        supabase
          .from("tender_invitations")
          .select("contractor_id")
          .eq("tender_id", paramTenderId),
      ]);

      if (tender) {
        const loadedSiteIds = (siteLinks ?? []).map((r) => r.site_id);
        const loadedResponseReqs: ResponseRequirementState[] = (responseReqs ?? []).map((r) => ({
          kind: r.kind as ResponseKind,
          referencesCount:
            r.kind === "references" ? ((r.config as { count?: number } | null)?.count ?? 1) : undefined,
          pricingSchedule:
            r.kind === "pricing_schedule"
              ? ((r.config as PricingScheduleConfig | null) ?? { rows: [], columns: [] })
              : undefined,
        }));
        const loadedPrequalReqs: PrequalRequirementState[] = (prequalReqs ?? []).map((r) => ({
          id: r.id,
          kind: r.kind,
          detailText: (r.detail as { text?: string } | null)?.text ?? "",
          mandatory: r.mandatory,
        }));
        const loadedInvitedIds = (invitations ?? []).map((r) => r.contractor_id);

        setForm({
          title: tender.title,
          tenderType: tender.tender_type as "works" | "term",
          trades: tender.trade_categories ?? [],
          siteIds: loadedSiteIds,
          responseDeadline: tender.response_deadline ? toDatetimeLocalValue(tender.response_deadline) : "",
          responseRequirements: loadedResponseReqs,
          prequalRequirements: loadedPrequalReqs,
          scopeDescription: tender.scope_description ?? "",
          slaRuleSetId: tender.sla_rule_set_id,
          bidVisibility: tender.bid_visibility as BidVisibility,
          distribution: tender.distribution as Distribution,
          invitedContractorIds: loadedInvitedIds,
        });
        setExistingSiteIds(loadedSiteIds);
        setExistingResponseRequirements(loadedResponseReqs);
        setExistingPrequalById(
          new Map(loadedPrequalReqs.map((r) => [r.id, { kind: r.kind, detailText: r.detailText, mandatory: r.mandatory }])),
        );
        setExistingInvitedContractorIds(loadedInvitedIds);
        setDocuments(docs ?? []);
        setTenderNumber(tender.tender_number);
        if (loadedPrequalReqs.length > 0) setPrequalOpen(true);
        if (tender.scope_description || (docs ?? []).length > 0) setScopeOpen(true);
        if (tender.sla_rule_set_id) setSlaOpen(true);
        if (loadedInvitedIds.length > 0) setDistributionOpen(true);
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

  const toggleInvitedContractor = (id: string) => {
    setForm((f) => ({
      ...f,
      invitedContractorIds: f.invitedContractorIds.includes(id)
        ? f.invitedContractorIds.filter((x) => x !== id)
        : [...f.invitedContractorIds, id],
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
          {
            kind,
            ...(kind === "references" ? { referencesCount: 1 } : {}),
            ...(kind === "pricing_schedule" ? { pricingSchedule: { rows: [], columns: [] } } : {}),
          },
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

  // Pricing schedule builder helpers. All operate on the single
  // "pricing_schedule" requirement row's pricingSchedule field -- there is
  // only ever one per tender (kind is the unique key), so no id lookup is
  // needed the way reference/prequal rows need one.
  const updatePricingSchedule = (patch: (p: PricingScheduleConfig) => PricingScheduleConfig) => {
    setForm((f) => ({
      ...f,
      responseRequirements: f.responseRequirements.map((r) =>
        r.kind === "pricing_schedule" && r.pricingSchedule ? { ...r, pricingSchedule: patch(r.pricingSchedule) } : r,
      ),
    }));
  };

  const addPricingRow = () => {
    updatePricingSchedule((p) => ({
      ...p,
      rows: [...p.rows, { id: crypto.randomUUID(), label: "", unit: "item" }],
    }));
  };

  const updatePricingRow = (rowId: string, patch: Partial<PricingScheduleRow>) => {
    updatePricingSchedule((p) => ({
      ...p,
      rows: p.rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r)),
    }));
  };

  const removePricingRow = (rowId: string) => {
    updatePricingSchedule((p) => ({ ...p, rows: p.rows.filter((r) => r.id !== rowId) }));
  };

  const togglePricingColumn = (column: PricingColumn) => {
    updatePricingSchedule((p) => ({
      ...p,
      columns: p.columns.includes(column) ? p.columns.filter((c) => c !== column) : [...p.columns, column],
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
  const pricingScheduleReq = form.responseRequirements.find((r) => r.kind === "pricing_schedule");
  const availableMappablePrequalKinds = MAPPABLE_PREQUAL_KINDS.filter(
    (k) => !form.prequalRequirements.some((r) => r.kind === k.kind),
  );

  // Returns the persisted tender id on success, null on any failure -- used
  // by handlePublish, which needs the freshly-created id on a first-ever
  // save immediately, before the setTenderId(...) state update below has
  // had a chance to re-render (the tenderId closure variable would
  // otherwise still read null at that point). options.silent skips the
  // "Draft saved" toast -- handlePublish saves as a step within publishing,
  // not as its own user-facing action, and shows its own toast instead.
  const handleSave = async (options?: { silent?: boolean }): Promise<string | null> => {
    if (!form.title.trim()) {
      toast({ title: "Title required", description: "Give the tender a title before saving.", variant: "destructive" });
      return null;
    }

    setSaving(true);

    const payload = {
      company_id: companyId,
      created_by: profileId,
      tender_type: form.tenderType,
      title: form.title.trim(),
      trade_categories: form.trades,
      response_deadline: form.responseDeadline ? new Date(form.responseDeadline).toISOString() : null,
      scope_description: form.scopeDescription.trim() || null,
      sla_rule_set_id: form.slaRuleSetId,
      bid_visibility: form.bidVisibility,
      distribution: form.distribution,
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
        return null;
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
        return null;
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
        return null;
      }
    }

    if (added.length) {
      const { error: addError } = await supabase
        .from("tender_sites")
        .insert(added.map((site_id) => ({ tender_id: savedId!, site_id })));
      if (addError) {
        toast({ title: "Sites not saved", description: addError.message, variant: "destructive" });
        setSaving(false);
        return null;
      }
    }

    setExistingSiteIds(form.siteIds);

    // Response requirements: kind is the natural unique key both before and
    // after persistence (at most one row per kind per tender), so this is a
    // by-kind diff -- no client-generated ids needed here, unlike prequal
    // requirements below. "changed" covers both value-bearing kinds:
    // references' count, and pricing_schedule's whole rows/columns config
    // (compared by JSON.stringify -- deep-comparing a small, order-stable
    // object is simpler here than field-by-field, and row identity inside
    // it is already stable since row ids are never regenerated on edit).
    const existingReqByKind = new Map(existingResponseRequirements.map((r) => [r.kind, r]));
    const currentReqByKind = new Map(form.responseRequirements.map((r) => [r.kind, r]));

    const removedKinds = [...existingReqByKind.keys()].filter((k) => !currentReqByKind.has(k));
    const addedKinds = [...currentReqByKind.keys()].filter((k) => !existingReqByKind.has(k));
    const changedKinds = [...currentReqByKind.keys()].filter((k) => {
      if (!existingReqByKind.has(k)) return false;
      const prev = existingReqByKind.get(k)!;
      const cur = currentReqByKind.get(k)!;
      if (k === "references") return prev.referencesCount !== cur.referencesCount;
      if (k === "pricing_schedule") return JSON.stringify(prev.pricingSchedule) !== JSON.stringify(cur.pricingSchedule);
      return false;
    });

    const configForKind = (k: ResponseKind): { count: number } | PricingScheduleConfig | null => {
      if (k === "references") return { count: currentReqByKind.get(k)!.referencesCount ?? 1 };
      if (k === "pricing_schedule") return currentReqByKind.get(k)!.pricingSchedule ?? { rows: [], columns: [] };
      return null;
    };

    if (removedKinds.length) {
      const { error: reqRemoveError } = await supabase
        .from("tender_response_requirements")
        .delete()
        .eq("tender_id", savedId!)
        .in("kind", removedKinds);
      if (reqRemoveError) {
        toast({ title: "Requirements not saved", description: reqRemoveError.message, variant: "destructive" });
        setSaving(false);
        return null;
      }
    }

    if (addedKinds.length) {
      const { error: reqAddError } = await supabase.from("tender_response_requirements").insert(
        addedKinds.map((k) => ({
          tender_id: savedId!,
          kind: k,
          config: configForKind(k),
        })),
      );
      if (reqAddError) {
        toast({ title: "Requirements not saved", description: reqAddError.message, variant: "destructive" });
        setSaving(false);
        return null;
      }
    }

    for (const k of changedKinds) {
      const { error: reqUpdateError } = await supabase
        .from("tender_response_requirements")
        .update({ config: configForKind(k) })
        .eq("tender_id", savedId!)
        .eq("kind", k);
      if (reqUpdateError) {
        toast({ title: "Requirements not saved", description: reqUpdateError.message, variant: "destructive" });
        setSaving(false);
        return null;
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
        return null;
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
        return null;
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
        return null;
      }
    }

    setExistingPrequalById(
      new Map(form.prequalRequirements.map((r) => [r.id, { kind: r.kind, detailText: r.detailText, mandatory: r.mandatory }])),
    );

    // Invited contractors: two-bucket diff against the last persisted set,
    // same idiom as sites -- a tender_invitations row carries no editable
    // value once created, so unlike prequal there's no "changed" bucket.
    const removedInvites = existingInvitedContractorIds.filter((id) => !form.invitedContractorIds.includes(id));
    const addedInvites = form.invitedContractorIds.filter((id) => !existingInvitedContractorIds.includes(id));

    if (removedInvites.length) {
      const { error: inviteRemoveError } = await supabase
        .from("tender_invitations")
        .delete()
        .eq("tender_id", savedId!)
        .in("contractor_id", removedInvites);
      if (inviteRemoveError) {
        toast({ title: "Invitations not saved", description: inviteRemoveError.message, variant: "destructive" });
        setSaving(false);
        return null;
      }
    }

    if (addedInvites.length) {
      const { error: inviteAddError } = await supabase.from("tender_invitations").insert(
        addedInvites.map((contractor_id) => ({
          tender_id: savedId!,
          contractor_id,
          invited_by: profileId,
        })),
      );
      if (inviteAddError) {
        toast({ title: "Invitations not saved", description: inviteAddError.message, variant: "destructive" });
        setSaving(false);
        return null;
      }
    }

    setExistingInvitedContractorIds(form.invitedContractorIds);

    setSaving(false);
    if (!options?.silent) {
      toast({ title: "Draft saved" });
    }
    return savedId;
  };

  // Upload needs tender_id for the storage path ({tender_id}/{filename}, the
  // convention the bucket RLS policies parse) -- the UI blocks this control
  // until the draft has been saved once (see the JSX below), so tenderId is
  // guaranteed non-null here.
  const handleUploadDocument = async (file: File) => {
    if (!tenderId) return;
    setUploading(true);
    try {
      const path = `${tenderId}/${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("tender-documents")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { data, error: insertError } = await supabase
        .from("tender_documents")
        .insert({ tender_id: tenderId, uploaded_by: profileId, file_path: path, label: file.name })
        .select("id, file_path, label")
        .single();
      if (insertError) throw insertError;

      setDocuments((prev) => [...prev, data]);
      toast({ title: "Document uploaded" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ variant: "destructive", title: "Upload failed", description: msg });
    } finally {
      setUploading(false);
    }
  };

  const handleViewDocument = async (doc: TenderDocument) => {
    const { data, error } = await supabase.storage.from("tender-documents").createSignedUrl(doc.file_path, 300);
    if (error || !data?.signedUrl) {
      toast({ variant: "destructive", title: "Could not open document" });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const handleRemoveDocument = async (doc: TenderDocument) => {
    const { error } = await supabase.from("tender_documents").delete().eq("id", doc.id);
    if (error) {
      toast({ variant: "destructive", title: "Remove failed", description: error.message });
      return;
    }
    await supabase.storage.from("tender-documents").remove([doc.file_path]);
    setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
  };

  // Client-side mirror of the precondition checks publish_tender() also
  // re-validates server-side (belt-and-braces -- see the migration). Runs
  // against the in-memory form, not the last-persisted state, since
  // handlePublish saves the current form before publishing.
  const getPublishBlockers = (): string[] => {
    const blockers: string[] = [];
    if (!form.title.trim()) blockers.push("a title");
    if (form.trades.length === 0) blockers.push("at least one trade");
    if (form.siteIds.length === 0) blockers.push("at least one site");
    if (!form.responseDeadline) {
      blockers.push("a response deadline");
    } else if (new Date(form.responseDeadline) <= new Date()) {
      blockers.push("a response deadline in the future");
    }
    if (form.distribution === "invite" && form.invitedContractorIds.length === 0) {
      blockers.push("at least one invited contractor");
    }
    return blockers;
  };

  const handlePublishClick = () => {
    const blockers = getPublishBlockers();
    if (blockers.length > 0) {
      toast({
        title: "Can't publish yet",
        description: `Add ${blockers.join(", ")} before publishing.`,
        variant: "destructive",
      });
      return;
    }
    setPublishDialogOpen(true);
  };

  // Saves the current form first so the published tender matches what the
  // business saw when confirming, then calls publish_tender() -- see that
  // migration for why this is a SECURITY DEFINER transition rather than a
  // raw status UPDATE. Uses the id handleSave returns, not the tenderId
  // state variable, because on a same-click first-ever save that state
  // update hasn't re-rendered yet.
  const handlePublish = async () => {
    setPublishing(true);
    const savedId = await handleSave({ silent: true });
    if (!savedId) {
      setPublishing(false);
      setPublishDialogOpen(false);
      return;
    }

    const { error } = await supabase.rpc("publish_tender", { p_tender_id: savedId });
    setPublishing(false);
    if (error) {
      toast({ title: "Publish failed", description: error.message, variant: "destructive" });
      return;
    }

    setPublishDialogOpen(false);
    toast({ title: "Tender published", description: "Invited contractors have been notified." });
    navigate("/dashboard/business?view=tenders");
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

          {pricingScheduleReq?.pricingSchedule && (
            <div className="pt-3 space-y-3 border-t">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <Label className="text-sm">Columns</Label>
                <div className="flex flex-wrap gap-1.5">
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border-2 border-[#1a2744] bg-[#1a2744]/5 text-[#1a2744]">
                    Rate
                  </span>
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border-2 border-[#1a2744] bg-[#1a2744]/5 text-[#1a2744]">
                    Unit
                  </span>
                  {PRICING_COLUMN_OPTIONS.map(({ value, label }) => {
                    const active = pricingScheduleReq.pricingSchedule!.columns.includes(value);
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() => togglePricingColumn(value)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border-2 transition-all ${
                          active
                            ? "border-[#f07820] bg-orange-50 text-[#f07820]"
                            : "border-border text-muted-foreground hover:border-foreground/30"
                        }`}
                      >
                        {active && <Check className="h-3 w-3" />}
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Rate and Unit are always shown. No custom columns — the fixed palette keeps bids comparable
                line-for-line across contractors.
              </p>

              <div className="space-y-2">
                <Label className="text-sm">Line items</Label>
                {pricingScheduleReq.pricingSchedule.rows.length === 0 && (
                  <p className="text-sm text-muted-foreground">No line items yet.</p>
                )}
                {pricingScheduleReq.pricingSchedule.rows.map((row, i) => (
                  <div key={row.id} className="flex items-start gap-2 border border-border rounded-md p-2.5">
                    <span className="text-xs text-muted-foreground shrink-0 mt-2 w-4">{i + 1}.</span>
                    <div className="flex-1 min-w-0 space-y-2">
                      <Input
                        placeholder="Line item description"
                        value={row.label}
                        onChange={(e) => updatePricingRow(row.id, { label: e.target.value })}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Select value={row.unit} onValueChange={(v) => updatePricingRow(row.id, { unit: v })}>
                          <SelectTrigger className="w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {PRICING_UNIT_OPTIONS.map((u) => (
                              <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {pricingScheduleReq.pricingSchedule!.columns.includes("slaPriority") && (
                          <Select
                            value={row.priority ?? ""}
                            onValueChange={(v) => updatePricingRow(row.id, { priority: v })}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue placeholder="Priority" />
                            </SelectTrigger>
                            <SelectContent>
                              {PRICING_PRIORITY_OPTIONS.map((p) => (
                                <SelectItem key={p} value={p}>{p}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        {pricingScheduleReq.pricingSchedule!.columns.includes("quantity") && (
                          <Input
                            className="w-28"
                            placeholder="Quantity"
                            value={row.quantity ?? ""}
                            onChange={(e) => updatePricingRow(row.id, { quantity: e.target.value })}
                          />
                        )}
                        {pricingScheduleReq.pricingSchedule!.columns.includes("leadTime") && (
                          <Input
                            className="w-32"
                            placeholder="Lead time"
                            value={row.leadTime ?? ""}
                            onChange={(e) => updatePricingRow(row.id, { leadTime: e.target.value })}
                          />
                        )}
                        {pricingScheduleReq.pricingSchedule!.columns.includes("frequency") && (
                          <Input
                            className="w-32"
                            placeholder="Frequency"
                            value={row.frequency ?? ""}
                            onChange={(e) => updatePricingRow(row.id, { frequency: e.target.value })}
                          />
                        )}
                      </div>
                      {pricingScheduleReq.pricingSchedule!.columns.includes("notes") && (
                        <Input
                          placeholder="Notes"
                          value={row.notes ?? ""}
                          onChange={(e) => updatePricingRow(row.id, { notes: e.target.value })}
                        />
                      )}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removePricingRow(row.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <Button type="button" size="sm" variant="outline" onClick={addPricingRow}>
                  + Add line item
                </Button>
              </div>
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

      {/* Scope & documents — collapsible, closed by default */}
      <Card>
        <CardHeader className="cursor-pointer select-none" onClick={() => setScopeOpen((o) => !o)}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Scope &amp; documents</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs font-normal text-muted-foreground">
                {documents.length > 0
                  ? `${documents.length} document${documents.length === 1 ? "" : "s"}`
                  : form.scopeDescription.trim()
                    ? "Scope added"
                    : "No scope or documents"}
              </span>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${scopeOpen ? "rotate-180" : ""}`}
              />
            </div>
          </div>
        </CardHeader>
        {scopeOpen && (
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Scope of works</Label>
              <Textarea
                placeholder="Describe the scope of works in detail..."
                rows={5}
                value={form.scopeDescription}
                onChange={(e) => setForm((f) => ({ ...f, scopeDescription: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label>Documents</Label>
              {!tenderId ? (
                <div className="flex items-center justify-between gap-3 border border-dashed border-border rounded-md p-3">
                  <p className="text-sm text-muted-foreground">Save the draft before attaching documents.</p>
                  <Button size="sm" variant="outline" onClick={() => handleSave()} disabled={saving}>
                    {saving && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />}
                    Save draft
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between gap-3 border border-border rounded-md p-2.5">
                      <button
                        type="button"
                        className="flex items-center gap-2 text-sm text-blue-600 hover:underline min-w-0"
                        onClick={() => handleViewDocument(doc)}
                      >
                        <FileText className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{doc.label ?? doc.file_path}</span>
                      </button>
                      <Button variant="ghost" size="sm" onClick={() => handleRemoveDocument(doc)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <label className="inline-block">
                    <input
                      type="file"
                      className="hidden"
                      disabled={uploading}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUploadDocument(file);
                        e.target.value = "";
                      }}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={uploading}
                      onClick={(e) => {
                        (e.currentTarget.previousSibling as HTMLInputElement)?.click();
                      }}
                    >
                      {uploading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                      ) : (
                        <Upload className="h-3.5 w-3.5 mr-1" />
                      )}
                      Upload document
                    </Button>
                  </label>
                </div>
              )}
            </div>
          </CardContent>
        )}
      </Card>

      {/* SLA expectations — collapsible, closed by default */}
      <Card>
        <CardHeader className="cursor-pointer select-none" onClick={() => setSlaOpen((o) => !o)}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">SLA expectations</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs font-normal text-muted-foreground">
                {slaRules.find((r) => r.id === form.slaRuleSetId)?.name ?? "No SLA rule selected"}
              </span>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${slaOpen ? "rotate-180" : ""}`}
              />
            </div>
          </div>
        </CardHeader>
        {slaOpen && (
          <CardContent className="space-y-2">
            <Label>SLA rule set</Label>
            {slaRules.length === 0 ? (
              <p className="text-sm text-muted-foreground">No SLA rules set up for your company yet.</p>
            ) : (
              <Select
                value={form.slaRuleSetId ?? "none"}
                onValueChange={(v) => setForm((f) => ({ ...f, slaRuleSetId: v === "none" ? null : v }))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select an SLA rule set" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {slaRules.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name} — {r.priority.toUpperCase()} · response {r.response_hours}h / resolution {r.resolution_hours}h
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CardContent>
        )}
      </Card>

      {/* Bidding & distribution — collapsible, closed by default */}
      <Card>
        <CardHeader className="cursor-pointer select-none" onClick={() => setDistributionOpen((o) => !o)}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Bidding &amp; distribution</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-xs font-normal text-muted-foreground">
                {form.bidVisibility === "sealed" ? "Sealed" : "Open"} ·{" "}
                {form.distribution === "invite"
                  ? `Invite-only (${form.invitedContractorIds.length})`
                  : "Open to all"}
              </span>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform ${distributionOpen ? "rotate-180" : ""}`}
              />
            </div>
          </div>
        </CardHeader>
        {distributionOpen && (
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label>Bid visibility</Label>
              <div className="inline-flex rounded-md border border-border p-0.5">
                {(["sealed", "open"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, bidVisibility: v }))}
                    className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                      form.bidVisibility === v
                        ? "bg-[#1a2744] text-white"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {v === "sealed" ? "Sealed" : "Open"}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {form.bidVisibility === "sealed"
                  ? "Bids stay hidden from you until you choose to unseal them."
                  : "Bids are visible to you as they come in."}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Distribution</Label>
              <div className="inline-flex rounded-md border border-border p-0.5">
                {(["invite", "open"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, distribution: v }))}
                    className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                      form.distribution === v
                        ? "bg-[#1a2744] text-white"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {v === "invite" ? "Invite-only" : "Open"}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {form.distribution === "invite"
                  ? "Only invited contractors can see and bid on this tender."
                  : "Any contractor on the platform can see and bid on this tender."}
              </p>
            </div>

            {form.distribution === "invite" && (
              <div className="space-y-2">
                <Label>Invite contractors ({form.invitedContractorIds.length} selected)</Label>
                {panelContractors.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No approved panel contractors yet — add contractors to your panel first.
                  </p>
                ) : (
                  <div className="max-h-48 overflow-y-auto border border-border rounded-md p-1">
                    {panelContractors.map((c) => (
                      <label
                        key={c.contractor_id}
                        className="flex items-center gap-2 cursor-pointer py-1.5 px-2 rounded hover:bg-muted"
                      >
                        <input
                          type="checkbox"
                          checked={form.invitedContractorIds.includes(c.contractor_id)}
                          onChange={() => toggleInvitedContractor(c.contractor_id)}
                          style={{ accentColor: "#f07820", width: 14, height: 14 }}
                        />
                        <span className="text-sm">{c.contractor_name}</span>
                        {c.contractor_trades?.length ? (
                          <span className="text-xs text-muted-foreground truncate">
                            {c.contractor_trades.join(", ")}
                          </span>
                        ) : null}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground font-mono">
          {tenderNumber ? `Saved as draft · ${tenderNumber}` : "Not yet saved"}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handlePublishClick}>
            Publish
          </Button>
          <Button onClick={() => handleSave()} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {tenderId ? "Save" : "Save as draft"}
          </Button>
        </div>
      </div>

      <AlertDialog open={publishDialogOpen} onOpenChange={setPublishDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish this tender?</AlertDialogTitle>
            <AlertDialogDescription>
              Invited contractors will be notified and can begin bidding. You won't be able to
              edit the essentials after publishing.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={publishing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handlePublish} disabled={publishing}>
              {publishing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Publish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
