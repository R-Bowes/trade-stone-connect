import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { wasRecentAction } from "@/lib/recentActions";
import { resolveNotificationRoute, primeViewerRole } from "@/lib/notificationResolver";
import type { ViewerRole } from "@/lib/notificationResolver";

export interface Notification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  reference_type: string | null;
  reference_id: string | null;
  is_read: boolean;
  created_at: string;
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const navigate = useNavigate();

  const fetchNotifications = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("id, user_type")
      .eq("user_id", user.id)
      .maybeSingle();

    // Prime the resolver cache so click-time lookups are synchronous
    if (profileRow?.user_type) {
      primeViewerRole(profileRow.user_type as ViewerRole);
    }

    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", profileRow?.id ?? user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("Failed to fetch notifications:", error);
    } else if (data) {
      setNotifications(data as unknown as Notification[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Subscribe to realtime inserts
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | undefined;

    const setup = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profileRow } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      const profileId = profileRow?.id ?? user.id;

      channel = supabase
        .channel("notifications-realtime")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${profileId}`,
          },
          (payload) => {
            const newNotif = payload.new as unknown as Notification;
            setNotifications((prev) => [newNotif, ...prev]);

            if (wasRecentAction(newNotif.reference_id)) return;

            resolveNotificationRoute(newNotif).then((route) => {
              toast({
                title: newNotif.title,
                description: newNotif.message,
                action: (
                  <ToastAction altText="View" onClick={() => navigate(route)}>
                    View
                  </ToastAction>
                ),
              });
            });
          }
        )
        .subscribe();
    };

    setup();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [toast, navigate]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const markAsRead = async (id: string) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
  };

  const markAllAsRead = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

    await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", profileRow?.id ?? user.id)
      .eq("is_read", false);

    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  const deleteNotification = async (id: string) => {
    await supabase.from("notifications").delete().eq("id", id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  return {
    notifications,
    loading,
    unreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    refetch: fetchNotifications,
  };
}