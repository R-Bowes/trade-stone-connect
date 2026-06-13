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
  currentRole: string;
}

interface ActiveMember {
  id: string;
  role: string;
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
  role: string;
  invited_email: string | null;
  invite_token: string | null;
  profile_id: string | null;
}

interface CodeResult {
  id: string;
  full_name: string | null;
  email: string | null;
  ts_profile_code: string | null;
  user_type: string;
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  member: "Member",
};

const ROLE_COLOURS: Record<string, string> = {
  owner: "bg-amber-100 text-amber-800",
  admin: "bg-blue-100 text-blue-800",
  member: "bg-gray-100 text-gray-600",
};

function RoleBadge({ role }: { role: string }) {
  const colour = ROLE_COLOURS[role] ?? "bg-gray-100 text-gray-600";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${colour}`}>
      {ROLE_LABELS[role] ?? role}
    </span>
  );
}

export function BusinessTeamView({ companyId, profileId: _profileId, currentRole }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [activeMembers, setActiveMembers] = useState<ActiveMember[]>([]);
  const [pendingInvites, setPendingInvites] = useState<PendingInviteRow[]>([]);
  const [busy, setBusy] = useState(false);

  // Invite form state
  const [inviteMode, setInviteMode] = useState<"none" | "link" | "code">("none");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviteLinkEmail, setInviteLinkEmail] = useState("");
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState("");
  const [codeResolved, setCodeResolved] = useState<CodeResult | null>(null);
  const [codeLookupError, setCodeLookupError] = useState<string | null>(null);

  const isAdminOrOwner = currentRole === "owner" || currentRole === "admin";
  const isOwner = currentRole === "owner";
  const roleOptions = isOwner ? ["owner", "admin", "member"] : ["admin", "member"];

  const loadMembers = useCallback(async () => {
    setLoading(true);
    const [activeRes, pendingRes] = await Promise.all([
      supabase
        .from("business_members")
        .select("id, role, profile_id, invited_email, profiles(full_name, email, ts_profile_code)")
        .eq("company_id", companyId)
        .eq("status", "active")
        .order("created_at"),
      supabase
        .from("business_members")
        .select("id, role, invited_email, invite_token, profile_id")
        .eq("company_id", companyId)
        .eq("status", "invited")
        .order("created_at"),
    ]);
    setActiveMembers((activeRes.data ?? []) as unknown as ActiveMember[]);
    setPendingInvites(pendingRes.data ?? []);
    setLoading(false);
  }, [companyId]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  const handleRoleChange = async (memberId: string, newRole: string) => {
    setBusy(true);
    try {
      const { error } = await supabase
        .from("business_members")
        .update({ role: newRole })
        .eq("id", memberId);
      if (error) throw error;
      await loadMembers();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ variant: "destructive", title: "Role change failed", description: msg });
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
    setBusy(true);
    setGeneratedLink(null);
    try {
      const { data, error } = await supabase
        .from("business_members")
        .insert({
          company_id: companyId,
          role: inviteRole,
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
    setBusy(true);
    try {
      const { error } = await supabase
        .from("business_members")
        .insert({
          company_id: companyId,
          role: inviteRole,
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
                // Don't show controls on the viewer's own row — use Settings to manage your own account.
                const isSelf = m.profile_id === _profileId;
                const canManage = isAdminOrOwner && !isSelf && (m.role !== "owner" || isOwner);

                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between px-6 py-3 border-b last:border-0 gap-4"
                  >
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
                      <RoleBadge role={m.role} />
                      {canManage && (
                        <>
                          <Select
                            value={m.role}
                            onValueChange={(val) => handleRoleChange(m.id, val)}
                            disabled={busy}
                          >
                            <SelectTrigger className="h-7 w-28 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {roleOptions.map((r) => (
                                <SelectItem key={r} value={r} className="text-xs">
                                  {ROLE_LABELS[r]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
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
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending invites — visible to owner/admin only (enforced by RLS) */}
      {isAdminOrOwner && (
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
                        <RoleBadge role={inv.role} />
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

      {/* Invite creation — owner/admin only */}
      {isAdminOrOwner && (
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
                    onClick={() => { setInviteMode("link"); setGeneratedLink(null); }}
                  >
                    Via link
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => { setInviteMode("code"); setCodeResolved(null); setCodeLookupError(null); }}
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
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">Role</label>
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger className="h-8 w-32 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {roleOptions.map((r) => (
                        <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button size="sm" className="h-8 text-sm" onClick={handleCreateLinkInvite} disabled={busy}>
                  Generate link
                </Button>
              </div>
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
                  <div className="flex gap-2 items-end flex-wrap">
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Role</label>
                      <Select value={inviteRole} onValueChange={setInviteRole}>
                        <SelectTrigger className="h-8 w-32 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {roleOptions.map((r) => (
                            <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
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
