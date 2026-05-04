import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Users,
  Search,
  Plus,
  CheckCircle2,
  Clock,
  XCircle,
  Star,
  Shield,
  AlertTriangle,
  Loader2,
  UserCheck,
  ChevronRight,
  Building2,
} from "lucide-react";

// --- Types ---
type PanelStatus = "invited" | "active" | "suspended" | "declined";
type PanelTier = "preferred" | "approved" | "under_review";

interface PanelMember {
  id: string;
  contractor_id: string | null;
  company_id: string | null;
  status: string | null;
  tier: string | null;
  notes: string | null;
  approved_at: string | null;
  created_at: string | null;
  // Joined from profiles
  contractor_name: string | null;
  contractor_ts_code: string | null;
  contractor_trades: string[] | null;
  contractor_location: string | null;
  contractor_rating: number | null;
  contractor_avatar: string | null;
  contractor_company: string | null;
}

interface PanelManagementProps {
  profileId: string;   // profiles.id (not user_id)
  userId: string;      // auth user_id
}

// --- Status helpers ---
const statusConfig: Record<string, { label: string; colour: string; icon: React.ElementType }> = {
  invited:     { label: "Invited",      colour: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: Clock },
  active:      { label: "Active",       colour: "bg-green-100 text-green-800 border-green-200",  icon: CheckCircle2 },
  suspended:   { label: "Suspended",    colour: "bg-red-100 text-red-800 border-red-200",        icon: XCircle },
  declined:    { label: "Declined",     colour: "bg-gray-100 text-gray-700 border-gray-200",     icon: XCircle },
};

const tierConfig: Record<string, { label: string; colour: string; icon: React.ElementType }> = {
  preferred:    { label: "Preferred",    colour: "bg-orange-100 text-orange-800 border-orange-200", icon: Star },
  approved:     { label: "Approved",     colour: "bg-blue-100 text-blue-800 border-blue-200",       icon: Shield },
  under_review: { label: "Under Review", colour: "bg-gray-100 text-gray-700 border-gray-200",       icon: AlertTriangle },
};

// --- Main component ---
export const PanelManagement = ({ profileId, userId }: PanelManagementProps) => {
  const { toast } = useToast();

  const [panel, setPanel] = useState<PanelMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [companyId, setCompanyId] = useState<string | null>(null);

  // Invite dialog state
  const [inviteOpen, setInviteOpen] = useState(false);
  const [tsCodeInput, setTsCodeInput] = useState("");
  const [tierInput, setTierInput] = useState<PanelTier>("approved");
  const [notesInput, setNotesInput] = useState("");
  const [inviteLoading, setInviteLoading] = useState(false);
  const [lookupResult, setLookupResult] = useState<{ id: string; name: string | null; ts_code: string | null; trades: string[] | null } | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);

  // Member detail dialog
  const [selectedMember, setSelectedMember] = useState<PanelMember | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Filter
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // --- Ensure company row exists ---
  const ensureCompany = useCallback(async (): Promise<string | null> => {
    // Check for existing company
    const { data: existing } = await supabase
      .from("companies")
      .select("id")
      .eq("owner_id", profileId)
      .maybeSingle();

    if (existing?.id) return existing.id;

    // Create one from profile data
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, company_name, email, phone, location")
      .eq("id", profileId)
      .maybeSingle();

    const { data: newCompany, error } = await supabase
      .from("companies")
      .insert({
        owner_id: profileId,
        name: profile?.company_name || profile?.full_name || "My Business",
        email: profile?.email,
        phone: profile?.phone,
        city: profile?.location,
      })
      .select("id")
      .single();

    if (error) {
      console.error("Failed to create company row:", error);
      return null;
    }
    return newCompany.id;
  }, [profileId]);

  // --- Load panel ---
  const loadPanel = useCallback(async () => {
    setLoading(true);
    const cId = companyId || await ensureCompany();
    if (cId) setCompanyId(cId);

    if (!cId) {
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from("contractor_panel")
      .select(`
        id,
        contractor_id,
        company_id,
        status,
        tier,
        notes,
        approved_at,
        created_at
      `)
      .eq("company_id", cId)
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Error", description: "Could not load panel.", variant: "destructive" });
      setLoading(false);
      return;
    }

    // Hydrate with profile data
    const hydrated: PanelMember[] = await Promise.all(
      (data || []).map(async (row) => {
        if (!row.contractor_id) return { ...row, contractor_name: null, contractor_ts_code: null, contractor_trades: null, contractor_location: null, contractor_rating: null, contractor_avatar: null, contractor_company: null };

        const { data: prof } = await supabase
          .from("profiles")
          .select("full_name, ts_profile_code, trades, location, rating, avatar_url, company_name")
          .eq("id", row.contractor_id)
          .maybeSingle();

        return {
          ...row,
          contractor_name: prof?.full_name ?? null,
          contractor_ts_code: prof?.ts_profile_code ?? null,
          contractor_trades: prof?.trades ?? null,
          contractor_location: prof?.location ?? null,
          contractor_rating: prof?.rating ?? null,
          contractor_avatar: prof?.avatar_url ?? null,
          contractor_company: prof?.company_name ?? null,
        };
      })
    );

    setPanel(hydrated);
    setLoading(false);
  }, [companyId, ensureCompany, toast]);

  useEffect(() => {
    loadPanel();
  }, [loadPanel]);

  // --- TS code lookup ---
  const handleLookup = async () => {
    const code = tsCodeInput.trim().toUpperCase();
    if (!code.startsWith("TS-C-")) {
      setLookupError("Must be a contractor TS code (TS-C-XXXXXX)");
      return;
    }
    setLookupLoading(true);
    setLookupError(null);
    setLookupResult(null);

    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, ts_profile_code, trades")
      .eq("ts_profile_code", code)
      .eq("user_type", "contractor")
      .maybeSingle();

    setLookupLoading(false);

    if (error || !data) {
      setLookupError("No contractor found with that TS code.");
      return;
    }

    // Check if already on panel
    const already = panel.find((m) => m.contractor_id === data.id);
    if (already) {
      setLookupError(`This contractor is already on your panel (${statusConfig[already.status ?? "invited"]?.label ?? already.status}).`);
      return;
    }

    setLookupResult(data);
  };

  // --- Send invite ---
  const handleInvite = async () => {
    if (!lookupResult || !companyId) return;
    setInviteLoading(true);

    const { error } = await supabase.from("contractor_panel").insert({
      company_id: companyId,
      contractor_id: lookupResult.id,
      added_by: profileId,
      status: "invited",
      tier: tierInput,
      notes: notesInput || null,
    });

    if (error) {
      toast({ title: "Error", description: "Failed to send invite.", variant: "destructive" });
      setInviteLoading(false);
      return;
    }

    // Create notification for contractor
    // Get contractor's user_id from profiles
    const { data: contractorProfile } = await supabase
      .from("profiles")
      .select("user_id, full_name")
      .eq("id", lookupResult.id)
      .maybeSingle();

    if (contractorProfile?.user_id) {
      await supabase.from("notifications").insert({
        user_id: contractorProfile.user_id,
        type: "panel_invite",
        title: "Panel Invitation",
        message: `You have been invited to join a contractor panel.`,
        is_read: false,
      });
    }

    toast({ title: "Invite sent", description: `${lookupResult.name} has been invited to your panel.` });
    setInviteOpen(false);
    setTsCodeInput("");
    setLookupResult(null);
    setNotesInput("");
    setTierInput("approved");
    loadPanel();
    setInviteLoading(false);
  };

  // --- Update member status/tier ---
  const updateMember = async (memberId: string, updates: { status?: string; tier?: string }) => {
    const { error } = await supabase
      .from("contractor_panel")
      .update({
        ...updates,
        ...(updates.status === "active" ? { approved_at: new Date().toISOString() } : {}),
      })
      .eq("id", memberId);

    if (error) {
      toast({ title: "Error", description: "Failed to update.", variant: "destructive" });
      return;
    }

    toast({ title: "Updated", description: "Panel member updated." });
    setDetailOpen(false);
    loadPanel();
  };

  // --- Remove from panel ---
  const removeMember = async (memberId: string) => {
    const { error } = await supabase
      .from("contractor_panel")
      .delete()
      .eq("id", memberId);

    if (error) {
      toast({ title: "Error", description: "Failed to remove.", variant: "destructive" });
      return;
    }

    toast({ title: "Removed", description: "Contractor removed from panel." });
    setDetailOpen(false);
    loadPanel();
  };

  // --- Filtered panel ---
  const filtered = panel.filter((m) => {
    const matchesStatus = filterStatus === "all" || m.status === filterStatus;
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      !q ||
      m.contractor_name?.toLowerCase().includes(q) ||
      m.contractor_ts_code?.toLowerCase().includes(q) ||
      m.contractor_trades?.some((t) => t.toLowerCase().includes(q));
    return matchesStatus && matchesSearch;
  });

  const counts = {
    active: panel.filter((m) => m.status === "active").length,
    invited: panel.filter((m) => m.status === "invited").length,
    preferred: panel.filter((m) => m.tier === "preferred").length,
  };

  // --- Render ---
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold">Contractor Panel</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Your curated list of approved contractors. Invite by TS code.
          </p>
        </div>
        <Button onClick={() => setInviteOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Invite Contractor
        </Button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-green-100 flex items-center justify-center">
              <UserCheck className="h-5 w-5 text-green-700" />
            </div>
            <div>
              <p className="text-2xl font-bold">{counts.active}</p>
              <p className="text-xs text-muted-foreground">Active</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-yellow-100 flex items-center justify-center">
              <Clock className="h-5 w-5 text-yellow-700" />
            </div>
            <div>
              <p className="text-2xl font-bold">{counts.invited}</p>
              <p className="text-xs text-muted-foreground">Pending</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-orange-100 flex items-center justify-center">
              <Star className="h-5 w-5 text-orange-700" />
            </div>
            <div>
              <p className="text-2xl font-bold">{counts.preferred}</p>
              <p className="text-xs text-muted-foreground">Preferred</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, TS code or trade..."
            className="pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="invited">Invited</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
            <SelectItem value="declined">Declined</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Panel list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            {panel.length === 0 ? (
              <>
                <h3 className="text-lg font-medium mb-2">No contractors on your panel yet</h3>
                <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                  Build your trusted network. Invite contractors by their TS code and manage your approved supplier list in one place.
                </p>
                <Button onClick={() => setInviteOpen(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Invite your first contractor
                </Button>
              </>
            ) : (
              <>
                <h3 className="text-lg font-medium mb-2">No results</h3>
                <p className="text-muted-foreground">Try adjusting your search or filter.</p>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((member) => {
            const status = statusConfig[member.status ?? "invited"] ?? statusConfig.invited;
            const tier = member.tier ? tierConfig[member.tier] : null;
            const StatusIcon = status.icon;

            return (
              <Card
                key={member.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => { setSelectedMember(member); setDetailOpen(true); }}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      {/* Avatar placeholder */}
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <Building2 className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold truncate">
                            {member.contractor_name ?? "Unknown Contractor"}
                          </p>
                          {member.contractor_ts_code && (
                            <span className="text-xs font-mono text-muted-foreground">
                              {member.contractor_ts_code}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {member.contractor_trades?.slice(0, 3).map((t) => (
                            <span key={t} className="text-xs bg-muted px-2 py-0.5 rounded-full">
                              {t}
                            </span>
                          ))}
                          {member.contractor_location && (
                            <span className="text-xs text-muted-foreground">
                              {member.contractor_location}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {tier && (
                        <Badge variant="outline" className={`text-xs ${tier.colour}`}>
                          {tier.label}
                        </Badge>
                      )}
                      <Badge variant="outline" className={`text-xs ${status.colour} flex items-center gap-1`}>
                        <StatusIcon className="h-3 w-3" />
                        {status.label}
                      </Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* --- Invite Dialog --- */}
      <Dialog open={inviteOpen} onOpenChange={(o) => { setInviteOpen(o); if (!o) { setLookupResult(null); setLookupError(null); setTsCodeInput(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Invite a Contractor</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Contractor TS Code</label>
              <div className="flex gap-2">
                <Input
                  placeholder="TS-C-XXXXXX"
                  value={tsCodeInput}
                  onChange={(e) => { setTsCodeInput(e.target.value.toUpperCase()); setLookupResult(null); setLookupError(null); }}
                  className="font-mono"
                />
                <Button
                  variant="outline"
                  onClick={handleLookup}
                  disabled={lookupLoading || !tsCodeInput}
                >
                  {lookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                </Button>
              </div>
              {lookupError && (
                <p className="text-sm text-destructive">{lookupError}</p>
              )}
              {lookupResult && (
                <div className="p-3 rounded-lg border bg-green-50 border-green-200 text-sm space-y-1">
                  <p className="font-semibold text-green-800">{lookupResult.name}</p>
                  <p className="text-green-700 font-mono text-xs">{lookupResult.ts_code}</p>
                  {lookupResult.trades?.length ? (
                    <p className="text-green-700">{lookupResult.trades.slice(0, 3).join(", ")}</p>
                  ) : null}
                </div>
              )}
            </div>

            {lookupResult && (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Panel Tier</label>
                  <Select value={tierInput} onValueChange={(v) => setTierInput(v as PanelTier)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="preferred">Preferred — first in line for jobs</SelectItem>
                      <SelectItem value="approved">Approved — standard panel member</SelectItem>
                      <SelectItem value="under_review">Under Review — vetting in progress</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Notes (optional)</label>
                  <Textarea
                    placeholder="Internal notes about this contractor..."
                    value={notesInput}
                    onChange={(e) => setNotesInput(e.target.value)}
                    rows={3}
                  />
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancel</Button>
            <Button
              onClick={handleInvite}
              disabled={!lookupResult || inviteLoading}
            >
              {inviteLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Send Invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* --- Member Detail Dialog --- */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-md">
          {selectedMember && (() => {
            const status = statusConfig[selectedMember.status ?? "invited"] ?? statusConfig.invited;
            const tier = selectedMember.tier ? tierConfig[selectedMember.tier] : null;
            return (
              <>
                <DialogHeader>
                  <DialogTitle>{selectedMember.contractor_name ?? "Contractor"}</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-2">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className={status.colour}>{status.label}</Badge>
                    {tier && <Badge variant="outline" className={tier.colour}>{tier.label}</Badge>}
                  </div>

                  {selectedMember.contractor_ts_code && (
                    <div>
                      <p className="text-xs text-muted-foreground">TS Code</p>
                      <p className="font-mono font-medium">{selectedMember.contractor_ts_code}</p>
                    </div>
                  )}

                  {selectedMember.contractor_trades?.length ? (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Trades</p>
                      <div className="flex flex-wrap gap-1">
                        {selectedMember.contractor_trades.map((t) => (
                          <span key={t} className="text-xs bg-muted px-2 py-0.5 rounded-full">{t}</span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {selectedMember.notes && (
                    <div>
                      <p className="text-xs text-muted-foreground">Notes</p>
                      <p className="text-sm">{selectedMember.notes}</p>
                    </div>
                  )}

                  {selectedMember.approved_at && (
                    <div>
                      <p className="text-xs text-muted-foreground">Approved</p>
                      <p className="text-sm">{new Date(selectedMember.approved_at).toLocaleDateString("en-GB")}</p>
                    </div>
                  )}

                  <div className="border-t pt-4 space-y-2">
                    <p className="text-sm font-medium mb-3">Update status</p>
                    <div className="flex flex-wrap gap-2">
                      {selectedMember.status !== "active" && (
                        <Button size="sm" variant="outline" className="border-green-300 text-green-700 hover:bg-green-50"
                          onClick={() => updateMember(selectedMember.id, { status: "active" })}>
                          <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
                        </Button>
                      )}
                      {selectedMember.status !== "suspended" && (
                        <Button size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-50"
                          onClick={() => updateMember(selectedMember.id, { status: "suspended" })}>
                          <XCircle className="h-3 w-3 mr-1" /> Suspend
                        </Button>
                      )}
                    </div>

                    <p className="text-sm font-medium mt-4 mb-3">Change tier</p>
                    <div className="flex flex-wrap gap-2">
                      {(["preferred", "approved", "under_review"] as PanelTier[]).map((t) => (
                        <Button key={t} size="sm" variant={selectedMember.tier === t ? "default" : "outline"}
                          onClick={() => updateMember(selectedMember.id, { tier: t })}>
                          {tierConfig[t].label}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => removeMember(selectedMember.id)}
                  >
                    Remove from panel
                  </Button>
                  <Button variant="outline" onClick={() => setDetailOpen(false)}>Close</Button>
                </DialogFooter>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
};
