-- work-order-photos bucket: private, mirrors enquiry-photos
-- (20260723120000_enquiry_photos_bucket_and_rls_fix.sql).
--
-- Not job-photos: a work order is not a job (job_id is null until the
-- contractor accepts, and may never be minted), and reusing that bucket would
-- make its policies reference two unrelated tables.
--
-- Path shape: {uploaderUserId}/{workOrderId}/{file}
--   segment 1 = uploader's own auth.uid() (owner rules, as enquiry-photos)
--   segment 2 = the work order id (scopes company/contractor read + write)
--
-- Access:
--   - Uploader: insert/update/delete/read anything under their own prefix.
--   - Company members: read photos on their company's work orders.
--   - Dispatched contractor: read photos on a work order while
--     work_orders.dispatched_to = auth.uid(). Photos attached at creation
--     belong to a draft with no contractor, so contractor read opens only at
--     dispatch, and a reassignment (dispatched_to changes) removes the
--     previous contractor's read access. That is intended.
--   - Dispatched contractor write: insert/update/delete under their own prefix
--     while the work order is theirs (dispatched_to = auth.uid() and status in
--     dispatched/accepted), for photo evidence against cost lines later. No
--     code calls this yet. Note it overlaps the owner-prefix rules for
--     own-prefix paths (policies are OR'd); it is kept as the explicit,
--     work-order-scoped statement so narrowing the owner rules later does not
--     silently remove contractor evidence uploads.
--
-- Direct auth.uid() comparisons throughout, per CLAUDE.md (profiles.id =
-- user_id = auth.uid()); company membership via the 1-arg
-- is_company_member(company_id).

INSERT INTO storage.buckets (id, name, public)
VALUES ('work-order-photos', 'work-order-photos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Work order photos owner upload" ON storage.objects;
DROP POLICY IF EXISTS "Work order photos owner update" ON storage.objects;
DROP POLICY IF EXISTS "Work order photos owner delete" ON storage.objects;
DROP POLICY IF EXISTS "Work order photos owner read" ON storage.objects;
DROP POLICY IF EXISTS "Work order photos company read" ON storage.objects;
DROP POLICY IF EXISTS "Work order photos contractor read" ON storage.objects;
DROP POLICY IF EXISTS "Work order photos contractor upload" ON storage.objects;
DROP POLICY IF EXISTS "Work order photos contractor update" ON storage.objects;
DROP POLICY IF EXISTS "Work order photos contractor delete" ON storage.objects;

CREATE POLICY "Work order photos owner upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'work-order-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Work order photos owner update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'work-order-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'work-order-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Work order photos owner delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'work-order-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Work order photos owner read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'work-order-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Work order photos company read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'work-order-photos'
  AND EXISTS (
    SELECT 1 FROM public.work_orders wo
    WHERE wo.id::text = (storage.foldername(name))[2]
      AND is_company_member(wo.company_id)
  )
);

CREATE POLICY "Work order photos contractor read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'work-order-photos'
  AND EXISTS (
    SELECT 1 FROM public.work_orders wo
    WHERE wo.id::text = (storage.foldername(name))[2]
      AND wo.dispatched_to = auth.uid()
  )
);

CREATE POLICY "Work order photos contractor upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'work-order-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND EXISTS (
    SELECT 1 FROM public.work_orders wo
    WHERE wo.id::text = (storage.foldername(name))[2]
      AND wo.dispatched_to = auth.uid()
      AND wo.status IN ('dispatched', 'accepted')
  )
);

CREATE POLICY "Work order photos contractor update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'work-order-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND EXISTS (
    SELECT 1 FROM public.work_orders wo
    WHERE wo.id::text = (storage.foldername(name))[2]
      AND wo.dispatched_to = auth.uid()
      AND wo.status IN ('dispatched', 'accepted')
  )
)
WITH CHECK (
  bucket_id = 'work-order-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND EXISTS (
    SELECT 1 FROM public.work_orders wo
    WHERE wo.id::text = (storage.foldername(name))[2]
      AND wo.dispatched_to = auth.uid()
      AND wo.status IN ('dispatched', 'accepted')
  )
);

CREATE POLICY "Work order photos contractor delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'work-order-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND EXISTS (
    SELECT 1 FROM public.work_orders wo
    WHERE wo.id::text = (storage.foldername(name))[2]
      AND wo.dispatched_to = auth.uid()
      AND wo.status IN ('dispatched', 'accepted')
  )
);
