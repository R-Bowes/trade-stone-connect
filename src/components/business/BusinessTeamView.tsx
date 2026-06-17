import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface Props {
  companyId: string;
  profileId: string;
  isOwner: boolean;
}

interface Coverage {
  coverage_kind: string;
  coverage_group_id: string | null;
  coverage_site_id: string | null;
}

interface ActiveMember {
  id: string;
  coverage_kind: string;
  coverage_group_id: string | null;
  coverage_site_id: string | null;
  profile_id: string | null;
  invited_email: string | null;
  profiles: {
    full_name: string | null;
    email: string | null;
    ts_profile_code: string | null;
  } | null;
}

interface PendingInviteRow {
  id: string;
  coverage_kind: string;
  coverage_group_id: string | null;
  coverage_site_id: string | null;
  invited_email: string | null;
  invite_token: string | null;
  profile_id: string | null;
}

interface SiteGroup {
  id: string;
  name: string;
  group_type: string;
}

interface SiteEntry {
  id: string;
  name: string;
}

interface CodeResult {
  id: string;
  full_name: string | null;
  email: string | null;
  ts_profile_code: string | null;
  user_type: string;
}

const COVERAGE_BADGE: Record<string, { bg: string; color: string }> = {
  national: { bg: "#1a2744", color: "#fff" },
  group:    { bg: "#f07820", color: "#fff" },
  site:     { bg: "#e5e7eb", color: "#374151" },
};

function coverageLabel(
  kind: string,
  groupId: string | null,
  siteId: string | null,
  groupsById: Record<string, SiteGroup>,
  sitesById: Record<string, SiteEntry>,
): string {
  if (kind === "national") return "National";
  if (kind === "group") {
    const g = groupId ? groupsById[groupId] : null;
    if (!g) return "Group";
    return `${g.group_type === "area" ? "Area" : "Region"}: ${g.name}`;
  }
  if (kind === "site") {
    const s = siteId ? sitesById[siteId] : null;
    return s ? `Site: ${s.name}` : "Site";
  }
  return kind;
}

function CoverageBadge({
  kind, groupId, siteId, groupsById, sitesById,
}: {
  kind: string;
  groupId: string | null;
  siteId: string | null;
  groupsById: Record<string, SiteGroup>;
  sitesById: Record<string, SiteEntry>;
}) {
  const label = coverageLabel(kind, groupId, siteId, groupsById, sitesById);
  const s = COVERAGE_BADGE[kind] ?? COVERAGE_BADGE.site;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 500,
        background: s.bg,
        color: s.color,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function CoveragePicker({
  value, onChange, groups, sites,
}: {
  value: Coverage;
  onChange: (c: Coverage) => void;
  groups: SiteGroup[];
  sites: SiteEntry[];
}) {
  const noGroups = groups.length === 0;
  const noSites = sites.length === 0;

  const handleKindChange = (kind: string) => {
    onChange({ coverage_kind: kind, coverage_group_id: null, coverage_site_id: null });
  };

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <Select value={value.coverage_kind} onValueChange={handleKindChange}>
        <SelectTrigger className="h-7 w-32 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="national" className="text-xs">National</SelectItem>
          <SelectItem value="group" className="text-xs" disabled={noGroups}>
            {noGroups ? "Group (none yet)" : "Group"}
          </SelectItem>
          <SelectItem value="site" className="text-xs" disabled={noSites}>
            {noSites ? "Site (none yet)" : "Site"}
          </SelectItem>
        </SelectContent>
      </Select>

      {value.coverage_kind === "group" && !noGroups && (
        <Select
          value={value.coverage_group_id ?? ""}
          onValueChange={(id) => onChange({ ...value, coverage_group_id: id, coverage_site_id: null })}
        >
          <SelectTrigger className="h-7 w-48 text-xs">
            <SelectValue placeholder="Select group" />
          </SelectTrigger>
          <SelectContent>
            {groups.map((g) => (
              <SelectItem key={g.id} value={g.id} className="text-xs">
                {g.group_type === "area" ? "Area" : "Region"}: {g.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {value.coverage_kind === "site" && !noSites && (
        <Select
          value={value.coverage_site_id ?? ""}
          onValueChange={(id) => onChange({ ...value, coverage_group_id: null, coverage_site_id: id })}
        >
          <SelectTrigger className="h-7 w-48 text-xs">
            <SelectValue placeholder="Select site" />
          </SelectTrigger>
          <SelectContent>
            {sites.map((s) => (
              <SelectItem key={s.id} value={s.id} className="text-xs">
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

const DEFAULT_COVERAGE: Coverage = {
  coverage_kind: "national",
  coverage_group_id: null,
  coverage_site_id: null,
};

export function BusinessTeamView({ companyId, profileId: _profileId, isOwner }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [activeMembers, setActiveMembers] = useState<ActiveMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInviteRow[]>([]);
  const [groups, setGroups] = useState<SiteGroup[]>([]);
  const [sites, setSites] = useState<SiteEntry[]>([]);
  const [busy, setBusy] = useState(false);

  // Per-row coverage edit state (owner only — one row at a time)
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<Coverage>(DEFAULT_COVERAGE);

  // Invite form state
  const [inviteMode, setInviteMode] = useState<"none" | "link" | "code">("none");
  const [inviteCoverage, setInviteCoverage] = useState<Coverage>(DEFAULT_COVERAGE);
  const [inviteLinkEmail, setInviteLinkEmail] = useState("");
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState("");
  const [codeResolved, setCodeResolved] = useState<CodeResult | null>(null);
  const [codeLookupError, setCodeLookupError] = useState<string | null>(null);
  const [coverageError, setCoverageError] = useState<string | null>(null);

  const groupsById = Object.fromEntries(groups.map((g) => [g.id, g]));
  const sitesById = Object.fromEntries(sites.map((s) => [s.id, s]));

  const loadMembers = useCallback(async () => {
    setLoading(true);
    const [activeRes, pendingRes, groupsRes, sitesRes] = await Promise.all([
      supabase
        .from("business_members")
        .select("id, coverage_kind, coverage_group_id, coverage_site_id, profile_id, invited_email, profiles(full_name, email, ts_profile_code)")
        .eq("company_id", companyId)
        .eq("status", "active")
        .order("created_at"),
      supabase
        .from("business_members")
        .select("id, coverage_kind, coverage_group_id, coverage_site_id, invited_email, invite_token, profile_id")
        .eq("company_id", companyId)
        .eq("status", "invited")
        .order("created_at"),
      supabase
        .from("site_groups")
        .select("id, name, group_type")
        .eq("company_id", companyId),
      supabase
        .from("sites")
        .select("id, name")
        .eq("company_id", companyId)
        .eq("is_active", true),
    ]);
    setActiveMembers((activeRes.data ?? []) as unknown as ActiveMember[]);
    setPendingInvites(pendingRes.data ?? []);
    setGroups(groupsRes.data ?? []);
    setSites((sitesRes.data ?? []) as SiteEntry[]);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  const validateCoverage = (c: Coverage): string | null => {
    if (c.coverage_kind === "group" && !c.coverage_group_id) return "Select a group.";
    if (c.coverage_kind === "site" && !c.coverage_site_id) return "Select a site.";
    return null;
  };

  const handleCoverageChange = async (memberId: string) => {
    const err = validateCoverage(editValue);
    if (err) {
      toast({ variant: "destructive", title: "Invalid coverage", description: err });
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase
        .from("business_members")
        .update({
          coverage_kind: editValue.coverage_kind,
          coverage_group_id: editValue.coverage_group_id,
          coverage_site_id: editValue.coverage_site_id,
        })
        .eq("id", memberId);
      if (error) throw error;
      setEditingId(null);
      await loadMembers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ variant: "destructive", title: "Coverage update failed", description: msg });
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    setBusy(true);
    try {
      const { error } = await supabase
        .from("business_members")
        .update({ status: "removed" })
        .eq("id", memberId);
      if (error) throw error;
      await loadMembers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ variant: "destructive", title: "Removal failed", description: msg });
    } finally {
      setBusy(false);
    }
  };

  const handleCancelInvite = async (inviteId: string) => {
    setBusy(true);
    try {
      const { error } = await supabase
        .from("business_members")
        .update({ status: "removed" })
        .eq("id", inviteId);
      if (error) throw error;
      await loadMembers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ variant: "destructive", title: "Cancel failed", description: msg });
    } finally {
      setBusy(false);
    }
  };

  const handleCreateLinkInvite = async () => {
    setCoverageError(null);
    const err = validateCoverage(inviteCoverage);
    if (err) { setCoverageError(err); return; }
    setBusy(true);
    setGeneratedLink(null);
    try {
      const { data, error } = await supabase
        .from("business_members")
        .insert({
          company_id: companyId,
          coverage_kind: inviteCoverage.coverage_kind,
          coverage_group_id: inviteCoverage.coverage_group_id,
          coverage_site_id: inviteCoverage.coverage_site_id,
          invited_email: inviteLinkEmail.trim() || null,
          status: "invited",
        })
        .select("id, invite_token")
        .single();
      if (error) throw error;
      if (data.invite_token) {
        setGeneratedLink(`${window.location.origin}/invite?token=${data.invite_token}`);
      }
      setInviteLinkEmail("");
      await loadMembers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ variant: "destructive", title: "Invite creation failed", description: msg });
    } finally {
      setBusy(false);
    }
  };

  const handleCodeLookup = async () => {
    setCodeLookupError(null);
    setCodeResolved(null);
    setBusy(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, ts_profile_code, user_type")
        .eq("ts_profile_code", inviteCode.trim().toUpperCase())
        .maybeSingle();
      if (error) throw error;
      if (!data) { setCodeLookupError("No account found for that code."); return; }
      if (data.user_type !== "business") {
        setCodeLookupError(
          "That code belongs to a non-business account. Only business accounts can join a team for now."
        );
        return;
      }

      const { data: existing } = await supabase
        .from("business_members")
        .select("id")
        .eq("company_id", companyId)
        .eq("profile_id", data.id)
        .eq("status", "active")
        .maybeSingle();
      if (existing) { setCodeLookupError("Already on the team."); return; }

      setCodeResolved(data);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setCodeLookupError(msg);
    } finally {
      setBusy(false);
    }
  };

  const handleCodeInvite = async () => {
    if (!codeResolved) return;
    setCoverageError(null);
    const err = validateCoverage(inviteCoverage);
    if (err) { setCoverageError(err); return; }
    setBusy(true);
    try {
      const { error } = await supabase
        .from("business_members")
        .insert({
          company_id: companyId,
          coverage_kind: inviteCoverage.coverage_kind,
          coverage_group_id: inviteCoverage.coverage_group_id,
          coverage_site_id: inviteCoverage.coverage_site_id,
          profile_id: codeResolved.id,
          invited_email: codeResolved.email,
          status: "invited",
          invite_token: null,
        });
      if (error) throw error;
      toast({
        title: "Invite sent",
        description: `${codeResolved.full_name ?? codeResolved.email} will see the invite in their dashboard.`,
      });
      setInviteMode("none");
      setInviteCode("");
      setCodeResolved(null);
      setInviteCoverage(DEFAULT_COVERAGE);
      await loadMembers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ variant: "destructive", title: "Invite failed", description: msg });
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: "Copied", description: "Link copied to clipboard." });
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <i className="ti ti-loader-2 animate-spin" style={{ fontSize: 24, color: "#9ca3af" }} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl">

      {/* Active members roster */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Team members</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {activeMembers.length === 0 ? (
            <p className="px-6 py-4 text-sm text-muted-foreground">No active members found.</p>
          ) : (
            <div>
              {activeMembers.map((m) => {
                const name = m.profiles?.full_name ?? m.invited_email ?? "Unknown";
                const email = m.profiles?.email ?? m.invited_email ?? "";
                const code = m.profiles?.ts_profile_code;
                const isEditing = isOwner && editingId === m.id;

                return (
                  <div
                    key={m.id}
                    className="flex flex-col gap-2 px-6 py-3 border-b last:border-0"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{name}</p>
                        {email && <p className="text-xs text-muted-foreground truncate">{email}</p>}
                        {code && (
                          <p
                            className="text-xs text-muted-foreground"
                            style={{ fontFamily: "'Roboto Mono', monospace" }}
                          >
                            {code}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <CoverageBadge
                          kind={m.coverage_kind}
                          groupId={m.coverage_group_id}
                          siteId={m.coverage_site_id}
                          groupsById={groupsById}
                          sitesById={sitesById}
                        />
                        {isOwner && !isEditing && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs px-2"
                              onClick={() => {
                                setEditingId(m.id);
                                setEditValue({
                                  coverage_kind: m.coverage_kind,
                                  coverage_group_id: m.coverage_group_id,
                                  coverage_site_id: m.coverage_site_id,
                                });
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 px-2"
                              onClick={() => handleRemoveMember(m.id)}
                              disabled={busy}
                            >
                              Remove
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                    {isEditing && (
                      <div className="flex flex-wrap items-center gap-2">
                        <CoveragePicker
                          value={editValue}
                          onChange={setEditValue}
                          groups={groups}
                          sites={sites}
                        />
                        <Button
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleCoverageChange(m.id)}
                          disabled={busy}
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending invites — owner only (RLS also enforces this) */}
      {isOwner && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pending invites</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {pendingInvites.length === 0 ? (
              <p className="px-6 py-4 text-sm text-muted-foreground">No pending invites.</p>
            ) : (
              <div>
                {pendingInvites.map((inv) => {
                  const link = inv.invite_token
                    ? `${window.location.origin}/invite?token=${inv.invite_token}`
                    : null;
                  const label = inv.invited_email
                    ?? (inv.profile_id ? "TS-Code invite" : "Link invite");
                  return (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between px-6 py-3 border-b last:border-0 gap-4"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="text-sm truncate">{label}</p>
                        <CoverageBadge
                          kind={inv.coverage_kind}
                          groupId={inv.coverage_group_id}
                          siteId={inv.coverage_site_id}
                          groupsById={groupsById}
                          sitesById={sitesById}
                        />
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {link && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => handleCopy(link)}
                          >
                            Copy link
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 px-2"
                          onClick={() => handleCancelInvite(inv.id)}
                          disabled={busy}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Invite creation — owner only */}
      {isOwner && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Invite a team member</CardTitle>
              {inviteMode === "none" ? (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => {
                      setInviteMode("link");
                      setGeneratedLink(null);
                      setInviteCoverage(DEFAULT_COVERAGE);
                      setCoverageError(null);
                    }}
                  >
                    Via link
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => {
                      setInviteMode("code");
                      setCodeResolved(null);
                      setCodeLookupError(null);
                      setInviteCoverage(DEFAULT_COVERAGE);
                      setCoverageError(null);
                    }}
                  >
                    Via TS code
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs"
                  onClick={() => {
                    setInviteMode("none");
                    setGeneratedLink(null);
                    setCodeResolved(null);
                    setCodeLookupError(null);
                    setInviteCode("");
                    setInviteCoverage(DEFAULT_COVERAGE);
                    setCoverageError(null);
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </CardHeader>

          {inviteMode === "link" && (
            <CardContent className="space-y-3">
              <div className="flex gap-2 items-end flex-wrap">
                <div className="space-y-1 flex-1 min-w-40">
                  <label className="text-xs text-muted-foreground">Email (optional)</label>
                  <Input
                    className="h-8 text-sm"
                    placeholder="team@example.com"
                    value={inviteLinkEmail}
                    onChange={(e) => setInviteLinkEmail(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Coverage</label>
                <CoveragePicker
                  value={inviteCoverage}
                  onChange={(c) => { setInviteCoverage(c); setCoverageError(null); }}
                  groups={groups}
                  sites={sites}
                />
              </div>
              {coverageError && <p className="text-xs text-red-600">{coverageError}</p>}
              <Button size="sm" className="h-8 text-sm" onClick={handleCreateLinkInvite} disabled={busy}>
                Generate link
              </Button>
              {generatedLink && (
                <div className="flex items-center gap-2 bg-muted rounded p-2">
                  <span
                    className="truncate flex-1 text-xs"
                    style={{ fontFamily: "'Roboto Mono', monospace" }}
                  >
                    {generatedLink}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 text-xs shrink-0"
                    onClick={() => handleCopy(generatedLink)}
                  >
                    Copy
                  </Button>
                </div>
              )}
            </CardContent>
          )}

          {inviteMode === "code" && (
            <CardContent className="space-y-3">
              {!codeResolved ? (
                <div className="flex gap-2 items-end flex-wrap">
                  <div className="space-y-1 flex-1 min-w-40">
                    <label className="text-xs text-muted-foreground">TradeStone code</label>
                    <Input
                      className="h-8 text-sm"
                      style={{ fontFamily: "'Roboto Mono', monospace" }}
                      placeholder="TS-B-XXXXXX"
                      value={inviteCode}
                      onChange={(e) => { setInviteCode(e.target.value); setCodeLookupError(null); }}
                    />
                  </div>
                  <Button
                    size="sm"
                    className="h-8 text-sm"
                    onClick={handleCodeLookup}
                    disabled={busy || !inviteCode.trim()}
                  >
                    Look up
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded border p-3 text-sm space-y-0.5">
                    <p className="font-medium">{codeResolved.full_name ?? "No name"}</p>
                    <p className="text-xs text-muted-foreground">{codeResolved.email}</p>
                    <p
                      className="text-xs text-muted-foreground"
                      style={{ fontFamily: "'Roboto Mono', monospace" }}
                    >
                      {codeResolved.ts_profile_code}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Coverage</label>
                    <CoveragePicker
                      value={inviteCoverage}
                      onChange={(c) => { setInviteCoverage(c); setCoverageError(null); }}
                      groups={groups}
                      sites={sites}
                    />
                  </div>
                  {coverageError && <p className="text-xs text-red-600">{coverageError}</p>}
                  <div className="flex gap-2 items-center flex-wrap">
                    <Button size="sm" className="h-8 text-sm" onClick={handleCodeInvite} disabled={busy}>
                      Send invite
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs"
                      onClick={() => { setCodeResolved(null); setInviteCode(""); }}
                    >
                      Change
                    </Button>
                  </div>
                </div>
              )}
              {codeLookupError && (
                <p className="text-xs text-red-600">{codeLookupError}</p>
              )}
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
