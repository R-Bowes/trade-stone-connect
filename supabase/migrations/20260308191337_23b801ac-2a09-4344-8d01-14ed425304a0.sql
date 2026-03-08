
-- Create contractor_documents table
CREATE TABLE public.contractor_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contractor_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  document_url text NOT NULL,
  file_name text NOT NULL,
  file_size integer,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contractor_documents ENABLE ROW LEVEL SECURITY;

-- Anyone can view contractor documents (public)
CREATE POLICY "Anyone can view contractor documents"
ON public.contractor_documents FOR SELECT
TO public
USING (true);

-- Contractors can manage their own documents
CREATE POLICY "Contractors can manage their own documents"
ON public.contractor_documents FOR ALL
TO authenticated
USING (contractor_id = auth.uid())
WITH CHECK (contractor_id = auth.uid());

-- Create storage bucket for documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload their own documents
CREATE POLICY "Users can upload their own documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to update their own documents
CREATE POLICY "Users can update their own documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow authenticated users to delete their own documents
CREATE POLICY "Users can delete their own documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow public read access to documents
CREATE POLICY "Anyone can view uploaded documents"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'documents');
