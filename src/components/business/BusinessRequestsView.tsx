import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";
import { PriorityBadge, PRIORITY_CONFIG } from "@/components/PriorityBadge";

// ── Types ──────────────────────────────────────────────────────────────────

interface Company {
  owner_id: string;
  name: string;
  contact_email: string | null;
  email: string | null;
  contact_phone: string | null;
  phone: string | null;
}

interface Site {
  id: string;
  name: string;
  address: string;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postcode: string;
}

interface Asset {
  id: string;
  name: string;
  site_id: string;
}

interface PanelContractor {
  id: string;
  full_name: string | null;
  ts_profile_code: string | null;
}

interface RequestRow {
  id: string;
  title: string | null;
  site_id: string | null;
  asset_id: string | null;
  contractor_id: string | null;
  status: string | null;
  priority: string | null;
  created_at: string | null;
  site_name?: string;
  asset_name?: string;
  contractor_name?: string;
}

interface SlaRule {
  priority: string;
  response_hours: number;
  resolution_hours: number;
}

interface Props {
  companyId: string;
  profileId: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function siteLocation(site: Site): string {
  const parts = [
    site.address_line1 ?? site.address,
    site.address_line2,
    site.city,
    site.postcode,
  ].filter((p): p is string => !!p);
  return parts.join(", ") || site.name;
}

const STATUS_COLOUR: Record<string, string> = {
  new:       "bg-blue-100 text-blue-800 border-blue-200",
  converted: "bg-green-100 text-green-800 border-green-200",
  closed:    "bg-gray-100 text-gray-600 border-gray-200",
};
const STATUS_LABEL: Record<string, string> = {
  new:       "New",
  converted: "Converted",
  closed:    "Closed",
};

// ── Component ─────────────────────────────────────────────────────────────

export function BusinessRequestsView({ companyId, profileId: _profileId }: Props) {
  const { toast } = useToast();

  const [company, setCompany] = useState<Company | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [contractors, setContractors] = useState<PanelContractor[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [slaRules, setSlaRules] = useState<SlaRule[]>([]);
  const [loading, setLoading] = useState(true);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [formSiteId, setFormSiteId] = useState("");
  const [formAssetId, setFormAssetId] = useState("none");
  const [formContractorId, setFormContractorId] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPriority, setFormPriority] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);

    // a. Company row
    const { data: companyRow } = await supabase
      .from("companies")
      .select("owner_id, name, contact_email, email, contact_phone, phone")
      .eq("id", companyId)
      .maybeSingle();
    setCompany(companyRow as Company | null);

    // b. Sites
    const { data: sitesData } = await supabase
      .from("sites")
      .select("id, name, address, address_line1, address_line2, city, postcode")
      .eq("company_id", companyId)
      .order("name");
    const siteList = (sitesData ?? []) as Site[];
    setSites(siteList);

    // c. Assets for this company; filter by site client-side
    const { data: assetsData } = await supabase
      .from("assets")
      .select("id, name, site_id")
      .eq("company_id", companyId)
      .order("name");
    const assetList = (assetsData ?? []) as Asset[];
    setAssets(assetList);

    // d. Approved panel contractors — two-step (mirror PanelManagement)
    const { data: panelRows } = await supabase
      .from("contractor_panel")
      .select("contractor_id")
      .eq("company_id", companyId)
      .eq("status", "approved");

    const hydrated: PanelContractor[] = await Promise.all(
      (panelRows ?? [])
        .filter((r) => !!r.contractor_id)
        .map(async (row) => {
          const { data: prof } = await supabase
            .from("profiles")
            .select("full_name, ts_profile_code")
            .eq("id", row.contractor_id!)
            .maybeSingle();
          return {
            id: row.contractor_id as string,
            full_name: prof?.full_name ?? null,
            ts_profile_code: prof?.ts_profile_code ?? null,
          };
        })
    );
    setContractors(hydrated);

    // e. SLA rules for this company — used to show response/resolution targets per priority
    const { data: slaRows } = await supabase
      .from("sla_rules")
      .select("priority, response_hours, resolution_hours")
      .eq("company_id", companyId);
    setSlaRules((slaRows ?? []) as SlaRule[]);

    // f. Existing requests for this company
    const { data: reqData } = await supabase
      .from("enquiries")
      .select("id, title, site_id, asset_id, contractor_id, status, priority, created_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    const siteMap = Object.fromEntries(siteList.map((s) => [s.id, s.name]));
    const assetMap = Object.fromEntries(assetList.map((a) => [a.id, a.name]));
    const contractorMap = Object.fromEntries(
      hydrated.map((c) => [c.id, c.full_name ?? c.ts_profile_code ?? c.id])
    );

    setRequests(
      (reqData ?? []).map((r) => ({
        ...r,
        site_name:       r.site_id       ? siteMap[r.site_id]             : undefined,
        asset_name:      r.asset_id      ? assetMap[r.asset_id]           : undefined,
        contractor_name: r.contractor_id ? contractorMap[r.contractor_id] : undefined,
      }))
    );

    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const resetForm = () => {
    setFormSiteId("");
    setFormAssetId("none");
    setFormContractorId("");
    setFormTitle("");
    setFormDescription("");
    setFormPriority("");
  };

  const handleSubmit = async () => {
    if (!formSiteId)           { toast({ title: "Site required",       variant: "destructive" }); return; }
    if (!formContractorId)     { toast({ title: "Contractor required", variant: "destructive" }); return; }
    if (!formPriority)         { toast({ title: "Priority required",   variant: "destructive" }); return; }
    if (!formTitle.trim())     { toast({ title: "Title required",      variant: "destructive" }); return; }
    if (!formDescription.trim()) { toast({ title: "Description required", variant: "destructive" }); return; }
    if (!company)              { toast({ title: "Company data not loaded", variant: "destructive" }); return; }

    const site = sites.find((s) => s.id === formSiteId);
    if (!site) { toast({ title: "Invalid site", variant: "destructive" }); return; }

    setSubmitting(true);

    const { data: enquiryRow, error } = await supabase.from("enquiries").insert({
      company_id:       companyId,
      site_id:          formSiteId,
      asset_id:         formAssetId !== "none" ? formAssetId : null,
      contractor_id:    formContractorId,
      customer_id:      company.owner_id,
      customer_name:    company.name,
      customer_email:   company.contact_email ?? company.email ?? null,
      customer_phone:   company.contact_phone ?? company.phone ?? null,
      customer_ts_code: null,   // companies table has no TS code column
      title:            formTitle.trim(),
      job_description:  formDescription.trim(),
      location:         siteLocation(site),
      status:           "new",
      priority:         formPriority,
    }).select("id").single();

    setSubmitting(false);

    if (error) {
      toast({ title: "Failed to submit request", description: error.message, variant: "destructive" });
      return;
    }

    await supabase.from("notifications").insert({
      user_id: formContractorId,
      title: "New work request",
      message: `${company.name} sent a new work request: ${formTitle.trim()}`,
      type: "enquiry",
      reference_id: enquiryRow.id,
      reference_type: "enquiry",
      is_read: false,
    }).catch(console.error);

    supabase.functions
      .invoke("notify-contractor", { body: { enquiry_id: enquiryRow.id } })
      .catch(console.error);

    toast({ title: "Request submitted" });
    setDialogOpen(false);
    resetForm();
    load();
  };

  const siteAssets = assets.filter((a) => a.site_id === formSiteId);
  const canCreate  = sites.length > 0 && contractors.length > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-heading text-2xl font-bold">Requests</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Direct work requests to your approved panel contractors.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button
            onClick={() => setDialogOpen(true)}
            disabled={!canCreate}
            className="gap-2"
          >
            <i className="ti ti-send" style={{ fontSize: 16 }} />
            New request
          </Button>
          {!canCreate && (
            <p className="text-xs text-muted-foreground">
              {sites.length === 0
                ? "Add a site before raising a request."
                : "No approved panel contractors yet."}
            </p>
          )}
        </div>
      </div>

      {/* Requests list */}
      {requests.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <i
              className="ti ti-send"
              style={{ fontSize: 40, color: "#d1d5db", display: "block", marginBottom: 12 }}
            />
            <p className="font-medium mb-1">No requests yet</p>
            <p className="text-sm text-muted-foreground">
              {canCreate
                ? "Use New request to send work directly to a panel contractor."
                : sites.length === 0
                  ? "Add a site first, then invite contractors to your panel."
                  : "Approve contractors on your panel to start raising requests."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => {
            const colour = STATUS_COLOUR[req.status ?? ""] ?? "bg-gray-100 text-gray-600 border-gray-200";
            const label  = STATUS_LABEL[req.status ?? ""]  ?? (req.status ?? "—");
            return (
              <Card key={req.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold truncate">{req.title ?? "Untitled"}</p>
                        <PriorityBadge priority={req.priority} />
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-muted-foreground">
                        <span>
                          <i className="ti ti-building-skyscraper mr-1 text-xs" />
                          {req.site_name ?? "—"}
                        </span>
                        <span>
                          <i className="ti ti-tools mr-1 text-xs" />
                          {req.asset_name ?? "—"}
                        </span>
                        <span>
                          <i className="ti ti-user mr-1 text-xs" />
                          {req.contractor_name ?? "—"}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${colour}`}
                      >
                        {label}
                      </span>
                      {req.created_at && (
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(req.created_at), "d MMM yyyy")}
                        </span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* New-request dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => { setDialogOpen(o); if (!o) resetForm(); }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Request</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* 1. Site */}
            <div className="space-y-2">
              <Label>
                Site <span className="text-destructive">*</span>
              </Label>
              <Select
                value={formSiteId}
                onValueChange={(v) => { setFormSiteId(v); setFormAssetId("none"); }}
                disabled={submitting}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a site..." />
                </SelectTrigger>
                <SelectContent>
                  {sites.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 2. Asset (optional) */}
            <div className="space-y-2">
              <Label>Asset (optional)</Label>
              <Select
                value={formAssetId}
                onValueChange={setFormAssetId}
                disabled={!formSiteId || submitting}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={formSiteId ? "None / general" : "Choose a site first"}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None / general</SelectItem>
                  {siteAssets.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 3. Contractor */}
            <div className="space-y-2">
              <Label>
                Contractor <span className="text-destructive">*</span>
              </Label>
              <Select
                value={formContractorId}
                onValueChange={setFormContractorId}
                disabled={submitting}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a contractor..." />
                </SelectTrigger>
                <SelectContent>
                  {contractors.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.full_name ?? c.id}
                      {c.ts_profile_code ? ` (${c.ts_profile_code})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* 4. Priority */}
            <div className="space-y-2">
              <Label>
                Priority <span className="text-destructive">*</span>
              </Label>
              <Select
                value={formPriority}
                onValueChange={setFormPriority}
                disabled={submitting}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a priority..." />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_CONFIG).map(([value, config]) => (
                    <SelectItem key={value} value={value}>
                      {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formPriority && (() => {
                const rule = slaRules.find((r) => r.priority === formPriority);
                return rule ? (
                  <p className="text-xs text-muted-foreground">
                    {PRIORITY_CONFIG[formPriority]?.label}: {rule.response_hours}hr response,{" "}
                    {rule.resolution_hours}hr resolution
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    No SLA policy configured for this priority yet.
                  </p>
                );
              })()}
            </div>

            {/* 5. Title */}
            <div className="space-y-2">
              <Label>
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Brief description of the work needed"
                disabled={submitting}
              />
            </div>

            {/* 6. Description */}
            <div className="space-y-2">
              <Label>
                Description <span className="text-destructive">*</span>
              </Label>
              <Textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Provide full details of the work required..."
                className="min-h-24"
                disabled={submitting}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => { setDialogOpen(false); resetForm(); }}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={() => void handleSubmit()} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Submit request
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
