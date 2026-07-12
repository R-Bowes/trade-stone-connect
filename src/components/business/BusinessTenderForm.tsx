import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { CONTRACTOR_TRADES } from "@/constants/trades";

interface Props {
  companyId: string;
  profileId: string;
}

interface SiteOption {
  id: string;
  name: string;
}

interface FormState {
  title: string;
  tenderType: "works" | "term";
  trades: string[];
  siteIds: string[];
  responseDeadline: string; // <input type="datetime-local"> value
}

const EMPTY_FORM: FormState = {
  title: "",
  tenderType: "works",
  trades: [],
  siteIds: [],
  responseDeadline: "",
};

// ISO timestamptz -> the value a <input type="datetime-local"> can display
// (local time, minute precision, no timezone suffix).
function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// The essentials card only — title, type, trade, sites, deadline. Optional
// sections (scope, budget, requirements, etc.) are a later slice; publish
// is stubbed (disabled button) until the publish-transition slice lands.
//
// Route contract: no ?tender= param = create mode (first Save does an
// INSERT, tender_number omitted so assign_tender_number_trigger mints it
// server-side); ?tender=<id> = resume mode (loads the existing draft,
// subsequent Saves UPDATE). On a successful first save, the URL is swapped
// to the resume form via navigate(..., { replace: true }) so a refresh
// continues editing the same row instead of risking a second draft.
export function BusinessTenderForm({ companyId, profileId }: Props) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const paramTenderId = searchParams.get("tender");
  const { toast } = useToast();

  const [tenderId, setTenderId] = useState<string | null>(paramTenderId);
  const [tenderNumber, setTenderNumber] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  // The site IDs actually persisted in tender_sites as of the last
  // successful save (or [] for a fresh create). Diffed against
  // form.siteIds at save time so only the delta is written — see handleSave.
  const [existingSiteIds, setExistingSiteIds] = useState<string[]>([]);
  const [sites, setSites] = useState<SiteOption[]>([]);
  const [tradeSearch, setTradeSearch] = useState("");
  const [loadingExisting, setLoadingExisting] = useState(!!paramTenderId);
  const [saving, setSaving] = useState(false);

  // Company's sites, for the checklist.
  useEffect(() => {
    supabase
      .from("sites")
      .select("id, name")
      .eq("company_id", companyId)
      .order("name")
      .then(({ data }) => setSites(data ?? []));
  }, [companyId]);

  // Resume mode: load the existing draft + its current site selection.
  useEffect(() => {
    if (!paramTenderId) return;

    (async () => {
      const [{ data: tender }, { data: siteLinks }] = await Promise.all([
        supabase
          .from("tenders")
          .select("id, tender_number, title, tender_type, trade_categories, response_deadline")
          .eq("id", paramTenderId)
          .maybeSingle(),
        supabase
          .from("tender_sites")
          .select("site_id")
          .eq("tender_id", paramTenderId),
      ]);

      if (tender) {
        const loadedSiteIds = (siteLinks ?? []).map((r) => r.site_id);
        setForm({
          title: tender.title,
          tenderType: tender.tender_type as "works" | "term",
          trades: tender.trade_categories ?? [],
          siteIds: loadedSiteIds,
          responseDeadline: tender.response_deadline ? toDatetimeLocalValue(tender.response_deadline) : "",
        });
        setExistingSiteIds(loadedSiteIds);
        setTenderNumber(tender.tender_number);
      }
      setLoadingExisting(false);
    })();
  }, [paramTenderId]);

  const toggleTrade = (t: string) => {
    setForm((f) => ({
      ...f,
      trades: f.trades.includes(t) ? f.trades.filter((x) => x !== t) : [...f.trades, t],
    }));
  };

  const toggleSite = (id: string) => {
    setForm((f) => ({
      ...f,
      siteIds: f.siteIds.includes(id) ? f.siteIds.filter((x) => x !== id) : [...f.siteIds, id],
    }));
  };

  const filteredTrades = CONTRACTOR_TRADES.filter((t) =>
    t.toLowerCase().includes(tradeSearch.toLowerCase()),
  );

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast({ title: "Title required", description: "Give the tender a title before saving.", variant: "destructive" });
      return;
    }

    setSaving(true);

    const payload = {
      company_id: companyId,
      created_by: profileId,
      tender_type: form.tenderType,
      title: form.title.trim(),
      trade_categories: form.trades,
      response_deadline: form.responseDeadline ? new Date(form.responseDeadline).toISOString() : null,
    };

    let savedId = tenderId;

    if (tenderId) {
      const { data, error } = await supabase
        .from("tenders")
        .update(payload)
        .eq("id", tenderId)
        .select("id, tender_number")
        .single();
      if (error) {
        toast({ title: "Save failed", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
      setTenderNumber(data.tender_number);
    } else {
      // tender_number is deliberately omitted -- assign_tender_number_trigger
      // (BEFORE INSERT, confirmed live) mints T-{code}-NNNN server-side.
      // status is omitted too and defaults to 'draft'.
      const { data, error } = await supabase
        .from("tenders")
        .insert(payload)
        .select("id, tender_number")
        .single();
      if (error) {
        toast({ title: "Save failed", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
      savedId = data.id;
      setTenderId(data.id);
      setTenderNumber(data.tender_number);
      navigate(`/dashboard/business?view=tender-form&tender=${data.id}`, { replace: true });
    }

    // Sites reconciled by diff against the last known-persisted set, not a
    // blanket delete-then-reinsert: unchanged sites are never touched, and
    // an insert failure can't wipe an existing set out from under a
    // successful delete. On first save existingSiteIds is [], so `removed`
    // is empty and `added` is every selected site -- no special case needed.
    const removed = existingSiteIds.filter((id) => !form.siteIds.includes(id));
    const added = form.siteIds.filter((id) => !existingSiteIds.includes(id));

    if (removed.length) {
      const { error: removeError } = await supabase
        .from("tender_sites")
        .delete()
        .eq("tender_id", savedId!)
        .in("site_id", removed);
      if (removeError) {
        toast({ title: "Sites not saved", description: removeError.message, variant: "destructive" });
        setSaving(false);
        return;
      }
    }

    if (added.length) {
      const { error: addError } = await supabase
        .from("tender_sites")
        .insert(added.map((site_id) => ({ tender_id: savedId!, site_id })));
      if (addError) {
        toast({ title: "Sites not saved", description: addError.message, variant: "destructive" });
        setSaving(false);
        return;
      }
    }

    setExistingSiteIds(form.siteIds);
    setSaving(false);
    toast({ title: "Draft saved" });
  };

  if (loadingExisting) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard/business?view=tenders")} className="gap-1 -ml-2">
        ← Back to Tenders
      </Button>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Essentials</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              placeholder="e.g. Reactive M&E maintenance — London portfolio"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>

          <div className="space-y-2">
            <Label>Type</Label>
            <div className="inline-flex rounded-md border border-border p-0.5">
              {(["works", "term"] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, tenderType: type }))}
                  className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                    form.tenderType === type
                      ? "bg-[#1a2744] text-white"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {type === "works" ? "Works" : "Term"}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Trade</Label>
            <Input
              placeholder="Search trades..."
              value={tradeSearch}
              onChange={(e) => setTradeSearch(e.target.value)}
            />
            <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto py-1">
              {filteredTrades.length === 0 && (
                <p className="text-sm text-muted-foreground py-1">No trades match your search</p>
              )}
              {filteredTrades.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => toggleTrade(t)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border-2 transition-all ${
                    form.trades.includes(t)
                      ? "border-[#f07820] bg-orange-50 text-[#f07820]"
                      : "border-border text-muted-foreground hover:border-foreground/30"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Sites ({form.siteIds.length} selected)</Label>
            {sites.length === 0 ? (
              <p className="text-sm text-muted-foreground">No sites in your company yet.</p>
            ) : (
              <div className="max-h-48 overflow-y-auto border border-border rounded-md p-1">
                {sites.map((s) => (
                  <label
                    key={s.id}
                    className="flex items-center gap-2 cursor-pointer py-1.5 px-2 rounded hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      checked={form.siteIds.includes(s.id)}
                      onChange={() => toggleSite(s.id)}
                      style={{ accentColor: "#f07820", width: 14, height: 14 }}
                    />
                    <span className="text-sm">{s.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Response deadline</Label>
            <Input
              type="datetime-local"
              value={form.responseDeadline}
              onChange={(e) => setForm((f) => ({ ...f, responseDeadline: e.target.value }))}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground font-mono">
          {tenderNumber ? `Saved as draft · ${tenderNumber}` : "Not yet saved"}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() =>
              navigate(
                `/dashboard/business?view=tenders-stub&mode=publish${tenderId ? `&tender=${tenderId}` : ""}`,
              )
            }
          >
            Publish
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {tenderId ? "Save" : "Save as draft"}
          </Button>
        </div>
      </div>
    </div>
  );
}
