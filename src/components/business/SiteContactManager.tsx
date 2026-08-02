import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Plus, UserX, UserCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSiteContacts, type SiteContact } from "@/hooks/useSiteContacts";

type SiteOption = { id: string; name: string };

const emptyForm = { site_id: "", full_name: "", email: "", phone: "", role: "" };

export function SiteContactManager({ companyId }: { companyId: string }) {
  const { contacts, loading, fetchContacts, inviteContact, updateContact, deactivateContact } = useSiteContacts();
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [siteFilter, setSiteFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchContacts(companyId);
    supabase.from("sites").select("id, name").eq("company_id", companyId).eq("status", "active").order("name")
      .then(({ data }) => setSites((data ?? []) as SiteOption[]));
  }, [companyId]);

  const filtered = siteFilter === "all" ? contacts : contacts.filter((c) => c.site_id === siteFilter);

  const handleInvite = async () => {
    if (!form.full_name.trim() || !form.email.trim() || !form.site_id) return;
    setSaving(true);
    try {
      await inviteContact({
        company_id: companyId,
        site_id: form.site_id,
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: form.phone || null,
        role: form.role || null,
      });
      setDialogOpen(false);
      setForm(emptyForm);
    } catch {
      // toast handled in hook
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (c: SiteContact) => {
    if (c.is_active) {
      await deactivateContact(c.id);
    } else {
      await updateContact(c.id, { is_active: true });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center gap-2 flex-wrap">
        <h3 className="font-heading text-lg font-bold">Site Contacts</h3>
        <div className="flex gap-2">
          <Select value={siteFilter} onValueChange={setSiteFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="All sites" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sites</SelectItem>
              {sites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => setDialogOpen(true)}><Plus className="h-4 w-4 mr-1" />Invite Contact</Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-6"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-muted-foreground">No site contacts yet.</CardContent></Card>
      ) : (
        <div className="grid gap-2">
          {filtered.map((c) => (
            <Card key={c.id} className={!c.is_active ? "opacity-50" : ""}>
              <CardContent className="p-3 flex items-center justify-between gap-2">
                <div>
                  <div className="font-medium text-sm">{c.full_name} {c.role && <span className="text-muted-foreground font-normal">· {c.role}</span>}</div>
                  <div className="text-xs text-muted-foreground">{c.email} · {c.site?.name}</div>
                  <div className="flex gap-1 mt-1">
                    {c.can_raise_requests && <Badge variant="outline" className="text-[10px]">Raise requests</Badge>}
                    {c.can_select_contractor && <Badge variant="outline" className="text-[10px]">Select contractor</Badge>}
                    {c.can_search_marketplace && <Badge variant="outline" className="text-[10px]">Search marketplace</Badge>}
                    {!c.user_id && <Badge variant="outline" className="text-[10px] text-amber-700 border-amber-300">Invite pending</Badge>}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => toggleActive(c)}>
                  {c.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Invite Site Contact</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Site</Label>
              <Select value={form.site_id} onValueChange={(v) => setForm((f) => ({ ...f, site_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select a site" /></SelectTrigger>
                <SelectContent>{sites.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Name</Label><Input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Phone (optional)</Label><Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Role (optional)</Label><Input placeholder="e.g. Store Manager" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleInvite} disabled={saving || !form.full_name.trim() || !form.email.trim() || !form.site_id}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
