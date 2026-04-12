import { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
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
  Send,
  MapPin,
  FileText,
  Star,
  ShieldCheck
} from "lucide-react";
import { useJobs, useJobNotes, useJobPhotos, useJobTeam, useJobReview, type Job } from "@/hooks/useJobs";
import { format } from "date-fns";

const statusConfig: Record<string, { label: string; icon: any; color: string }> = {
  not_started: { label: "Not Started", icon: Clock, color: "bg-muted text-muted-foreground" },
  in_progress: { label: "In Progress", icon: PlayCircle, color: "bg-blue-100 text-blue-800" },
  completed: { label: "Completed", icon: CheckCircle2, color: "bg-green-100 text-green-800" },
};

export function ClientJobsView() {
  const { jobs, loading } = useJobs("client");
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  if (loading) {
    return <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  if (selectedJob) {
    return <ClientJobDetail job={selectedJob} onBack={() => setSelectedJob(null)} />;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">My Jobs</h2>

      {jobs.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Briefcase className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Active Jobs</h3>
            <p className="text-muted-foreground">When you accept a quote from a contractor, a job will be created here.</p>
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
                        {job.quote_number && (
                        <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                         {job.quote_number}
                         </span>
)}
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
                        {format(new Date(job.created_at), "dd MMM yyyy")}
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

function ClientJobDetail({ job, onBack }: { job: Job; onBack: () => void }) {
  const { notes, addNote } = useJobNotes(job.id);
  const { photos } = useJobPhotos(job.id);
  const { teamMembers } = useJobTeam(job.id);
  const { review, submitReview } = useJobReview(job.id);
  const [newNote, setNewNote] = useState("");
  const [activeSection, setActiveSection] = useState<"overview" | "notes" | "photos" | "team" | "review">("overview");
  const [rating, setRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [portfolioApproved, setPortfolioApproved] = useState(job.portfolio_approved);
  const { toast } = useToast();

  const sc = statusConfig[job.status] || statusConfig.not_started;
  const StatusIcon = sc.icon;

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    await addNote(newNote.trim());
    setNewNote("");
  };

  const handleSubmitReview = async () => {
    await submitReview(rating, reviewComment);
  };

  const handlePortfolioApproval = async (approved: boolean) => {
    const { error } = await supabase
      .from("jobs")
      .update({ portfolio_approved: approved })
      .eq("id", job.id);
    if (!error) {
      setPortfolioApproved(approved);
      toast({
        title: approved ? "Portfolio Approved" : "Portfolio Approval Removed",
        description: approved ? "This job can now appear in the contractor's portfolio." : "This job will not appear in the contractor's portfolio.",
      });
    }
  };

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft className="h-4 w-4 mr-2" /> Back to My Jobs
      </Button>

      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-xl">{job.title}</CardTitle>
{job.quote_number && (
  <span className="text-xs font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded mt-1 inline-block">
    Quote {job.quote_number}
  </span>
)}
              {job.description && <CardDescription>{job.description}</CardDescription>}
            </div>
            <Badge className={sc.color}>
              <StatusIcon className="h-3 w-3 mr-1" />
              {sc.label}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            {job.location && <span className="flex items-center gap-1"><MapPin className="h-4 w-4" />{job.location}</span>}
            {job.contract_value > 0 && <span className="flex items-center gap-1"><FileText className="h-4 w-4" />£{Number(job.contract_value).toFixed(2)}</span>}
            {job.start_date && <span>Start: {format(new Date(job.start_date), "dd MMM yyyy")}</span>}
          </div>
        </CardContent>
      </Card>

      {/* Section Nav */}
      <div className="flex gap-2 flex-wrap">
        {(["overview", "notes", "photos", "team", ...(job.status === "completed" ? ["review"] : [])] as const).map((section) => (
          <Button key={section} variant={activeSection === section ? "default" : "outline"} size="sm" onClick={() => setActiveSection(section as any)}>
            {section === "overview" && <Briefcase className="h-4 w-4 mr-1" />}
            {section === "notes" && <StickyNote className="h-4 w-4 mr-1" />}
            {section === "photos" && <Camera className="h-4 w-4 mr-1" />}
            {section === "team" && <Users className="h-4 w-4 mr-1" />}
            {section === "review" && <Star className="h-4 w-4 mr-1" />}
            {String(section).charAt(0).toUpperCase() + String(section).slice(1)}
          </Button>
        ))}
      </div>

      {/* Notes */}
      {activeSection === "notes" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Notes</CardTitle>
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
              <Textarea placeholder="Add a note..." value={newNote} onChange={(e) => setNewNote(e.target.value)} rows={2} className="flex-1" />
              <Button onClick={handleAddNote} disabled={!newNote.trim()} className="self-end">
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Photos */}
      {activeSection === "photos" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Job Photos</CardTitle>
          </CardHeader>
          <CardContent>
            {photos.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No photos uploaded yet.</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {photos.map((photo) => (
                  <div key={photo.id} className="rounded-lg overflow-hidden border">
                    <img src={photo.photo_url} alt={photo.title || "Job photo"} className="aspect-square object-cover w-full" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Team */}
      {activeSection === "team" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Assigned Team</CardTitle>
          </CardHeader>
          <CardContent>
            {teamMembers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No team members assigned yet.</p>
            ) : (
              <div className="space-y-3">
                {teamMembers.map((tm) => (
                  <div key={tm.id} className="flex items-center gap-3 p-3 border rounded-lg">
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                      {(tm.full_name || "?")[0]}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{tm.full_name || "Unknown"}</p>
                      <p className="text-xs text-muted-foreground">{tm.role_title || tm.role}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Review */}
      {activeSection === "review" && job.status === "completed" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Review This Job</CardTitle>
            <CardDescription>Share your experience with this contractor</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {review ? (
              <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                <div className="flex items-center gap-1">
                  {Array.from({ length: review.rating }).map((_, i) => (
                    <Star key={i} className="h-5 w-5 fill-primary text-primary" />
                  ))}
                </div>
                {review.comment && <p className="text-sm">{review.comment}</p>}
                <p className="text-xs text-muted-foreground">Submitted {format(new Date(review.created_at), "dd MMM yyyy")}</p>
              </div>
            ) : (
              <>
                <div>
                  <p className="text-sm font-medium mb-2">Rating</p>
                  <div className="flex gap-1">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <button key={s} onClick={() => setRating(s)} className="focus:outline-none">
                        <Star className={`h-8 w-8 ${s <= rating ? "fill-primary text-primary" : "text-muted-foreground"}`} />
                      </button>
                    ))}
                  </div>
                </div>
                <Textarea placeholder="Tell us about your experience..." value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} rows={3} />
                <div className="flex items-center gap-3 p-3 rounded-lg border">
                  <ShieldCheck className="h-5 w-5 text-primary flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Allow this job in contractor's portfolio?</p>
                    <p className="text-xs text-muted-foreground">Photos and details may be shown on their public profile.</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant={portfolioApproved ? "default" : "outline"} onClick={() => handlePortfolioApproval(true)}>Yes</Button>
                    <Button size="sm" variant={!portfolioApproved ? "default" : "outline"} onClick={() => handlePortfolioApproval(false)}>No</Button>
                  </div>
                </div>
                <Button onClick={handleSubmitReview}>
                  <Star className="h-4 w-4 mr-2" /> Submit Review
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Overview */}
      {activeSection === "overview" && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveSection("notes")}>
            <CardContent className="p-6 text-center">
              <StickyNote className="h-8 w-8 mx-auto mb-2 text-primary" />
              <p className="font-semibold">{notes.length} Notes</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveSection("photos")}>
            <CardContent className="p-6 text-center">
              <Camera className="h-8 w-8 mx-auto mb-2 text-primary" />
              <p className="font-semibold">{photos.length} Photos</p>
            </CardContent>
          </Card>
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setActiveSection("team")}>
            <CardContent className="p-6 text-center">
              <Users className="h-8 w-8 mx-auto mb-2 text-primary" />
              <p className="font-semibold">{teamMembers.length} Team</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
