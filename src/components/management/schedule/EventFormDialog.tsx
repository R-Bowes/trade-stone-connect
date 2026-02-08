import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { ScheduleEvent } from "@/hooks/useSchedule";

interface EventFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (event: any) => Promise<void>;
  editingEvent?: ScheduleEvent | null;
  defaultDate?: Date;
}

const EVENT_TYPES = [
  { value: "job", label: "Job / Work" },
  { value: "consultation", label: "Consultation" },
  { value: "estimate", label: "Estimate Visit" },
  { value: "follow_up", label: "Follow-up" },
  { value: "personal", label: "Personal" },
  { value: "blocked", label: "Blocked Time" },
];

const STATUS_OPTIONS = [
  { value: "scheduled", label: "Scheduled" },
  { value: "confirmed", label: "Confirmed" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

const COLOR_OPTIONS = [
  { value: "#e87722", label: "Orange (Default)" },
  { value: "#2563eb", label: "Blue" },
  { value: "#16a34a", label: "Green" },
  { value: "#dc2626", label: "Red" },
  { value: "#7c3aed", label: "Purple" },
  { value: "#ca8a04", label: "Gold" },
  { value: "#6b7280", label: "Grey" },
];

function toLocalDatetime(d: Date) {
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

export function EventFormDialog({ open, onClose, onSave, editingEvent, defaultDate }: EventFormDialogProps) {
  const now = defaultDate || new Date();
  const defaultStart = toLocalDatetime(now);
  const defaultEnd = toLocalDatetime(new Date(now.getTime() + 2 * 60 * 60 * 1000));

  const [title, setTitle] = useState(editingEvent?.title || "");
  const [description, setDescription] = useState(editingEvent?.description || "");
  const [eventType, setEventType] = useState(editingEvent?.event_type || "job");
  const [clientName, setClientName] = useState(editingEvent?.client_name || "");
  const [clientPhone, setClientPhone] = useState(editingEvent?.client_phone || "");
  const [location, setLocation] = useState(editingEvent?.location || "");
  const [startTime, setStartTime] = useState(editingEvent ? toLocalDatetime(new Date(editingEvent.start_time)) : defaultStart);
  const [endTime, setEndTime] = useState(editingEvent ? toLocalDatetime(new Date(editingEvent.end_time)) : defaultEnd);
  const [allDay, setAllDay] = useState(editingEvent?.all_day || false);
  const [status, setStatus] = useState(editingEvent?.status || "scheduled");
  const [color, setColor] = useState(editingEvent?.color || "#e87722");
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim() || !startTime || !endTime) return;
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        description: description.trim() || null,
        event_type: eventType,
        client_name: clientName.trim() || null,
        client_phone: clientPhone.trim() || null,
        location: location.trim() || null,
        start_time: new Date(startTime).toISOString(),
        end_time: new Date(endTime).toISOString(),
        all_day: allDay,
        status,
        color,
      });
      onClose();
    } catch {
      // toast handled in hook
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingEvent ? "Edit Event" : "New Event"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Title *</Label>
            <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Kitchen renovation at Smith's" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Type</Label>
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Switch checked={allDay} onCheckedChange={setAllDay} />
            <Label>All Day Event</Label>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Start {allDay ? "Date" : "Date & Time"} *</Label>
              <Input type={allDay ? "date" : "datetime-local"} value={allDay ? startTime.slice(0, 10) : startTime} onChange={e => setStartTime(allDay ? e.target.value + "T09:00" : e.target.value)} />
            </div>
            <div>
              <Label>End {allDay ? "Date" : "Date & Time"} *</Label>
              <Input type={allDay ? "date" : "datetime-local"} value={allDay ? endTime.slice(0, 10) : endTime} onChange={e => setEndTime(allDay ? e.target.value + "T17:00" : e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Client Name</Label>
              <Input value={clientName} onChange={e => setClientName(e.target.value)} placeholder="Client name" />
            </div>
            <div>
              <Label>Client Phone</Label>
              <Input value={clientPhone} onChange={e => setClientPhone(e.target.value)} placeholder="Phone number" />
            </div>
          </div>

          <div>
            <Label>Location</Label>
            <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="Job site address" />
          </div>

          <div>
            <Label>Description</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Notes about this job..." rows={3} />
          </div>

          <div>
            <Label>Color</Label>
            <Select value={color} onValueChange={setColor}>
              <SelectTrigger>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded-full" style={{ backgroundColor: color }} />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                {COLOR_OPTIONS.map(c => (
                  <SelectItem key={c.value} value={c.value}>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 rounded-full" style={{ backgroundColor: c.value }} />
                      {c.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !title.trim()}>
            {saving ? "Saving..." : editingEvent ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
