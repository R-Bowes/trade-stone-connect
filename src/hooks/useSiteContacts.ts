import { useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface SiteContact {
  id: string;
  company_id: string;
  site_id: string;
  user_id: string | null;
  email: string;
  full_name: string;
  phone: string | null;
  role: string | null;
  invite_token: string | null;
  invite_sent_at: string | null;
  invite_accepted_at: string | null;
  is_active: boolean;
  can_raise_requests: boolean;
  can_select_contractor: boolean;
  can_search_marketplace: boolean;
  created_at: string;
  updated_at: string;
  site?: { id: string; name: string } | null;
}

export interface SiteContactInsert {
  company_id: string;
  site_id: string;
  email: string;
  full_name: string;
  phone?: string | null;
  role?: string | null;
}

// Mirrors the tier thresholds used by process_auto_dispatch()/the site
// portal: what a contact can do is entirely a function of the site's
// (or company default's) autonomy_level.
function permissionsForLevel(level: number) {
  return {
    can_raise_requests: level >= 1,
    can_select_contractor: level >= 3,
    can_search_marketplace: level >= 4,
  };
}

export function useSiteContacts() {
  const [contacts, setContacts] = useState<SiteContact[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchContacts = useCallback(async (companyId: string, siteId?: string) => {
    setLoading(true);
    let query = (supabase as any)
      .from("site_contacts")
      .select("*, site:sites(id, name)")
      .eq("company_id", companyId)
      .order("full_name");
    if (siteId) query = query.eq("site_id", siteId);

    const { data, error } = await query;
    if (error) {
      console.error("Error fetching site contacts:", error);
      setLoading(false);
      return [];
    }
    const rows = (data ?? []) as SiteContact[];
    setContacts(rows);
    setLoading(false);
    return rows;
  }, []);

  // v1: creates the row (the invite link is invite_token — emailing it via
  // Resend is a nice-to-have per the brief, not built here). The contact
  // becomes usable once they sign up with the invited email and their
  // auth.users id is matched back to this row's user_id (done by
  // acceptSiteInvite below).
  const inviteContact = async (data: SiteContactInsert): Promise<SiteContact | null> => {
    const { data: siteConfig } = await (supabase as any)
      .from("site_autonomy_config")
      .select("autonomy_level")
      .eq("company_id", data.company_id)
      .or(`site_id.eq.${data.site_id},site_id.is.null`)
      .order("site_id", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    const level = siteConfig?.autonomy_level ?? 1;

    const { data: inserted, error } = await (supabase as any)
      .from("site_contacts")
      .insert({
        ...data,
        invite_sent_at: new Date().toISOString(),
        ...permissionsForLevel(level),
      })
      .select("*, site:sites(id, name)")
      .single();

    if (error) {
      toast({ title: "Error", description: "Failed to invite contact", variant: "destructive" });
      throw error;
    }
    toast({ title: "Contact invited", description: `${data.full_name} can now be linked once they sign up with ${data.email}.` });
    setContacts((cur) => [...cur, inserted as SiteContact].sort((a, b) => a.full_name.localeCompare(b.full_name)));
    return inserted as SiteContact;
  };

  const updateContact = async (id: string, updates: Partial<SiteContactInsert & { is_active: boolean }>) => {
    const { data, error } = await (supabase as any)
      .from("site_contacts")
      .update(updates)
      .eq("id", id)
      .select("*, site:sites(id, name)")
      .single();

    if (error) {
      toast({ title: "Error", description: "Failed to update contact", variant: "destructive" });
      throw error;
    }
    setContacts((cur) => cur.map((c) => (c.id === id ? (data as SiteContact) : c)));
    return data as SiteContact;
  };

  const deactivateContact = async (id: string) => {
    await updateContact(id, { is_active: false });
    toast({ title: "Contact deactivated" });
  };

  // Re-derives the cached permission booleans for every contact at a site
  // from its current autonomy level — call after changing
  // site_autonomy_config so already-invited contacts pick up the change.
  const syncPermissions = async (companyId: string, siteId: string) => {
    const { data: siteConfig } = await (supabase as any)
      .from("site_autonomy_config")
      .select("autonomy_level")
      .eq("company_id", companyId)
      .or(`site_id.eq.${siteId},site_id.is.null`)
      .order("site_id", { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    const level = siteConfig?.autonomy_level ?? 1;
    const { error } = await (supabase as any)
      .from("site_contacts")
      .update(permissionsForLevel(level))
      .eq("company_id", companyId)
      .eq("site_id", siteId);

    if (error) {
      console.error("Error syncing site contact permissions:", error);
      throw error;
    }
  };

  return {
    contacts,
    loading,
    fetchContacts,
    inviteContact,
    updateContact,
    deactivateContact,
    syncPermissions,
  };
}
