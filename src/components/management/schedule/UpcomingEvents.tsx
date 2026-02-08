import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, User, Phone, Clock, Edit, Trash2 } from "lucide-react";
import { format, isAfter } from "date-fns";
import type { ScheduleEvent } from "@/hooks/useSchedule";

interface UpcomingEventsProps {
  events: ScheduleEvent[];
  onEdit: (event: ScheduleEvent) => void;
  onDelete: (id: string) => void;
}

const typeLabels: Record<string, string> = {
  job: "Job",
  consultation: "Consultation",
  estimate: "Estimate",
  follow_up: "Follow-up",
  personal: "Personal",
  blocked: "Blocked",
};

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  scheduled: "outline",
  confirmed: "default",
  in_progress: "secondary",
  completed: "default",
  cancelled: "destructive",
};

export function UpcomingEvents({ events, onEdit, onDelete }: UpcomingEventsProps) {
  const upcoming = events
    .filter(e => isAfter(new Date(e.start_time), new Date()) && e.status !== "cancelled")
    .slice(0, 8);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Upcoming Events ({upcoming.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {upcoming.length === 0 ? (
          <p className="text-muted-foreground text-center py-6">No upcoming events scheduled</p>
        ) : (
          <div className="space-y-3">
            {upcoming.map(event => (
              <div
                key={event.id}
                className="flex items-start gap-3 p-3 border rounded-lg hover:shadow-sm transition-shadow"
                style={{ borderLeftWidth: 4, borderLeftColor: event.color || "#e87722" }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium truncate">{event.title}</h4>
                    <Badge variant={statusVariant[event.status] || "outline"} className="text-xs">
                      {event.status}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {typeLabels[event.event_type] || event.event_type}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {format(new Date(event.start_time), "EEE, MMM d · h:mm a")} — {format(new Date(event.end_time), "h:mm a")}
                  </p>
                  <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                    {event.client_name && (
                      <span className="flex items-center gap-1"><User className="h-3 w-3" />{event.client_name}</span>
                    )}
                    {event.location && (
                      <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{event.location}</span>
                    )}
                    {event.client_phone && (
                      <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{event.client_phone}</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(event)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => onDelete(event.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
