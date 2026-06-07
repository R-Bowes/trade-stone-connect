import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface FeatureAnnouncement {
  id: string;
  title: string;
  description: string | null;
  applies_to: string[];
  released_at: string;
}

export type ActiveModal = "none" | "tutorial" | "help" | "whatsnew";
export type UserRole = "contractor" | "personal" | "business";

interface HelpSystemContextValue {
  activeModal: ActiveModal;
  role: UserRole;
  openHelp: () => void;
  openTutorial: () => void;
  close: () => void;
  unseenAnnouncements: FeatureAnnouncement[];
  onTutorialComplete: () => Promise<void>;
  onAnnouncementsSeen: (ids: string[]) => Promise<void>;
}

const DEFAULT_CTX: HelpSystemContextValue = {
  activeModal: "none",
  role: "contractor",
  openHelp: () => {},
  openTutorial: () => {},
  close: () => {},
  unseenAnnouncements: [],
  onTutorialComplete: async () => {},
  onAnnouncementsSeen: async () => {},
};

const HelpSystemContext = createContext<HelpSystemContextValue>(DEFAULT_CTX);

export function useHelpSystem(): HelpSystemContextValue {
  return useContext(HelpSystemContext);
}

interface HelpSystemProviderProps {
  profileId: string;
  role: UserRole;
  children: ReactNode;
}

export function HelpSystemProvider({ profileId, role, children }: HelpSystemProviderProps) {
  const [activeModal, setActiveModal] = useState<ActiveModal>("none");
  const [unseenAnnouncements, setUnseenAnnouncements] = useState<FeatureAnnouncement[]>([]);

  useEffect(() => {
    const init = async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("onboarding_completed_at")
        .eq("id", profileId)
        .single();

      if (!profile?.onboarding_completed_at) {
        setActiveModal("tutorial");
        return;
      }

      const { data: seenRows } = await supabase
        .from("user_seen_announcements")
        .select("announcement_id")
        .eq("user_id", profileId);

      const seenIds = new Set((seenRows ?? []).map((r) => r.announcement_id));

      const { data: allForRole } = await supabase
        .from("feature_announcements")
        .select("id, title, description, applies_to, released_at")
        .contains("applies_to", [role])
        .order("released_at", { ascending: false });

      const unseen = (allForRole ?? []).filter((a) => !seenIds.has(a.id));

      if (unseen.length > 0) {
        setUnseenAnnouncements(unseen);
        setActiveModal("whatsnew");
      }
    };

    init();
  }, [profileId, role]);

  const openHelp = useCallback(() => setActiveModal("help"), []);
  const openTutorial = useCallback(() => setActiveModal("tutorial"), []);
  const close = useCallback(() => setActiveModal("none"), []);

  const onTutorialComplete = useCallback(async () => {
    await supabase
      .from("profiles")
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq("id", profileId);
    setActiveModal("none");
  }, [profileId]);

  const onAnnouncementsSeen = useCallback(
    async (ids: string[]) => {
      if (ids.length === 0) return;
      await supabase
        .from("user_seen_announcements")
        .upsert(
          ids.map((announcement_id) => ({ user_id: profileId, announcement_id })),
          { onConflict: "user_id,announcement_id" }
        );
      setUnseenAnnouncements([]);
      setActiveModal("none");
    },
    [profileId]
  );

  return (
    <HelpSystemContext.Provider
      value={{
        activeModal,
        role,
        openHelp,
        openTutorial,
        close,
        unseenAnnouncements,
        onTutorialComplete,
        onAnnouncementsSeen,
      }}
    >
      {children}
    </HelpSystemContext.Provider>
  );
}
