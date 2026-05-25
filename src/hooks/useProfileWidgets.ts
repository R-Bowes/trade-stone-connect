import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type WidgetKey =
  | "bio" | "stats" | "trades" | "photos"
  | "reviews" | "credentials" | "availability" | "team";

export interface ProfileWidget {
  widget_key: WidgetKey;
  is_enabled: boolean;
  display_order: number;
}

const DEFAULT_WIDGETS: ProfileWidget[] = (
  ["bio", "stats", "trades", "photos", "reviews", "credentials", "availability", "team"] as WidgetKey[]
).map((key, i) => ({ widget_key: key, is_enabled: true, display_order: i }));

// For the authenticated contractor managing their own profile layout.
export function useProfileWidgets() {
  const [contractorId, setContractorId] = useState<string | null>(null);
  const [widgets, setWidgets] = useState<ProfileWidget[]>(DEFAULT_WIDGETS);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Two-step lookup: profiles.user_id → profiles.id
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .single();
      if (!profile) return;
      setContractorId(profile.id);

      const { data: rows } = await supabase
        .from("profile_widgets")
        .select("widget_key, is_enabled, display_order")
        .eq("contractor_id", profile.id)
        .order("display_order", { ascending: true });

      if (rows && rows.length > 0) {
        setWidgets(rows as ProfileWidget[]);
      }
      setLoaded(true);
    };
    load();
  }, []);

  const toggleWidget = useCallback((key: WidgetKey) => {
    setWidgets(prev =>
      prev.map(w => w.widget_key === key ? { ...w, is_enabled: !w.is_enabled } : w)
    );
  }, []);

  const reorderWidgets = useCallback((newOrder: WidgetKey[]) => {
    setWidgets(prev => {
      const map = new Map(prev.map(w => [w.widget_key, w]));
      return newOrder.map((key, i) => ({ ...map.get(key)!, display_order: i }));
    });
  }, []);

  const saveWidgets = useCallback(async () => {
    if (!contractorId) return;
    setSaving(true);
    try {
      await supabase.from("profile_widgets").upsert(
        widgets.map(w => ({
          contractor_id: contractorId,
          widget_key: w.widget_key,
          is_enabled: w.is_enabled,
          display_order: w.display_order,
        })),
        { onConflict: "contractor_id,widget_key" }
      );
    } finally {
      setSaving(false);
    }
  }, [contractorId, widgets]);

  return { widgets, toggleWidget, reorderWidgets, saveWidgets, saving, loaded };
}

// For reading another contractor's widget layout on the public profile page.
export function usePublicProfileWidgets(contractorId: string) {
  const [widgets, setWidgets] = useState<ProfileWidget[]>(DEFAULT_WIDGETS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!contractorId) return;
    const load = async () => {
      const { data: rows } = await supabase
        .from("profile_widgets")
        .select("widget_key, is_enabled, display_order")
        .eq("contractor_id", contractorId)
        .order("display_order", { ascending: true });

      if (rows && rows.length > 0) {
        setWidgets(rows as ProfileWidget[]);
      }
      setLoaded(true);
    };
    load();
  }, [contractorId]);

  // Only enabled widgets, in display order
  const enabledWidgets = widgets.filter(w => w.is_enabled);

  return { widgets: enabledWidgets, allWidgets: widgets, loaded };
}
