-- 20260705140000_release_schedule_block_by_event.sql
-- (rationale comment as above)

DROP FUNCTION public.release_schedule_block(uuid);

CREATE OR REPLACE FUNCTION public.release_schedule_block(p_event_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $function$
DECLARE
  v_contractor uuid;
  v_recipient uuid;
  v_date date;
  v_quote uuid;
BEGIN
  SELECT se.contractor_id, se.start_time::date, se.quote_id
    INTO v_contractor, v_date, v_quote
  FROM public.schedule_events se
  WHERE se.id = p_event_id AND se.event_type = 'quote_proposal';

  IF v_contractor IS NULL THEN
    RAISE EXCEPTION 'Schedule event not found';
  END IF;

  SELECT q.recipient_id INTO v_recipient
  FROM public.issued_quotes q WHERE q.id = v_quote;

  IF auth.uid() NOT IN (
    SELECT user_id FROM public.profiles WHERE id IN (v_contractor, v_recipient)
  ) THEN
    RAISE EXCEPTION 'Not a party to this quote';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.jobs j
    WHERE j.issued_quote_id = v_quote AND j.status <> 'cancelled'
  ) THEN
    DELETE FROM public.contractor_availability_overrides
    WHERE contractor_id = v_contractor
      AND date = v_date
      AND reason = 'Auto-blocked: confirmed job';
  END IF;
END;
$function$;