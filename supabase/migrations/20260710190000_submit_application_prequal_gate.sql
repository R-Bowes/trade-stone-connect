-- =============================================================================
-- 20260710190000_submit_application_prequal_gate.sql
-- Fixes submit_tender_application() (20260710180000): it computed a
-- prequal_snapshot but never enforced the RED-block ruling from the
-- Phase 1 review (mandatory + unmet tender_prequal_requirements must block
-- submission). This migration closes that gap.
--
-- Mapping (kind -> panel_prequalification columns): the six mappable kind
-- values are exactly prequalification_documents.document_type's CHECK list
-- minus 'other'. public_liability/employers_liability/trade_cert each have
-- a _verified + _expiry pair; induction/nda/terms are verified-only (no
-- expiry column on panel_prequalification for these three -- once true,
-- they don't lapse). Every boolean check uses `IS TRUE`, never a bare
-- column reference or `= true` comparison: `x IS TRUE` is FALSE (never
-- NULL) for both FALSE and NULL inputs, so NULL is explicitly unmet at
-- the expression level rather than relying on WHERE-clause NULL-filtering
-- to get the same result incidentally. This matters most for nda_signed,
-- the one nullable column here (no NOT NULL in its original definition),
-- but is applied uniformly to all six for one consistent, defensively
-- obvious idiom.
--
-- "No panel row = all mandatory mappable requirements unmet" falls out of
-- the query shape itself: the unmet set is built as mandatory-mappable
-- kinds for which no satisfying panel_prequalification row exists via
-- NOT EXISTS against a per-contractor/company CTE -- if that CTE is empty
-- (no panel row at all), every mandatory mappable kind fails NOT EXISTS
-- and lands in unmet, with no special-casing required.
--
-- Non-mappable kinds (anything outside the six) are never checked here,
-- mandatory or not -- informational only, per instruction, consistent with
-- the Phase 1 scoping note that there is no schema-defined mapping for
-- free-text kind values beyond these six.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.submit_tender_application(p_application_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_application  public.tender_applications%ROWTYPE;
  v_tender       public.tenders%ROWTYPE;
  v_unmet_kinds  text[];
BEGIN
  SELECT * INTO v_application
  FROM public.tender_applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  IF v_application.contractor_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not your application';
  END IF;

  IF v_application.status <> 'draft' THEN
    RAISE EXCEPTION 'Application is not in draft (status: %)', v_application.status;
  END IF;

  SELECT * INTO v_tender FROM public.tenders WHERE id = v_application.tender_id;

  IF v_tender.response_deadline IS NOT NULL AND now() > v_tender.response_deadline THEN
    RAISE EXCEPTION 'Tender response deadline has passed';
  END IF;

  -- RED-block: mandatory + unmet mappable prequal requirements stop
  -- submission outright.
  WITH panel AS (
    SELECT *
    FROM public.panel_prequalification
    WHERE company_id = v_tender.company_id
      AND contractor_id = v_application.contractor_id
  ),
  mandatory_mappable AS (
    SELECT DISTINCT kind
    FROM public.tender_prequal_requirements
    WHERE tender_id = v_application.tender_id
      AND mandatory = true
      AND kind IN ('public_liability', 'employers_liability', 'trade_cert', 'induction', 'nda', 'terms')
  ),
  unmet AS (
    SELECT mm.kind
    FROM mandatory_mappable mm
    WHERE NOT EXISTS (
      SELECT 1 FROM panel p
      WHERE CASE mm.kind
        WHEN 'public_liability'    THEN (p.public_liability_verified    IS TRUE) AND (p.public_liability_expiry    IS NULL OR p.public_liability_expiry    > now())
        WHEN 'employers_liability' THEN (p.employers_liability_verified IS TRUE) AND (p.employers_liability_expiry IS NULL OR p.employers_liability_expiry > now())
        WHEN 'trade_cert'          THEN (p.trade_cert_verified          IS TRUE) AND (p.trade_cert_expiry          IS NULL OR p.trade_cert_expiry          > now())
        WHEN 'induction'           THEN (p.site_induction_complete      IS TRUE)
        WHEN 'nda'                 THEN (p.nda_signed                   IS TRUE)
        WHEN 'terms'               THEN (p.terms_accepted               IS TRUE)
        ELSE false
      END
    )
  )
  SELECT array_agg(kind ORDER BY kind) INTO v_unmet_kinds FROM unmet;

  IF v_unmet_kinds IS NOT NULL AND array_length(v_unmet_kinds, 1) > 0 THEN
    RAISE EXCEPTION 'Prequalification requirements not met: %', array_to_string(v_unmet_kinds, ', ');
  END IF;

  UPDATE public.tender_applications
  SET
    status            = 'submitted',
    submitted_at      = now(),
    prequal_snapshot  = build_prequal_snapshot(v_tender.company_id, v_application.contractor_id)
  WHERE id = p_application_id;
END;
$$;
