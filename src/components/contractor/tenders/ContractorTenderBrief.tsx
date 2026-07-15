import { useState, useEffect, useCallback, useRef } from "react";
import { differenceInCalendarDays, format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, FileText, ArrowLeft, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";

interface Props {
  profileId: string;
  tenderId: string;
  onBack: () => void;
  onStub: (mode: "ask" | "decline" | "apply") => void;
}

interface TenderDetail {
  id: string;
  tender_number: string;
  title: string;
  tender_type: "works" | "term";
  status: string;
  bid_visibility: "sealed" | "open";
  distribution: "invite" | "open";
  response_deadline: string | null;
  scope_description: string | null;
  site_visit_required: boolean;
  sla_rule_set_id: string | null;
  company_id: string;
}

interface CompanyInfo {
  name: string;
  logo_url: string | null;
}

interface SlaRuleInfo {
  name: string;
  priority: string;
  response_hours: number;
  resolution_hours: number;
  attendance_hours: number | null;
  business_hours_only: boolean;
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
  config: { count?: number } | null;
}

interface PrequalRequirement {
  id: string;
  kind: string;
  detail: { text?: string } | null;
  mandatory: boolean;
}

interface InvitationInfo {
  id: string;
  status: string;
}

interface ApplicationInfo {
  id: string;
  status: string;
}

// Verbatim mirror of RESPONSE_KIND_OPTIONS in BusinessTenderForm.tsx --
// same seven values tender_response_requirements_kind_check permits
// ('pricing' renamed to 'pricing_schedule' in 20260713130000). Kept
// duplicated rather than shared: it's a small, stable, DB-constrained list,
// and the two components live in different dashboards with no existing
// shared-constants file between them.
const RESPONSE_KIND_LABELS: Record<string, string> = {
  pricing_schedule: "Pricing schedule",
  references: "References",
  methodology: "Methodology statement",
  programme: "Programme",
  subcontracting: "Subcontracting declaration",
  declarations: "Declarations",
  rams: "RAMS",
};

type PrequalRecordFields = {
  public_liability_verified: boolean;
  public_liability_expiry: string | null;
  employers_liability_verified: boolean;
  employers_liability_expiry: string | null;
  trade_cert_verified: boolean;
  trade_cert_expiry: string | null;
  site_induction_complete: boolean;
  nda_signed: boolean | null;
  terms_accepted: boolean;
};

// Mirrors MAPPABLE_PREQUAL_KINDS in BusinessTenderForm.tsx -- the six kinds
// the RED-block (submit_tender_application) actually checks against
// panel_prequalification. Any other kind is "not verifiable", never red.
const MAPPABLE_PREQUAL_KINDS: Record<
  string,
  { label: string; verifiedField: keyof PrequalRecordFields; expiryField: keyof PrequalRecordFields | null }
> = {
  public_liability: { label: "Public liability insurance", verifiedField: "public_liability_verified", expiryField: "public_liability_expiry" },
  employers_liability: { label: "Employers' liability insurance", verifiedField: "employers_liability_verified", expiryField: "employers_liability_expiry" },
  trade_cert: { label: "Trade certification", verifiedField: "trade_cert_verified", expiryField: "trade_cert_expiry" },
  induction: { label: "Site induction", verifiedField: "site_induction_complete", expiryField: null },
  nda: { label: "NDA", verifiedField: "nda_signed", expiryField: null },
  terms: { label: "Terms accepted", verifiedField: "terms_accepted", expiryField: null },
};

const EXPIRY_WARNING_DAYS = 60;

type RagLevel = "green" | "amber" | "red";

interface RagItem {
  key: string;
  label: string;
  level: RagLevel;
  reason: string;
  mandatory: boolean;
}

const RAG_STYLES: Record<RagLevel, { badge: string; icon: JSX.Element }> = {
  green: { badge: "bg-green-100 text-green-800 border-green-200", icon: <CheckCircle2 className="h-4 w-4 text-green-600" /> },
  amber: { badge: "bg-amber-100 text-amber-800 border-amber-200", icon: <AlertTriangle className="h-4 w-4 text-amber-600" /> },
  red: { badge: "bg-red-100 text-red-800 border-red-200", icon: <XCircle className="h-4 w-4 text-red-600" /> },
};

function ragForRequirement(req: PrequalRequirement, record: PrequalRecordFields | null): RagItem {
  const mapping = MAPPABLE_PREQUAL_KINDS[req.kind];

  if (!mapping) {
    return {
      key: req.id,
      label: (req.detail as { text?: string } | null)?.text || "Other requirement",
      level: "amber",
      reason: "Not verifiable automatically — checked manually by the business.",
      mandatory: req.mandatory,
    };
  }

  if (!record) {
    return {
      key: req.id,
      label: mapping.label,
      level: req.mandatory ? "red" : "amber",
      reason: "No record on file with this business yet.",
      mandatory: req.mandatory,
    };
  }

  const verified = Boolean(record[mapping.verifiedField]);
  if (!verified) {
    return {
      key: req.id,
      label: mapping.label,
      level: req.mandatory ? "red" : "amber",
      reason: "Not yet verified.",
      mandatory: req.mandatory,
    };
  }

  const expiry = mapping.expiryField ? record[mapping.expiryField] : null;
  if (expiry) {
    const daysLeft = differenceInCalendarDays(new Date(expiry), new Date());
    if (daysLeft < 0) {
      return {
        key: req.id,
        label: mapping.label,
        level: req.mandatory ? "red" : "amber",
        reason: `Expired ${format(new Date(expiry), "d MMM yyyy")}.`,
        mandatory: req.mandatory,
      };
    }
    if (daysLeft <= EXPIRY_WARNING_DAYS) {
      return {
        key: req.id,
        label: mapping.label,
        level: "amber",
        reason: `Expires ${format(new Date(expiry), "d MMM yyyy")}.`,
        mandatory: req.mandatory,
      };
    }
  }

  return {
    key: req.id,
    label: mapping.label,
    level: "green",
    reason: expiry ? `Valid to ${format(new Date(expiry), "d MMM yyyy")}.` : "Verified.",
    mandatory: req.mandatory,
  };
}

export function ContractorTenderBrief({ profileId, tenderId, onBack, onStub }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [tender, setTender] = useState<TenderDetail | null>(null);
  const [company, setCompany] = useState<CompanyInfo | null>(null);
  const [slaRule, setSlaRule] = useState<SlaRuleInfo | null>(null);
  const [sites, setSites] = useState<SiteInfo[]>([]);
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [responseRequirements, setResponseRequirements] = useState<ResponseRequirement[]>([]);
  const [prequalRequirements, setPrequalRequirements] = useState<PrequalRequirement[]>([]);
  const [prequalRecord, setPrequalRecord] = useState<PrequalRecordFields | null>(null);
  const [invitation, setInvitation] = useState<InvitationInfo | null>(null);
  const [application, setApplication] = useState<ApplicationInfo | null>(null);

  const viewedMarked = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);

    const { data: tenderRow } = await supabase
      .from("tenders")
      .select("id, tender_number, title, tender_type, status, bid_visibility, distribution, response_deadline, scope_description, site_visit_required, sla_rule_set_id, company_id")
      .eq("id", tenderId)
      .maybeSingle();

    if (!tenderRow) {
      setTender(null);
      setLoading(false);
      return;
    }
    setTender(tenderRow);

    const [
      { data: companyRow },
      { data: slaRow },
      { data: siteLinks },
      { data: docRows },
      { data: responseReqs },
      { data: prequalReqs },
      { data: invitationRow },
      { data: applicationRow },
    ] = await Promise.all([
      supabase.from("companies").select("name, logo_url").eq("id", tenderRow.company_id).maybeSingle(),
      tenderRow.sla_rule_set_id
        ? supabase.from("sla_rules").select("name, priority, response_hours, resolution_hours, attendance_hours, business_hours_only").eq("id", tenderRow.sla_rule_set_id).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from("tender_sites").select("site_id").eq("tender_id", tenderId),
      supabase.from("tender_documents").select("id, file_path, label").eq("tender_id", tenderId),
      supabase.from("tender_response_requirements").select("kind, config").eq("tender_id", tenderId),
      supabase.from("tender_prequal_requirements").select("id, kind, detail, mandatory").eq("tender_id", tenderId),
      supabase.from("tender_invitations").select("id, status").eq("tender_id", tenderId).eq("contractor_id", profileId).maybeSingle(),
      supabase.from("tender_applications").select("id, status").eq("tender_id", tenderId).eq("contractor_id", profileId).maybeSingle(),
    ]);

    setCompany(companyRow ?? null);
    setSlaRule((slaRow as SlaRuleInfo | null) ?? null);
    setDocuments(docRows ?? []);
    setResponseRequirements((responseReqs ?? []) as ResponseRequirement[]);
    setPrequalRequirements((prequalReqs ?? []) as PrequalRequirement[]);
    setInvitation(invitationRow ?? null);
    setApplication(applicationRow ?? null);

    const siteIds = (siteLinks ?? []).map((r) => r.site_id);
    if (siteIds.length) {
      const { data: siteRows } = await supabase.from("sites").select("id, name, city, postcode").in("id", siteIds);
      setSites(siteRows ?? []);
    } else {
      setSites([]);
    }

    const { data: prequalRow } = await supabase
      .from("panel_prequalification")
      .select("public_liability_verified, public_liability_expiry, employers_liability_verified, employers_liability_expiry, trade_cert_verified, trade_cert_expiry, site_induction_complete, nda_signed, terms_accepted")
      .eq("contractor_id", profileId)
      .eq("company_id", tenderRow.company_id)
      .maybeSingle();
    setPrequalRecord(prequalRow ?? null);

    setLoading(false);
  }, [tenderId, profileId]);

  useEffect(() => { load(); }, [load]);

  // Mark viewed once per brief open, only once an invitation row is
  // actually loaded (open-distribution applications with no invitation
  // have nothing to stamp). mark_tender_invitation_viewed() is idempotent
  // (COALESCE on viewed_at, status only advances from 'invited'), so this
  // is safe even if the effect re-fires.
  useEffect(() => {
    if (!invitation || viewedMarked.current) return;
    viewedMarked.current = true;
    supabase.rpc("mark_tender_invitation_viewed", { p_invitation_id: invitation.id }).then(({ error }) => {
      if (error) console.warn("mark_tender_invitation_viewed:", error.message);
    });
  }, [invitation]);

  const handleViewDocument = async (doc: DocumentInfo) => {
    const { data, error } = await supabase.storage.from("tender-documents").createSignedUrl(doc.file_path, 300);
    if (error || !data?.signedUrl) {
      toast({ variant: "destructive", title: "Could not open document" });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!tender) {
    return (
      <div className="p-6 max-w-2xl">
        <Button variant="ghost" size="sm" onClick={onBack} className="gap-1 -ml-2 mb-4">
          <ArrowLeft className="h-4 w-4" /> Back to Tenders
        </Button>
        <Card>
          <CardContent className="p-10 text-center">
            <p className="text-muted-foreground">
              This tender isn't available — it may have been withdrawn or you no longer have access to it.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const ragItems = prequalRequirements.map((r) => ragForRequirement(r, prequalRecord));
  const blockingItems = ragItems.filter((r) => r.level === "red" && r.mandatory);
  const cautionItems = ragItems.filter((r) => r.level === "amber");
  const clearToBid = blockingItems.length === 0;

  const deadlineDays = tender.response_deadline ? differenceInCalendarDays(new Date(tender.response_deadline), new Date()) : null;

  const alreadyDeclined = invitation?.status === "declined";
  const isPublished = tender.status === "published";
  const canDecline = isPublished && invitation && !alreadyDeclined && !application;
  const canAsk = isPublished;
  const canApply = isPublished && !alreadyDeclined;
  const applyLabel = application ? (application.status === "draft" ? "Continue application" : "View application") : "Start application";

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <Button variant="ghost" size="sm" onClick={onBack} className="gap-1 -ml-2">
        <ArrowLeft className="h-4 w-4" /> Back to Tenders
      </Button>

      {/* Header + countdown */}
      <div>
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="font-mono text-xs text-muted-foreground">{tender.tender_number}</span>
          <Badge variant="outline" className="text-xs">{tender.tender_type === "works" ? "Works" : "Term"}</Badge>
          <Badge variant="outline" className="text-xs">{tender.bid_visibility === "sealed" ? "Sealed bidding" : "Open bidding"}</Badge>
        </div>
        <h1 className="font-heading text-2xl font-bold">{tender.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{company?.name ?? "Unknown business"}</p>

        {tender.response_deadline && (
          <p className={`text-sm mt-2 font-medium ${deadlineDays !== null && deadlineDays <= 3 ? "text-red-600" : "text-muted-foreground"}`}>
            {deadlineDays !== null && deadlineDays > 0
              ? `Closes ${format(new Date(tender.response_deadline), "d MMM yyyy")} · ${deadlineDays} day${deadlineDays === 1 ? "" : "s"} remaining`
              : deadlineDays === 0
                ? "Closes today"
                : `Closed ${format(new Date(tender.response_deadline), "d MMM yyyy")}`}
          </p>
        )}
      </div>

      {/* RAG banner */}
      {prequalRequirements.length > 0 && (
        <Card style={{ borderColor: clearToBid ? "#15803d" : "#dc2626", borderWidth: 2 }}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              {clearToBid ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
              {clearToBid ? "You're clear to bid" : "Not yet eligible to bid"}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {clearToBid
                ? cautionItems.length > 0
                  ? `Clear to submit — ${cautionItems.length} item${cautionItems.length === 1 ? "" : "s"} worth reviewing below.`
                  : "All prequalification requirements are met."
                : `${blockingItems.length} mandatory requirement${blockingItems.length === 1 ? "" : "s"} must be resolved before you can submit.`}
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {ragItems.map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-3 border rounded-md p-3">
                <div className="flex items-center gap-2 min-w-0">
                  {RAG_STYLES[item.level].icon}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {item.label}
                      {item.mandatory && <span className="text-xs text-muted-foreground ml-1.5">(mandatory)</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">{item.reason}</p>
                  </div>
                </div>
                <Badge variant="outline" className={`text-xs shrink-0 ${RAG_STYLES[item.level].badge}`}>
                  {item.level === "green" ? "Verified" : item.level === "amber" ? "Review" : "Blocked"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* SLA & coverage facts */}
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
            <p className="text-sm text-muted-foreground">No SLA expectations specified for this tender.</p>
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

      {/* Your application will need */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Your application will need</CardTitle>
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
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action row */}
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t">
        {!isPublished ? (
          <p className="text-sm text-muted-foreground py-2">
            {tender.status === "awarded" ? "This tender has been awarded." : "Bidding is no longer open for this tender."}
          </p>
        ) : (
          <>
            {alreadyDeclined && <p className="text-sm text-muted-foreground py-2">You declined this invitation.</p>}
            {canAsk && (
              <Button variant="outline" onClick={() => onStub("ask")}>Ask a question</Button>
            )}
            {canDecline && (
              <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => onStub("decline")}>
                Decline
              </Button>
            )}
            {canApply && (
              <Button onClick={() => onStub("apply")}>{applyLabel}</Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
