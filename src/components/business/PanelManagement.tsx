import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useToast } from "@/hooks/use-toast";
import { differenceInDays, formatDistanceToNow } from "date-fns";
import { BusinessPrequalView } from "@/components/business/BusinessPrequalView";

// company_code is assigned by a BEFORE INSERT trigger (assign_company_code)
// — never generated client-side, hence the Omit here.
type CompanyInsert = Omit<Database["public"]["Tables"]["companies"]["Insert"], "company_code">;
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Users,
  Search,
  Plus,
  CheckCircle2,
  Clock,
  XCircle,
  Star,
  Shield,
  AlertTriangle,
  Loader2,
  UserCheck,
  ChevronRight,
  Building2,
  Award,
  FileCheck2,
  History,
  CalendarClock,
} from "lucide-react";

// --- Types ---
// DB constraint: status = ANY ('pending','approved','suspended','removed')
type PanelStatus = "pending" | "approved" | "suspended" | "removed";
type PanelTier = "preferred" | "approved" | "probationary";

interface PanelMember {
  id: string;
  contractor_id: string | null;
  company_id: string | null;
  status: string | null;
  tier: string | null;
  notes: string | null;
  approved_at: string | null;
  created_at: string | null;
  can_receive_jobs: boolean;
  contractor_name: string | null;
  contractor_ts_code: string | null;
  contractor_trades: string[] | null;
  contractor_location: string | null;
  contractor_rating: number | null;
  contractor_avatar: string | null;
  contractor_company: string | null;
}

// --- term_engagements (direct-origin creation from this view) ---
// Only the three not-yet-terminated statuses are fetched — 'ended'/'expired'
// engagements don't block setting up a new one (create_direct_engagement's
// own duplicate guard uses the same three-status set).
interface ExistingEngagementRow {
  id: string;
  contractor_id: string;
  status: string;
  expiry_date: string;
}

const BILLING_PERIOD_OPTIONS = [
  { value: "calendar_month", label: "Calendar month" },
  { value: "custom", label: "Custom (a fixed day of the month)" },
] as const;

interface PanelManagementProps {
  profileId: string;
  userId: string;
}

// --- contractor_scores ---
// craft_confidence/service_confidence/value_confidence are a 3-tier text enum
// ('building' | 'provisional' | 'established'), NOT a numeric 0–1 value — confirmed
// in 20260730230000_contractor_scores.sql's CHECK constraint. 'building' is
// server-derived from the paired count column being < 3
// (see the v_*_confidence CASE blocks in 20260730270000_calculate_contractor_scores.sql),
// so the confidence check and the count check below are the same underlying
// condition observed twice — matches the gate ScoreBreakdown.tsx / ScoreGauge.tsx
// already use (`confidence === "building" || score === null`).
// composite_score is intentionally never selected here — it's marked
// "internal ranking use only, never displayed" in the schema comment.
interface ContractorScoreRow {
  contractor_id: string;
  craft_score: number | null;
  craft_confidence: string | null;
  craft_signal_count: number;
  service_score: number | null;
  service_confidence: string | null;
  service_review_count: number;
  value_score: number | null;
  value_confidence: string | null;
  value_signal_count: number;
}

function hasEnoughData(confidence: string | null, count: number): boolean {
  return confidence != null && confidence !== "building" && count >= 3;
}

const SCORE_DIMENSIONS: { key: "craft" | "service" | "value"; label: string }[] = [
  { key: "craft", label: "Craft" },
  { key: "service", label: "Service" },
  { key: "value", label: "Value" },
];

function scoreFor(row: ContractorScoreRow, dim: "craft" | "service" | "value") {
  if (dim === "craft") return { score: row.craft_score, confidence: row.craft_confidence, count: row.craft_signal_count };
  if (dim === "service") return { score: row.service_score, confidence: row.service_confidence, count: row.service_review_count };
  return { score: row.value_score, confidence: row.value_confidence, count: row.value_signal_count };
}

// --- panel_prequalification-derived document status ---
// Only 3 of the 6 prequal checklist items carry an expiry column at all
// (public_liability, employers_liability, trade_cert — see CHECKLIST_ITEMS in
// BusinessPrequalView.tsx; site_induction/nda/terms are boolean-only). Status is
// derived ONLY from panel_prequalification.*_expiry — never from
// prequalification_documents.expiry_date, which is descriptive file metadata.
interface PrequalExpiryRow {
  contractor_id: string;
  public_liability_expiry: string | null;
  employers_liability_expiry: string | null;
  trade_cert_expiry: string | null;
}

const DOC_EXPIRY_ITEMS: { key: keyof Omit<PrequalExpiryRow, "contractor_id">; label: string }[] = [
  { key: "public_liability_expiry", label: "Public liability" },
  { key: "employers_liability_expiry", label: "Employers liability" },
  { key: "trade_cert_expiry", label: "Trade cert" },
];

type ExpiryTone = "expired" | "soon" | "neutral";

function expiryTone(expiry: string | null): ExpiryTone {
  if (!expiry) return "neutral";
  const days = differenceInDays(new Date(expiry), new Date());
  if (days < 0) return "expired";
  if (days <= 30) return "soon";
  return "neutral";
}

const toneClass: Record<ExpiryTone, string> = {
  expired: "bg-red-100 text-red-800 border-red-200",
  soon: "bg-amber-100 text-amber-800 border-amber-200",
  neutral: "bg-gray-100 text-gray-700 border-gray-200",
};

// --- sla_rules (relocated from BusinessComplianceView.tsx — see report) ---
interface SlaRule {
  id: string;
  name: string | null;
  applies_to_trade: string | null;
  response_hours: number | null;
  resolution_hours: number | null;
}

// --- Status helpers ---
const statusConfig: Record<string, { label: string; colour: string; icon: React.ElementType }> = {
  pending:   { label: "Pending",   colour: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: Clock },
  approved:  { label: "Approved",  colour: "bg-green-100 text-green-800 border-green-200",   icon: CheckCircle2 },
  suspended: { label: "Suspended", colour: "bg-red-100 text-red-800 border-red-200",         icon: XCircle },
  removed:   { label: "Removed",   colour: "bg-gray-100 text-gray-700 border-gray-200",      icon: XCircle },
};

const tierConfig: Record<string, { label: string; colour: string; icon: React.ElementType }> = {
  preferred:    { label: "Preferred",    colour: "bg-orange-100 text-orange-800 border-orange-200", icon: Star },
  approved:     { label: "Approved",     colour: "bg-blue-100 text-blue-800 border-blue-200",       icon: Shield },
  probationary: { label: "Probationary", colour: "bg-gray-100 text-gray-700 border-gray-200",       icon: AlertTriangle },
};

// --- Score block (shared by card + detail dialog) ---
function ScoreBlock({ row }: { row: ContractorScoreRow | undefined }) {
  if (!row) return null;
  return (
    <div className="flex flex-wrap items-center gap-3">
      {SCORE_DIMENSIONS.map((d) => {
        const { score, confidence, count } = scoreFor(row, d.key);
        const ok = hasEnoughData(confidence, count) && score !== null;
        return (
          <div key={d.key} className="flex items-center gap-1 text-xs">
            <Award className="h-3 w-3 text-muted-foreground" />
            <span className="text-muted-foreground">{d.label}:</span>
            {ok ? (
              <span className="font-mono font-semibold">{score!.toFixed(1)}/10</span>
            ) : (
              <span className="text-muted-foreground italic">Not enough jobs yet</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// --- Document status chips (shared by card + detail dialog) ---
function DocumentChips({ row }: { row: PrequalExpiryRow | undefined }) {
  if (!row) {
    return (
      <Badge variant="outline" className={`text-[10px] ${toneClass.neutral}`}>
        Not prequalified
      </Badge>
    );
  }
  return (
    <>
      {DOC_EXPIRY_ITEMS.map((item) => {
        const tone = expiryTone(row[item.key]);
        return (
          <Badge key={item.key} variant="outline" className={`text-[10px] ${toneClass[tone]}`}>
            {item.label}
          </Badge>
        );
      })}
    </>
  );
}

// --- Main component ---
export const PanelManagement = ({ profileId, userId }: PanelManagementProps) => {
  const { toast } = useToast();

  const [panel, setPanel] = useState<PanelMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [tsCodeInput, setTsCodeInput] = useState("");
  const [tierInput, setTierInput] = useState<PanelTier>("approved");
  const [notesInput, setNotesInput] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState<{ id: string; name: string | null; ts_code: string | null; trades: string[] | null } | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  const [selectedMember, setSelectedMember] = useState<PanelMember | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [prequalOpen, setPrequalOpen] = useState(false);

  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [scoresMap, setScoresMap] = useState<Record<string, ContractorScoreRow>>({});
  const [prequalMap, setPrequalMap] = useState<Record<string, PrequalExpiryRow>>({});
  const [lastWorkedMap, setLastWorkedMap] = useState<Record<string, string>>({});
  const [slaRules, setSlaRules] = useState<SlaRule[]>([]);
  const [engagementMap, setEngagementMap] = useState<Record<string, ExistingEngagementRow>>({});

  // --- Direct term engagement creation dialog ---
  const [engagementOpen, setEngagementOpen] = useState(false);
  const [engagementStep, setEngagementStep] = useState<"form" | "retry-rates">("form");
  const [engagementSubmitting, setEngagementSubmitting] = useState(false);
  const [pendingEngagementId, setPendingEngagementId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [billingPeriod, setBillingPeriod] = useState<"calendar_month" | "custom">("calendar_month");
  const [billingAnchorDay, setBillingAnchorDay] = useState("");
  const [calloutStandard, setCalloutStandard] = useState("");
  const [calloutOoh, setCalloutOoh] = useState("");
  const [hourlyRate, setHourlyRate] = useState("");
  const [materialsMarkupPct, setMaterialsMarkupPct] = useState("");
  const [minimumCharge, setMinimumCharge] = useState("");

  // --- Ensure company row exists ---
  const ensureCompany = useCallback(async (): Promise<string | null> => {
    const { data: existing } = await supabase
      .from("companies")
      .select("id")
      .eq("owner_id", profileId)
      .maybeSingle();

    if (existing?.id) return existing.id;

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, company_name, email, phone, location")
      .eq("id", profileId)
      .maybeSingle();

    const companyPayload: CompanyInsert = {
      owner_id: profileId,
      name: profile?.company_name || profile?.full_name || "My Business",
      contact_email: profile?.email,
      contact_phone: profile?.phone,
      city: profile?.location,
    };

    const { data: newCompany, error } = await supabase
      .from("companies")
      .insert(companyPayload as Database["public"]["Tables"]["companies"]["Insert"])
      .select("id")
      .single();

    if (error) {
      console.error("Failed to create company row:", error);
      return null;
    }
    return newCompany.id;
  }, [profileId]);

  // --- Load score/document/last-worked enrichment for the current panel, batched ---
  const loadEnrichment = useCallback(async (cId: string, contractorIds: string[]) => {
    if (!contractorIds.length) {
      setScoresMap({});
      setPrequalMap({});
      setLastWorkedMap({});
      setEngagementMap({});
      return;
    }

    const [scoresRes, prequalRes, jobsRes, engagementsRes] = await Promise.all([
      supabase
        .from("contractor_scores")
        .select("contractor_id, craft_score, craft_confidence, craft_signal_count, service_score, service_confidence, service_review_count, value_score, value_confidence, value_signal_count" as const)
        .in("contractor_id", contractorIds),
      supabase
        .from("panel_prequalification")
        .select("contractor_id, public_liability_expiry, employers_liability_expiry, trade_cert_expiry" as const)
        .eq("company_id", cId)
        .in("contractor_id", contractorIds),
      supabase
        .from("jobs")
        .select("contractor_id, completed_at" as const)
        .eq("company_id", cId)
        .eq("status", "complete")
        .in("contractor_id", contractorIds)
        .order("completed_at", { ascending: false }),
      // Not-yet-terminated engagements only — matches
      // create_direct_engagement's own duplicate guard exactly, so what the
      // form offers/blocks always agrees with what the RPC will accept.
      supabase
        .from("term_engagements")
        .select("id, contractor_id, status, expiry_date")
        .eq("company_id", cId)
        .in("contractor_id", contractorIds)
        .in("status", ["active", "suspended", "notice_given"]),
    ]);

    const sMap: Record<string, ContractorScoreRow> = {};
    for (const row of scoresRes.data ?? []) sMap[row.contractor_id] = row as ContractorScoreRow;
    setScoresMap(sMap);

    const pMap: Record<string, PrequalExpiryRow> = {};
    for (const row of prequalRes.data ?? []) pMap[row.contractor_id] = row as PrequalExpiryRow;
    setPrequalMap(pMap);

    // jobsRes is ordered completed_at desc, so the first row seen per contractor is the most recent.
    const jMap: Record<string, string> = {};
    for (const row of jobsRes.data ?? []) {
      if (row.completed_at && !jMap[row.contractor_id]) jMap[row.contractor_id] = row.completed_at;
    }
    setLastWorkedMap(jMap);

    const eMap: Record<string, ExistingEngagementRow> = {};
    for (const row of engagementsRes.data ?? []) eMap[row.contractor_id] = row as ExistingEngagementRow;
    setEngagementMap(eMap);
  }, []);

  // --- Load panel ---
  const loadPanel = useCallback(async () => {
    setLoading(true);
    const cId = companyId || await ensureCompany();
    if (cId) setCompanyId(cId);

    if (!cId) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("contractor_panel")
      .select("id, contractor_id, company_id, status, tier, notes, approved_at, created_at, can_receive_jobs")
      .eq("company_id", cId)
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Error", description: "Could not load panel.", variant: "destructive" });
      setLoading(false);
      return;
    }

    const hydrated: PanelMember[] = await Promise.all(
      (data || []).map(async (row) => {
        if (!row.contractor_id) return {
          ...row,
          contractor_name: null, contractor_ts_code: null, contractor_trades: null,
          contractor_location: null, contractor_rating: null, contractor_avatar: null, contractor_company: null,
        };

        const { data: prof } = await supabase
          .from("profiles")
          .select("full_name, ts_profile_code, trades, location, rating, avatar_url, company_name")
          .eq("id", row.contractor_id)
          .maybeSingle();

        return {
          ...row,
          contractor_name: prof?.full_name ?? null,
          contractor_ts_code: prof?.ts_profile_code ?? null,
          contractor_trades: prof?.trades ?? null,
          contractor_location: prof?.location ?? null,
          contractor_rating: prof?.rating ?? null,
          contractor_avatar: prof?.avatar_url ?? null,
          contractor_company: prof?.company_name ?? null,
        };
      })
    );

    setPanel(hydrated);

    const contractorIds = hydrated.map((m) => m.contractor_id).filter((id): id is string => !!id);
    await loadEnrichment(cId, contractorIds);

    const { data: slaRows } = await supabase
      .from("sla_rules")
      .select("id, name, applies_to_trade, response_hours, resolution_hours" as const)
      .eq("company_id", cId)
      .order("applies_to_trade");
    setSlaRules((slaRows ?? []) as SlaRule[]);

    setLoading(false);
  }, [companyId, ensureCompany, loadEnrichment, toast]);

  useEffect(() => {
    loadPanel();
  }, [loadPanel]);

  // --- TS code lookup ---
  const handleLookup = async () => {
    const code = tsCodeInput.trim().toUpperCase();
    if (!code.startsWith("TS-C-")) {
      setLookupError("Must be a contractor TS code (TS-C-XXXXXX)");
      return;
    }
    setLookupLoading(true);
    setLookupError(null);
    setLookupResult(null);

    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, ts_profile_code, trades")
      .eq("ts_profile_code", code)
      .eq("user_type", "contractor")
      .maybeSingle();

    setLookupLoading(false);

    if (error || !data) {
      setLookupError("No contractor found with that TS code.");
      return;
    }

    const already = panel.find((m) => m.contractor_id === data.id);
    if (already) {
      setLookupError(`This contractor is already on your panel (${statusConfig[already.status ?? "pending"]?.label ?? already.status}).`);
      return;
    }

    setLookupResult({
      id: data.id,
      name: data.full_name,
      ts_code: data.ts_profile_code,
      trades: data.trades,
    });
  };

  // --- Send invite ---
  const handleInvite = async () => {
    if (!lookupResult) return;
    setInviteLoading(true);

    // Always resolve companyId fresh — don't rely on state
    let cId = companyId;
    if (!cId) {
      cId = await ensureCompany();
      if (cId) setCompanyId(cId);
    }

    if (!cId) {
      toast({ title: "Error", description: "Could not resolve your company. Please refresh and try again.", variant: "destructive" });
      setInviteLoading(false);
      return;
    }

    const { error } = await supabase.from("contractor_panel").insert({
      company_id: cId,
      contractor_id: lookupResult.id,
      added_by: profileId,
      status: "pending",  // DB constraint: pending | approved | suspended | removed
      tier: tierInput,
      notes: notesInput || null,
    });

    if (error) {
      console.error("Panel insert error:", error);
      toast({ title: "Error", description: "Failed to send invite.", variant: "destructive" });
      setInviteLoading(false);
      return;
    }

    // Notify contractor
    const { data: contractorProfile } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("id", lookupResult.id)
      .maybeSingle();

    if (contractorProfile?.user_id) {
      await supabase.from("notifications").insert({
        user_id: contractorProfile.user_id,
        type: "panel_invite",
        title: "Panel Invitation",
        message: "You have been invited to join a contractor panel.",
        is_read: false,
      });
    }

    toast({ title: "Invite sent", description: `${lookupResult.name ?? "Contractor"} has been added to your panel.` });
    setInviteOpen(false);
    setTsCodeInput("");
    setLookupResult(null);
    setNotesInput("");
    setTierInput("approved");
    setInviteLoading(false);
    loadPanel();
  };

  // --- Update member ---
  const updateMember = async (memberId: string, updates: { status?: string; tier?: string }) => {
    const { error } = await supabase
      .from("contractor_panel")
      .update({
        ...updates,
        ...(updates.status === "approved" ? { approved_at: new Date().toISOString() } : {}),
      })
      .eq("id", memberId);

    if (error) {
      toast({ title: "Error", description: "Failed to update.", variant: "destructive" });
      return;
    }

    toast({ title: "Updated", description: "Panel member updated." });
    setDetailOpen(false);
    loadPanel();
  };

  // --- Remove from panel ---
  const removeMember = async (memberId: string) => {
    const { error } = await supabase
      .from("contractor_panel")
      .delete()
      .eq("id", memberId);

    if (error) {
      toast({ title: "Error", description: "Failed to remove.", variant: "destructive" });
      return;
    }

    toast({ title: "Removed", description: "Contractor removed from panel." });
    setDetailOpen(false);
    loadPanel();
  };

  // --- Direct term engagement creation ---

  const resetEngagementForm = () => {
    setStartDate("");
    setExpiryDate("");
    setBillingPeriod("calendar_month");
    setBillingAnchorDay("");
    setCalloutStandard("");
    setCalloutOoh("");
    setHourlyRate("");
    setMaterialsMarkupPct("");
    setMinimumCharge("");
    setPendingEngagementId(null);
    setEngagementStep("form");
  };

  const openEngagementDialog = () => {
    resetEngagementForm();
    setEngagementOpen(true);
  };

  // Proposes the rate version against an already-created engagement.
  // Split out from handleCreateEngagement so a failed proposal can be
  // retried on its own — create_direct_engagement would refuse a second
  // call for the same contractor+company once the first succeeded (its own
  // duplicate guard treats the just-created row as blocking), so re-running
  // the whole form is not an option once the engagement exists.
  const proposeRates = async (engagementId: string) => {
    // propose_engagement_rate_version rejects an effective_from before
    // today. An engagement can legitimately start in the past (formalising
    // a relationship that was already running informally), so the rate's
    // effective_from is clamped to today when the engagement's own start
    // date has already passed, rather than sending a start_date the RPC
    // would reject outright.
    const todayStr = new Date().toISOString().slice(0, 10);
    const effectiveFrom = startDate < todayStr ? todayStr : startDate;

    const { data: rateId, error: rateError } = await supabase.rpc("propose_engagement_rate_version", {
      p_engagement_id: engagementId,
      p_callout_standard: Number(calloutStandard),
      p_callout_ooh: Number(calloutOoh),
      p_hourly_rate: Number(hourlyRate),
      p_materials_markup_pct: Number(materialsMarkupPct),
      p_minimum_charge: minimumCharge ? Number(minimumCharge) : null,
      p_effective_from: effectiveFrom,
    });

    if (rateError) {
      setPendingEngagementId(engagementId);
      setEngagementStep("retry-rates");
      toast({
        title: "Engagement created, but rates were not proposed",
        description: "The engagement exists on file, but the contractor has nothing to accept yet. Try proposing rates again.",
        variant: "destructive",
      });
      return false;
    }

    // Best-effort — a failed notification must not undo an already-agreed
    // rate proposal. The contractor can still find this from their
    // Engagements view with nothing waiting in their notification bell.
    if (selectedMember?.contractor_id && rateId) {
      try {
        const { error: notifyError } = await supabase.from("notifications").insert({
          user_id: selectedMember.contractor_id,
          title: "New rates proposed",
          message: "A business has proposed rates for a term engagement with you. Review and accept or decline them from your Engagements view.",
          type: "engagement_rate_proposed",
          reference_type: "engagement_rates",
          reference_id: rateId as string,
        });
        if (notifyError) {
          console.error(
            `Failed to notify contractor ${selectedMember.contractor_id} of proposed rate version ${rateId} on engagement ${engagementId}:`,
            notifyError,
          );
        }
      } catch (notifyException) {
        console.error(
          `Notification insert threw while notifying contractor ${selectedMember.contractor_id} of proposed rate version ${rateId} on engagement ${engagementId}:`,
          notifyException,
        );
      }
    }

    toast({
      title: "Engagement created",
      description: "Rates have been proposed. The contractor must accept them before this engagement is usable.",
    });
    setEngagementOpen(false);
    resetEngagementForm();
    setDetailOpen(false);
    loadPanel();
    return true;
  };

  const handleCreateEngagement = async () => {
    if (!selectedMember?.contractor_id || !companyId) return;

    if (!startDate || !expiryDate) {
      toast({ title: "Missing dates", description: "Start and expiry dates are required.", variant: "destructive" });
      return;
    }
    if (billingPeriod === "custom" && !billingAnchorDay) {
      toast({ title: "Missing anchor day", description: "Enter a day of the month (1–28) for a custom billing period.", variant: "destructive" });
      return;
    }
    if (!calloutStandard || !calloutOoh || !hourlyRate || !materialsMarkupPct) {
      toast({ title: "Missing rates", description: "Every rate is required except minimum charge.", variant: "destructive" });
      return;
    }

    setEngagementSubmitting(true);
    try {
      const { data: engagementId, error: engagementError } = await supabase.rpc("create_direct_engagement", {
        p_company_id: companyId,
        p_contractor_id: selectedMember.contractor_id,
        p_start_date: startDate,
        p_expiry_date: expiryDate,
        p_billing_period: billingPeriod,
        p_billing_anchor_day: billingPeriod === "custom" ? Number(billingAnchorDay) : null,
      });

      if (engagementError || !engagementId) {
        toast({
          title: "Could not create engagement",
          description: engagementError?.message ?? "Please try again.",
          variant: "destructive",
        });
        return;
      }

      await proposeRates(engagementId as string);
    } finally {
      setEngagementSubmitting(false);
    }
  };

  const handleRetryRates = async () => {
    if (!pendingEngagementId) return;
    setEngagementSubmitting(true);
    try {
      await proposeRates(pendingEngagementId);
    } finally {
      setEngagementSubmitting(false);
    }
  };

  // --- Filtered panel ---
  const filtered = panel.filter((m) => {
    const matchesStatus = filterStatus === "all" || m.status === filterStatus;
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      m.contractor_name?.toLowerCase().includes(q) ||
      m.contractor_ts_code?.toLowerCase().includes(q) ||
      m.contractor_trades?.some((t) => t.toLowerCase().includes(q));
    return matchesStatus && matchesSearch;
  });

  const counts = {
    approved:  panel.filter((m) => m.status === "approved").length,
    pending:   panel.filter((m) => m.status === "pending").length,
    preferred: panel.filter((m) => m.tier === "preferred").length,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-heading text-2xl font-bold">Contractor Panel</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Your curated list of approved contractors. Invite by TS code.
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Invite Contractor
        </Button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-green-100 flex items-center justify-center">
              <UserCheck className="h-5 w-5 text-green-700" />
            </div>
            <div>
              <p className="text-2xl font-bold">{counts.approved}</p>
              <p className="text-xs text-muted-foreground">Approved</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-yellow-100 flex items-center justify-center">
              <Clock className="h-5 w-5 text-yellow-700" />
            </div>
            <div>
              <p className="text-2xl font-bold">{counts.pending}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-orange-100 flex items-center justify-center">
              <Star className="h-5 w-5 text-orange-700" />
            </div>
            <div>
              <p className="text-2xl font-bold">{counts.preferred}</p>
              <p className="text-xs text-muted-foreground">Preferred</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, TS code or trade..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="removed">Removed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Panel list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            {panel.length === 0 ? (
              <>
                <h3 className="text-lg font-medium mb-2">No contractors on your panel yet</h3>
                <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                  Build your trusted network. Invite contractors by their TS code and manage your approved supplier list in one place.
                </p>
                <Button onClick={() => setInviteOpen(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Invite your first contractor
                </Button>
              </>
            ) : (
              <>
                <h3 className="text-lg font-medium mb-2">No results</h3>
                <p className="text-muted-foreground">Try adjusting your search or filter.</p>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((member) => {
            const status = statusConfig[member.status ?? "pending"] ?? statusConfig.pending;
            const tier = member.tier ? tierConfig[member.tier] : null;
            const StatusIcon = status.icon;
            const cid = member.contractor_id;
            const lastWorked = cid ? lastWorkedMap[cid] : undefined;

            return (
              <Card
                key={member.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => { setSelectedMember(member); setDetailOpen(true); }}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <Building2 className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold truncate">
                            {member.contractor_name ?? "Unknown Contractor"}
                          </p>
                          {member.contractor_ts_code && (
                            <span className="text-xs font-mono text-muted-foreground">
                              {member.contractor_ts_code}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {member.contractor_trades?.slice(0, 3).map((t) => (
                            <span key={t} className="text-xs bg-muted px-2 py-0.5 rounded-full">
                              {t}
                            </span>
                          ))}
                          {member.contractor_location && (
                            <span className="text-xs text-muted-foreground">
                              {member.contractor_location}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {tier && (
                        <Badge variant="outline" className={`text-xs ${tier.colour}`}>
                          {tier.label}
                        </Badge>
                      )}
                      <Badge variant="outline" className={`text-xs ${status.colour} flex items-center gap-1`}>
                        <StatusIcon className="h-3 w-3" />
                        {status.label}
                      </Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>

                  {/* Score block, document chips, last worked */}
                  <div className="mt-3 pt-3 border-t space-y-2">
                    <ScoreBlock row={cid ? scoresMap[cid] : undefined} />
                    <div className="flex flex-wrap items-center gap-1.5">
                      <FileCheck2 className="h-3 w-3 text-muted-foreground" />
                      <DocumentChips row={cid ? prequalMap[cid] : undefined} />
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <History className="h-3 w-3" />
                      {lastWorked
                        ? `Last worked ${formatDistanceToNow(new Date(lastWorked), { addSuffix: true })}`
                        : "No jobs yet"}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* SLA rules reference — relocated from BusinessComplianceView.tsx (see report) */}
      <div className="space-y-4">
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
      </div>

      {/* --- Invite Dialog --- */}
      <Dialog open={inviteOpen} onOpenChange={(o) => {
        setInviteOpen(o);
        if (!o) { setLookupResult(null); setLookupError(null); setTsCodeInput(""); }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Invite a Contractor</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Contractor TS Code</label>
              <div className="flex gap-2">
                <Input
                  placeholder="TS-C-XXXXXX"
                  value={tsCodeInput}
                  onChange={(e) => {
                    setTsCodeInput(e.target.value.toUpperCase());
                    setLookupResult(null);
                    setLookupError(null);
                  }}
                  className="font-mono"
                />
                <Button
                  variant="outline"
                  onClick={handleLookup}
                  disabled={lookupLoading || !tsCodeInput}
                >
                  {lookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
              {lookupError && <p className="text-sm text-destructive">{lookupError}</p>}
              {lookupResult && (
                <div className="p-3 rounded-lg border bg-green-50 border-green-200 text-sm space-y-1">
                  <p className="font-semibold text-green-800">{lookupResult.name ?? "Contractor found"}</p>
                  <p className="text-green-700 font-mono text-xs">{lookupResult.ts_code}</p>
                  {lookupResult.trades?.length ? (
                    <p className="text-green-700">{lookupResult.trades.slice(0, 3).join(", ")}</p>
                  ) : null}
                </div>
              )}
            </div>

            {lookupResult && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Panel Tier</label>
                  <Select value={tierInput} onValueChange={(v) => setTierInput(v as PanelTier)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="preferred">Preferred — first in line for jobs</SelectItem>
                      <SelectItem value="approved">Approved — standard panel member</SelectItem>
                      <SelectItem value="probationary">Probationary — vetting in progress</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Notes (optional)</label>
                  <Textarea
                    placeholder="Internal notes about this contractor..."
                    value={notesInput}
                    onChange={(e) => setNotesInput(e.target.value)}
                    rows={3}
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button onClick={handleInvite} disabled={!lookupResult || inviteLoading}>
              {inviteLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Send Invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- Member Detail Dialog --- */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-md">
          {selectedMember && (() => {
            const status = statusConfig[selectedMember.status ?? "pending"] ?? statusConfig.pending;
            const tier = selectedMember.tier ? tierConfig[selectedMember.tier] : null;
            const cid = selectedMember.contractor_id;
            const lastWorked = cid ? lastWorkedMap[cid] : undefined;
            return (
              <>
                <DialogHeader>
                  <DialogTitle>{selectedMember.contractor_name ?? "Contractor"}</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-2">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className={status.colour}>{status.label}</Badge>
                    {tier && <Badge variant="outline" className={tier.colour}>{tier.label}</Badge>}
                  </div>

                  {selectedMember.contractor_ts_code && (
                    <div>
                      <p className="text-xs text-muted-foreground">TS Code</p>
                      <p className="font-mono font-medium">{selectedMember.contractor_ts_code}</p>
                    </div>
                  )}

                  {selectedMember.contractor_trades?.length ? (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Trades</p>
                      <div className="flex flex-wrap gap-1">
                        {selectedMember.contractor_trades.map((t) => (
                          <span key={t} className="text-xs bg-muted px-2 py-0.5 rounded-full">{t}</span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Scores</p>
                    <ScoreBlock row={cid ? scoresMap[cid] : undefined} />
                    {!(cid && scoresMap[cid]) && <p className="text-sm text-muted-foreground">No scores yet.</p>}
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Compliance documents</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <DocumentChips row={cid ? prequalMap[cid] : undefined} />
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 h-7 text-xs"
                      onClick={() => setPrequalOpen(true)}
                    >
                      Manage prequalification &amp; documents
                    </Button>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Term engagement</p>
                    {cid && engagementMap[cid] ? (
                      <div className="p-3 rounded-lg border bg-muted/30 text-sm space-y-1">
                        <div className="flex items-center gap-1.5 font-medium">
                          <CalendarClock className="h-3.5 w-3.5" />
                          Active — expires {new Date(engagementMap[cid].expiry_date).toLocaleDateString("en-GB")}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          This contractor already has an ongoing term engagement with your company. A second one cannot be created until it ends.
                        </p>
                      </div>
                    ) : selectedMember.status === "approved" && selectedMember.can_receive_jobs ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={openEngagementDialog}
                      >
                        <CalendarClock className="h-3 w-3 mr-1" />
                        Set up term engagement
                      </Button>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Approve this contractor (and clear any suspension) before setting up a term engagement.
                      </p>
                    )}
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground">Last worked</p>
                    <p className="text-sm">
                      {lastWorked
                        ? `${formatDistanceToNow(new Date(lastWorked), { addSuffix: true })}`
                        : "No jobs yet"}
                    </p>
                  </div>

                  {selectedMember.notes && (
                    <div>
                      <p className="text-xs text-muted-foreground">Notes</p>
                      <p className="text-sm">{selectedMember.notes}</p>
                    </div>
                  )}

                  {selectedMember.approved_at && (
                    <div>
                      <p className="text-xs text-muted-foreground">Approved</p>
                      <p className="text-sm">{new Date(selectedMember.approved_at).toLocaleDateString("en-GB")}</p>
                    </div>
                  )}

                  <div className="border-t pt-4 space-y-2">
                    <p className="text-sm font-medium mb-3">Update status</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedMember.status !== "approved" && (
                        <Button size="sm" variant="outline"
                          className="border-green-300 text-green-700 hover:bg-green-50"
                          onClick={() => updateMember(selectedMember.id, { status: "approved" })}>
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
                        </Button>
                      )}
                      {selectedMember.status !== "suspended" && (
                        <Button size="sm" variant="outline"
                          className="border-red-300 text-red-700 hover:bg-red-50"
                          onClick={() => updateMember(selectedMember.id, { status: "suspended" })}>
                          <XCircle className="h-3 w-3 mr-1" /> Suspend
                        </Button>
                      )}
                    </div>

                    <p className="text-sm font-medium mt-4 mb-3">Change tier</p>
                    <div className="flex flex-wrap gap-2">
                      {(["preferred", "approved", "probationary"] as PanelTier[]).map((t) => (
                        <Button key={t} size="sm"
                          variant={selectedMember.tier === t ? "default" : "outline"}
                          onClick={() => updateMember(selectedMember.id, { tier: t })}>
                          {tierConfig[t].label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <Button variant="destructive" size="sm"
                    onClick={() => removeMember(selectedMember.id)}>
                    Remove from panel
                  </Button>
                  <Button variant="outline" onClick={() => setDetailOpen(false)}>Close</Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* --- Prequalification & documents (reuses BusinessPrequalView as-is) --- */}
      <Dialog open={prequalOpen} onOpenChange={setPrequalOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto p-0">
          {companyId && <BusinessPrequalView companyId={companyId} profileId={profileId} />}
        </DialogContent>
      </Dialog>

      {/* --- Term Engagement Dialog --- */}
      <Dialog open={engagementOpen} onOpenChange={(o) => {
        setEngagementOpen(o);
        if (!o) resetEngagementForm();
      }}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {engagementStep === "retry-rates"
                ? "Propose rates again"
                : `Set up term engagement — ${selectedMember?.contractor_name ?? "Contractor"}`}
            </DialogTitle>
          </DialogHeader>

          <div className="p-3 rounded-lg border border-amber-200 bg-amber-50 text-amber-900 text-sm">
            This engagement is not usable until {selectedMember?.contractor_name ?? "the contractor"} accepts these
            rates from their side. Nothing is dispatched to them, and no work can be raised against this engagement,
            until then.
          </div>

          <div className="space-y-5 py-2">
            {engagementStep === "form" && (
              <>
                <div className="space-y-3">
                  <p className="text-sm font-medium">Engagement</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">Start date</label>
                      <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">Expiry date</label>
                      <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-medium">Billing period</p>
                  <Select value={billingPeriod} onValueChange={(v) => setBillingPeriod(v as "calendar_month" | "custom")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {BILLING_PERIOD_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {billingPeriod === "custom" && (
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">Day of the month billing starts (1–28)</label>
                      <Input
                        type="number"
                        min={1}
                        max={28}
                        value={billingAnchorDay}
                        onChange={(e) => setBillingAnchorDay(e.target.value)}
                      />
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">This cannot be changed once the engagement starts.</p>
                </div>
              </>
            )}

            {engagementStep === "retry-rates" && (
              <p className="text-sm text-muted-foreground">
                The engagement itself was already created — it does not need to be entered again. Only the rate
                proposal failed. Review the rates below and try again.
              </p>
            )}

            <div className="space-y-3">
              <p className="text-sm font-medium">Rates</p>
              <p className="text-xs text-muted-foreground">
                What you'll pay for work under this engagement. Every field is required except minimum charge.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Standard call-out fee (£)</label>
                  <Input type="number" min={0} step="0.01" value={calloutStandard} onChange={(e) => setCalloutStandard(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Out-of-hours call-out fee (£)</label>
                  <Input type="number" min={0} step="0.01" value={calloutOoh} onChange={(e) => setCalloutOoh(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Hourly rate (£)</label>
                  <Input type="number" min={0} step="0.01" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">Materials markup (%)</label>
                  <Input type="number" min={0} step="0.1" value={materialsMarkupPct} onChange={(e) => setMaterialsMarkupPct(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">Minimum charge (£) — optional</label>
                <Input type="number" min={0} step="0.01" value={minimumCharge} onChange={(e) => setMinimumCharge(e.target.value)} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEngagementOpen(false)}>Cancel</Button>
            {engagementStep === "form" ? (
              <Button onClick={handleCreateEngagement} disabled={engagementSubmitting}>
                {engagementSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Create engagement &amp; propose rates
              </Button>
            ) : (
              <Button onClick={handleRetryRates} disabled={engagementSubmitting}>
                {engagementSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Retry proposing rates
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
