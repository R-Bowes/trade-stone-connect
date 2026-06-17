import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface Props {
  companyId: string;
  isOwner: boolean;
}

interface SiteGroup {
  id: string;
  name: string;
  group_type: string;
  created_at: string;
}

interface SiteEntry {
  id: string;
  name: string;
  is_active: boolean | null;
}

function TypeBadge({ type }: { type: string }) {
  const isArea = type === "area";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 600,
        background: isArea ? "#1a2744" : "#f07820",
        color: "#fff",
        whiteSpace: "nowrap",
        letterSpacing: "0.02em",
        textTransform: "uppercase",
      }}
    >
      {isArea ? "Area" : "Region"}
    </span>
  );
}

export function SiteGroupsView({ companyId, isOwner }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<SiteGroup[]>([]);
  const [membershipMap, setMembershipMap] = useState<Record<string, string[]>>({});
  const [sites, setSites] = useState<SiteEntry[]>([]);

  // Create form
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"area" | "region">("area");
  const [creating, setCreating] = useState(false);

  // Inline rename/retype
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editType, setEditType] = useState("area");
  const [saving, setSaving] = useState(false);

  // Site assignment checklist
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  // Delete flow
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteBlockMsg, setDeleteBlockMsg] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [groupsRes, sitesRes] = await Promise.all([
      supabase
        .from("site_groups")
        .select("id, name, group_type, created_at")
        .eq("company_id", companyId)
        .order("created_at"),
      supabase
        .from("sites")
        .select("id, name, is_active")
        .eq("company_id", companyId),
    ]);

    const loadedGroups = (groupsRes.data ?? []) as SiteGroup[];
    setGroups(loadedGroups);
    setSites((sitesRes.data ?? []) as SiteEntry[]);

    if (loadedGroups.length > 0) {
      const groupIds = loadedGroups.map((g) => g.id);
      const { data: memberships } = await supabase
        .from("site_group_members")
        .select("group_id, site_id")
        .in("group_id", groupIds);

      const map: Record<string, string[]> = {};
      for (const g of loadedGroups) map[g.id] = [];
      for (const m of (memberships ?? [])) {
        if (map[m.group_id]) map[m.group_id].push(m.site_id);
        else map[m.group_id] = [m.site_id];
      }
      setMembershipMap(map);
    } else {
      setMembershipMap({});
    }

    setLoading(false);
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const sitesById = Object.fromEntries(sites.map((s) => [s.id, s]));

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const { error } = await supabase
        .from("site_groups")
        .insert({ company_id: companyId, name: newName.trim(), group_type: newType });
      if (error) throw error;
      setNewName("");
      setNewType("area");
      await load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ variant: "destructive", title: "Create failed", description: msg });
    } finally {
      setCreating(false);
    }
  };

  const handleSaveEdit = async (groupId: string) => {
    if (!editName.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("site_groups")
        .update({ name: editName.trim(), group_type: editType })
        .eq("id", groupId);
      if (error) throw error;
      setEditingId(null);
      await load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ variant: "destructive", title: "Save failed", description: msg });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleSite = async (groupId: string, siteId: string, isAssigned: boolean) => {
    setToggling(siteId);
    try {
      if (isAssigned) {
        const { error } = await supabase
          .from("site_group_members")
          .delete()
          .eq("group_id", groupId)
          .eq("site_id", siteId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("site_group_members")
          .insert({ group_id: groupId, site_id: siteId });
        if (error) throw error;
      }
      setMembershipMap((prev) => {
        const current = prev[groupId] ?? [];
        return {
          ...prev,
          [groupId]: isAssigned
            ? current.filter((id) => id !== siteId)
            : [...current, siteId],
        };
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ variant: "destructive", title: "Site assignment failed", description: msg });
    } finally {
      setToggling(null);
    }
  };

  const handleDeleteCheck = async (groupId: string) => {
    setDeleteBlockMsg(null);
    const { count, error } = await supabase
      .from("business_members")
      .select("id", { count: "exact", head: true })
      .eq("coverage_group_id", groupId);
    if (error) {
      toast({ variant: "destructive", title: "Delete check failed", description: error.message });
      return;
    }
    if ((count ?? 0) > 0) {
      setDeleteBlockMsg(
        `Can't delete — ${count} team member${count === 1 ? "" : "s"} have coverage scoped to this group. Reassign their coverage first.`
      );
    }
    setConfirmDeleteId(groupId);
  };

  const handleConfirmDelete = async (groupId: string) => {
    setDeleting(true);
    try {
      const { error: membErr } = await supabase
        .from("site_group_members")
        .delete()
        .eq("group_id", groupId);
      if (membErr) throw membErr;
      const { error: grpErr } = await supabase
        .from("site_groups")
        .delete()
        .eq("id", groupId);
      if (grpErr) throw grpErr;
      setConfirmDeleteId(null);
      setDeleteBlockMsg(null);
      await load();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ variant: "destructive", title: "Delete failed", description: msg });
    } finally {
      setDeleting(false);
    }
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

      {/* Groups list */}
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">No groups yet. {isOwner ? "Create one below." : "The owner can create groups here."}</p>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => {
            const assignedIds = membershipMap[g.id] ?? [];
            const assignedNames = assignedIds
              .map((id) => sitesById[id]?.name)
              .filter((n): n is string => Boolean(n));
            const isEditing = editingId === g.id;
            const isAssigning = assigningId === g.id;
            const isConfirmDelete = confirmDeleteId === g.id;

            return (
              <Card key={g.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-4">
                    {isEditing ? (
                      <div className="flex flex-wrap items-center gap-2 flex-1">
                        <Input
                          className="h-8 text-sm w-48"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="Group name"
                          onKeyDown={(e) => { if (e.key === "Enter") handleSaveEdit(g.id); }}
                        />
                        <Select value={editType} onValueChange={setEditType}>
                          <SelectTrigger className="h-8 w-28 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="area" className="text-xs">Area</SelectItem>
                            <SelectItem value="region" className="text-xs">Region</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => handleSaveEdit(g.id)}
                          disabled={saving || !editName.trim()}
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 text-xs"
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 min-w-0">
                        <CardTitle className="text-base">{g.name}</CardTitle>
                        <TypeBadge type={g.group_type} />
                      </div>
                    )}

                    {!isEditing && isOwner && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs px-2"
                          onClick={() => {
                            setEditingId(g.id);
                            setEditName(g.name);
                            setEditType(g.group_type);
                            setAssigningId(null);
                            setConfirmDeleteId(null);
                            setDeleteBlockMsg(null);
                          }}
                        >
                          Rename
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs px-2"
                          onClick={() => {
                            setAssigningId(isAssigning ? null : g.id);
                            setEditingId(null);
                            setConfirmDeleteId(null);
                            setDeleteBlockMsg(null);
                          }}
                        >
                          {isAssigning ? "Done" : "Manage sites"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-red-600 hover:text-red-700 hover:bg-red-50 px-2"
                          onClick={() => {
                            setEditingId(null);
                            setAssigningId(null);
                            handleDeleteCheck(g.id);
                          }}
                        >
                          Delete
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="pt-0 space-y-3">
                  {/* Assigned sites summary (shown when not in site-picker mode) */}
                  {!isAssigning && (
                    <div>
                      {assignedNames.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No sites assigned.</p>
                      ) : (
                        <div className="flex flex-wrap gap-1 items-center">
                          {assignedNames.map((name) => (
                            <span
                              key={name}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                padding: "2px 8px",
                                borderRadius: 4,
                                fontSize: 11,
                                fontWeight: 500,
                                background: "#f3f4f6",
                                color: "#374151",
                              }}
                            >
                              {name}
                            </span>
                          ))}
                          <span className="text-xs text-muted-foreground ml-1">
                            {assignedNames.length} site{assignedNames.length !== 1 ? "s" : ""}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Site checklist */}
                  {isAssigning && (
                    <div className="space-y-0.5">
                      {sites.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No sites in your company yet.</p>
                      ) : (
                        sites.map((s) => {
                          const assigned = assignedIds.includes(s.id);
                          const busy = toggling === s.id;
                          return (
                            <label
                              key={s.id}
                              className="flex items-center gap-2 cursor-pointer py-1 px-2 rounded hover:bg-muted"
                              style={{ opacity: busy ? 0.6 : 1 }}
                            >
                              <input
                                type="checkbox"
                                checked={assigned}
                                disabled={busy}
                                onChange={() => handleToggleSite(g.id, s.id, assigned)}
                                style={{ accentColor: "#f07820", width: 14, height: 14 }}
                              />
                              <span className="text-sm">{s.name}</span>
                              {!s.is_active && (
                                <span className="text-xs text-muted-foreground">(inactive)</span>
                              )}
                            </label>
                          );
                        })
                      )}
                    </div>
                  )}

                  {/* Delete confirmation / block */}
                  {isConfirmDelete && (
                    <div
                      className="rounded border p-3 space-y-2"
                      style={{
                        borderColor: deleteBlockMsg ? "#fca5a5" : "#e5e7eb",
                        background: deleteBlockMsg ? "#fef2f2" : "#fafafa",
                      }}
                    >
                      {deleteBlockMsg ? (
                        <p className="text-xs text-red-600">{deleteBlockMsg}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Delete <strong>{g.name}</strong>? This cannot be undone.
                        </p>
                      )}
                      <div className="flex gap-2">
                        {!deleteBlockMsg && (
                          <Button
                            size="sm"
                            className="h-7 text-xs bg-red-600 hover:bg-red-700 text-white"
                            onClick={() => handleConfirmDelete(g.id)}
                            disabled={deleting}
                          >
                            {deleting ? "Deleting..." : "Confirm delete"}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => { setConfirmDeleteId(null); setDeleteBlockMsg(null); }}
                        >
                          Dismiss
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create group — owner only */}
      {isOwner ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Create group</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1 flex-1 min-w-40">
                <label className="text-xs text-muted-foreground">Group name</label>
                <Input
                  className="h-8 text-sm"
                  placeholder="e.g. London North"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Type</label>
                <Select value={newType} onValueChange={(v) => setNewType(v as "area" | "region")}>
                  <SelectTrigger className="h-8 w-28 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="area" className="text-xs">Area</SelectItem>
                    <SelectItem value="region" className="text-xs">Region</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                size="sm"
                className="h-8 text-sm"
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
              >
                {creating ? "Creating..." : "Create"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <p className="text-xs text-muted-foreground">Only the owner can manage groups.</p>
      )}
    </div>
  );
}
