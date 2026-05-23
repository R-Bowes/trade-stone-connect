import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Calendar, CheckCircle2, Clock, Loader2, Upload, Eye,
  Building2, AlertTriangle, ChevronRight, FileText,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────
type VisitStatus = 'scheduled' | 'confirmed' | 'completed' | 'overdue' | 'cancelled';
type DocType = 'certificate' | 'report' | 'invoice' | 'photo' | 'other';

interface Visit {
  id: string;
  schedule_id: string;
  asset_id: string;
  contractor_id: string;
  company_id: string;
  scheduled_window_start: string;
  scheduled_window_end: string;
  confirmed_date: string | null;
  completed_at: string | null;
  status: VisitStatus;
  notes: string | null;
  created_at: string;
  // hydrated
  asset_name?: string;
  asset_category?: string;
  site_name?: string;
  company_name?: string;
  contract_title?: string;
}

interface Doc {
  id: string;
  visit_id: string;
  uploaded_by: string;
  document_name: string;
  document_url: string;
  document_type: DocType;
  created_at: string;
}

const STATUS_CONFIG: Record<VisitStatus, { label: string; colour: string }> = {
  scheduled: { label: 'Scheduled', colour: 'bg-blue-100 text-blue-800 border-blue-200' },
  confirmed:  { label: 'Confirmed', colour: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  completed:  { label: 'Completed', colour: 'bg-green-100 text-green-800 border-green-200' },
  overdue:    { label: 'Overdue',   colour: 'bg-red-100 text-red-800 border-red-200' },
  cancelled:  { label: 'Cancelled', colour: 'bg-gray-100 text-gray-700 border-gray-200' },
};

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB');

// ─── Main Component ──────────────────────────────────────────────────────────
interface ContractorServiceVisitsProps {
  profileId: string; // profiles.id
}

export const ContractorServiceVisits = ({ profileId }: ContractorServiceVisitsProps) => {
  const { toast } = useToast();
  const [visits, setVisits] = useState<Visit[]>([]);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('active');

  // Detail dialog
  const [selected, setSelected] = useState<Visit | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Confirm date
  const [confirmDate, setConfirmDate] = useState('');
  const [confirming, setConfirming] = useState(false);

  // Complete + upload
  const [completing, setCompleting] = useState(false);
  const [completionNotes, setCompletionNotes] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState('');
  const [uploadType, setUploadType] = useState<DocType>('certificate');
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);

    const { data: visitsData, error: visitsError } = await supabase
      .from('service_visits')
      .select('*')
      .eq('contractor_id', profileId)
      .order('scheduled_window_end', { ascending: true });

    if (visitsError) {
      console.error('Service visits error:', visitsError);
      setVisits([]); setLoading(false); return;
    }
    if (!visitsData?.length) { setVisits([]); setLoading(false); return; }

    // Hydrate — fetch all supporting data, default to empty on error
    const assetIds = [...new Set(visitsData.map(v => v.asset_id))];
    const companyIds = [...new Set(visitsData.map(v => v.company_id))];
    const scheduleIds = [...new Set(visitsData.map(v => v.schedule_id))];

    const [assetsRes, companiesRes, schedulesRes] = await Promise.all([
      supabase.from('assets').select('id, name, category, site_id').in('id', assetIds),
      supabase.from('companies').select('id, name').in('id', companyIds),
      supabase.from('service_schedules').select('id, contract_id').in('id', scheduleIds),
    ]);

    const assetsData = assetsRes.data ?? [];
    const companiesData = companiesRes.data ?? [];
    const schedulesData = schedulesRes.data ?? [];

    if (assetsRes.error) console.warn('Assets hydration:', assetsRes.error.message);
    if (companiesRes.error) console.warn('Companies hydration:', companiesRes.error.message);
    if (schedulesRes.error) console.warn('Schedules hydration:', schedulesRes.error.message);

    const siteIds = [...new Set(assetsData.map(a => a.site_id).filter(Boolean))] as string[];
    const contractIds = [...new Set(schedulesData.map(s => s.contract_id).filter(Boolean))] as string[];

    const [sitesRes, contractsRes] = await Promise.all([
      siteIds.length ? supabase.from('sites').select('id, name').in('id', siteIds) : Promise.resolve({ data: [] as {id:string;name:string}[], error: null }),
      contractIds.length ? supabase.from('service_contracts').select('id, title').in('id', contractIds) : Promise.resolve({ data: [] as {id:string;title:string}[], error: null }),
    ]);

    const sitesData = sitesRes.data ?? [];
    const contractsData = contractsRes.data ?? [];

    const hydrated: Visit[] = visitsData.map(v => {
      const asset = assetsData?.find(a => a.id === v.asset_id);
      const site = sitesData?.find(s => s.id === asset?.site_id);
      const company = companiesData?.find(c => c.id === v.company_id);
      const schedule = schedulesData?.find(s => s.id === v.schedule_id);
      const contract = contractsData?.find(c => c.id === schedule?.contract_id);
      return {
        ...v,
        status: v.status as VisitStatus,
        asset_name: asset?.name,
        asset_category: asset?.category,
        site_name: site?.name,
        company_name: company?.name,
        contract_title: contract?.title,
      };
    });

    setVisits(hydrated);

    // Load docs
    const visitIds = visitsData.map(v => v.id);
    const { data: docsData } = await supabase.from('service_documents').select('*').in('visit_id', visitIds);
    setDocs(docsData ?? []);

    setLoading(false);
  }, [profileId]);

  useEffect(() => { load(); }, [load]);

  // Mark overdue client-side
  const visitsWithStatus: Visit[] = visits.map(v => ({
    ...v,
    status: (v.status === 'scheduled' || v.status === 'confirmed') && new Date(v.scheduled_window_end) < new Date()
      ? 'overdue' : v.status,
  }));

  const filtered = filterStatus === 'active'
    ? visitsWithStatus.filter(v => ['scheduled', 'confirmed', 'overdue'].includes(v.status))
    : filterStatus === 'all' ? visitsWithStatus
    : visitsWithStatus.filter(v => v.status === filterStatus);

  const counts = {
    overdue: visitsWithStatus.filter(v => v.status === 'overdue').length,
    upcoming: visitsWithStatus.filter(v => ['scheduled', 'confirmed'].includes(v.status)).length,
    completed: visitsWithStatus.filter(v => v.status === 'completed').length,
  };

  // ── Confirm date ────────────────────────────────────────────────────────────
  const handleConfirm = async () => {
    if (!selected || !confirmDate) return;
    setConfirming(true);

    const confirmedAt = new Date(confirmDate).toISOString();
    const windowStart = new Date(selected.scheduled_window_start);
    const windowEnd = new Date(selected.scheduled_window_end);
    const picked = new Date(confirmDate);

    if (picked < windowStart || picked > windowEnd) {
      toast({ title: 'Out of window', description: `Please pick a date between ${fmtDate(selected.scheduled_window_start)} and ${fmtDate(selected.scheduled_window_end)}.`, variant: 'destructive' });
      setConfirming(false); return;
    }

    const { error } = await supabase.from('service_visits').update({
      confirmed_date: confirmedAt,
      status: 'confirmed',
    }).eq('id', selected.id);

    if (error) { toast({ title: 'Error', description: 'Failed to confirm date.', variant: 'destructive' }); setConfirming(false); return; }

    // Notify business
    const { data: companyData } = await supabase.from('companies').select('owner_id').eq('id', selected.company_id).maybeSingle();
    if (companyData?.owner_id) {
      const { data: ownerProfile } = await supabase.from('profiles').select('user_id').eq('id', companyData.owner_id).maybeSingle();
      if (ownerProfile?.user_id) {
        await supabase.from('notifications').insert({
          user_id: ownerProfile.user_id,
          type: 'visit_confirmed',
          title: 'Visit Date Confirmed',
          message: `A contractor has confirmed a service visit for ${selected.asset_name ?? 'an asset'} on ${fmtDate(confirmDate)}.`,
          is_read: false,
        });
      }
    }

    toast({ title: 'Date confirmed', description: `Visit confirmed for ${fmtDate(confirmDate)}.` });
    setConfirming(false);
    setDetailOpen(false);
    load();
  };

  // ── Mark complete ────────────────────────────────────────────────────────────
  const handleComplete = async () => {
    if (!selected) return;
    setCompleting(true);

    const completedAt = new Date().toISOString();

    // Update visit
    const { error: visitError } = await supabase.from('service_visits').update({
      status: 'completed',
      completed_at: completedAt,
      notes: completionNotes || null,
    }).eq('id', selected.id);

    if (visitError) { toast({ title: 'Error', description: 'Failed to mark complete.', variant: 'destructive' }); setCompleting(false); return; }

    // Update schedule last_completed_at
    await supabase.from('service_schedules').update({ last_completed_at: completedAt }).eq('id', selected.schedule_id);

    // Notify business
    const { data: companyData } = await supabase.from('companies').select('owner_id').eq('id', selected.company_id).maybeSingle();
    if (companyData?.owner_id) {
      const { data: ownerProfile } = await supabase.from('profiles').select('user_id').eq('id', companyData.owner_id).maybeSingle();
      if (ownerProfile?.user_id) {
        await supabase.from('notifications').insert({
          user_id: ownerProfile.user_id,
          type: 'visit_completed',
          title: 'Service Visit Completed',
          message: `Service visit for ${selected.asset_name ?? 'an asset'} has been marked as completed.`,
          is_read: false,
          reference_id: selected.id,
          reference_type: 'service_visit',
        });
      }
    }

    toast({ title: 'Visit completed' });
    setCompleting(false);
    setCompletionNotes('');
    setDetailOpen(false);
    load();
  };

  // ── Upload document ──────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!selected || !uploadFile || !uploadName) {
      toast({ title: 'Required', description: 'Please select a file and enter a document name.', variant: 'destructive' }); return;
    }
    setUploading(true);

    // Upload to Supabase Storage
    const filePath = `service-documents/${selected.id}/${Date.now()}-${uploadFile.name}`;
    const { error: storageError } = await supabase.storage
      .from('documents')
      .upload(filePath, uploadFile, { upsert: false });

    if (storageError) {
      // Fallback: store as base64 URL if storage bucket not set up
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target?.result as string;
        await supabase.from('service_documents').insert({
          visit_id: selected.id,
          uploaded_by: profileId,
          document_name: uploadName,
          document_url: base64,
          document_type: uploadType,
        });

        // Notify business
        const { data: companyData } = await supabase.from('companies').select('owner_id').eq('id', selected.company_id).maybeSingle();
        if (companyData?.owner_id) {
          const { data: ownerProfile } = await supabase.from('profiles').select('user_id').eq('id', companyData.owner_id).maybeSingle();
          if (ownerProfile?.user_id) {
            await supabase.from('notifications').insert({
              user_id: ownerProfile.user_id,
              type: 'document_uploaded',
              title: 'Compliance Document Uploaded',
              message: `A compliance document "${uploadName}" has been uploaded for ${selected.asset_name ?? 'an asset'}.`,
              is_read: false,
              reference_id: selected.id,
              reference_type: 'service_visit',
            });
          }
        }

        toast({ title: 'Document uploaded' });
        setUploading(false);
        setUploadFile(null);
        setUploadName('');
        load();
      };
      reader.readAsDataURL(uploadFile);
      return;
    }

    // Get public URL
    const { data: urlData } = supabase.storage.from('documents').getPublicUrl(filePath);

    await supabase.from('service_documents').insert({
      visit_id: selected.id,
      uploaded_by: profileId,
      document_name: uploadName,
      document_url: urlData.publicUrl,
      document_type: uploadType,
    });

    toast({ title: 'Document uploaded' });
    setUploading(false);
    setUploadFile(null);
    setUploadName('');
    load();
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-heading text-2xl font-bold">Service Visits</h2>
          <p className="text-muted-foreground text-sm mt-1">Your scheduled maintenance and service visits.</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${counts.overdue > 0 ? 'bg-red-100' : 'bg-green-100'}`}>
            {counts.overdue > 0 ? <AlertTriangle className="h-5 w-5 text-red-700" /> : <CheckCircle2 className="h-5 w-5 text-green-700" />}
          </div>
          <div><p className="text-2xl font-bold">{counts.overdue}</p><p className="text-xs text-muted-foreground">Overdue</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-blue-100 flex items-center justify-center shrink-0"><Clock className="h-5 w-5 text-blue-700" /></div>
          <div><p className="text-2xl font-bold">{counts.upcoming}</p><p className="text-xs text-muted-foreground">Upcoming</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-green-100 flex items-center justify-center shrink-0"><CheckCircle2 className="h-5 w-5 text-green-700" /></div>
          <div><p className="text-2xl font-bold">{counts.completed}</p><p className="text-xs text-muted-foreground">Completed</p></div>
        </CardContent></Card>
      </div>

      {/* Filter */}
      <Select value={filterStatus} onValueChange={setFilterStatus}>
        <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="active">Active visits</SelectItem>
          <SelectItem value="scheduled">Scheduled</SelectItem>
          <SelectItem value="confirmed">Confirmed</SelectItem>
          <SelectItem value="overdue">Overdue</SelectItem>
          <SelectItem value="completed">Completed</SelectItem>
          <SelectItem value="all">All visits</SelectItem>
        </SelectContent>
      </Select>

      {/* Visit list */}
      {filtered.length === 0 ? (
        <Card><CardContent className="p-12 text-center">
          <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No visits found</h3>
          <p className="text-muted-foreground">Service visits assigned to you will appear here.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(visit => {
            const cfg = STATUS_CONFIG[visit.status];
            const visitDocs = docs.filter(d => d.visit_id === visit.id);
            return (
              <Card key={visit.id} className={`cursor-pointer hover:shadow-md transition-shadow ${visit.status === 'overdue' ? 'border-red-200' : ''}`}
                onClick={() => { setSelected(visit); setConfirmDate(visit.confirmed_date ? visit.confirmed_date.split('T')[0] : ''); setCompletionNotes(visit.notes ?? ''); setDetailOpen(true); }}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                        <Building2 className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="font-semibold truncate">{visit.asset_name ?? 'Asset'}</p>
                          <Badge variant="outline" className={`text-xs ${cfg.colour}`}>{cfg.label}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{visit.company_name ?? 'Client'}{visit.site_name ? ` · ${visit.site_name}` : ''}</p>
                        <div className="flex gap-3 text-xs text-muted-foreground mt-1">
                          <span>Window: {fmtDate(visit.scheduled_window_start)} – {fmtDate(visit.scheduled_window_end)}</span>
                          {visit.confirmed_date && <span>Confirmed: {fmtDate(visit.confirmed_date)}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {visitDocs.length > 0 && (
                        <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700">
                          {visitDocs.length} doc{visitDocs.length !== 1 ? 's' : ''}
                        </Badge>
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Detail Dialog ─────────────────────────────────────────────────────── */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.asset_name ?? 'Service Visit'}</DialogTitle>
              </DialogHeader>

              <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-1">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className={STATUS_CONFIG[selected.status].colour}>
                    {STATUS_CONFIG[selected.status].label}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs text-muted-foreground">Client</p><p>{selected.company_name ?? '—'}</p></div>
                  <div><p className="text-xs text-muted-foreground">Site</p><p>{selected.site_name ?? '—'}</p></div>
                  <div><p className="text-xs text-muted-foreground">Contract</p><p>{selected.contract_title ?? '—'}</p></div>
                  <div><p className="text-xs text-muted-foreground">Service Window</p>
                    <p>{fmtDate(selected.scheduled_window_start)} – {fmtDate(selected.scheduled_window_end)}</p></div>
                </div>

                {/* Confirm date section */}
                {selected.status !== 'completed' && selected.status !== 'cancelled' && (
                  <div className="border rounded-lg p-4 space-y-3">
                    <p className="text-sm font-medium">Confirm your visit date</p>
                    <p className="text-xs text-muted-foreground">
                      Pick a date within the service window: {fmtDate(selected.scheduled_window_start)} – {fmtDate(selected.scheduled_window_end)}
                    </p>
                    <div className="flex gap-2">
                      <Input type="date" value={confirmDate}
                        min={selected.scheduled_window_start.split('T')[0]}
                        max={selected.scheduled_window_end.split('T')[0]}
                        onChange={e => setConfirmDate(e.target.value)} />
                      <Button onClick={handleConfirm} disabled={!confirmDate || confirming} className="shrink-0">
                        {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Confirm'}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Complete section */}
                {(selected.status === 'confirmed' || selected.status === 'scheduled') && (
                  <div className="border rounded-lg p-4 space-y-3">
                    <p className="text-sm font-medium">Mark visit as complete</p>
                    <Textarea placeholder="Completion notes (optional)..." value={completionNotes}
                      onChange={e => setCompletionNotes(e.target.value)} rows={2} />
                    <Button onClick={handleComplete} disabled={completing}
                      className="w-full bg-green-600 hover:bg-green-700 text-white">
                      {completing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                      Mark Complete
                    </Button>
                  </div>
                )}

                {/* Document upload */}
                <div className="border rounded-lg p-4 space-y-3">
                  <p className="text-sm font-medium">Upload Compliance Document</p>
                  <div className="space-y-2">
                    <Input placeholder="Document name (e.g. Fire Alarm Certificate 2026)"
                      value={uploadName} onChange={e => setUploadName(e.target.value)} />
                    <Select value={uploadType} onValueChange={v => setUploadType(v as DocType)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="certificate">Certificate</SelectItem>
                        <SelectItem value="report">Report</SelectItem>
                        <SelectItem value="invoice">Invoice</SelectItem>
                        <SelectItem value="photo">Photo</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                      onChange={e => setUploadFile(e.target.files?.[0] ?? null)} />
                    <Button onClick={handleUpload} disabled={!uploadFile || !uploadName || uploading} variant="outline" className="w-full">
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
                      Upload Document
                    </Button>
                  </div>
                </div>

                {/* Existing documents */}
                {docs.filter(d => d.visit_id === selected.id).length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Uploaded Documents</p>
                    {docs.filter(d => d.visit_id === selected.id).map(doc => (
                      <div key={doc.id} className="flex items-center justify-between p-2 border rounded-lg">
                        <div>
                          <p className="text-sm font-medium">{doc.document_name}</p>
                          <p className="text-xs text-muted-foreground capitalize">{doc.document_type} · {fmtDate(doc.created_at)}</p>
                        </div>
                        <Button variant="ghost" size="sm" asChild>
                          <a href={doc.document_url} target="_blank" rel="noopener noreferrer">
                            <Eye className="h-4 w-4" />
                          </a>
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setDetailOpen(false)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
