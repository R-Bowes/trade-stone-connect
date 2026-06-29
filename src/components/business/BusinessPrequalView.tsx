import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";

// contractor_panel.prequal_status constraint: 'not_started' | 'in_progress' | 'approved' | 'lapsed'
const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  not_started: { label: "Not started", className: "bg-gray-100 text-gray-700 border-gray-200" },
  in_progress: { label: "In progress", className: "bg-amber-100 text-amber-800 border-amber-200" },
  approved:    { label: "Approved",    className: "bg-green-100 text-green-800 border-green-200" },
  lapsed:      { label: "Lapsed",      className: "bg-red-100 text-red-800 border-red-200" },
};

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

interface PanelContractor {
  panel_id: string;
  contractor_id: string;
  contractor_name: string;
  contractor_trades: string[] | null;
  prequal_status: string;
}

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
  reviewed_by: string | null;
  reviewed_at: string | null;
}

interface PrequalDocument {
  id: string;
  document_type: string;
  file_url: string;
  file_name: string;
}

interface Props {
  companyId: string;
  profileId: string;
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

function emptyRecord(companyId: string, contractorId: string): PrequalRecord {
  return {
    id: "",
    company_id: companyId,
    contractor_id: contractorId,
    public_liability_verified: false,
    public_liability_expiry: null,
    employers_liability_verified: false,
    employers_liability_expiry: null,
    trade_cert_verified: false,
    trade_cert_expiry: null,
    site_induction_complete: false,
    nda_signed: null,
    terms_accepted: false,
    overall_status: "pending",
    reviewed_by: null,
    reviewed_at: null,
  };
}

export function BusinessPrequalView({ companyId, profileId }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [contractors, setContractors] = useState<PanelContractor[]>([]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeContractor, setActiveContractor] = useState<PanelContractor | null>(null);
  const [record, setRecord] = useState<PrequalRecord | null>(null);
  const [documents, setDocuments] = useState<PrequalDocument[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);

  const loadContractors = useCallback(async () => {
    setLoading(true);
    const { data: panelRows } = await supabase
      .from("contractor_panel")
      .select("id, contractor_id, prequal_status")
      .eq("company_id", companyId);

    const ids = (panelRows ?? []).map((r) => r.contractor_id as string).filter(Boolean);
    if (!ids.length) {
      setContractors([]);
      setLoading(false);
      return;
    }

    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id, full_name, trades")
      .in("id", ids);

    const hydrated: PanelContractor[] = (panelRows ?? [])
      .filter((r) => r.contractor_id)
      .map((r) => {
        const p = (profileRows ?? []).find((row) => row.id === r.contractor_id);
        return {
          panel_id: r.id,
          contractor_id: r.contractor_id as string,
          contractor_name: p?.full_name ?? "Unknown contractor",
          contractor_trades: p?.trades ?? null,
          prequal_status: r.prequal_status ?? "not_started",
        };
      });

    setContractors(hydrated);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { loadContractors(); }, [loadContractors]);

  const loadPrequalDetail = useCallback(async (contractor: PanelContractor) => {
    const { data: existing } = await supabase
      .from("panel_prequalification")
      .select("*")
      .eq("company_id", companyId)
      .eq("contractor_id", contractor.contractor_id)
      .maybeSingle();

    const rec = (existing as PrequalRecord) ?? emptyRecord(companyId, contractor.contractor_id);
    setRecord(rec);

    if (existing) {
      const { data: docs } = await supabase
        .from("prequalification_documents")
        .select("id, document_type, file_url, file_name")
        .eq("prequal_id", existing.id);
      setDocuments(docs ?? []);
    } else {
      setDocuments([]);
    }
  }, [companyId]);

  const openContractor = (contractor: PanelContractor) => {
    setActiveContractor(contractor);
    setRecord(null);
    setDocuments([]);
    setDrawerOpen(true);
    loadPrequalDetail(contractor);
  };

  const persistRecord = async (updates: Partial<PrequalRecord>) => {
    if (!record || !activeContractor) return null;
    setBusy(true);
    try {
      const next = { ...record, ...updates };
      const { data, error } = await supabase
        .from("panel_prequalification")
        .upsert(
          {
            id: record.id || undefined,
            company_id: next.company_id,
            contractor_id: next.contractor_id,
            public_liability_verified: next.public_liability_verified,
            public_liability_expiry: next.public_liability_expiry,
            employers_liability_verified: next.employers_liability_verified,
            employers_liability_expiry: next.employers_liability_expiry,
            trade_cert_verified: next.trade_cert_verified,
            trade_cert_expiry: next.trade_cert_expiry,
            site_induction_complete: next.site_induction_complete,
            nda_signed: next.nda_signed,
            terms_accepted: next.terms_accepted,
            overall_status: next.overall_status,
            reviewed_by: next.reviewed_by,
            reviewed_at: next.reviewed_at,
          },
          { onConflict: "company_id,contractor_id" },
        )
        .select("*")
        .single();
      if (error) throw error;

      const saved = data as PrequalRecord;
      setRecord(saved);

      const wasNew = !record.id;
      if (wasNew) {
        await supabase
          .from("contractor_panel")
          .update({ prequal_id: saved.id, prequal_status: "in_progress" })
          .eq("id", activeContractor.panel_id)
          .eq("prequal_status", "not_started");
        setContractors((prev) =>
          prev.map((c) =>
            c.panel_id === activeContractor.panel_id && c.prequal_status === "not_started"
              ? { ...c, prequal_status: "in_progress" }
              : c,
          ),
        );
      }

      return saved;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ variant: "destructive", title: "Update failed", description: msg });
      return null;
    } finally {
      setBusy(false);
    }
  };

  const handleToggleVerified = (item: ChecklistItem, checked: boolean) => {
    persistRecord({ [item.verifiedField]: checked } as Partial<PrequalRecord>);
  };

  const handleExpiryChange = (item: ChecklistItem, value: string) => {
    if (!item.expiryField) return;
    persistRecord({ [item.expiryField]: value || null } as Partial<PrequalRecord>);
  };

  const handleRequireNda = () => {
    persistRecord({ nda_signed: false });
  };

  const handleUpload = async (item: ChecklistItem, file: File) => {
    if (!record) return;
    setUploadingKey(item.key);
    try {
      let prequalId = record.id;
      if (!prequalId) {
        const saved = await persistRecord({});
        if (!saved) return;
        prequalId = saved.id;
      }

      const path = `${prequalId}/${item.documentType}/${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("prequal-documents")
        .upload(path, file, { upsert: true });
      if (uploadError) throw uploadError;

      const { error: insertError } = await supabase
        .from("prequalification_documents")
        .insert({
          prequal_id: prequalId,
          document_type: item.documentType,
          file_url: path,
          file_name: file.name,
          uploaded_by: profileId,
        });
      if (insertError) throw insertError;

      const { data: docs } = await supabase
        .from("prequalification_documents")
        .select("id, document_type, file_url, file_name")
        .eq("prequal_id", prequalId);
      setDocuments(docs ?? []);

      toast({ title: "Document uploaded" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ variant: "destructive", title: "Upload failed", description: msg });
    } finally {
      setUploadingKey(null);
    }
  };

  const handleViewDocument = async (doc: PrequalDocument) => {
    const { data, error } = await supabase.storage
      .from("prequal-documents")
      .createSignedUrl(doc.file_url, 300);
    if (error || !data?.signedUrl) {
      toast({ variant: "destructive", title: "Could not open document" });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const handleApprove = async () => {
    if (!activeContractor) return;
    const saved = await persistRecord({
      overall_status: "approved",
      reviewed_by: profileId,
      reviewed_at: new Date().toISOString(),
    });
    if (!saved) return;

    const { error } = await supabase
      .from("contractor_panel")
      .update({ prequal_status: "approved", can_receive_jobs: true })
      .eq("id", activeContractor.panel_id);
    if (error) {
      toast({ variant: "destructive", title: "Approve failed", description: error.message });
      return;
    }
    setContractors((prev) =>
      prev.map((c) => (c.panel_id === activeContractor.panel_id ? { ...c, prequal_status: "approved" } : c)),
    );
    toast({ title: "Contractor approved" });
  };

  const handleSuspend = async () => {
    if (!activeContractor) return;
    const saved = await persistRecord({ overall_status: "suspended" });
    if (!saved) return;

    const { error } = await supabase
      .from("contractor_panel")
      .update({ can_receive_jobs: false })
      .eq("id", activeContractor.panel_id);
    if (error) {
      toast({ variant: "destructive", title: "Suspend failed", description: error.message });
      return;
    }
    toast({ title: "Contractor suspended" });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <i className="ti ti-loader-2 animate-spin" style={{ fontSize: 24, color: "#9ca3af" }} />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div>
        <h2 className="font-heading text-2xl font-bold">Panel compliance</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Manage prequalification documents for your approved contractors
        </p>
      </div>

      {contractors.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <i className="ti ti-shield-check" style={{ fontSize: 32, color: "#9ca3af" }} />
            <p className="font-medium mt-3 mb-1">No panel contractors</p>
            <p className="text-sm text-muted-foreground">Add contractors to your panel to track their prequalification here.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {contractors.map((c) => {
            const status = STATUS_CONFIG[c.prequal_status] ?? STATUS_CONFIG.not_started;
            return (
              <Card
                key={c.panel_id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => openContractor(c)}
              >
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="h-10 w-10 rounded-full flex items-center justify-center shrink-0 text-sm font-semibold"
                      style={{ background: "#1e3a5f", color: "#fff" }}
                    >
                      {initials(c.contractor_name)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{c.contractor_name}</p>
                      {c.contractor_trades?.length ? (
                        <p className="text-xs text-muted-foreground truncate">
                          {c.contractor_trades.join(", ")}
                        </p>
                      ) : null}
                    </div>
                  </div>
                  <Badge variant="outline" className={`text-xs shrink-0 ${status.className}`}>
                    {status.label}
                  </Badge>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
          {activeContractor && (
            <>
              <SheetHeader>
                <SheetTitle>{activeContractor.contractor_name}</SheetTitle>
                <SheetDescription>
                  {activeContractor.contractor_trades?.length
                    ? activeContractor.contractor_trades.join(", ")
                    : "Prequalification checklist"}
                </SheetDescription>
              </SheetHeader>

              {!record ? (
                <div className="flex justify-center py-10">
                  <i className="ti ti-loader-2 animate-spin" style={{ fontSize: 20, color: "#9ca3af" }} />
                </div>
              ) : (
                <div className="space-y-5 py-6">
                  {CHECKLIST_ITEMS.map((item) => {
                    if (item.optional && record.nda_signed === null) {
                      return (
                        <div key={item.key} className="flex items-center justify-between gap-3 border rounded-md p-3">
                          <p className="text-sm text-muted-foreground">{item.label} — not required for this contractor</p>
                          <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={handleRequireNda} disabled={busy}>
                            Mark as required
                          </Button>
                        </div>
                      );
                    }

                    const verified = Boolean(record[item.verifiedField]);
                    const expiry = item.expiryField ? (record[item.expiryField] as string | null) : null;
                    const docsForItem = documents.filter((d) => d.document_type === item.documentType);

                    return (
                      <div key={item.key} className="border rounded-md p-3 space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              id={`chk-${item.key}`}
                              checked={verified}
                              onCheckedChange={(v) => handleToggleVerified(item, Boolean(v))}
                              disabled={busy}
                            />
                            <Label htmlFor={`chk-${item.key}`} className="text-sm font-medium">
                              {item.label}
                            </Label>
                          </div>
                        </div>

                        {item.expiryField && (
                          <div className="flex items-center gap-2 pl-6">
                            <Label className="text-xs text-muted-foreground shrink-0">Expiry date</Label>
                            <Input
                              type="date"
                              className="h-8 text-sm w-auto"
                              value={expiry ?? ""}
                              onChange={(e) => handleExpiryChange(item, e.target.value)}
                              disabled={busy}
                            />
                          </div>
                        )}

                        <div className="flex flex-wrap items-center gap-2 pl-6">
                          {docsForItem.map((doc) => (
                            <button
                              key={doc.id}
                              type="button"
                              className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                              onClick={() => handleViewDocument(doc)}
                            >
                              <i className="ti ti-file-text" />
                              {doc.file_name}
                            </button>
                          ))}
                          <label className="text-xs">
                            <input
                              type="file"
                              className="hidden"
                              disabled={uploadingKey === item.key}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) handleUpload(item, file);
                                e.target.value = "";
                              }}
                            />
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              disabled={uploadingKey === item.key}
                              onClick={(e) => {
                                (e.currentTarget.previousSibling as HTMLInputElement)?.click();
                              }}
                            >
                              {uploadingKey === item.key ? (
                                <i className="ti ti-loader-2 animate-spin mr-1" />
                              ) : (
                                <i className="ti ti-upload mr-1" />
                              )}
                              Upload
                            </Button>
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <SheetFooter className="gap-2">
                <Button
                  variant="destructive"
                  onClick={handleSuspend}
                  disabled={busy || !record}
                >
                  Suspend
                </Button>
                <Button
                  onClick={handleApprove}
                  disabled={busy || !record}
                >
                  Mark as approved
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
