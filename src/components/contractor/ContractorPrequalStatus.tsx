import { useState, useEffect, useCallback } from "react";
import { differenceInDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Loader2, Building2, ChevronDown, CheckCircle2, AlertTriangle, Upload } from "lucide-react";

// contractor_panel.prequal_status constraint: 'not_started' | 'in_progress' | 'approved' | 'lapsed'
const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  not_started: { label: "Not started", className: "bg-gray-100 text-gray-700 border-gray-200" },
  in_progress: { label: "In progress", className: "bg-amber-100 text-amber-800 border-amber-200" },
  approved:    { label: "Approved",    className: "bg-green-100 text-green-800 border-green-200" },
  lapsed:      { label: "Lapsed",      className: "bg-red-100 text-red-800 border-red-200" },
};

const EXPIRY_WARNING_DAYS = 60;

interface ChecklistItem {
  key: string;
  label: string;
  verifiedField: keyof PrequalRecord;
  expiryField: (keyof PrequalRecord) | null;
  documentType: string;
  optional?: boolean;
}

const CHECKLIST_ITEMS: ChecklistItem[] = [
  { key: "public_liability",    label: "Public liability insurance",    verifiedField: "public_liability_verified",    expiryField: "public_liability_expiry",    documentType: "public_liability" },
  { key: "employers_liability", label: "Employers liability insurance", verifiedField: "employers_liability_verified", expiryField: "employers_liability_expiry", documentType: "employers_liability" },
  { key: "trade_cert",          label: "Trade certification",           verifiedField: "trade_cert_verified",          expiryField: "trade_cert_expiry",           documentType: "trade_cert" },
  { key: "site_induction",      label: "Site induction",                verifiedField: "site_induction_complete",      expiryField: null,                          documentType: "induction" },
  { key: "nda",                 label: "NDA signed",                    verifiedField: "nda_signed",                   expiryField: null,                          documentType: "nda", optional: true },
  { key: "terms",               label: "Terms accepted",                verifiedField: "terms_accepted",               expiryField: null,                          documentType: "terms" },
];

interface PrequalRecord {
  id: string;
  company_id: string;
  contractor_id: string;
  public_liability_verified: boolean;
  public_liability_expiry: string | null;
  employers_liability_verified: boolean;
  employers_liability_expiry: string | null;
  trade_cert_verified: boolean;
  trade_cert_expiry: string | null;
  site_induction_complete: boolean;
  nda_signed: boolean | null;
  terms_accepted: boolean;
  overall_status: string;
}

interface PrequalDocument {
  id: string;
  document_type: string;
  file_name: string;
}

interface CompanyPanelEntry {
  panel_id: string;
  company_id: string;
  company_name: string;
  company_logo: string | null;
  prequal_status: string;
  record: PrequalRecord | null;
  documents: PrequalDocument[];
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

interface Props {
  profileId: string;
}

export function ContractorPrequalStatus({ profileId }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<CompanyPanelEntry[]>([]);
  const [expandedApproved, setExpandedApproved] = useState<Record<string, boolean>>({});
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);

    const { data: panelRows } = await supabase
      .from("contractor_panel")
      .select("id, company_id, prequal_status")
      .eq("contractor_id", profileId);

    const rows = (panelRows ?? []).filter((r) => r.company_id);
    if (!rows.length) {
      setEntries([]);
      setLoading(false);
      return;
    }

    const companyIds = rows.map((r) => r.company_id as string);

    const { data: companyRows } = await supabase
      .from("companies")
      .select("id, name, logo_url")
      .in("id", companyIds);

    const { data: prequalRows } = await supabase
      .from("panel_prequalification")
      .select("*")
      .eq("contractor_id", profileId)
      .in("company_id", companyIds);

    const prequalIds = (prequalRows ?? []).map((r: PrequalRecord) => r.id);
    const { data: docRows } = prequalIds.length
      ? await supabase
          .from("prequalification_documents")
          .select("id, document_type, file_name, prequal_id")
          .in("prequal_id", prequalIds)
      : { data: [] };

    const hydrated: CompanyPanelEntry[] = rows.map((row) => {
      const company = (companyRows ?? []).find((c) => c.id === row.company_id);
      const record = (prequalRows ?? []).find(
        (r: PrequalRecord) => r.company_id === row.company_id,
      ) as PrequalRecord | undefined;
      const documents = record
        ? (docRows ?? []).filter((d: PrequalDocument & { prequal_id: string }) => d.prequal_id === record.id)
        : [];

      return {
        panel_id: row.id,
        company_id: row.company_id as string,
        company_name: company?.name ?? "Unknown company",
        company_logo: company?.logo_url ?? null,
        prequal_status: row.prequal_status ?? "not_started",
        record: record ?? null,
        documents,
      };
    });

    setEntries(hydrated);
    setLoading(false);
  }, [profileId]);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async (entry: CompanyPanelEntry, item: ChecklistItem, file: File) => {
    if (!entry.record) return;
    const uploadKey = `${entry.company_id}-${item.key}`;
    setUploadingKey(uploadKey);
    try {
      const path = `${entry.record.id}/${item.documentType}/${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("prequal-documents")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase
        .from("prequalification_documents")
        .insert({
          prequal_id: entry.record.id,
          document_type: item.documentType,
          file_url: path,
          file_name: file.name,
          uploaded_by: profileId,
        });
      if (insertError) throw insertError;

      toast({ title: "Document uploaded", description: "Awaiting verification by your client." });
      await load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ variant: "destructive", title: "Upload failed", description: msg });
    } finally {
      setUploadingKey(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div>
        <h2 className="font-heading text-2xl font-bold">Panel compliance</h2>
        <p className="text-muted-foreground text-sm mt-1">Documents required by your clients</p>
      </div>

      {entries.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <Building2 className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="font-medium mt-3 mb-1">Not on any client panels yet</p>
            <p className="text-sm text-muted-foreground">
              When a business adds you to their contractor panel, any prequalification requirements will appear here.
            </p>
          </CardContent>
        </Card>
      ) : (
        entries.map((entry) => {
          const status = STATUS_CONFIG[entry.prequal_status] ?? STATUS_CONFIG.not_started;
          const record = entry.record;

          const outstanding: ChecklistItem[] = [];
          const expiring: { item: ChecklistItem; expiry: string }[] = [];
          const approved: { item: ChecklistItem; expiry: string | null }[] = [];

          if (record) {
            for (const item of CHECKLIST_ITEMS) {
              if (item.optional && record.nda_signed === null) continue;
              const verified = Boolean(record[item.verifiedField]);
              const expiry = item.expiryField ? (record[item.expiryField] as string | null) : null;

              if (!verified) {
                outstanding.push(item);
                continue;
              }
              if (expiry && differenceInDays(new Date(expiry), new Date()) <= EXPIRY_WARNING_DAYS) {
                expiring.push({ item, expiry });
                continue;
              }
              approved.push({ item, expiry });
            }
          }

          const isApprovedExpanded = expandedApproved[entry.panel_id] ?? false;

          return (
            <Card key={entry.panel_id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {entry.company_logo ? (
                      <img
                        src={entry.company_logo}
                        alt={entry.company_name}
                        className="h-10 w-10 rounded-lg object-contain border shrink-0 bg-white"
                      />
                    ) : (
                      <div
                        className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0 text-sm font-semibold"
                        style={{ background: "#1e3a5f", color: "#fff" }}
                      >
                        {initials(entry.company_name)}
                      </div>
                    )}
                    <CardTitle className="text-base truncate">{entry.company_name}</CardTitle>
                  </div>
                  <Badge variant="outline" className={`text-xs shrink-0 ${status.className}`}>
                    {status.label}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {!record ? (
                  <p className="text-sm text-muted-foreground">
                    This client hasn't started a prequalification checklist for you yet.
                  </p>
                ) : (
                  <>
                    {outstanding.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Outstanding
                        </p>
                        {outstanding.map((item) => {
                          const uploadKey = `${entry.company_id}-${item.key}`;
                          const hasDoc = entry.documents.some((d) => d.document_type === item.documentType);
                          return (
                            <div
                              key={item.key}
                              className="flex items-center justify-between gap-3 border rounded-md p-3"
                            >
                              <div>
                                <p className="text-sm font-medium">{item.label}</p>
                                {hasDoc && (
                                  <p className="text-xs text-amber-700 mt-0.5">Awaiting verification</p>
                                )}
                              </div>
                              <label className="shrink-0">
                                <input
                                  type="file"
                                  className="hidden"
                                  disabled={uploadingKey === uploadKey}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleUpload(entry, item, file);
                                    e.target.value = "";
                                  }}
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 text-xs"
                                  disabled={uploadingKey === uploadKey}
                                  onClick={(e) => {
                                    (e.currentTarget.previousSibling as HTMLInputElement)?.click();
                                  }}
                                >
                                  {uploadingKey === uploadKey ? (
                                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                  ) : (
                                    <Upload className="h-3 w-3 mr-1" />
                                  )}
                                  {hasDoc ? "Replace" : "Upload"}
                                </Button>
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {expiring.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-amber-700 uppercase tracking-wide flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Expiring soon
                        </p>
                        {expiring.map(({ item, expiry }) => {
                          const uploadKey = `${entry.company_id}-${item.key}`;
                          const days = differenceInDays(new Date(expiry), new Date());
                          return (
                            <div
                              key={item.key}
                              className="flex items-center justify-between gap-3 border border-amber-200 bg-amber-50 rounded-md p-3"
                            >
                              <div>
                                <p className="text-sm font-medium">{item.label}</p>
                                <p className="text-xs text-amber-700 mt-0.5">
                                  {days < 0 ? `Expired ${fmtDate(expiry)}` : `Expires ${fmtDate(expiry)}`}
                                </p>
                              </div>
                              <label className="shrink-0">
                                <input
                                  type="file"
                                  className="hidden"
                                  disabled={uploadingKey === uploadKey}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleUpload(entry, item, file);
                                    e.target.value = "";
                                  }}
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 text-xs"
                                  disabled={uploadingKey === uploadKey}
                                  onClick={(e) => {
                                    (e.currentTarget.previousSibling as HTMLInputElement)?.click();
                                  }}
                                >
                                  {uploadingKey === uploadKey ? (
                                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                  ) : (
                                    <Upload className="h-3 w-3 mr-1" />
                                  )}
                                  Renew
                                </Button>
                              </label>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {approved.length > 0 && (
                      <Collapsible
                        open={isApprovedExpanded}
                        onOpenChange={(open) =>
                          setExpandedApproved((prev) => ({ ...prev, [entry.panel_id]: open }))
                        }
                      >
                        <CollapsibleTrigger asChild>
                          <button
                            type="button"
                            className="flex items-center gap-1 text-xs font-medium text-green-700 uppercase tracking-wide"
                          >
                            <ChevronDown
                              className={`h-3 w-3 transition-transform ${isApprovedExpanded ? "rotate-180" : ""}`}
                            />
                            Approved ({approved.length})
                          </button>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-2 mt-2">
                          {approved.map(({ item, expiry }) => (
                            <div
                              key={item.key}
                              className="flex items-center justify-between gap-3 border rounded-md p-3"
                            >
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 text-green-600" />
                                <p className="text-sm font-medium">{item.label}</p>
                              </div>
                              {expiry && (
                                <p className="text-xs text-muted-foreground">Valid to {fmtDate(expiry)}</p>
                              )}
                            </div>
                          ))}
                        </CollapsibleContent>
                      </Collapsible>
                    )}

                    {outstanding.length === 0 && expiring.length === 0 && approved.length === 0 && (
                      <p className="text-sm text-muted-foreground">No checklist items recorded yet.</p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
