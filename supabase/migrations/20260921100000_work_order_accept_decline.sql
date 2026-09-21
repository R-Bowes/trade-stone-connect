-- Work order accept / decline.
--
-- The client used to accept in three steps: raise_callout (mints a job), then a
-- direct UPDATE of work_orders, then a notification. work_orders_update's WITH
-- CHECK is identical to its USING clause
--   is_company_member(company_id) OR (dispatched_to = auth.uid() AND status = 'dispatched')
-- and WITH CHECK tests the NEW row, so a contractor can never write 'accepted'
-- or 'declined'. Every accept minted a job, then failed to record the
-- acceptance, and the still-'dispatched' work order could be accepted again.
--
-- Contractor status changes now go through the two functions below only.
-- work_orders_update is deliberately left as it is — not widened.

-- =============================================================================
-- 1. jobs.work_order_id — nullable, UNIQUE. NULLs are distinct in a unique
--    constraint, so jobs with no work order are unaffected, and a second job for
--    the same work order becomes impossible.
-- =============================================================================

ALTER TABLE public.jobs
  ADD COLUMN work_order_id uuid REFERENCES public.work_orders(id);

ALTER TABLE public.jobs
  ADD CONSTRAINT jobs_work_order_id_key UNIQUE (work_order_id);

-- =============================================================================
-- 2. accept_work_order
--
--    create_callout_job is called UNCHANGED (redefining it would reset its
--    EXECUTE grants, and the PPM cron runner depends on it); work_order_id is
--    set on the returned job in the same transaction. A second call raises at
--    the precondition checks, and the unique constraint above is the backstop.
--
--    create_callout_job also writes its usual "New call-out" notification to the
--    contractor, so the accepting contractor is notified of their own accept.
--    Kept as-is; noted in LATER.md as noise to suppress on this path.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.accept_work_order(p_work_order_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wo     public.work_orders%ROWTYPE;
  v_job_id uuid;
  v_name   text;
BEGIN
  SELECT * INTO v_wo FROM public.work_orders WHERE id = p_work_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Work order not found';
  END IF;

  IF v_wo.dispatched_to IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'This work order is not dispatched to you';
  END IF;

  IF v_wo.status <> 'dispatched' THEN
    RAISE EXCEPTION 'This work order is no longer awaiting a response (status: %)', v_wo.status;
  END IF;

  IF v_wo.response IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'This work order has already been responded to';
  END IF;

  IF v_wo.job_id IS NOT NULL THEN
    RAISE EXCEPTION 'A job has already been created for this work order';
  END IF;

  IF v_wo.engagement_id IS NULL THEN
    RAISE EXCEPTION 'This work order has no engagement, so a job cannot be created from it';
  END IF;

  v_job_id := public.create_callout_job(v_wo.engagement_id, v_wo.title, v_wo.description, v_wo.site_id);

  UPDATE public.jobs SET work_order_id = p_work_order_id WHERE id = v_job_id;

  UPDATE public.work_orders
  SET response = 'accepted',
      status = 'accepted',
      responded_at = now(),
      job_id = v_job_id
  WHERE id = p_work_order_id;

  -- Warning-only: a failed notification must not undo the acceptance.
  BEGIN
    SELECT COALESCE(full_name, 'The contractor') INTO v_name FROM public.profiles WHERE id = auth.uid();
    INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id)
    VALUES (
      v_wo.raised_by,
      'Work order accepted',
      'Work order accepted by ' || COALESCE(v_name, 'The contractor'),
      'work_order_accepted',
      'work_order',
      p_work_order_id
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'accept_work_order: business notification for work order % failed: %', p_work_order_id, SQLERRM;
  END;

  RETURN v_job_id;
END;
$$;

-- =============================================================================
-- 3. decline_work_order — same locking and preconditions, no job.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.decline_work_order(p_work_order_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wo   public.work_orders%ROWTYPE;
  v_name text;
BEGIN
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'A reason is required to decline a work order';
  END IF;

  SELECT * INTO v_wo FROM public.work_orders WHERE id = p_work_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Work order not found';
  END IF;

  IF v_wo.dispatched_to IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'This work order is not dispatched to you';
  END IF;

  IF v_wo.status <> 'dispatched' THEN
    RAISE EXCEPTION 'This work order is no longer awaiting a response (status: %)', v_wo.status;
  END IF;

  IF v_wo.response IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'This work order has already been responded to';
  END IF;

  IF v_wo.job_id IS NOT NULL THEN
    RAISE EXCEPTION 'A job has already been created for this work order';
  END IF;

  UPDATE public.work_orders
  SET response = 'declined',
      status = 'declined',
      responded_at = now(),
      decline_reason = btrim(p_reason)
  WHERE id = p_work_order_id;

  BEGIN
    SELECT COALESCE(full_name, 'The contractor') INTO v_name FROM public.profiles WHERE id = auth.uid();
    INSERT INTO public.notifications (user_id, title, message, type, reference_type, reference_id)
    VALUES (
      v_wo.raised_by,
      'Work order declined',
      COALESCE(v_name, 'The contractor') || ' declined — reason: ' || btrim(p_reason),
      'work_order_declined',
      'work_order',
      p_work_order_id
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'decline_work_order: business notification for work order % failed: %', p_work_order_id, SQLERRM;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_work_order(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decline_work_order(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_work_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_work_order(uuid, text) TO authenticated;

-- =============================================================================
-- 4. Retire the four jobs orphaned by this bug (J-0016 to J-0019, minted by
--    repeated failed accepts while testing before this fix). Explicit ids only —
--    never by title or engagement, which could catch a legitimate job. Status
--    only, never DELETE.
--    Scoped so it is a no-op on any database where they don't exist, are no
--    longer 'scheduled', or already have a work order attached.
--    Cancelling fires on_job_status_change, which notifies the customer and the
--    contractor of "Job ... is now Cancelled" once per job (four jobs, so eight notifications) — accepted noise.
-- =============================================================================

UPDATE public.jobs
SET status = 'cancelled'
WHERE id IN (
    'f1337039-c9cd-471b-9da8-53dea00dc264',  -- J-0016
    '36c00657-1a32-4c17-a9c5-5fd9bcd88779',  -- J-0017
    'd75bc2e4-0daa-4076-b142-a84f0679bd15',  -- J-0018
    '3c4f7464-bdd5-4565-9b45-4f72570cb904'   -- J-0019
  )
  AND status = 'scheduled'
  AND work_order_id IS NULL;
