import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface Job {
  id: string;
  contractor_id: string;
  customer_id: string;
  issued_quote_id: string | null;
  engagement_id: string | null;
  quote_number: number | null;
  title: string;
  description: string | null;
  location: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  actual_end: string | null;
  contract_value: number;
  portfolio_approved: boolean;
  signed_off_by: string | null;
  signed_off_at: string | null;
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
  photo_url: string | null;
  storage_path: string | null;
  caption: string | null;
  tags: string[];
  visibility: "internal" | "customer";
  file_type: "image" | "pdf";
  portfolio: boolean;
  uploaded_by: string;
  uploaded_by_role: "contractor" | "customer";
  created_at: string;
}

// Shape of a job_assignments row (see useJobTeam) — team_member_id is
// nullable there since a row can represent the contractor themself.
export interface JobTeamMember {
  id: string;
  job_id: string;
  team_member_id: string | null;
  is_contractor: boolean;
  created_at: string;
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
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profileRow } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      const column = role === "contractor" ? "contractor_id" : "customer_id";
      const { data, error } = await supabase
        .from("jobs")
        .select("*, issued_quotes!jobs_issued_quote_id_fkey(quote_number)")
        .eq(column, profileRow?.id)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error loading jobs:", error);
        toast({ title: "Error", description: "Failed to load jobs", variant: "destructive" });
      } else {
        const mapped = (data || []).map((j: any) => ({
          ...j,
          quote_number: j.issued_quotes?.quote_number ?? null,
        }));
        setJobs(mapped as Job[]);
      }
    } finally {
      setLoading(false);
    }
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
    // RLS ("Clients can view job photos") already restricts this to
    // visibility='customer' rows for the client's own job — nothing to
    // filter client-side.
    const { data, error } = await supabase
      .from("job_photos")
      .select("*")
      .eq("job_id", jobId)
      .order("created_at", { ascending: true });
    if (!error) {
      setPhotos(
        (data || []).map((row: any) => ({
          ...row,
          tags: Array.isArray(row.tags) ? row.tags : [],
        })) as JobPhoto[],
      );
    }
    setLoading(false);
  };

  useEffect(() => {
    loadPhotos();
  }, [jobId]);

  // No upload UI exists on the client side today (ClientJobDetail's
  // Photos tab is read-only) — kept for API completeness, fixed to match
  // JobPhotosTab.tsx's real column shape rather than the old photo_url-
  // only insert that could never have worked against this table.
  const uploadPhoto = async (file: File, caption?: string) => {
    if (!jobId) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const ext = file.name.split(".").pop() ?? "bin";
    const filePath = `${user.id}/${jobId}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("job-photos")
      .upload(filePath, file);
    if (uploadError) {
      toast({ title: "Upload failed", variant: "destructive" });
      return;
    }

    const { error } = await supabase.from("job_photos").insert({
      job_id: jobId,
      storage_path: filePath,
      caption: caption || null,
      uploaded_by: user.id,
      uploaded_by_role: "customer",
      visibility: "customer",
      file_type: file.type === "application/pdf" ? "pdf" : "image",
    });
    if (error) {
      await supabase.storage.from("job-photos").remove([filePath]);
      toast({ title: "Error", description: "Failed to save photo", variant: "destructive" });
    } else {
      loadPhotos();
    }
  };

  const deletePhoto = async (photo: JobPhoto) => {
    if (photo.storage_path) {
      await supabase.storage.from("job-photos").remove([photo.storage_path]);
    }
    const { error } = await supabase.from("job_photos").delete().eq("id", photo.id);
    if (!error) setPhotos(prev => prev.filter(p => p.id !== photo.id));
  };

  return { photos, loading, uploadPhoto, deletePhoto, loadPhotos };
}

// job_team_members is deprecated-pending-drop (never had a writer anywhere
// in the app — see 20260719100000_job_photos_shape_and_visibility_rls.sql).
// The contractor's actual worker-assignment UI (JobManagement.tsx's
// Workers section, toggleAssignment) writes job_assignments; this hook now
// reads that table instead so the client's Team tab shows real data
// rather than a table nothing ever populated. Read-only repoint — no
// dual-write, and no assignment UI exists on the client side.
export function useJobTeam(jobId: string | null) {
  const [teamMembers, setTeamMembers] = useState<(JobTeamMember & { full_name?: string; role_title?: string })[]>([]);
  const [loading, setLoading] = useState(false);

  const loadTeam = async () => {
    if (!jobId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("job_assignments")
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

  return { teamMembers, loading, loadTeam };
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

    const { data: profileRow } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();

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
        client_id: profileRow?.id,
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
