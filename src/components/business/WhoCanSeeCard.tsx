import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/AsyncState";
import { messageOf } from "@/components/projects/projectErrors";

interface ProjectSite {
  id: string;
  name: string;
}

interface Viewer {
  id: string;
  name: string;
  coverageLabel: string;
  isOwner: boolean;
}

/**
 * Read-only: the owner, plus each active team member whose coverage
 * (national, a site group, or a single site) reaches at least one of
 * this project's sites. "Reaches" is a product question, not the same
 * as can_access_project — any active member can technically open the
 * project; this card answers who it's actually relevant to.
 */
export function WhoCanSeeCard({ companyId, projectSites }: { companyId: string; projectSites: ProjectSite[] }) {
  const navigate = useNavigate();
  const [viewers, setViewers] = useState<Viewer[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const projectSiteIds = new Set(projectSites.map((s) => s.id));

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: company, error: companyError } = await supabase
        .from("companies")
        .select("owner_id")
        .eq("id", companyId)
        .single();
      if (companyError) throw companyError;

      const { data: ownerProfile, error: ownerError } = await supabase
        .from("profiles")
        .select("id, full_name, ts_profile_code")
        .eq("id", company.owner_id)
        .maybeSingle();
      if (ownerError) throw ownerError;

      const { data: members, error: membersError } = await supabase
        .from("business_members")
        .select("coverage_kind, coverage_group_id, coverage_site_id, profiles(id, full_name, ts_profile_code)")
        .eq("company_id", companyId)
        .eq("status", "active");
      if (membersError) throw membersError;

      const groupIds = [...new Set((members ?? []).map((m) => m.coverage_group_id).filter((id): id is string => !!id))];
      let groupNames: Record<string, string> = {};
      let groupSiteIds: Record<string, string[]> = {};
      if (groupIds.length > 0) {
        const [groupsRes, groupMembersRes] = await Promise.all([
          supabase.from("site_groups").select("id, name").in("id", groupIds),
          supabase.from("site_group_members").select("group_id, site_id").in("group_id", groupIds),
        ]);
        if (groupsRes.error) throw groupsRes.error;
        if (groupMembersRes.error) throw groupMembersRes.error;
        groupNames = Object.fromEntries((groupsRes.data ?? []).map((g) => [g.id, g.name]));
        for (const row of groupMembersRes.data ?? []) {
          (groupSiteIds[row.group_id] ??= []).push(row.site_id);
        }
      }

      const list: Viewer[] = [];
      if (ownerProfile) {
        list.push({
          id: ownerProfile.id,
          name: ownerProfile.full_name || ownerProfile.ts_profile_code || "Owner",
          coverageLabel: "Owner — sees every project",
          isOwner: true,
        });
      }

      for (const m of members ?? []) {
        const profile = m.profiles as { id: string; full_name: string | null; ts_profile_code: string | null } | null;
        if (!profile) continue;

        let reaches = false;
        let label = "";
        if (m.coverage_kind === "national") {
          reaches = true;
          label = "National coverage";
        } else if (m.coverage_kind === "site") {
          reaches = !!m.coverage_site_id && projectSiteIds.has(m.coverage_site_id);
          const siteName = projectSites.find((s) => s.id === m.coverage_site_id)?.name;
          label = siteName ? `Site coverage — ${siteName}` : "Site coverage";
        } else if (m.coverage_kind === "group") {
          const sitesInGroup = m.coverage_group_id ? groupSiteIds[m.coverage_group_id] ?? [] : [];
          reaches = sitesInGroup.some((id) => projectSiteIds.has(id));
          const groupName = m.coverage_group_id ? groupNames[m.coverage_group_id] : undefined;
          label = groupName ? `Group coverage — ${groupName}` : "Group coverage";
        }

        if (reaches) {
          list.push({
            id: profile.id,
            name: profile.full_name || profile.ts_profile_code || "Team member",
            coverageLabel: label,
            isOwner: false,
          });
        }
      }

      setViewers(list);
    } catch (err) {
      console.error("Error loading who can see this project:", err);
      setError(messageOf(err));
      setViewers(null);
    } finally {
      setLoading(false);
    }
  }, [companyId, projectSites]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, projectSites.map((s) => s.id).join(",")]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="font-heading text-lg">Who can see this</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">Team members whose coverage includes one of this project's sites.</p>

        {loading ? (
          <LoadingState message="Loading..." />
        ) : error || !viewers ? (
          <p className="text-destructive">You don't have permission to see who else can see this project.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {viewers.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 p-2.5">
                <span>{v.name}</span>
                <span className="text-xs text-muted-foreground">{v.coverageLabel}</span>
              </li>
            ))}
          </ul>
        )}

        <Button variant="link" className="h-auto p-0" onClick={() => navigate("/dashboard/business?view=team")}>
          Go to Team
        </Button>
      </CardContent>
    </Card>
  );
}
