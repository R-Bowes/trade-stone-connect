import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ArrowLeft, Plus, Search } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { VerificationBadge } from "@/components/verification/VerificationBadge";
import ContractorDirectory from "@/components/ContractorDirectory";
import { useServiceRequests, type ServiceRequest, type ServiceRequestStatus } from "@/hooks/useServiceRequests";
import { useWorkOrders, type AvailableContractor, type WorkOrderPriority } from "@/hooks/useWorkOrders";

type SiteContactRow = {
  id: string;
  company_id: string;
  site_id: string;
  full_name: string;
  can_raise_requests: boolean;
  can_select_contractor: boolean;
  can_search_marketplace: boolean;
  site: { id: string; name: string } | null;
};

type Category = { id: string; name: string; trade: string | null; default_priority: WorkOrderPriority };

type AutonomyConfig = {
  autonomy_level: number;
  max_wo_value: number | null;
  max_monthly_spend: number | null;
  approval_threshold: number | null;
  auto_dispatch_rules: { category: string; engagement_id: string }[] | null;
};

const STATUS_LABEL: Record<ServiceRequestStatus, string> = {
  open: "Open", triaged: "Triaged", dispatched: "Dispatched", cancelled: "Cancelled", completed: "Completed",
};
const STATUS_COLOR: Record<ServiceRequestStatus, string> = {
  open: "bg-slate-100 text-slate-700",
  triaged: "bg-blue-100 text-blue-800",
  dispatched: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
  completed: "bg-green-100 text-green-800",
};
const PRIORITY_LABEL: Record<WorkOrderPriority, string> = {
  emergency: "Emergency", urgent: "Urgent", routine: "Routine", planned: "Planned",
};

async function uploadPortalPhoto(file: File): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  const fileExt = file.name.split(".").pop();
  // First path segment must be the uploader's own auth.uid() — matches the
  // documents bucket's existing generic "own folder" storage policy
  // (20260308191337), so no new storage policy is needed for site contacts.
  const path = `${user.id}/service-requests/${Date.now()}.${fileExt}`;
  const { error } = await supabase.storage.from("documents").upload(path, file);
  if (error) throw error;
  return path;
}

export default function SitePortal() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { createRequest, fetchMyRequests } = useServiceRequests();
  const { fetchAvailableContractors, dispatchWorkOrder } = useWorkOrders();

  const [loading, setLoading] = useState(true);
  const [myContacts, setMyContacts] = useState<SiteContactRow[]>([]);
  const [activeContact, setActiveContact] = useState<SiteContactRow | null>(null);
  const [autonomy, setAutonomy] = useState<AutonomyConfig | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [myRequests, setMyRequests] = useState<ServiceRequest[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);

  const [view, setView] = useState<"list" | "new">("list");
  const [selectedRequest, setSelectedRequest] = useState<ServiceRequest | null>(null);

  // New-request form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<WorkOrderPriority>("routine");
  const [categoryId, setCategoryId] = useState<string>("");
  const [locationInSite, setLocationInSite] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [candidates, setCandidates] = useState<AvailableContractor[]>([]);
  const [selectedContractor, setSelectedContractor] = useState<AvailableContractor | null>(null);
  const [showDirectory, setShowDirectory] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const { data } = await (supabase as any)
        .from("site_contacts")
        .select("id, company_id, site_id, full_name, can_raise_requests, can_select_contractor, can_search_marketplace, site:sites(id, name)")
        .eq("user_id", user.id)
        .eq("is_active", true);

      const rows = (data ?? []) as SiteContactRow[];
      setMyContacts(rows);
      if (rows.length === 1) setActiveContact(rows[0]);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!activeContact) return;
    (async () => {
      const { data: company } = await supabase.from("companies").select("name, logo_url").eq("id", activeContact.company_id).maybeSingle();
      setCompanyName(company?.name ?? "");
      setCompanyLogo(company?.logo_url ?? null);

      const { data: configRows } = await (supabase as any)
        .from("site_autonomy_config")
        .select("autonomy_level, max_wo_value, max_monthly_spend, approval_threshold, auto_dispatch_rules")
        .eq("company_id", activeContact.company_id)
        .or(`site_id.eq.${activeContact.site_id},site_id.is.null`)
        .order("site_id", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle();
      setAutonomy((configRows as AutonomyConfig) ?? { autonomy_level: 1, max_wo_value: null, max_monthly_spend: null, approval_threshold: null, auto_dispatch_rules: [] });

      const { data: catRows } = await (supabase as any)
        .from("service_request_categories")
        .select("id, name, trade, default_priority")
        .eq("company_id", activeContact.company_id)
        .eq("is_active", true)
        .order("sort_order");
      setCategories((catRows ?? []) as Category[]);

      const requests = await fetchMyRequests();
      setMyRequests(requests);
    })();
  }, [activeContact]);

  const level = autonomy?.autonomy_level ?? 1;

  const handleCategoryChange = (id: string) => {
    setCategoryId(id);
    const cat = categories.find((c) => c.id === id);
    if (cat?.default_priority) setPriority(cat.default_priority);
  };

  const autoDispatchNotice = (() => {
    if (level < 2 || !categoryId || !autonomy?.auto_dispatch_rules) return null;
    const cat = categories.find((c) => c.id === categoryId);
    const rule = autonomy.auto_dispatch_rules.find((r) => r.category === cat?.name);
    return rule ? "This will be automatically assigned to the pre-agreed contractor." : null;
  })();

  useEffect(() => {
    if (level < 3 || !activeContact) { setCandidates([]); return; }
    const cat = categories.find((c) => c.id === categoryId);
    fetchAvailableContractors(activeContact.company_id, activeContact.site_id, cat?.trade ?? undefined).then(setCandidates);
  }, [level, categoryId, activeContact, categories]);

  const resetForm = () => {
    setTitle(""); setDescription(""); setPriority("routine"); setCategoryId("");
    setLocationInSite(""); setFiles([]); setSelectedContractor(null); setShowDirectory(false); setBlockedMessage(null);
  };

  const checkSpendLimits = async (): Promise<string | null> => {
    if (level < 4 || !autonomy) return null;
    // No estimated-cost input exists in this simple form — the site's
    // standard call-out rate for the selected contractor's engagement is
    // used as the spend estimate, since that's the only figure available
    // at request time.
    if (!selectedContractor) return null;
    const { data: rate } = await supabase.rpc("effective_engagement_rates", { p_engagement_id: selectedContractor.engagement_id });
    const estimatedCost = rate ? Number((rate as any).callout_standard) : 0;

    if (autonomy.max_wo_value && estimatedCost > autonomy.max_wo_value) {
      return `This exceeds your spending limit of £${autonomy.max_wo_value.toFixed(2)}. Please contact your facilities manager.`;
    }
    if (autonomy.max_monthly_spend) {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const { data: monthWos } = await (supabase as any)
        .from("work_orders")
        .select("estimated_cost")
        .eq("site_id", activeContact!.site_id)
        .gte("created_at", monthStart.toISOString());
      const spent = (monthWos ?? []).reduce((sum: number, w: { estimated_cost: number | null }) => sum + Number(w.estimated_cost ?? 0), 0);
      if (spent + estimatedCost > autonomy.max_monthly_spend) {
        return `This exceeds your monthly spending limit of £${autonomy.max_monthly_spend.toFixed(2)}. Please contact your facilities manager.`;
      }
    }
    return null;
  };

  const handleSubmit = async () => {
    if (!activeContact || !title.trim()) return;
    setSubmitting(true);
    setBlockedMessage(null);
    try {
      const blocked = await checkSpendLimits();
      if (blocked) { setBlockedMessage(blocked); return; }

      const photoPaths: string[] = [];
      for (const file of files) {
        try { photoPaths.push(await uploadPortalPhoto(file)); }
        catch { /* individual upload failures are non-fatal */ }
      }

      const created = await createRequest({
        company_id: activeContact.company_id,
        site_id: activeContact.site_id,
        requested_by: (await supabase.auth.getUser()).data.user!.id,
        requested_by_name: activeContact.full_name,
        requested_by_role: "site_contact",
        category_id: categoryId || null,
        title: title.trim(),
        description: description || null,
        priority,
        location_in_site: locationInSite || null,
        photos: photoPaths,
      });

      // Level 3+: if the contact picked a contractor and the request wasn't
      // already auto-dispatched, dispatch it directly (approval threshold
      // is enforced by requires_approval on the work order rather than
      // blocking submission — FM sees it in the queue either way).
      if (created && level >= 3 && selectedContractor && created.status === "open") {
        const { data: { user } } = await supabase.auth.getUser();
        const { data: wo, error: woErr } = await (supabase as any)
          .from("work_orders")
          .insert({
            company_id: activeContact.company_id,
            raised_by: user!.id,
            raised_by_name: activeContact.full_name,
            service_request_id: created.id,
            site_id: activeContact.site_id,
            title: title.trim(),
            description: description || null,
            priority,
            status: "draft",
          })
          .select("id")
          .single();
        if (!woErr && wo) {
          await dispatchWorkOrder(wo.id, selectedContractor.contractor_id, selectedContractor.engagement_id);
          await (supabase as any).from("service_requests").update({ work_order_id: wo.id, status: "dispatched" }).eq("id", created.id);
        }
      }

      toast({ title: "Request submitted" });
      resetForm();
      setView("list");
      const requests = await fetchMyRequests();
      setMyRequests(requests);
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to submit request", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="flex justify-center items-center min-h-screen"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  if (myContacts.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center space-y-2">
            <h2 className="font-heading text-xl font-bold">No site access found</h2>
            <p className="text-sm text-muted-foreground">
              Your account isn't linked to a site yet. Ask your facilities manager to invite you using the email address you signed up with.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!activeContact) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardContent className="p-6 space-y-3">
            <h2 className="font-heading text-xl font-bold">Choose a site</h2>
            {myContacts.map((c) => (
              <Button key={c.id} variant="outline" className="w-full justify-start" onClick={() => setActiveContact(c)}>
                {c.site?.name ?? "Site"}
              </Button>
            ))}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="bg-white border-b px-6 py-4 flex items-center gap-3">
        {companyLogo && <img src={companyLogo} alt={companyName} className="h-8 w-8 object-contain" />}
        <div>
          <div className="font-heading font-bold">{companyName}</div>
          <div className="text-xs text-muted-foreground">{activeContact.site?.name} · Service Portal</div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto p-6 space-y-6">
        {view === "list" && (
          <>
            <div className="flex justify-between items-center">
              <h1 className="font-heading text-2xl font-bold">Service Requests</h1>
              {activeContact.can_raise_requests && (
                <Button onClick={() => setView("new")}>
                  <Plus className="h-4 w-4 mr-1" />Report an Issue
                </Button>
              )}
            </div>

            {myRequests.length === 0 ? (
              <Card><CardContent className="p-8 text-center text-muted-foreground">No requests submitted yet.</CardContent></Card>
            ) : (
              <div className="grid gap-2">
                {myRequests.map((r) => (
                  <Card key={r.id} className="cursor-pointer" onClick={() => setSelectedRequest(r)}>
                    <CardContent className="p-4 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{r.title}</div>
                        <div className="text-xs text-muted-foreground">{format(new Date(r.created_at), "d MMM yyyy")}</div>
                      </div>
                      <Badge className={STATUS_COLOR[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}

        {view === "new" && (
          <>
            <Button variant="ghost" size="sm" onClick={() => { resetForm(); setView("list"); }}>
              <ArrowLeft className="h-4 w-4 mr-1" />Back
            </Button>
            <h1 className="font-heading text-2xl font-bold">Report an Issue</h1>

            {/* Level 2+: category picker */}
            {level >= 2 && categories.length > 0 && (
              <div className="space-y-1">
                <Label>Category</Label>
                <Select value={categoryId} onValueChange={handleCategoryChange}>
                  <SelectTrigger><SelectValue placeholder="Select a category" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                {autoDispatchNotice && (
                  <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-1.5">{autoDispatchNotice}</p>
                )}
              </div>
            )}

            <div className="space-y-1">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Leaking tap in staff kitchen" />
            </div>
            <div className="space-y-1">
              <Label>Description</Label>
              <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Urgency</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as WorkOrderPriority)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="emergency">Emergency</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                  <SelectItem value="routine">Routine</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Location in building (optional)</Label>
              <Input value={locationInSite} onChange={(e) => setLocationInSite(e.target.value)} placeholder="e.g. 2nd floor, staff kitchen" />
            </div>
            <div className="space-y-1">
              <Label>Photos (optional)</Label>
              <Input type="file" accept="image/*" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
            </div>

            {/* Level 3+: contractor selection */}
            {level >= 3 && activeContact.can_select_contractor && (
              <div className="space-y-2 rounded-md border p-3">
                <Label>Assign Contractor</Label>
                {candidates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No panel contractors cover this site{categoryId ? " for this category" : ""} yet.</p>
                ) : (
                  <div className="grid gap-2">
                    {candidates.map((c) => (
                      <ContractorPickCard
                        key={c.contractor_id}
                        contractor={c}
                        selected={selectedContractor?.contractor_id === c.contractor_id}
                        onSelect={() => setSelectedContractor(c)}
                      />
                    ))}
                  </div>
                )}
                {autonomy?.approval_threshold != null && (
                  <p className="text-xs text-muted-foreground">
                    Requests estimated above £{autonomy.approval_threshold.toFixed(2)} require FM approval before dispatch.
                  </p>
                )}
              </div>
            )}

            {/* Level 4: full marketplace search */}
            {level >= 4 && activeContact.can_search_marketplace && (
              <div className="space-y-2">
                <Button type="button" variant="outline" onClick={() => setShowDirectory((v) => !v)}>
                  <Search className="h-4 w-4 mr-1" />{showDirectory ? "Hide" : "Search TradeStone"}
                </Button>
                {showDirectory && (
                  <div className="border rounded-md overflow-hidden">
                    <ContractorDirectory />
                  </div>
                )}
              </div>
            )}

            {blockedMessage && (
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{blockedMessage}</p>
            )}

            <Button onClick={handleSubmit} disabled={submitting || !title.trim()} className="w-full">
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Submit
            </Button>
          </>
        )}
      </main>

      {selectedRequest && (
        <RequestDetailSheet request={selectedRequest} onClose={() => setSelectedRequest(null)} />
      )}
    </div>
  );
}

function ContractorPickCard({ contractor, selected, onSelect }: {
  contractor: AvailableContractor;
  selected: boolean;
  onSelect: () => void;
}) {
  const [tier, setTier] = useState(1);
  useEffect(() => {
    supabase.from("contractor_verification_public").select("current_tier").eq("contractor_id", contractor.contractor_id).maybeSingle()
      .then(({ data }) => setTier(data?.current_tier ?? 1));
  }, [contractor.contractor_id]);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex items-center justify-between rounded-md border p-2 text-left ${selected ? "border-[#f07820] bg-orange-50" : ""}`}
    >
      <div>
        <div className="font-medium text-sm">{contractor.full_name}</div>
        <div className="text-xs font-mono text-muted-foreground">{contractor.ts_profile_code}</div>
      </div>
      {tier >= 2 && <VerificationBadge tier={tier} size="sm" />}
    </button>
  );
}

function RequestDetailSheet({ request, onClose }: { request: ServiceRequest; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <Card className="max-w-md w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <CardContent className="p-6 space-y-3">
          <div className="flex items-start justify-between">
            <h3 className="font-heading text-lg font-bold">{request.title}</h3>
            <Badge className={STATUS_COLOR[request.status]}>{STATUS_LABEL[request.status]}</Badge>
          </div>
          {request.category?.name && <div className="text-sm text-muted-foreground">Category: {request.category.name}</div>}
          <div className="text-sm text-muted-foreground">Priority: {PRIORITY_LABEL[request.priority]}</div>
          {request.location_in_site && <div className="text-sm text-muted-foreground">Location: {request.location_in_site}</div>}
          {request.description && <p className="text-sm">{request.description}</p>}
          <div className="text-xs text-muted-foreground">Raised {format(new Date(request.created_at), "d MMM yyyy 'at' HH:mm")}</div>
          {request.work_order && (
            <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
              Work order created — status: {request.work_order.status}
            </div>
          )}
          {request.triage_notes && (
            <div className="rounded-md border p-3 text-sm text-muted-foreground">{request.triage_notes}</div>
          )}
          <Button variant="outline" onClick={onClose} className="w-full">Close</Button>
        </CardContent>
      </Card>
    </div>
  );
}
