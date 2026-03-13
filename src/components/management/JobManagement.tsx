import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useInvoices } from "@/hooks/useInvoices";
import { InvoiceFormDialog, type InvoiceFormInitialData } from "@/components/management/invoices/InvoiceFormDialog";
import {
  Briefcase,
  ArrowLeft,
  Clock,
  PlayCircle,
  CheckCircle2,
  StickyNote,
  Camera,
  Users,
  Loader2,
  Trash2,
  Upload,
  Plus,
  Send,
  FileText,
  MapPin,
  Receipt
} from "lucide-react";
import { useJobs, useJobNotes, useJobPhotos, useJobTeam, type Job } from "@/hooks/useJobs";
import { format } from "date-fns";

const statusConfig: Record<string, { label: string; icon: any; color: string }> = {
  not_started: { label: "Not Started", icon: Clock, color: "bg-muted text-muted-foreground" },
  in_progress: { label: "In Progress", icon: PlayCircle, color: "bg-blue-100 text-blue-800" },
  completed: { label: "Completed", icon: CheckCircle2, color: "bg-green-100 text-green-800" },
};

export function JobManagement() {
  const { jobs, loading, updateJobStatus } = useJobs("contractor");
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  if (selectedJob) {
    return <JobDetail job={selectedJob} onBack={() => setSelectedJob(null)} updateJobStatus={updateJobStatus} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Jobs</h2>
      </div>

      {jobs.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Briefcase className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Jobs Yet</h3>
            <p className="text-muted-foreground">Jobs are automatically created when a client accepts one of your quotes.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {jobs.map((job) => {
            const sc = statusConfig[job.status] || statusConfig.not_started;
            const StatusIcon = sc.icon;
            return (
              <Card key={job.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setSelectedJob(job)}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold truncate">{job.title}</h3>
                        <Badge className={sc.color}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {sc.label}
                        </Badge>
                      </div>
                      {job.location && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {job.location}
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        Created {format(new Date(job.created_at), "dd MMM yyyy")}
                        {job.contract_value > 0 && ` • £${Number(job.contract_value).toFixed(2)}`}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function JobDetail({ job, onBack, updateJobStatus }: { job: Job; onBack: () => void; updateJobStatus: (id: string, status: string) => void }) {
  const { notes, addNote } = useJobNotes(job.id);
  const { photos, uploadPhoto, deletePhoto } = useJobPhotos(job.id);
  const { teamMembers, assignMember, removeMember } = useJobTeam(job.id);
  const [newNote, setNewNote] = useState("");
  const [activeSection, setActiveSection] = useState<"overview" | "notes" | "photos" | "team">("overview");
  const [availableTeam, setAvailableTeam] = useState<any[]>([]);
  const [selectedMember, setSelectedMember] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const sc = statusConfig[job.status] || statusConfig.not_started;
  const StatusIcon = sc.icon;

  const loadAvailableTeam = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("team_members")
      .select("id, full_name, role")
      .eq("contractor_id", user.id)
      .eq("is_active", true);
    setAvailableTeam(data || []);
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    await addNote(newNote.trim());
    setNewNote("");
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Only images are allowed.", variant: "destructive" });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Max 5MB.", variant: "destructive" });
      return;
    }
    await uploadPhoto(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleAssignMember = async () => {
    if (!selectedMember) return;
    const error = await assignMember(selectedMember);
    if (error) {
      toast({ title: "Error", description: "Member may already be assigned.", variant: "destructive" });
    }
    setSelectedMember("");
  };

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft className="h-4 w-4 mr-2" /> Back to Jobs
      </Button>

      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-xl">{job.title}</CardTitle>
              {job.description && <CardDescription>{job.description}</CardDescription>}
            </div>
            <Badge className={sc.color}>
              <StatusIcon className="h-3 w-3 mr-1" />
              {sc.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-4">
            {job.location && <span className="flex items-center gap-1"><MapPin className="h-4 w-4" />{job.location}</span>}
            {job.contract_value > 0 && <span className="flex items-center gap-1"><FileText className="h-4 w-4" />£{Number(job.contract_value).toFixed(2)}</span>}
            {job.start_date && <span>Start: {format(new Date(job.start_date), "dd MMM yyyy")}</span>}
          </div>
          <div className="flex gap-2">
            {job.status === "not_started" && (
              <Button size="sm" onClick={() => updateJobStatus(job.id, "in_progress")}>
                <PlayCircle className="h-4 w-4 mr-1" /> Start Job
              </Button>
            )}
            {job.status === "in_progress" && (
              <Button size="sm" onClick={() => updateJobStatus(job.id, "completed")}>
                <CheckCircle2 className="h-4 w-4 mr-1" /> Mark Complete
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Section Nav */}
      <div className="flex gap-2">
        {(["overview", "notes", "photos", "team"] as const).map((section) => (
          <Button
            key={section}
            variant={activeSection === section ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setActiveSection(section);
              if (section === "team") loadAvailableTeam();
            }}
          >
            {section === "overview" && <Briefcase className="h-4 w-4 mr-1" />}
            {section === "notes" && <StickyNote className="h-4 w-4 mr-1" />}
            {section === "photos" && <Camera className="h-4 w-4 mr-1" />}
            {section === "team" && <Users className="h-4 w-4 mr-1" />}
            {section.charAt(0).toUpperCase() + section.slice(1)}
          </Button>
        ))}
      </div>

      {/* Notes Section */}
      {activeSection === "notes" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Notes</CardTitle>
            <CardDescription>Notes shared between you and the client</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {notes.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No notes yet.</p>}
              {notes.map((note) => (
                <div key={note.id} className="p-3 rounded-lg bg-muted/50 space-y-1">
                  <p className="text-sm">{note.content}</p>
                  <p className="text-xs text-muted-foreground">{format(new Date(note.created_at), "dd MMM yyyy HH:mm")}</p>
                </div>
              ))}
            </div>
            <Separator />
            <div className="flex gap-2">
              <Textarea
                placeholder="Add a note..."
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                rows={2}
                className="flex-1"
              />
              <Button onClick={handleAddNote} disabled={!newNote.trim()} className="self-end">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Photos Section */}
      {activeSection === "photos" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Job Photos</CardTitle>
                <CardDescription>Document your work progress</CardDescription>
              </div>
              <div>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="h-4 w-4 mr-2" /> Add Photo
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {photos.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No photos uploaded yet.</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {photos.map((photo) => (
                  <div key={photo.id} className="relative group rounded-lg overflow-hidden border">
                    <img src={photo.photo_url} alt={photo.title || "Job photo"} className="aspect-square object-cover w-full" />
                    <Button
                      size="sm"
                      variant="destructive"
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity h-8 w-8 p-0"
                      onClick={() => deletePhoto(photo)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Team Section */}
      {activeSection === "team" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Assigned Team</CardTitle>
            <CardDescription>Team members working on this job</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {teamMembers.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No team members assigned.</p>}
            {teamMembers.map((tm) => (
              <div key={tm.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>{(tm.full_name || "?")[0]}</AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium text-sm">{tm.full_name || "Unknown"}</p>
                    <p className="text-xs text-muted-foreground">{tm.role_title || tm.role}</p>
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => removeMember(tm.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
            <Separator />
            <div className="flex gap-2">
              <Select value={selectedMember} onValueChange={setSelectedMember}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Select team member" />
                </SelectTrigger>
                <SelectContent>
                  {availableTeam
                    .filter(t => !teamMembers.some(tm => tm.team_member_id === t.id))
                    .map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.full_name} ({t.role})</SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Button onClick={handleAssignMember} disabled={!selectedMember}>
                <Plus className="h-4 w-4 mr-1" /> Assign
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Overview - shown by default */}
      {activeSection === "overview" && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveSection("notes")}>
            <CardContent className="p-6 text-center">
              <StickyNote className="h-8 w-8 mx-auto mb-2 text-primary" />
              <p className="font-semibold">{notes.length} Notes</p>
              <p className="text-xs text-muted-foreground">View & add notes</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveSection("photos")}>
            <CardContent className="p-6 text-center">
              <Camera className="h-8 w-8 mx-auto mb-2 text-primary" />
              <p className="font-semibold">{photos.length} Photos</p>
              <p className="text-xs text-muted-foreground">Document work</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => { setActiveSection("team"); loadAvailableTeam(); }}>
            <CardContent className="p-6 text-center">
              <Users className="h-8 w-8 mx-auto mb-2 text-primary" />
              <p className="font-semibold">{teamMembers.length} Team Members</p>
              <p className="text-xs text-muted-foreground">Manage team</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
