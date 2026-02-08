import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Loader2, CalendarDays, Clock, List } from "lucide-react";
import { useSchedule, type ScheduleEvent } from "@/hooks/useSchedule";
import { WeekCalendar } from "./schedule/WeekCalendar";
import { UpcomingEvents } from "./schedule/UpcomingEvents";
import { AvailabilityManager } from "./schedule/AvailabilityManager";
import { EventFormDialog } from "./schedule/EventFormDialog";

export function ScheduleManagement() {
  const { events, availability, loading, addEvent, updateEvent, deleteEvent, saveAvailability } = useSchedule();
  const [showForm, setShowForm] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ScheduleEvent | null>(null);
  const [defaultDate, setDefaultDate] = useState<Date | undefined>();

  const handleSlotClick = (date: Date) => {
    setEditingEvent(null);
    setDefaultDate(date);
    setShowForm(true);
  };

  const handleEventClick = (event: ScheduleEvent) => {
    setEditingEvent(event);
    setDefaultDate(undefined);
    setShowForm(true);
  };

  const handleSave = async (data: any) => {
    if (editingEvent) {
      await updateEvent(editingEvent.id, data);
    } else {
      await addEvent(data);
    }
  };

  const handleDrop = async (eventId: string, newStart: Date, newEnd: Date) => {
    await updateEvent(eventId, {
      start_time: newStart.toISOString(),
      end_time: newEnd.toISOString(),
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Schedule & Availability</h2>
        <Button onClick={() => { setEditingEvent(null); setDefaultDate(undefined); setShowForm(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Add Event
        </Button>
      </div>

      <Tabs defaultValue="calendar">
        <TabsList>
          <TabsTrigger value="calendar" className="gap-1"><CalendarDays className="h-4 w-4" />Calendar</TabsTrigger>
          <TabsTrigger value="upcoming" className="gap-1"><List className="h-4 w-4" />Upcoming</TabsTrigger>
          <TabsTrigger value="availability" className="gap-1"><Clock className="h-4 w-4" />Availability</TabsTrigger>
        </TabsList>

        <TabsContent value="calendar" className="mt-4">
          <WeekCalendar
            events={events}
            onEventClick={handleEventClick}
            onSlotClick={handleSlotClick}
            onEventDrop={handleDrop}
          />
        </TabsContent>

        <TabsContent value="upcoming" className="mt-4">
          <UpcomingEvents events={events} onEdit={handleEventClick} onDelete={deleteEvent} />
        </TabsContent>

        <TabsContent value="availability" className="mt-4">
          <AvailabilityManager availability={availability} onSave={saveAvailability} />
        </TabsContent>
      </Tabs>

      <EventFormDialog
        open={showForm}
        onClose={() => { setShowForm(false); setEditingEvent(null); }}
        onSave={handleSave}
        editingEvent={editingEvent}
        defaultDate={defaultDate}
      />
    </div>
  );
}
