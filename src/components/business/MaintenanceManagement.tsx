import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Building2, Plus, Loader2, MapPin, Package, FileText,
  Calendar, CheckCircle2, AlertTriangle, Clock, ChevronRight,
  Upload, Eye, Trash2, Edit, X,
} from "lucide-react";
import type {
  Site, Asset, ServiceContract, ServiceSchedule, ServiceVisit, ServiceDocument,
  AssetCategory, ServiceFrequency, ServiceContractStatus,
} from "@/components/business/maintenance-types";
import {
  ASSET_CATEGORY_LABELS, ASSET_CATEGORY_GROUPS, FREQUENCY_LABELS,
  FREQUENCY_DAYS, VISIT_STATUS_CONFIG, CONTRACT_STATUS_CONFIG,
} from "@/components/business/maintenance-types";

interface MaintenanceManagementProps {
  companyId: string;
  profileId: string;
}

const ALL_FREQUENCIES: ServiceFrequency[] = [
  'weekly', 'bi_weekly', 'monthly', 'bi_monthly', 'quarterly',
  'six_monthly', 'annual', '2_yearly', '3_yearly', '4_yearly',
  '5_yearly', '6_yearly', '7_yearly', '8_yearly', '9_yearly', '10_yearly',
];

// ─── Utility ────────────────────────────────────────────────────────────────
const addDays = (date: Date, days: number): Date => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB');

const isOverdue = (nextDue: string) => new Date(nextDue) < new Date();

// ─── Sites Tab ───────────────────────────────────────────────────────────────
const SitesTab = ({
  companyId, sites, loading, onRefresh,
  onSelectSite,
}: {
  companyId: string;
  sites: Site[];
  loading: boolean;
  onRefresh: () => void;
  onSelectSite: (site: Site) => void;
}) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', address: '', postcode: '' });
  const [editSite, setEditSite] = useState<Site | null>(null);

  const openCreate = () => { setForm({ name: '', address: '', postcode: '' }); setEditSite(null); setOpen(true); };
  const openEdit = (s: Site, e: React.MouseEvent) => { e.stopPropagation(); setForm({ name: s.name, address: s.address, postcode: s.postcode }); setEditSite(s); setOpen(true); };

  const save = async () => {
    if (!form.name || !form.address || !form.postcode) { toast({ title: 'Required', description: 'All fields are required.', variant: 'destructive' }); return; }
    setSaving(true);
    if (editSite) {
      const { error } = await supabase.from('sites').update(form).eq('id', editSite.id);
      if (error) { toast({ title: 'Error', description: 'Failed to update site.', variant: 'destructive' }); setSaving(false); return; }
      toast({ title: 'Site updated' });
    } else {
      const { error } = await supabase.from('sites').insert({ ...form, company_id: companyId });
      if (error) { toast({ title: 'Error', description: 'Failed to create site.', variant: 'destructive' }); setSaving(false); return; }
      toast({ title: 'Site created' });
    }
    setSaving(false); setOpen(false); onRefresh();
  };

  const deactivate = async (s: Site, e: React.MouseEvent) => {
    e.stopPropagation();
    await supabase.from('sites').update({ is_active: !s.is_active }).eq('id', s.id);
    onRefresh();
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-muted-foreground text-sm">{sites.length} site{sites.length !== 1 ? 's' : ''}</p>
        <Button onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" />Add Site</Button>
      </div>

      {sites.length === 0 ? (
        <Card><CardContent className="p-12 text-center">
          <MapPin className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No sites yet</h3>
          <p className="text-muted-foreground mb-6">Add your first site to start managing assets and service schedules.</p>
          <Button onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" />Add your first site</Button>
        </CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sites.map(site => (
            <Card key={site.id} className={`cursor-pointer hover:shadow-md transition-shadow ${!site.is_active ? 'opacity-50' : ''}`}
              onClick={() => onSelectSite(site)}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Building2 className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold truncate">{site.name}</p>
                      <p className="text-sm text-muted-foreground truncate">{site.address}</p>
                      <p className="text-xs text-muted-foreground">{site.postcode}</p>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="sm" onClick={(e) => openEdit(site, e)}><Edit className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="sm" onClick={(e) => deactivate(site, e)}>
                      {site.is_active ? <X className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                    </Button>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <Badge variant="outline" className={site.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-50 text-gray-500'}>
                    {site.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editSite ? 'Edit Site' : 'Add Site'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><label className="text-sm font-medium">Site Name</label>
              <Input placeholder="e.g. London HQ" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="space-y-2"><label className="text-sm font-medium">Address</label>
              <Input placeholder="123 High Street" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
            <div className="space-y-2"><label className="text-sm font-medium">Postcode</label>
              <Input placeholder="SW1A 1AA" value={form.postcode} onChange={e => setForm(f => ({ ...f, postcode: e.target.value.toUpperCase() }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}{editSite ? 'Save' : 'Create Site'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ─── Assets Tab ──────────────────────────────────────────────────────────────
const AssetsTab = ({
  companyId, sites, assets, loading, onRefresh,
}: {
  companyId: string;
  sites: Site[];
  assets: Asset[];
  loading: boolean;
  onRefresh: () => void;
}) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filterSite, setFilterSite] = useState<string>('all');
  const [editAsset, setEditAsset] = useState<Asset | null>(null);
  const [form, setForm] = useState({
    site_id: '', name: '', category: '' as AssetCategory | '',
    description: '', make: '', model: '', serial_number: '', install_date: '',
  });

  const openCreate = () => {
    setForm({ site_id: sites[0]?.id ?? '', name: '', category: '', description: '', make: '', model: '', serial_number: '', install_date: '' });
    setEditAsset(null); setOpen(true);
  };
  const openEdit = (a: Asset) => {
    setForm({ site_id: a.site_id, name: a.name, category: a.category, description: a.description ?? '', make: a.make ?? '', model: a.model ?? '', serial_number: a.serial_number ?? '', install_date: a.install_date ?? '' });
    setEditAsset(a); setOpen(true);
  };

  const save = async () => {
    if (!form.site_id || !form.name || !form.category) { toast({ title: 'Required', description: 'Site, name and category are required.', variant: 'destructive' }); return; }
    setSaving(true);
    const payload = { site_id: form.site_id, company_id: companyId, name: form.name, category: form.category as AssetCategory, description: form.description || null, make: form.make || null, model: form.model || null, serial_number: form.serial_number || null, install_date: form.install_date || null };
    if (editAsset) {
      const { error } = await supabase.from('assets').update(payload).eq('id', editAsset.id);
      if (error) { toast({ title: 'Error', description: 'Failed to update asset.', variant: 'destructive' }); setSaving(false); return; }
      toast({ title: 'Asset updated' });
    } else {
      const { error } = await supabase.from('assets').insert(payload);
      if (error) { toast({ title: 'Error', description: 'Failed to create asset.', variant: 'destructive' }); setSaving(false); return; }
      toast({ title: 'Asset created' });
    }
    setSaving(false); setOpen(false); onRefresh();
  };

  const filtered = filterSite === 'all' ? assets : assets.filter(a => a.site_id === filterSite);
  const getSiteName = (id: string) => sites.find(s => s.id === id)?.name ?? 'Unknown';

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between gap-3">
        <Select value={filterSite} onValueChange={setFilterSite}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sites</SelectItem>
            {sites.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button onClick={openCreate} disabled={sites.length === 0} className="gap-2"><Plus className="h-4 w-4" />Add Asset</Button>
      </div>

      {sites.length === 0 ? (
        <Card><CardContent className="p-8 text-center"><p className="text-muted-foreground">Add a site first before adding assets.</p></CardContent></Card>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-12 text-center">
          <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No assets yet</h3>
          <p className="text-muted-foreground mb-6">Add assets to your sites to start scheduling maintenance.</p>
          <Button onClick={openCreate} className="gap-2"><Plus className="h-4 w-4" />Add your first asset</Button>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(asset => (
            <Card key={asset.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                      <Package className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold">{asset.name}</p>
                        <Badge variant="outline" className="text-xs">{ASSET_CATEGORY_LABELS[asset.category]}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{getSiteName(asset.site_id)}</p>
                      {(asset.make || asset.model) && (
                        <p className="text-xs text-muted-foreground">{[asset.make, asset.model].filter(Boolean).join(' — ')}</p>
                      )}
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => openEdit(asset)}><Edit className="h-4 w-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editAsset ? 'Edit Asset' : 'Add Asset'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
            <div className="space-y-2"><label className="text-sm font-medium">Site</label>
              <Select value={form.site_id} onValueChange={v => setForm(f => ({ ...f, site_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select site" /></SelectTrigger>
                <SelectContent>{sites.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-2"><label className="text-sm font-medium">Asset Name</label>
              <Input placeholder="e.g. Fire Alarm Panel - Floor 1" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="space-y-2"><label className="text-sm font-medium">Category</label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v as AssetCategory }))}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {ASSET_CATEGORY_GROUPS.map(group => (
                    <SelectGroup key={group.label}>
                      <SelectLabel>{group.label}</SelectLabel>
                      {group.categories.map(cat => <SelectItem key={cat} value={cat}>{ASSET_CATEGORY_LABELS[cat]}</SelectItem>)}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><label className="text-sm font-medium">Make</label>
                <Input placeholder="Manufacturer" value={form.make} onChange={e => setForm(f => ({ ...f, make: e.target.value }))} /></div>
              <div className="space-y-2"><label className="text-sm font-medium">Model</label>
                <Input placeholder="Model number" value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><label className="text-sm font-medium">Serial Number</label>
                <Input placeholder="Serial / ID" value={form.serial_number} onChange={e => setForm(f => ({ ...f, serial_number: e.target.value }))} /></div>
              <div className="space-y-2"><label className="text-sm font-medium">Install Date</label>
                <Input type="date" value={form.install_date} onChange={e => setForm(f => ({ ...f, install_date: e.target.value }))} /></div>
            </div>
            <div className="space-y-2"><label className="text-sm font-medium">Description</label>
              <Textarea placeholder="Additional details..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}{editAsset ? 'Save' : 'Add Asset'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ─── Contracts Tab ───────────────────────────────────────────────────────────
const ContractsTab = ({
  companyId, sites, contracts, panelContractors, loading, onRefresh, onSelectContract,
}: {
  companyId: string;
  sites: Site[];
  contracts: (ServiceContract & { contractor_name?: string; site_name?: string })[];
  panelContractors: { id: string; name: string | null; ts_code: string | null }[];
  loading: boolean;
  onRefresh: () => void;
  onSelectContract: (c: ServiceContract) => void;
}) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ contractor_id: '', site_id: '', title: '', description: '', start_date: '', end_date: '', annual_value: '', status: 'draft' as ServiceContractStatus });

  const openCreate = () => { setForm({ contractor_id: '', site_id: 'all-sites', title: '', description: '', start_date: '', end_date: '', annual_value: '', status: 'draft' }); setOpen(true); };

  const save = async () => {
    if (!form.contractor_id || !form.title || !form.start_date || !form.end_date) {
      toast({ title: 'Required', description: 'Contractor, title and dates are required.', variant: 'destructive' }); return;
    }
    setSaving(true);
    const { error } = await supabase.from('service_contracts').insert({
      company_id: companyId, contractor_id: form.contractor_id,
      site_id: form.site_id && form.site_id !== 'all-sites' ? form.site_id : null, title: form.title,
      description: form.description || null, start_date: form.start_date,
      end_date: form.end_date, annual_value: form.annual_value ? parseFloat(form.annual_value) : null,
      status: form.status,
    });
    if (error) { toast({ title: 'Error', description: 'Failed to create contract.', variant: 'destructive' }); setSaving(false); return; }
    toast({ title: 'Contract created' });
    setSaving(false); setOpen(false); onRefresh();
  };

  const updateStatus = async (id: string, status: ServiceContractStatus) => {
    await supabase.from('service_contracts').update({ status }).eq('id', id);
    onRefresh();
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-muted-foreground text-sm">{contracts.length} contract{contracts.length !== 1 ? 's' : ''}</p>
        <Button onClick={openCreate} disabled={panelContractors.length === 0} className="gap-2">
          <Plus className="h-4 w-4" />New Contract
        </Button>
      </div>

      {panelContractors.length === 0 && (
        <Card className="border-yellow-200 bg-yellow-50/30"><CardContent className="p-4">
          <p className="text-sm text-yellow-800">You need approved contractors on your panel before creating service contracts. Go to the Contractor Panel to invite contractors.</p>
        </CardContent></Card>
      )}

      {contracts.length === 0 ? (
        <Card><CardContent className="p-12 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No service contracts yet</h3>
          <p className="text-muted-foreground mb-6">Create a service contract with a panel contractor to start scheduling maintenance.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {contracts.map(contract => {
            const cfg = CONTRACT_STATUS_CONFIG[contract.status];
            const expiring = new Date(contract.end_date) < addDays(new Date(), 30);
            return (
              <Card key={contract.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => onSelectContract(contract)}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="font-semibold">{contract.title}</p>
                        <Badge variant="outline" className={`text-xs ${cfg.colour}`}>{cfg.label}</Badge>
                        {expiring && contract.status === 'active' && (
                          <Badge variant="outline" className="text-xs bg-orange-100 text-orange-800 border-orange-200">Expiring soon</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{contract.contractor_name ?? 'Contractor'}</p>
                      <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                        {contract.site_name && <span>{contract.site_name}</span>}
                        <span>{fmtDate(contract.start_date)} – {fmtDate(contract.end_date)}</span>
                        {contract.annual_value && <span>£{Number(contract.annual_value).toLocaleString('en-GB')}/yr</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {contract.status === 'draft' && (
                        <Button size="sm" variant="outline" className="border-green-300 text-green-700"
                          onClick={e => { e.stopPropagation(); updateStatus(contract.id, 'active'); }}>
                          Activate
                        </Button>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Service Contract</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2 max-h-[60vh] overflow-y-auto pr-1">
            <div className="space-y-2"><label className="text-sm font-medium">Contractor</label>
              <Select value={form.contractor_id} onValueChange={v => setForm(f => ({ ...f, contractor_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select contractor" /></SelectTrigger>
                <SelectContent>
                  {panelContractors.map(c => <SelectItem key={c.id} value={c.id}>{c.name ?? c.ts_code ?? c.id}</SelectItem>)}
                </SelectContent>
              </Select></div>
            <div className="space-y-2"><label className="text-sm font-medium">Contract Title</label>
              <Input placeholder="e.g. Annual Fire Alarm Servicing" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
            <div className="space-y-2"><label className="text-sm font-medium">Site (optional — leave blank for all sites)</label>
              <Select value={form.site_id} onValueChange={v => setForm(f => ({ ...f, site_id: v }))}>
                <SelectTrigger><SelectValue placeholder="All sites" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-sites">All sites</SelectItem>
                  {sites.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><label className="text-sm font-medium">Start Date</label>
                <Input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} /></div>
              <div className="space-y-2"><label className="text-sm font-medium">End Date</label>
                <Input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} /></div>
            </div>
            <div className="space-y-2"><label className="text-sm font-medium">Annual Value (£)</label>
              <Input type="number" placeholder="0.00" value={form.annual_value} onChange={e => setForm(f => ({ ...f, annual_value: e.target.value }))} /></div>
            <div className="space-y-2"><label className="text-sm font-medium">Description</label>
              <Textarea placeholder="Scope of works, terms, notes..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Create Contract</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ─── Schedules Tab ───────────────────────────────────────────────────────────
const SchedulesTab = ({
  companyId, contracts, assets, schedules, loading, onRefresh,
}: {
  companyId: string;
  contracts: ServiceContract[];
  assets: Asset[];
  schedules: (ServiceSchedule & { asset_name?: string; contract_title?: string })[];
  loading: boolean;
  onRefresh: () => void;
}) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ contract_id: '', asset_id: '', frequency: '' as ServiceFrequency | '', next_due_at: '', notice_days: '14' });

  const activeContracts = contracts.filter(c => c.status === 'active');

  const save = async () => {
    if (!form.contract_id || !form.asset_id || !form.frequency || !form.next_due_at) {
      toast({ title: 'Required', description: 'All fields are required.', variant: 'destructive' }); return;
    }
    setSaving(true);

    const noticeDays = parseInt(form.notice_days) || 14;
    const nextDueAt = new Date(form.next_due_at);
    const windowStart = new Date(nextDueAt);
    windowStart.setDate(windowStart.getDate() - noticeDays);

    // Get contract to find contractor_id and company_id
    const { data: contractData } = await supabase
      .from('service_contracts')
      .select('contractor_id, company_id')
      .eq('id', form.contract_id)
      .maybeSingle();

    const { data: scheduleData, error } = await supabase.from('service_schedules').insert({
      contract_id: form.contract_id, asset_id: form.asset_id,
      frequency: form.frequency as ServiceFrequency,
      next_due_at: nextDueAt.toISOString(),
      notice_days: noticeDays,
    }).select('id').single();

    if (error || !scheduleData) {
      toast({ title: 'Error', description: 'Failed to create schedule.', variant: 'destructive' });
      setSaving(false); return;
    }

    // Auto-generate first visit
    if (contractData) {
      await supabase.from('service_visits').insert({
        schedule_id: scheduleData.id,
        asset_id: form.asset_id,
        contractor_id: contractData.contractor_id,
        company_id: contractData.company_id,
        scheduled_window_start: windowStart.toISOString(),
        scheduled_window_end: nextDueAt.toISOString(),
        status: 'scheduled',
      });
    }

    toast({ title: 'Schedule created', description: 'First service visit has been generated.' });
    setSaving(false); setOpen(false); onRefresh();
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-muted-foreground text-sm">{schedules.length} schedule{schedules.length !== 1 ? 's' : ''}</p>
        <Button onClick={() => { setForm({ contract_id: '', asset_id: '', frequency: '', next_due_at: '', notice_days: '14' }); setOpen(true); }}
          disabled={activeContracts.length === 0 || assets.length === 0} className="gap-2">
          <Plus className="h-4 w-4" />Add Schedule
        </Button>
      </div>

      {activeContracts.length === 0 && <Card><CardContent className="p-4 text-center text-muted-foreground text-sm">Activate a service contract before adding schedules.</CardContent></Card>}

      {schedules.length === 0 ? (
        <Card><CardContent className="p-12 text-center">
          <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No schedules yet</h3>
          <p className="text-muted-foreground">Add maintenance schedules to track when each asset needs servicing.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {schedules.map(schedule => {
            const overdue = isOverdue(schedule.next_due_at);
            const dueDate = new Date(schedule.next_due_at);
            const daysUntil = Math.ceil((dueDate.getTime() - Date.now()) / 86400000);
            return (
              <Card key={schedule.id} className={overdue ? 'border-red-200' : ''}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="font-semibold">{schedule.asset_name ?? 'Asset'}</p>
                        <Badge variant="outline" className="text-xs">{FREQUENCY_LABELS[schedule.frequency]}</Badge>
                        {overdue ? (
                          <Badge variant="outline" className="text-xs bg-red-100 text-red-800 border-red-200">Overdue</Badge>
                        ) : daysUntil <= (schedule.notice_days ?? 14) ? (
                          <Badge variant="outline" className="text-xs bg-orange-100 text-orange-800 border-orange-200">Due soon</Badge>
                        ) : null}
                      </div>
                      <p className="text-sm text-muted-foreground">{schedule.contract_title ?? 'Contract'}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Next due: {fmtDate(schedule.next_due_at)}
                        {schedule.last_completed_at && ` · Last done: ${fmtDate(schedule.last_completed_at)}`}
                      </p>
                    </div>
                    {overdue ? <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" /> : <Clock className="h-5 w-5 text-muted-foreground shrink-0" />}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Maintenance Schedule</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2"><label className="text-sm font-medium">Service Contract</label>
              <Select value={form.contract_id} onValueChange={v => setForm(f => ({ ...f, contract_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select contract" /></SelectTrigger>
                <SelectContent>{activeContracts.map(c => <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-2"><label className="text-sm font-medium">Asset</label>
              <Select value={form.asset_id} onValueChange={v => setForm(f => ({ ...f, asset_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select asset" /></SelectTrigger>
                <SelectContent>{assets.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-2"><label className="text-sm font-medium">Frequency</label>
              <Select value={form.frequency} onValueChange={v => setForm(f => ({ ...f, frequency: v as ServiceFrequency }))}>
                <SelectTrigger><SelectValue placeholder="Select frequency" /></SelectTrigger>
                <SelectContent>{ALL_FREQUENCIES.map(f => <SelectItem key={f} value={f}>{FREQUENCY_LABELS[f]}</SelectItem>)}</SelectContent>
              </Select></div>
            <div className="space-y-2"><label className="text-sm font-medium">Next Due Date</label>
              <Input type="date" value={form.next_due_at} onChange={e => setForm(f => ({ ...f, next_due_at: e.target.value }))} /></div>
            <div className="space-y-2"><label className="text-sm font-medium">Notify days before due</label>
              <Input type="number" value={form.notice_days} onChange={e => setForm(f => ({ ...f, notice_days: e.target.value }))} min="1" max="90" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Create Schedule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// ─── Visits Tab ──────────────────────────────────────────────────────────────
const FREQUENCY_DAYS_MAP: Record<string, number> = {
  weekly: 7, bi_weekly: 14, monthly: 30, bi_monthly: 61, quarterly: 91,
  six_monthly: 183, annual: 365, '2_yearly': 730, '3_yearly': 1095,
  '4_yearly': 1460, '5_yearly': 1825, '6_yearly': 2190, '7_yearly': 2555,
  '8_yearly': 2920, '9_yearly': 3285, '10_yearly': 3650,
};

const VisitsTab = ({
  visits, documents, loading, onRefresh,
}: {
  visits: (ServiceVisit & { asset_name?: string; contractor_name?: string })[];
  documents: ServiceDocument[];
  loading: boolean;
  onRefresh: () => void;
}) => {
  const { toast } = useToast();
  const [selectedVisit, setSelectedVisit] = useState<typeof visits[0] | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [completing, setCompleting] = useState(false);

  const filtered = filterStatus === 'all' ? visits : visits.filter(v => v.status === filterStatus);
  const visitDocs = selectedVisit ? documents.filter(d => d.visit_id === selectedVisit.id) : [];

  const handleMarkComplete = async (visit: typeof visits[0]) => {
    setCompleting(true);
    const completedAt = new Date().toISOString();

    await supabase.from('service_visits').update({
      status: 'completed',
      completed_at: completedAt,
    }).eq('id', visit.id);

    const { data: schedule } = await supabase
      .from('service_schedules')
      .select('*')
      .eq('id', visit.schedule_id)
      .maybeSingle();

    if (schedule) {
      const days = FREQUENCY_DAYS_MAP[schedule.frequency] ?? 365;
      const nextDue = new Date(completedAt);
      nextDue.setDate(nextDue.getDate() + days);
      const windowStart = new Date(nextDue);
      windowStart.setDate(windowStart.getDate() - (schedule.notice_days ?? 14));

      await supabase.from('service_schedules').update({
        last_completed_at: completedAt,
        next_due_at: nextDue.toISOString(),
      }).eq('id', schedule.id);

      const { data: contract } = await supabase
        .from('service_contracts')
        .select('contractor_id, company_id')
        .eq('id', schedule.contract_id)
        .maybeSingle();

      if (contract) {
        await supabase.from('service_visits').insert({
          schedule_id: schedule.id,
          asset_id: visit.asset_id,
          contractor_id: contract.contractor_id,
          company_id: contract.company_id,
          scheduled_window_start: windowStart.toISOString(),
          scheduled_window_end: nextDue.toISOString(),
          status: 'scheduled',
        });
      }
    }

    toast({ title: 'Visit completed', description: 'Next visit has been automatically scheduled.' });
    setCompleting(false);
    setDetailOpen(false);
    onRefresh();
  };

  if (loading) return <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All visits</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="overdue">Overdue</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-muted-foreground">{filtered.length} visit{filtered.length !== 1 ? 's' : ''}</p>
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="p-12 text-center">
          <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No visits yet</h3>
          <p className="text-muted-foreground">Service visits will appear here once schedules are active and visits are booked.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(visit => {
            const cfg = VISIT_STATUS_CONFIG[visit.status];
            return (
              <Card key={visit.id} className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => { setSelectedVisit(visit); setDetailOpen(true); }}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="font-semibold">{visit.asset_name ?? 'Asset'}</p>
                        <Badge variant="outline" className={`text-xs ${cfg.colour}`}>{cfg.label}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{visit.contractor_name ?? 'Contractor'}</p>
                      <div className="flex gap-4 text-xs text-muted-foreground mt-1">
                        <span>Window: {fmtDate(visit.scheduled_window_start)} – {fmtDate(visit.scheduled_window_end)}</span>
                        {visit.confirmed_date && <span>Confirmed: {fmtDate(visit.confirmed_date)}</span>}
                        {visit.completed_at && <span>Completed: {fmtDate(visit.completed_at)}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {documents.filter(d => d.visit_id === visit.id).length > 0 && (
                        <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700">
                          {documents.filter(d => d.visit_id === visit.id).length} doc{documents.filter(d => d.visit_id === visit.id).length !== 1 ? 's' : ''}
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

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-md">
          {selectedVisit && (
            <>
              <DialogHeader>
                <DialogTitle>Visit — {selectedVisit.asset_name ?? 'Asset'}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="flex gap-2 flex-wrap">
                  <Badge variant="outline" className={VISIT_STATUS_CONFIG[selectedVisit.status].colour}>
                    {VISIT_STATUS_CONFIG[selectedVisit.status].label}
                  </Badge>
                </div>
                <div className="space-y-2 text-sm">
                  <div><p className="text-xs text-muted-foreground">Contractor</p><p>{selectedVisit.contractor_name ?? '—'}</p></div>
                  <div><p className="text-xs text-muted-foreground">Scheduled Window</p>
                    <p>{fmtDate(selectedVisit.scheduled_window_start)} – {fmtDate(selectedVisit.scheduled_window_end)}</p></div>
                  {selectedVisit.confirmed_date && <div><p className="text-xs text-muted-foreground">Confirmed Date</p><p>{fmtDate(selectedVisit.confirmed_date)}</p></div>}
                  {selectedVisit.completed_at && <div><p className="text-xs text-muted-foreground">Completed</p><p>{fmtDate(selectedVisit.completed_at)}</p></div>}
                  {selectedVisit.notes && <div><p className="text-xs text-muted-foreground">Notes</p><p>{selectedVisit.notes}</p></div>}
                </div>

                {/* Business can mark complete if contractor hasn't */}
                {(selectedVisit.status === 'confirmed' || selectedVisit.status === 'scheduled') && (
                  <div className="border rounded-lg p-4">
                    <p className="text-sm font-medium mb-2">Mark as Complete</p>
                    <p className="text-xs text-muted-foreground mb-3">This will automatically schedule the next visit based on the service frequency.</p>
                    <Button
                      onClick={() => handleMarkComplete(selectedVisit)}
                      disabled={completing}
                      className="w-full bg-green-600 hover:bg-green-700 text-white"
                    >
                      {completing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                      Mark Complete & Schedule Next Visit
                    </Button>
                  </div>
                )}

                <div className="border-t pt-4">
                  <p className="text-sm font-medium mb-3">Compliance Documents</p>
                  {visitDocs.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No documents uploaded yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {visitDocs.map(doc => (
                        <div key={doc.id} className="flex items-center justify-between p-2 border rounded-lg">
                          <div>
                            <p className="text-sm font-medium">{doc.document_name}</p>
                            <p className="text-xs text-muted-foreground capitalize">{doc.document_type}</p>
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

// ─── Main Component ──────────────────────────────────────────────────────────
export const MaintenanceManagement = ({ companyId, profileId }: MaintenanceManagementProps) => {
  const { toast } = useToast();
  const [tab, setTab] = useState('sites');
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);

  const [sites, setSites] = useState<Site[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [contracts, setContracts] = useState<(ServiceContract & { contractor_name?: string; site_name?: string })[]>([]);
  const [schedules, setSchedules] = useState<(ServiceSchedule & { asset_name?: string; contract_title?: string })[]>([]);
  const [visits, setVisits] = useState<(ServiceVisit & { asset_name?: string; contractor_name?: string })[]>([]);
  const [documents, setDocuments] = useState<ServiceDocument[]>([]);
  const [panelContractors, setPanelContractors] = useState<{ id: string; name: string | null; ts_code: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    // Sites
    const { data: sitesData } = await supabase.from('sites').select('*').eq('company_id', companyId).order('name');
    setSites(sitesData ?? []);

    // Assets
    const { data: assetsData } = await supabase.from('assets').select('*').eq('company_id', companyId).eq('is_active', true).order('name');
    setAssets(assetsData ?? []);

    // Panel contractors (approved)
    const { data: panelData } = await supabase
      .from('contractor_panel')
      .select('contractor_id')
      .eq('company_id', companyId)
      .eq('status', 'approved');

    if (panelData?.length) {
      const ids = panelData.map(p => p.contractor_id).filter(Boolean) as string[];
      const { data: profilesData } = await supabase
        .from('profiles')
        .select('id, full_name, ts_profile_code')
        .in('id', ids);
      setPanelContractors(profilesData?.map(p => ({ id: p.id, name: p.full_name, ts_code: p.ts_profile_code })) ?? []);
    } else {
      setPanelContractors([]);
    }

    // Contracts with hydration
    const { data: contractsData } = await supabase.from('service_contracts').select('*').eq('company_id', companyId).order('created_at', { ascending: false });
    if (contractsData?.length) {
      const contractorIds = [...new Set(contractsData.map(c => c.contractor_id))];
      const siteIds = [...new Set(contractsData.map(c => c.site_id).filter(Boolean))] as string[];
      const [{ data: cProfiles }, { data: cSites }] = await Promise.all([
        supabase.from('profiles').select('id, full_name').in('id', contractorIds),
        siteIds.length ? supabase.from('sites').select('id, name').in('id', siteIds) : Promise.resolve({ data: [] }),
      ]);
      setContracts(contractsData.map(c => ({
        ...c,
        contractor_name: cProfiles?.find(p => p.id === c.contractor_id)?.full_name ?? undefined,
        site_name: cSites?.find(s => s.id === c.site_id)?.name ?? undefined,
      })));
    } else {
      setContracts([]);
    }

    // Schedules with hydration
    const { data: schedulesData } = await supabase.from('service_schedules').select('*').eq('is_active', true).order('next_due_at');
    if (schedulesData?.length) {
      const assetIds = [...new Set(schedulesData.map(s => s.asset_id))];
      const contractIds = [...new Set(schedulesData.map(s => s.contract_id))];
      const [{ data: sAssets }, { data: sContracts }] = await Promise.all([
        supabase.from('assets').select('id, name').in('id', assetIds),
        supabase.from('service_contracts').select('id, title').in('id', contractIds),
      ]);
      setSchedules(schedulesData.map(s => ({
        ...s,
        asset_name: sAssets?.find(a => a.id === s.asset_id)?.name ?? undefined,
        contract_title: sContracts?.find(c => c.id === s.contract_id)?.title ?? undefined,
      })));
    } else {
      setSchedules([]);
    }

    // Visits with hydration
    const { data: visitsData } = await supabase.from('service_visits').select('*').eq('company_id', companyId).order('scheduled_window_start', { ascending: false });
    if (visitsData?.length) {
      const assetIds = [...new Set(visitsData.map(v => v.asset_id))];
      const contractorIds = [...new Set(visitsData.map(v => v.contractor_id))];
      const [{ data: vAssets }, { data: vProfiles }] = await Promise.all([
        supabase.from('assets').select('id, name').in('id', assetIds),
        supabase.from('profiles').select('id, full_name').in('id', contractorIds),
      ]);
      setVisits(visitsData.map(v => ({
        ...v,
        asset_name: vAssets?.find(a => a.id === v.asset_id)?.name ?? undefined,
        contractor_name: vProfiles?.find(p => p.id === v.contractor_id)?.full_name ?? undefined,
      })));

      // Documents
      const visitIds = visitsData.map(v => v.id);
      const { data: docsData } = await supabase.from('service_documents').select('*').in('visit_id', visitIds);
      setDocuments(docsData ?? []);
    } else {
      setVisits([]);
      setDocuments([]);
    }

    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  // Overview stats
  const overdueCount = schedules.filter(s => isOverdue(s.next_due_at)).length;
  const dueSoonCount = schedules.filter(s => {
    const days = Math.ceil((new Date(s.next_due_at).getTime() - Date.now()) / 86400000);
    return days >= 0 && days <= 30;
  }).length;
  const activeContracts = contracts.filter(c => c.status === 'active').length;
  const pendingVisits = visits.filter(v => v.status === 'scheduled' || v.status === 'confirmed').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Maintenance & Compliance</h2>
          <p className="text-muted-foreground text-sm mt-1">Manage planned preventative maintenance across your sites and assets.</p>
        </div>
      </div>

      {/* Overview stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-blue-100 flex items-center justify-center shrink-0"><FileText className="h-5 w-5 text-blue-700" /></div>
          <div><p className="text-2xl font-bold">{activeContracts}</p><p className="text-xs text-muted-foreground">Active Contracts</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-yellow-100 flex items-center justify-center shrink-0"><Clock className="h-5 w-5 text-yellow-700" /></div>
          <div><p className="text-2xl font-bold">{dueSoonCount}</p><p className="text-xs text-muted-foreground">Due This Month</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${overdueCount > 0 ? 'bg-red-100' : 'bg-green-100'}`}>
            {overdueCount > 0 ? <AlertTriangle className="h-5 w-5 text-red-700" /> : <CheckCircle2 className="h-5 w-5 text-green-700" />}
          </div>
          <div><p className="text-2xl font-bold">{overdueCount}</p><p className="text-xs text-muted-foreground">Overdue</p></div>
        </CardContent></Card>
        <Card><CardContent className="p-4 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-purple-100 flex items-center justify-center shrink-0"><Calendar className="h-5 w-5 text-purple-700" /></div>
          <div><p className="text-2xl font-bold">{pendingVisits}</p><p className="text-xs text-muted-foreground">Pending Visits</p></div>
        </CardContent></Card>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="sites">Sites</TabsTrigger>
          <TabsTrigger value="assets">Assets</TabsTrigger>
          <TabsTrigger value="contracts">Contracts</TabsTrigger>
          <TabsTrigger value="schedules">Schedules</TabsTrigger>
          <TabsTrigger value="visits">Visits</TabsTrigger>
        </TabsList>

        <TabsContent value="sites" className="mt-6">
          <SitesTab companyId={companyId} sites={sites} loading={loading} onRefresh={load}
            onSelectSite={(s) => { setSelectedSite(s); setTab('assets'); }} />
        </TabsContent>

        <TabsContent value="assets" className="mt-6">
          <AssetsTab companyId={companyId} sites={sites} assets={assets} loading={loading} onRefresh={load} />
        </TabsContent>

        <TabsContent value="contracts" className="mt-6">
          <ContractsTab companyId={companyId} sites={sites} contracts={contracts}
            panelContractors={panelContractors} loading={loading} onRefresh={load}
            onSelectContract={(c) => { setTab('schedules'); }} />
        </TabsContent>

        <TabsContent value="schedules" className="mt-6">
          <SchedulesTab companyId={companyId} contracts={contracts} assets={assets}
            schedules={schedules} loading={loading} onRefresh={load} />
        </TabsContent>

        <TabsContent value="visits" className="mt-6">
          <VisitsTab visits={visits} documents={documents} loading={loading} onRefresh={load} />
        </TabsContent>
      </Tabs>
    </div>
  );
};
