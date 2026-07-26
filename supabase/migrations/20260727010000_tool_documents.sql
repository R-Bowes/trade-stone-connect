-- Migration: tool_documents
-- Storage bucket + table for contractor tool document attachments

-- ============================================================
-- 1. Storage bucket
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('tool-documents', 'tool-documents', false);

-- Storage RLS: contractor can only access their own tool documents
CREATE POLICY "tool_documents_storage_select"
  ON storage.objects FOR SELECT USING (
    bucket_id = 'tool-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "tool_documents_storage_insert"
  ON storage.objects FOR INSERT WITH CHECK (
    bucket_id = 'tool-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "tool_documents_storage_delete"
  ON storage.objects FOR DELETE USING (
    bucket_id = 'tool-documents'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM profiles WHERE user_id = auth.uid()
    )
  );

-- ============================================================
-- 2. tool_documents table
-- ============================================================
CREATE TABLE tool_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tool_id uuid NOT NULL REFERENCES contractor_tools(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  document_type text NOT NULL DEFAULT 'Other'
    CHECK (document_type IN (
      'Receipt',
      'PAT Certificate',
      'Calibration Certificate',
      'Warranty',
      'Inspection Report',
      'Other'
    )),
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tool_documents ENABLE ROW LEVEL SECURITY;

-- RLS via tool ownership chain
CREATE POLICY "tool_documents_select" ON tool_documents
  FOR SELECT USING (
    tool_id IN (
      SELECT id FROM contractor_tools
      WHERE contractor_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "tool_documents_insert" ON tool_documents
  FOR INSERT WITH CHECK (
    tool_id IN (
      SELECT id FROM contractor_tools
      WHERE contractor_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    )
  );

CREATE POLICY "tool_documents_delete" ON tool_documents
  FOR DELETE USING (
    tool_id IN (
      SELECT id FROM contractor_tools
      WHERE contractor_id IN (SELECT id FROM profiles WHERE user_id = auth.uid())
    )
  );