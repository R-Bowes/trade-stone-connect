import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Plus, FileText, ShieldCheck, ExternalLink, Edit } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  useJobCertificates,
  CERTIFICATE_TYPE_LABELS,
  type CertificateType,
  type JobCertificate,
} from "@/hooks/useJobCertificates";

const CERTIFICATE_TYPES = Object.keys(CERTIFICATE_TYPE_LABELS) as CertificateType[];

type AssetOption = { id: string; name: string };

function isExpired(expiryDate: string | null): boolean {
  if (!expiryDate) return false;
  return expiryDate < new Date().toISOString().slice(0, 10);
}

function CertificateCard({ cert, onView, onEdit, canEdit }: {
  cert: JobCertificate;
  onView: (path: string) => void;
  onEdit: (cert: JobCertificate) => void;
  canEdit: boolean;
}) {
  const expired = isExpired(cert.expiry_date);
  const isWarranty = cert.certificate_type === "manufacturer_warranty" || cert.certificate_type === "workmanship_warranty";

  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium text-sm truncate">{cert.certificate_name}</div>
            <Badge variant="outline" className="text-[10px] mt-1">{CERTIFICATE_TYPE_LABELS[cert.certificate_type]}</Badge>
          </div>
          <div className="flex gap-1 shrink-0">
            {cert.verified && <Badge className="bg-green-600 text-white">Verified</Badge>}
            {expired && <Badge variant="destructive">Expired</Badge>}
          </div>
        </div>

        <div className="text-xs text-muted-foreground space-y-0.5">
          <div>Issued: {format(new Date(cert.issued_date), "d MMM yyyy")}</div>
          {cert.expiry_date && <div>Expires: {format(new Date(cert.expiry_date), "d MMM yyyy")}</div>}
          {cert.certificate_number && <div>No. {cert.certificate_number}</div>}
          {cert.issuer && <div>Issuer: {cert.issuer}</div>}
        </div>

        {isWarranty && (cert.warranty_duration_months || cert.warranty_terms) && (
          <div className="text-xs bg-muted/50 rounded p-2 space-y-0.5">
            {cert.warranty_duration_months && <div>Duration: {cert.warranty_duration_months} months</div>}
            {cert.warranty_terms && <div className="text-muted-foreground">{cert.warranty_terms}</div>}
          </div>
        )}

        <div className="flex gap-1 pt-1">
          {cert.document_path && (
            <Button size="sm" variant="outline" onClick={() => onView(cert.document_path!)}>
              <ExternalLink className="h-3.5 w-3.5 mr-1" />View Document
            </Button>
          )}
          {canEdit && !cert.verified && (
            <Button size="sm" variant="ghost" onClick={() => onEdit(cert)}>
              <Edit className="h-3.5 w-3.5 mr-1" />Edit
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface CertificateFormState {
  certificate_type: CertificateType;
  certificate_name: string;
  certificate_number: string;
  issuer: string;
  issued_date: string;
  expiry_date: string;
  warranty_duration_months: string;
  warranty_terms: string;
  asset_id: string;
  notes: string;
}

const BLANK_FORM: CertificateFormState = {
  certificate_type: "gas_safety",
  certificate_name: CERTIFICATE_TYPE_LABELS.gas_safety,
  certificate_number: "",
  issuer: "",
  issued_date: new Date().toISOString().slice(0, 10),
  expiry_date: "",
  warranty_duration_months: "",
  warranty_terms: "",
  asset_id: "",
  notes: "",
};

interface JobCertificatesProps {
  jobId: string;
  contractorId: string;
  isContractor: boolean;
  onChanged?: () => void;
}

export function JobCertificates({ jobId, contractorId, isContractor, onChanged }: JobCertificatesProps) {
  const { certificates, loading, addCertificate, updateCertificate, uploadCertificateDocument, getSignedDocumentUrl } = useJobCertificates(jobId);
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CertificateFormState>(BLANK_FORM);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [assetOptions, setAssetOptions] = useState<AssetOption[]>([]);

  useEffect(() => {
    (async () => {
      const { data: job } = await supabase
        .from("jobs")
        .select("site_id, company_id")
        .eq("id", jobId)
        .maybeSingle();
      if (!job?.company_id || !job.site_id) { setAssetOptions([]); return; }
      const { data: assets } = await (supabase as any)
        .from("assets")
        .select("id, name")
        .eq("site_id", job.site_id);
      setAssetOptions((assets ?? []) as AssetOption[]);
    })();
  }, [jobId]);

  const handleView = async (path: string) => {
    try {
      const url = await getSignedDocumentUrl(path);
      window.open(url, "_blank");
    } catch {
      toast({ title: "Error", description: "Could not open document", variant: "destructive" });
    }
  };

  const openAddDialog = () => {
    setEditingId(null);
    setForm(BLANK_FORM);
    setFile(null);
    setDialogOpen(true);
  };

  const openEditDialog = (cert: JobCertificate) => {
    setEditingId(cert.id);
    setForm({
      certificate_type: cert.certificate_type,
      certificate_name: cert.certificate_name,
      certificate_number: cert.certificate_number ?? "",
      issuer: cert.issuer ?? "",
      issued_date: cert.issued_date,
      expiry_date: cert.expiry_date ?? "",
      warranty_duration_months: cert.warranty_duration_months != null ? String(cert.warranty_duration_months) : "",
      warranty_terms: cert.warranty_terms ?? "",
      asset_id: cert.asset_id ?? "",
      notes: cert.notes ?? "",
    });
    setFile(null);
    setDialogOpen(true);
  };

  const isWarrantyType = form.certificate_type === "manufacturer_warranty" || form.certificate_type === "workmanship_warranty";

  const handleSave = async () => {
    if (!form.certificate_name.trim()) return;
    setSaving(true);
    try {
      let documentPath: string | null = editingId ? certificates.find((c) => c.id === editingId)?.document_path ?? null : null;
      if (file) {
        documentPath = await uploadCertificateDocument(file, jobId);
      }

      const payload = {
        job_id: jobId,
        contractor_id: contractorId,
        certificate_type: form.certificate_type,
        certificate_name: form.certificate_name.trim(),
        certificate_number: form.certificate_number || null,
        issuer: form.issuer || null,
        issued_date: form.issued_date,
        expiry_date: form.expiry_date || null,
        warranty_duration_months: isWarrantyType && form.warranty_duration_months ? Number(form.warranty_duration_months) : null,
        warranty_terms: isWarrantyType ? (form.warranty_terms || null) : null,
        document_path: documentPath,
        asset_id: form.asset_id || null,
        notes: form.notes || null,
      };

      if (editingId) {
        await updateCertificate(editingId, payload);
      } else {
        await addCertificate(payload);
      }
      setDialogOpen(false);
      onChanged?.();
    } catch {
      // errors surfaced by the hook's toast
    } finally {
      setSaving(false);
    }
  };

  const warranties = certificates.filter((c) => c.certificate_type === "manufacturer_warranty" || c.certificate_type === "workmanship_warranty");
  const longestWarrantyExpiry = warranties
    .map((w) => w.expiry_date)
    .filter((d): d is string => !!d)
    .sort()
    .pop();

  if (loading) return <div className="flex justify-center p-4"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  return (
    <div className="space-y-3">
      {isContractor && (
        <Button size="sm" onClick={openAddDialog}>
          <Plus className="h-4 w-4 mr-1" />Add Certificate
        </Button>
      )}

      {warranties.length > 0 && (
        <Card className="border-green-300 bg-green-50">
          <CardContent className="p-3 flex items-center gap-2 text-sm text-green-900">
            <ShieldCheck className="h-4 w-4 flex-shrink-0" />
            This work is covered by {warranties.length} warrant{warranties.length === 1 ? "y" : "ies"}
            {longestWarrantyExpiry && <> — cover until {format(new Date(longestWarrantyExpiry), "d MMM yyyy")}</>}
          </CardContent>
        </Card>
      )}

      {certificates.length === 0 ? (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <FileText className="h-4 w-4" />No certificates attached yet.
        </p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-2">
          {certificates.map((cert) => (
            <CertificateCard key={cert.id} cert={cert} onView={handleView} onEdit={openEditDialog} canEdit={isContractor} />
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Certificate" : "Add Certificate"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Certificate type</Label>
              <Select
                value={form.certificate_type}
                onValueChange={(v) => {
                  const type = v as CertificateType;
                  setForm((f) => ({
                    ...f,
                    certificate_type: type,
                    certificate_name: f.certificate_name === CERTIFICATE_TYPE_LABELS[f.certificate_type] ? CERTIFICATE_TYPE_LABELS[type] : f.certificate_name,
                  }));
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CERTIFICATE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{CERTIFICATE_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Certificate name</Label>
              <Input value={form.certificate_name} onChange={(e) => setForm((f) => ({ ...f, certificate_name: e.target.value }))} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Certificate number</Label>
                <Input value={form.certificate_number} onChange={(e) => setForm((f) => ({ ...f, certificate_number: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Issuer</Label>
                <Input placeholder="e.g. Gas Safe Register" value={form.issuer} onChange={(e) => setForm((f) => ({ ...f, issuer: e.target.value }))} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Issued date</Label>
                <Input type="date" value={form.issued_date} onChange={(e) => setForm((f) => ({ ...f, issued_date: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Expiry date</Label>
                <Input type="date" value={form.expiry_date} onChange={(e) => setForm((f) => ({ ...f, expiry_date: e.target.value }))} />
              </div>
            </div>

            {isWarrantyType && (
              <div className="space-y-3 rounded-md border p-3">
                <div className="space-y-1">
                  <Label>Warranty duration (months)</Label>
                  <Input type="number" min="0" value={form.warranty_duration_months} onChange={(e) => setForm((f) => ({ ...f, warranty_duration_months: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Warranty terms</Label>
                  <Textarea rows={2} value={form.warranty_terms} onChange={(e) => setForm((f) => ({ ...f, warranty_terms: e.target.value }))} />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label>Document</Label>
              <Input type="file" accept="image/*,.pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>

            {assetOptions.length > 0 && (
              <div className="space-y-1">
                <Label>Linked asset (optional)</Label>
                <Select value={form.asset_id || "none"} onValueChange={(v) => setForm((f) => ({ ...f, asset_id: v === "none" ? "" : v }))}>
                  <SelectTrigger><SelectValue placeholder="No asset" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No asset</SelectItem>
                    {assetOptions.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.certificate_name.trim()}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingId ? "Save changes" : "Add Certificate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
