import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface Job {
  id: string;
  contractor_id: string;
  client_id: string;
  issued_quote_id: string | null;
  title: string;
  description: string | null;
  location: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  contract_value: number;
  portfolio_approved: boolean;
  created_at: string;
  updated_at: string;
}

export interface JobNote {
  id: string;
  job_id: string;
  author_id: string;
  content: string;
  created_at: string;
}

export interface JobPhoto {
  id: string;
  job_id: string;
  photo_url: string;
  title: string | null;
  description: string | null;
  uploaded_by: string;
  created_at: string;
}

export interface JobTeamMember {
  id: string;
  job_id: string;
  team_member_id: string;
  role: string;
  assigned_at: string;
}

export interface JobReview {
  id: string;
  job_id: string;
  client_id: string;
  contractor_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

export function useJobs(role: "contractor" | "client") {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const loadJobs = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const column = role === "contractor" ? "contractor_id" : "client_id";
    const { data, error } = await supabase
      .from("jobs")
      .select("*")
      .eq(column, user.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error loading jobs:", error);
    } else {
      setJobs((data || []) as Job[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadJobs();
  }, [role]);

  const updateJobStatus = async (jobId: string, status: string) => {
    const { error } = await supabase
      .from("jobs")
      .update({ status })
      .eq("id", jobId);
    if (error) {
      toast({ title: "Error", description: "Failed to update job status", variant: "destructive" });
    } else {
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status } : j));
      toast({ title: "Job Updated", description: `Status changed to ${status.replace("_", " ")}` });
    }
  };

  return { jobs, loading, loadJobs, updateJobStatus };
}

export function useJobNotes(jobId: string | null) {
  const [notes, setNotes] = useState<JobNote[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const loadNotes = async () => {
    if (!jobId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("job_notes")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: true });
    if (!error) setNotes((data || []) as JobNote[]);
    setLoading(false);
  };

  useEffect(() => {
    loadNotes();
  }, [jobId]);

  const addNote = async (content: string) => {
    if (!jobId) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase
      .from("job_notes")
      .insert({ job_id: jobId, author_id: user.id, content });
    if (error) {
      toast({ title: "Error", description: "Failed to add note", variant: "destructive" });
    } else {
      loadNotes();
    }
  };

  const deleteNote = async (noteId: string) => {
    const { error } = await supabase
      .from("job_notes")
      .delete()
      .eq("id", noteId);
    if (!error) setNotes(prev => prev.filter(n => n.id !== noteId));
  };

  return { notes, loading, addNote, deleteNote, loadNotes };
}

export function useJobPhotos(jobId: string | null) {
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const loadPhotos = async () => {
    if (!jobId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("job_photos")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: true });
    if (!error) setPhotos((data || []) as JobPhoto[]);
    setLoading(false);
  };

  useEffect(() => {
    loadPhotos();
  }, [jobId]);

  const uploadPhoto = async (file: File, title?: string) => {
    if (!jobId) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const fileId = crypto.randomUUID();
    const ext = file.name.split(".").pop();
    const filePath = `${user.id}/${jobId}/${fileId}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("job-photos")
      .upload(filePath, file);
    if (uploadError) {
      toast({ title: "Upload failed", variant: "destructive" });
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from("job-photos").getPublicUrl(filePath);

    const { error } = await supabase
      .from("job_photos")
      .insert({ job_id: jobId, photo_url: publicUrl, title: title || null, uploaded_by: user.id });
    if (error) {
      toast({ title: "Error", description: "Failed to save photo", variant: "destructive" });
    } else {
      loadPhotos();
    }
  };

  const deletePhoto = async (photo: JobPhoto) => {
    // Try to extract path and remove from storage
    const urlParts = photo.photo_url.split("/job-photos/");
    const storagePath = urlParts[urlParts.length - 1]?.split("?")[0];
    if (storagePath) {
      await supabase.storage.from("job-photos").remove([storagePath]);
    }
    const { error } = await supabase.from("job_photos").delete().eq("id", photo.id);
    if (!error) setPhotos(prev => prev.filter(p => p.id !== photo.id));
  };

  return { photos, loading, uploadPhoto, deletePhoto, loadPhotos };
}

export function useJobTeam(jobId: string | null) {
  const [teamMembers, setTeamMembers] = useState<(JobTeamMember & { full_name?: string; role_title?: string })[]>([]);
  const [loading, setLoading] = useState(false);

  const loadTeam = async () => {
    if (!jobId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("job_team_members")
      .select("*, team_members(full_name, role)")
      .eq("job_id", jobId);
    if (!error) {
      setTeamMembers((data || []).map((d: any) => ({
        ...d,
        full_name: d.team_members?.full_name,
        role_title: d.team_members?.role,
      })));
    }
    setLoading(false);
  };

  useEffect(() => {
    loadTeam();
  }, [jobId]);

  const assignMember = async (teamMemberId: string, role?: string) => {
    if (!jobId) return;
    const { error } = await supabase
      .from("job_team_members")
      .insert({ job_id: jobId, team_member_id: teamMemberId, role: role || "worker" });
    if (!error) loadTeam();
    return error;
  };

  const removeMember = async (id: string) => {
    const { error } = await supabase
      .from("job_team_members")
      .delete()
      .eq("id", id);
    if (!error) setTeamMembers(prev => prev.filter(t => t.id !== id));
  };

  return { teamMembers, loading, assignMember, removeMember, loadTeam };
}

export function useJobReview(jobId: string | null) {
  const [review, setReview] = useState<JobReview | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!jobId) return;
    setLoading(true);
    supabase
      .from("job_reviews")
      .select("*")
      .eq("job_id", jobId)
      .maybeSingle()
      .then(({ data }) => {
        setReview(data as JobReview | null);
        setLoading(false);
      });
  }, [jobId]);

  const submitReview = async (rating: number, comment: string) => {
    if (!jobId) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Get the job to get contractor_id
    const { data: job } = await supabase
      .from("jobs")
      .select("contractor_id")
      .eq("id", jobId)
      .single();
    if (!job) return;

    const { data, error } = await supabase
      .from("job_reviews")
      .insert({
        job_id: jobId,
        client_id: user.id,
        contractor_id: (job as any).contractor_id,
        rating,
        comment: comment || null,
      })
      .select()
      .single();
    if (error) {
      toast({ title: "Error", description: "Failed to submit review", variant: "destructive" });
    } else {
      setReview(data as JobReview);
      toast({ title: "Review Submitted", description: "Thank you for your feedback!" });
    }
  };

  return { review, loading, submitReview };
}
