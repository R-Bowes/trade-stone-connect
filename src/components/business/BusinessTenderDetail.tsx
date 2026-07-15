import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { differenceInCalendarDays, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ArrowLeft, Lock, FileText, CheckCircle2 } from "lucide-react";
import { STATUS_LABEL, STATUS_COLOUR, TYPE_LABEL } from "@/lib/tenderStatus";
import type { TenderStatus, TenderType, BidVisibility } from "@/hooks/useTenders";

interface TenderDetailRow {
  id: string;
  tender_number: string;
  title: string;
  tender_type: TenderType;
  status: TenderStatus;
  bid_visibility: BidVisibility;
  distribution: "invite" | "open";
  response_deadline: string | null;
  scope_description: string | null;
  site_visit_required: boolean;
  sla_rule_set_id: string | null;
  company_id: string;
  published_at: string | null;
  closed_at: string | null;
  awarded_at: string | null;
  cancelled_reason: string | null;
}

interface SiteInfo {
  id: string;
  name: string;
  city: string | null;
  postcode: string;
}

interface DocumentInfo {
  id: string;
  file_path: string;
  label: string | null;
}

interface ResponseRequirement {
  kind: string;
  config: { count?: number; rows?: unknown[] } | null;
}

interface PrequalRequirement {
  id: string;
  kind: string;
  detail: { text?: string } | null;
  mandatory: boolean;
}

interface SlaRuleInfo {
  name: string;
  priority: string;
  response_hours: number;
  resolution_hours: number;
  attendance_hours: number | null;
  business_hours_only: boolean;
}

// Verbatim mirror of the labels in BusinessTenderForm.tsx / duplicated
// again in the contractor components -- same seven values
// tender_response_requirements_kind_check permits.
const RESPONSE_KIND_LABELS: Record<string, string> = {
  pricing_schedule: "Pricing schedule",
  references: "References",
  methodology: "Methodology statement",
  programme: "Programme",
  subcontracting: "Subcontracting declaration",
  declarations: "Declarations",
  rams: "RAMS",
};

// Verbatim mirror of MAPPABLE_PREQUAL_KINDS in BusinessTenderForm.tsx.
const MAPPABLE_PREQUAL_LABELS: Record<string, string> = {
  public_liability: "Public liability insurance",
  employers_liability: "Employers' liability insurance",
  trade_cert: "Trade certification",
  induction: "Site induction",
  nda: "NDA",
  terms: "Terms accepted",
};

function prequalLabel(kind: string, detail: { text?: string } | null): string {
  return MAPPABLE_PREQUAL_LABELS[kind] ?? detail?.text ?? "Other requirement";
}

interface WinnerInfo {
  contractorName: string;
}

export function BusinessTenderDetail() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tenderId = searchParams.get("tender");
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [tender, setTender] = useState<TenderDetailRow | null>(null);
  const [sites, setSites] = useState<SiteInfo[]>([]);
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [responseRequirements, setResponseRequirements] = useState<ResponseRequirement[]>([]);
  const [prequalRequirements, setPrequalRequirements] = useState<PrequalRequirement[]>([]);
  const [slaRule, setSlaRule] = useState<SlaRuleInfo | null>(null);
  const [invitedCount, setInvitedCount] = useState<number | null>(null);
  const [receivedCount, setReceivedCount] = useState<number | null>(null);
  const [winner, setWinner] = useState<WinnerInfo | null>(null);

  const backToTenders = () => navigate("/dashboard/business?view=tenders");

  const load = useCallback(async () => {
    if (!tenderId) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const { data: tenderRow } = await supabase
      .from("tenders")
      .select(
        "id, tender_number, title, tender_type, status, bid_visibility, distribution, response_deadline, scope_description, site_visit_required, sla_rule_set_id, company_id, published_at, closed_at, awarded_at, cancelled_reason",
      )
      .eq("id", tenderId)
      .maybeSingle();

    if (!tenderRow) {
      setTender(null);
      setLoading(false);
      return;
    }
    setTender(tenderRow);

    const [
      { data: siteLinks },
      { data: docRows },
      { data: responseReqs },
      { data: prequalReqs },
      { data: slaRow },
      { data: invitations },
      { data: count },
    ] = await Promise.all([
      supabase.from("tender_sites").select("site_id").eq("tender_id", tenderId),
      supabase.from("tender_documents").select("id, file_path, label").eq("tender_id", tenderId),
      supabase.from("tender_response_requirements").select("kind, config").eq("tender_id", tenderId),
      supabase.from("tender_prequal_requirements").select("id, kind, detail, mandatory").eq("tender_id", tenderId),
      tenderRow.sla_rule_set_id
        ? supabase.from("sla_rules").select("name, priority, response_hours, resolution_hours, attendance_hours, business_hours_only").eq("id", tenderRow.sla_rule_set_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("tender_invitations").select("contractor_id").eq("tender_id", tenderId),
      supabase.rpc("tender_application_received_count", { p_tender_id: tenderId }),
    ]);

    setDocuments(docRows ?? []);
    setResponseRequirements((responseReqs ?? []) as ResponseRequirement[]);
    setPrequalRequirements((prequalReqs ?? []) as PrequalRequirement[]);
    setSlaRule((slaRow as SlaRuleInfo | null) ?? null);
    setInvitedCount((invitations ?? []).length);
    setReceivedCount((count as number | null) ?? null);

    const siteIds = (siteLinks ?? []).map((r) => r.site_id);
    if (siteIds.length) {
      const { data: siteRows } = await supabase.from("sites").select("id, name, city, postcode").in("id", siteIds);
      setSites(siteRows ?? []);
    } else {
      setSites([]);
    }

    // Awarded: resolve the winning contractor + whatever the acceptance
    // converted into (a J-number job for works, a term_engagement for
    // term). tender_agreements.tender_id is UNIQUE, so at most one row.
    if (tenderRow.status === "awarded") {
      const { data: agreement } = await supabase
        .from("tender_agreements")
        .select("application_id")
        .eq("tender_id", tenderId)
        .maybeSingle();

      if (agreement?.application_id) {
        const { data: application } = await supabase
          .from("tender_applications")
          .select("contractor_id")
          .eq("id", agreement.application_id)
          .maybeSingle();

        if (application?.contractor_id) {
          const { data: contractorProfile } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", application.contractor_id)
            .maybeSingle();

          setWinner({ contractorName: contractorProfile?.full_name ?? "Unknown contractor" });
        }
      }
    } else {
      setWinner(null);
    }

    setLoading(false);
  }, [tenderId]);

  useEffect(() => { load(); }, [load]);

  const handleViewDocument = async (doc: DocumentInfo) => {
    const { data, error } = await supabase.storage.from("tender-documents").createSignedUrl(doc.file_path, 300);
    if (error || !data?.signedUrl) {
      toast({ variant: "destructive", title: "Could not open document" });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const goStub = (mode: string) => navigate(`/dashboard/business?view=tenders-stub&mode=${mode}&tender=${tenderId}`);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!tenderId || !tender) {
    return (
      <div className="p-6 max-w-2xl">
        <Button variant="ghost" size="sm" onClick={backToTenders} className="gap-1 -ml-2 mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to Tenders
        </Button>
        <Card>
          <CardContent className="p-10 text-center">
            <p className="text-muted-foreground">Tender not found.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Row clicks never send a draft here (BusinessTendersView routes drafts
  // through goContinueDraft to the edit form instead) -- but RLS itself
  // doesn't restrict this query by status, so a direct URL visit to a
  // draft's id would otherwise fall through to the published-tender layout
  // below, including the state banner's unconditional else branch (the
  // lapsed-tender message) and the "essentials are locked" footer, both
  // wrong for a draft. Caught on review; guarded explicitly here instead.
  if (tender.status === "draft") {
    return (
      <div className="p-6 max-w-2xl">
        <Button variant="ghost" size="sm" onClick={backToTenders} className="gap-1 -ml-2 mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to Tenders
        </Button>
        <Card>
          <CardContent className="p-10 text-center space-y-3">
            <p className="text-muted-foreground">This tender is still a draft.</p>
            <Button onClick={() => navigate(`/dashboard/business?view=tender-form&tender=${tenderId}`)}>
              Continue editing
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const deadlineDays = tender.response_deadline ? differenceInCalendarDays(new Date(tender.response_deadline), new Date()) : null;

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <Button variant="ghost" size="sm" onClick={backToTenders} className="gap-1 -ml-2">
        <ArrowLeft className="h-4 w-4" /> Back to Tenders
      </Button>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="font-mono text-xs text-muted-foreground">{tender.tender_number}</span>
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLOUR[tender.status]}`}>
            {STATUS_LABEL[tender.status]}
          </span>
          <Badge variant="outline" className="text-xs">{TYPE_LABEL[tender.tender_type]}</Badge>
          <Badge variant="outline" className="text-xs">{tender.bid_visibility === "sealed" ? "Sealed bidding" : "Open bidding"}</Badge>
        </div>
        <h1 className="font-heading text-2xl font-bold">{tender.title}</h1>
        <div className="flex items-center gap-3 text-sm text-muted-foreground mt-1">
          {tender.published_at && <span>Published {format(new Date(tender.published_at), "d MMM yyyy")}</span>}
          {tender.response_deadline && (
            <span className={deadlineDays !== null && deadlineDays <= 3 && deadlineDays >= 0 ? "text-red-600 font-medium" : ""}>
              {deadlineDays !== null && deadlineDays > 0
                ? `Closes ${format(new Date(tender.response_deadline), "d MMM yyyy")} · ${deadlineDays} day${deadlineDays === 1 ? "" : "s"} left`
                : deadlineDays === 0
                  ? "Closes today"
                  : `Deadline was ${format(new Date(tender.response_deadline), "d MMM yyyy")}`}
            </span>
          )}
        </div>
      </div>

      {/* State banner */}
      <Card
        style={
          tender.status === "awarded"
            ? { borderColor: "#15803d", borderWidth: 2 }
            : tender.status === "unsealed"
              ? { borderColor: "#7c3aed", borderWidth: 2 }
              : undefined
        }
      >
        <CardContent className="p-4">
          {tender.status === "awarded" ? (
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
              <div>
                <p className="text-sm font-medium">
                  Awarded to {winner?.contractorName ?? "…"}
                  {tender.awarded_at && ` on ${format(new Date(tender.awarded_at), "d MMM yyyy")}`}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {tender.tender_type === "term"
                    ? "A term engagement has been created for this award."
                    : "A job has been created for this award."}
                </p>
              </div>
              <Button size="sm" variant="outline" className="ml-auto shrink-0" onClick={() => navigate("/dashboard/business?view=jobs")}>
                {tender.tender_type === "term" ? "View jobs" : "View job"}
              </Button>
            </div>
          ) : tender.status === "unsealed" ? (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <p className="text-sm font-medium">
                Ready to compare — {receivedCount ?? 0} bid{(receivedCount ?? 0) === 1 ? "" : "s"} unsealed.
              </p>
              <Button size="sm" onClick={() => goStub("review")}>Review bids</Button>
            </div>
          ) : tender.status === "closed" ? (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
                <p className="text-sm font-medium">
                  {tender.bid_visibility === "sealed"
                    ? `Sealed — ${receivedCount ?? 0} of ${invitedCount ?? 0} invited have responded.`
                    : `${receivedCount ?? 0} response${(receivedCount ?? 0) === 1 ? "" : "s"} received.`}
                  {" "}Response window closed.
                </p>
              </div>
              <Button size="sm" onClick={() => goStub("unseal")}>Unseal bids</Button>
            </div>
          ) : tender.status === "published" ? (
            <div className="flex items-center gap-2">
              {tender.bid_visibility === "sealed" && <Lock className="h-4 w-4 text-muted-foreground shrink-0" />}
              <p className="text-sm font-medium">
                {tender.bid_visibility === "sealed"
                  ? `Sealed — ${receivedCount ?? 0} of ${invitedCount ?? 0} invited have responded. Bids stay hidden until the response deadline.`
                  : `${receivedCount ?? 0} response${(receivedCount ?? 0) === 1 ? "" : "s"} so far.`}
              </p>
            </div>
          ) : tender.status === "cancelled" ? (
            <p className="text-sm text-muted-foreground">
              Cancelled{tender.cancelled_reason ? `: ${tender.cancelled_reason}` : "."}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">No bids were received before the deadline.</p>
          )}
        </CardContent>
      </Card>

      {/* Scope */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Scope of works</CardTitle>
        </CardHeader>
        <CardContent>
          {tender.scope_description ? (
            <p className="font-serif text-sm whitespace-pre-wrap leading-relaxed">{tender.scope_description}</p>
          ) : (
            <p className="text-sm text-muted-foreground">No scope description provided.</p>
          )}
        </CardContent>
      </Card>

      {/* Documents */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Documents {documents.length > 0 && `(${documents.length})`}</CardTitle>
        </CardHeader>
        <CardContent>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No documents attached.</p>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <button
                  key={doc.id}
                  type="button"
                  className="flex items-center gap-2 text-sm text-blue-600 hover:underline"
                  onClick={() => handleViewDocument(doc)}
                >
                  <FileText className="h-3.5 w-3.5 shrink-0" />
                  {doc.label ?? doc.file_path}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* What contractors must submit */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">What contractors must submit</CardTitle>
        </CardHeader>
        <CardContent>
          {responseRequirements.length === 0 ? (
            <p className="text-sm text-muted-foreground">No specific requirements listed.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {responseRequirements.map((r) => (
                <Badge key={r.kind} variant="outline" className="text-xs">
                  {RESPONSE_KIND_LABELS[r.kind] ?? r.kind}
                  {r.kind === "references" && r.config?.count ? ` (${r.config.count})` : ""}
                  {r.kind === "pricing_schedule" && r.config?.rows ? ` (${r.config.rows.length} line items)` : ""}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Prequalification requirements */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            Prequalification requirements
            {prequalRequirements.length > 0 && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">({prequalRequirements.length})</span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {prequalRequirements.length === 0 ? (
            <p className="text-sm text-muted-foreground">None set.</p>
          ) : (
            <div className="space-y-2">
              {prequalRequirements.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 border border-border rounded-md p-2.5">
                  <p className="text-sm font-medium">{prequalLabel(r.kind, r.detail)}</p>
                  <Badge
                    variant="outline"
                    className={`text-xs shrink-0 ${r.mandatory ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}
                  >
                    {r.mandatory ? "Mandatory" : "Preferred"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* SLA & sites */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">SLA &amp; coverage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {slaRule ? (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">SLA rule</p>
                <p className="font-medium">{slaRule.name} ({slaRule.priority.toUpperCase()})</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Response / resolution</p>
                <p className="font-medium">{slaRule.response_hours}h / {slaRule.resolution_hours}h</p>
              </div>
              {slaRule.attendance_hours != null && (
                <div>
                  <p className="text-xs text-muted-foreground">Attendance</p>
                  <p className="font-medium">{slaRule.attendance_hours}h</p>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground">Hours</p>
                <p className="font-medium">{slaRule.business_hours_only ? "Business hours only" : "24/7"}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No SLA expectations specified.</p>
          )}

          <div>
            <p className="text-xs text-muted-foreground mb-1">Sites {sites.length > 0 && `(${sites.length})`}</p>
            {sites.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sites listed.</p>
            ) : (
              <ul className="text-sm space-y-0.5">
                {sites.map((s) => (
                  <li key={s.id}>{s.name}{s.city ? ` — ${s.city}` : ""} {s.postcode}</li>
                ))}
              </ul>
            )}
            {tender.site_visit_required && (
              <p className="text-xs text-amber-700 mt-1.5">Site visit required before bidding.</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Distribution */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm">
            {tender.distribution === "invite"
              ? `Invite-only — ${invitedCount ?? 0} contractor${(invitedCount ?? 0) === 1 ? "" : "s"} invited.`
              : "Open to all contractors on the platform."}
          </p>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground pt-2 border-t">
        Essentials (title, type, trade, sites, deadline) are locked once published — issue an addendum to make changes
        (coming in a later slice).
      </p>
    </div>
  );
}
