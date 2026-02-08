import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface ScheduleEvent {
  id: string;
  contractor_id: string;
  title: string;
  description: string | null;
  event_type: string;
  client_name: string | null;
  client_phone: string | null;
  location: string | null;
  start_time: string;
  end_time: string;
  all_day: boolean;
  status: string;
  color: string | null;
  created_at: string;
  updated_at: string;
}

export interface AvailabilitySlot {
  id: string;
  contractor_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_available: boolean;
  created_at: string;
  updated_at: string;
}

export type ScheduleEventInsert = Omit<ScheduleEvent, "id" | "created_at" | "updated_at">;
export type ScheduleEventUpdate = Partial<ScheduleEventInsert> & { id: string };

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function useSchedule() {
  const [events, setEvents] = useState<ScheduleEvent[]>([]);
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchEvents = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("schedule_events")
      .select("*")
      .eq("contractor_id", user.id)
      .order("start_time", { ascending: true });

    if (error) {
      console.error("Error fetching events:", error);
    } else {
      setEvents((data as ScheduleEvent[]) || []);
    }
  }, []);

  const fetchAvailability = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data, error } = await supabase
      .from("availability_slots")
      .select("*")
      .eq("contractor_id", user.id)
      .order("day_of_week", { ascending: true });

    if (error) {
      console.error("Error fetching availability:", error);
    } else {
      setAvailability((data as AvailabilitySlot[]) || []);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      await Promise.all([fetchEvents(), fetchAvailability()]);
      setLoading(false);
    };
    load();
  }, [fetchEvents, fetchAvailability]);

  const addEvent = async (event: Omit<ScheduleEventInsert, "contractor_id">) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from("schedule_events")
      .insert({ ...event, contractor_id: user.id });

    if (error) {
      toast({ title: "Error", description: "Failed to create event", variant: "destructive" });
      throw error;
    }

    toast({ title: "Event Created", description: `"${event.title}" added to your calendar` });
    await fetchEvents();
  };

  const updateEvent = async (id: string, updates: Partial<ScheduleEventInsert>) => {
    const { error } = await supabase
      .from("schedule_events")
      .update(updates)
      .eq("id", id);

    if (error) {
      toast({ title: "Error", description: "Failed to update event", variant: "destructive" });
      throw error;
    }

    toast({ title: "Event Updated", description: "Schedule updated successfully" });
    await fetchEvents();
  };

  const deleteEvent = async (id: string) => {
    const { error } = await supabase
      .from("schedule_events")
      .delete()
      .eq("id", id);

    if (error) {
      toast({ title: "Error", description: "Failed to delete event", variant: "destructive" });
      throw error;
    }

    toast({ title: "Event Deleted", description: "Event removed from calendar" });
    await fetchEvents();
  };

  const saveAvailability = async (slots: { day_of_week: number; start_time: string; end_time: string; is_available: boolean }[]) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Upsert all slots
    const records = slots.map(s => ({
      contractor_id: user.id,
      day_of_week: s.day_of_week,
      start_time: s.start_time,
      end_time: s.end_time,
      is_available: s.is_available,
    }));

    // Delete existing and re-insert for simplicity
    await supabase.from("availability_slots").delete().eq("contractor_id", user.id);
    const { error } = await supabase.from("availability_slots").insert(records);

    if (error) {
      toast({ title: "Error", description: "Failed to save availability", variant: "destructive" });
      throw error;
    }

    toast({ title: "Availability Saved", description: "Your working hours have been updated" });
    await fetchAvailability();
  };

  return {
    events,
    availability,
    loading,
    addEvent,
    updateEvent,
    deleteEvent,
    saveAvailability,
    refreshEvents: fetchEvents,
    DAY_NAMES,
  };
}
