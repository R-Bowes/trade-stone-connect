import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { ChevronLeft, ChevronRight, CalendarDays, MapPin, User, Phone, GripVertical } from "lucide-react";
import { format, startOfWeek, addDays, isSameDay, addWeeks, subWeeks } from "date-fns";
import type { ScheduleEvent } from "@/hooks/useSchedule";

interface WeekCalendarProps {
  events: ScheduleEvent[];
  onEventClick: (event: ScheduleEvent) => void;
  onSlotClick: (date: Date) => void;
  onEventDrop: (eventId: string, newStart: Date, newEnd: Date) => void;
}

const HOURS = Array.from({ length: 14 }, (_, i) => i + 6); // 6am to 7pm

const statusStyles: Record<string, string> = {
  scheduled: "border-l-4",
  confirmed: "border-l-4",
  in_progress: "border-l-4 opacity-90",
  completed: "border-l-4 opacity-60",
  cancelled: "border-l-4 opacity-40 line-through",
  accepted: "border-l-4",
  proposed: "border-l-4 border-dashed opacity-60",
  declined: "border-l-4 border-dashed opacity-30 line-through",
};

const statusLabel: Record<string, string> = {
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  in_progress: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
  accepted: "Accepted",
  proposed: "Proposed",
  declined: "Declined",
};

function eventActionLabel(event: ScheduleEvent): "View Job" | "View Quote" | "Edit event" {
  if (event.job_id) return "View Job";
  if (event.quote_id) return "View Quote";
  return "Edit event";
}

export function WeekCalendar({ events, onEventClick, onSlotClick, onEventDrop }: WeekCalendarProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [draggedEvent, setDraggedEvent] = useState<ScheduleEvent | null>(null);
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 }); // Monday
  const weekDays = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const getEventsForDay = (day: Date) =>
    events.filter(e => {
      const eventDate = new Date(e.start_time);
      return isSameDay(eventDate, day);
    });

  const getEventPosition = (event: ScheduleEvent) => {
    const start = new Date(event.start_time);
    const end = new Date(event.end_time);
    const startHour = start.getHours() + start.getMinutes() / 60;
    const endHour = end.getHours() + end.getMinutes() / 60;
    const top = Math.max(0, (startHour - 6) * 60); // 60px per hour, starting at 6am
    const height = Math.max(30, (endHour - startHour) * 60);
    return { top, height };
  };

  const handleDragStart = (e: React.DragEvent, event: ScheduleEvent) => {
    setDraggedEvent(event);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", event.id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, day: Date, hour: number) => {
    e.preventDefault();
    if (!draggedEvent) return;

    const originalStart = new Date(draggedEvent.start_time);
    const originalEnd = new Date(draggedEvent.end_time);
    const duration = originalEnd.getTime() - originalStart.getTime();

    const newStart = new Date(day);
    newStart.setHours(hour, 0, 0, 0);
    const newEnd = new Date(newStart.getTime() + duration);

    onEventDrop(draggedEvent.id, newStart, newEnd);
    setDraggedEvent(null);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Week View
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={() => setCurrentDate(d => subWeeks(d, 1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
              Today
            </Button>
            <Button variant="outline" size="icon" onClick={() => setCurrentDate(d => addWeeks(d, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {format(weekDays[0], "MMM d")} — {format(weekDays[6], "MMM d, yyyy")}
        </p>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <div className="min-w-[800px]">
            {/* Day headers */}
            <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b">
              <div className="p-2 text-xs text-muted-foreground" />
              {weekDays.map((day) => (
                <div
                  key={day.toISOString()}
                  className={`p-2 text-center border-l cursor-pointer hover:bg-accent/50 transition-colors ${
                    isSameDay(day, new Date()) ? "bg-primary/10 font-bold" : ""
                  }`}
                  onClick={() => onSlotClick(day)}
                >
                  <div className="text-xs text-muted-foreground">{format(day, "EEE")}</div>
                  <div className={`text-lg ${isSameDay(day, new Date()) ? "text-primary" : ""}`}>
                    {format(day, "d")}
                  </div>
                </div>
              ))}
            </div>

            {/* Time grid */}
            <div className="grid grid-cols-[60px_repeat(7,1fr)] relative" style={{ height: HOURS.length * 60 }}>
              {/* Time labels */}
              {HOURS.map((hour) => (
                <div
                  key={hour}
                  className="absolute left-0 w-[60px] text-xs text-muted-foreground pr-2 text-right"
                  style={{ top: (hour - 6) * 60 - 8 }}
                >
                  {format(new Date(2000, 0, 1, hour), "ha")}
                </div>
              ))}

              {/* Hour lines */}
              {HOURS.map((hour) => (
                <div
                  key={`line-${hour}`}
                  className="absolute left-[60px] right-0 border-t border-border/50"
                  style={{ top: (hour - 6) * 60 }}
                />
              ))}

              {/* Day columns with events */}
              {weekDays.map((day, dayIdx) => {
                const dayEvents = getEventsForDay(day);
                return (
                  <div
                    key={day.toISOString()}
                    className="absolute border-l"
                    style={{
                      left: `calc(60px + ${dayIdx} * ((100% - 60px) / 7))`,
                      width: `calc((100% - 60px) / 7)`,
                      height: "100%",
                    }}
                  >
                    {/* Drop zones per hour */}
                    {HOURS.map(hour => (
                      <div
                        key={hour}
                        className="absolute w-full hover:bg-accent/20 transition-colors cursor-pointer"
                        style={{ top: (hour - 6) * 60, height: 60 }}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, day, hour)}
                        onClick={() => {
                          const d = new Date(day);
                          d.setHours(hour, 0, 0, 0);
                          onSlotClick(d);
                        }}
                      />
                    ))}

                    {/* Events */}
                    {dayEvents.map(event => {
                      const pos = getEventPosition(event);
                      const isDraggable = !event.quote_id;
                      const actionLabel = eventActionLabel(event);
                      return (
                        <div
                          key={event.id}
                          className={`absolute left-1 right-1 rounded-md text-xs overflow-hidden ${statusStyles[event.status] || ""}`}
                          style={{
                            top: pos.top,
                            height: pos.height,
                            backgroundColor: (event.color || "#e87722") + "22",
                            borderLeftColor: event.color || "#e87722",
                            zIndex: 10,
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Popover
                            open={openPopoverId === event.id}
                            onOpenChange={(isOpen) => setOpenPopoverId(isOpen ? event.id : null)}
                          >
                            <PopoverTrigger asChild>
                              <div className="px-2 py-1 cursor-pointer h-full w-full">
                                <div className="flex items-center gap-1">
                                  {isDraggable && (
                                    <span
                                      draggable
                                      onDragStart={(e) => handleDragStart(e, event)}
                                      onClick={(e) => e.stopPropagation()}
                                      className="cursor-grab active:cursor-grabbing flex-shrink-0"
                                    >
                                      <GripVertical className="h-3 w-3 opacity-40" />
                                    </span>
                                  )}
                                  <span className="font-medium truncate">{event.title}</span>
                                </div>
                                {pos.height > 40 && (
                                  <div className="text-muted-foreground mt-0.5">
                                    {format(new Date(event.start_time), "h:mm a")} - {format(new Date(event.end_time), "h:mm a")}
                                  </div>
                                )}
                                {pos.height > 60 && event.client_name && (
                                  <div className="flex items-center gap-1 text-muted-foreground mt-0.5">
                                    <User className="h-3 w-3" />
                                    <span className="truncate">{event.client_name}</span>
                                  </div>
                                )}
                                {pos.height > 80 && event.location && (
                                  <div className="flex items-center gap-1 text-muted-foreground mt-0.5">
                                    <MapPin className="h-3 w-3" />
                                    <span className="truncate">{event.location}</span>
                                  </div>
                                )}
                              </div>
                            </PopoverTrigger>
                            <PopoverContent className="w-64 text-sm space-y-2">
                              <p className="font-semibold leading-tight">{event.title}</p>
                              <Badge variant="outline" className="text-xs">
                                {statusLabel[event.status] ?? event.status}
                              </Badge>
                              <p className="text-muted-foreground text-xs">
                                {format(new Date(event.start_time), "d MMM yyyy")}<br />
                                {format(new Date(event.start_time), "h:mm a")} – {format(new Date(event.end_time), "h:mm a")}
                              </p>
                              {event.client_name && (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <User className="h-3 w-3 flex-shrink-0" />
                                  <span>{event.client_name}</span>
                                </div>
                              )}
                              {event.location && (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <MapPin className="h-3 w-3 flex-shrink-0" />
                                  <span>{event.location}</span>
                                </div>
                              )}
                              <Button
                                size="sm"
                                className="w-full"
                                onClick={() => { setOpenPopoverId(null); onEventClick(event); }}
                              >
                                {actionLabel}
                              </Button>
                            </PopoverContent>
                          </Popover>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
