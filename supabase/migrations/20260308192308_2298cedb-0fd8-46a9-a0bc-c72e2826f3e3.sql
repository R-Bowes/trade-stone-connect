
-- Jobs table
CREATE TABLE public.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  issued_quote_id uuid REFERENCES public.issued_quotes(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  location text,
  status text NOT NULL DEFAULT 'not_started',
  start_date date,
  end_date date,
  contract_value numeric DEFAULT 0,
  portfolio_approved boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

-- Contractor full access
CREATE POLICY "Contractors can manage their own jobs"
ON public.jobs FOR ALL TO authenticated
USING (contractor_id = auth.uid())
WITH CHECK (contractor_id = auth.uid());

-- Client read access
CREATE POLICY "Clients can view their jobs"
ON public.jobs FOR SELECT TO authenticated
USING (client_id = auth.uid());

-- Client can update portfolio_approved
CREATE POLICY "Clients can update their job fields"
ON public.jobs FOR UPDATE TO authenticated
USING (client_id = auth.uid())
WITH CHECK (client_id = auth.uid());

-- Job notes table
CREATE TABLE public.job_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Job participants can view notes"
ON public.job_notes FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = job_notes.job_id
    AND (j.contractor_id = auth.uid() OR j.client_id = auth.uid())
  )
);

CREATE POLICY "Job participants can add notes"
ON public.job_notes FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = job_notes.job_id
    AND (j.contractor_id = auth.uid() OR j.client_id = auth.uid())
  )
);

CREATE POLICY "Authors can delete their own notes"
ON public.job_notes FOR DELETE TO authenticated
USING (author_id = auth.uid());

-- Job team assignments
CREATE TABLE public.job_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  team_member_id uuid NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  role text DEFAULT 'worker',
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, team_member_id)
);

ALTER TABLE public.job_team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contractors can manage job team"
ON public.job_team_members FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = job_team_members.job_id
    AND j.contractor_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = job_team_members.job_id
    AND j.contractor_id = auth.uid()
  )
);

CREATE POLICY "Clients can view job team"
ON public.job_team_members FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = job_team_members.job_id
    AND j.client_id = auth.uid()
  )
);

-- Job photos
CREATE TABLE public.job_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  title text,
  description text,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contractors can manage job photos"
ON public.job_photos FOR ALL TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = job_photos.job_id
    AND j.contractor_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = job_photos.job_id
    AND j.contractor_id = auth.uid()
  )
);

CREATE POLICY "Clients can view job photos"
ON public.job_photos FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = job_photos.job_id
    AND j.client_id = auth.uid()
  )
);

-- Job reviews
CREATE TABLE public.job_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE UNIQUE,
  client_id uuid NOT NULL,
  contractor_id uuid NOT NULL,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients can create reviews for their jobs"
ON public.job_reviews FOR INSERT TO authenticated
WITH CHECK (
  client_id = auth.uid() AND
  EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.id = job_reviews.job_id
    AND j.client_id = auth.uid()
    AND j.status = 'completed'
  )
);

CREATE POLICY "Anyone can view reviews"
ON public.job_reviews FOR SELECT TO public
USING (true);

-- Storage bucket for job photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('job-photos', 'job-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Contractors can upload job photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'job-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Contractors can delete job photos"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'job-photos' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Anyone can view job photos"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'job-photos');
