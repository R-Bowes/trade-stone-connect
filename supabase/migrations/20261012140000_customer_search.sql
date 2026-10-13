-- Customer search on the invoice and quote forms.
--
-- ROLLBACK (run in this order if this migration must be undone):
--   drop function public.search_customers(text);
--   create or replace function public._issue_invoice(p_invoice_id uuid)
--   -- (paste the live body below, pasted verbatim from 2026-10-12, as the
--   -- rollback body)
--
-- Live body of public._issue_invoice(uuid), as deployed on 2026-10-12, before
-- this migration's one added check (pasted verbatim so a rollback can
-- restore it exactly):
--
--   CREATE OR REPLACE FUNCTION public._issue_invoice(p_invoice_id uuid)
--    RETURNS integer
--    LANGUAGE plpgsql
--    SECURITY DEFINER
--    SET search_path TO 'public'
--   AS $function$
--   DECLARE
--     v_inv            public.invoices%ROWTYPE;
--     v_contractor     public.profiles%ROWTYPE;
--     v_problem        text;
--     v_number         integer;
--     v_customer_code  text;
--     v_supplier_addr  jsonb;
--     v_customer_addr  jsonb;
--   BEGIN
--     SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
--     IF NOT FOUND THEN
--       RAISE EXCEPTION 'Invoice not found.' USING ERRCODE = 'no_data_found';
--     END IF;
--
--     IF v_inv.status <> 'draft' THEN
--       RAISE EXCEPTION 'Only a draft invoice can be issued.' USING ERRCODE = 'check_violation';
--     END IF;
--
--     -- Items, subtotal, tax -- the one shared rule set.
--     v_problem := public._invoice_figures_problem(
--       v_inv.contractor_id, v_inv.items, v_inv.subtotal,
--       v_inv.tax_rate, v_inv.tax_amount, v_inv.total
--     );
--     IF v_problem IS NOT NULL THEN
--       RAISE EXCEPTION '%', v_problem USING ERRCODE = 'check_violation';
--     END IF;
--
--     -- Due date.
--     IF v_inv.due_date < current_date THEN
--       RAISE EXCEPTION 'The due date cannot be before today.' USING ERRCODE = 'check_violation';
--     END IF;
--
--     -- Snapshot the supplier (the contractor), as things stand today. No phone,
--     -- no email -- CLAUDE.md: no phone numbers or email addresses on the
--     -- invoice or its PDF, for either party.
--     SELECT * INTO v_contractor FROM public.profiles WHERE id = v_inv.contractor_id;
--
--     v_supplier_addr := jsonb_build_object(
--       'line1', v_contractor.addr_line1,
--       'line2', v_contractor.addr_line2,
--       'city', v_contractor.addr_city,
--       'region', v_contractor.addr_region,
--       'postcode', coalesce(v_contractor.addr_postcode, v_contractor.postcode),
--       'country', v_contractor.addr_country,
--       'legacy_address', nullif(v_contractor.address, '')
--     );
--
--     SELECT ts_profile_code INTO v_customer_code
--     FROM public.profiles WHERE id = v_inv.recipient_id;
--
--     v_customer_addr := CASE
--       WHEN v_inv.addr_line1 IS NOT NULL OR v_inv.addr_postcode IS NOT NULL THEN
--         jsonb_build_object(
--           'line1', v_inv.addr_line1, 'line2', v_inv.addr_line2, 'city', v_inv.addr_city,
--           'region', v_inv.addr_region, 'postcode', v_inv.addr_postcode, 'country', v_inv.addr_country
--         )
--       ELSE jsonb_build_object('legacy_address', v_inv.client_address)
--     END;
--
--     v_number := next_document_number(v_inv.contractor_id, 'invoice');
--
--     UPDATE public.invoices
--     SET invoice_number    = v_number,
--         status             = 'sent',
--         issued_date        = current_date,
--         issued_at          = now(),
--         sent_at            = now(),
--         supplier_snapshot  = jsonb_build_object(
--           'legal_name', v_contractor.full_name,
--           'trading_name', v_contractor.company_name,
--           'address', v_supplier_addr,
--           'country_code', v_contractor.country_code,
--           'ts_profile_code', v_contractor.ts_profile_code,
--           'vat_status', coalesce((SELECT fs.vat_status FROM public.finance_settings fs WHERE fs.contractor_id = v_inv.contractor_id), 'not_registered'),
--           'vat_number', (SELECT fs.vat_number FROM public.finance_settings fs WHERE fs.contractor_id = v_inv.contractor_id)
--         ),
--         customer_snapshot  = jsonb_build_object(
--           'client_name', v_inv.client_name,
--           'address', v_customer_addr,
--           'ts_profile_code', v_customer_code
--         )
--     WHERE id = p_invoice_id;
--
--     IF NOT FOUND THEN
--       RAISE EXCEPTION 'Invoice % was not updated.', p_invoice_id USING ERRCODE = 'no_data_found';
--     END IF;
--
--     RETURN v_number;
--   END;
--   $function$
--
-- What this migration does:
--
-- 1. search_customers(text): lets a contractor (or a team member acting for
--    one, via acting_contractor_ids()) search for a customer by exact TS
--    code or by name, to replace linking an invoice/quote recipient by email
--    guesswork (the INV-0013 silent-unlink bug, NOW.md). An exact TS code
--    always resolves to that one account (name + code only); a name search
--    is restricted to accounts the caller already has a relationship with
--    (an enquiry, quote, job or invoice as the contractor, with that account
--    as the customer, or -- for a business account -- its owned company as
--    the customer/company party). Never returns phone or email. Address
--    columns come back only for a row with an existing relationship -- an
--    unrelated account found by its exact TS code gets a name and code only,
--    never an address.
--
--    display_name for a business account is coalesce(companies.name,
--    profiles.company_name, profiles.full_name) in both branches -- a
--    business account's own full_name is rarely the name a contractor is
--    looking for. The name search matches against the company name too
--    (companies.name or profiles.company_name), not only full_name. The
--    query is escaped for ILIKE's own % and _ wildcards before either
--    branch runs a name match, so a literal % or _ in the search text is
--    never treated as a pattern.
--
--    Address is read off the account's own `profiles` row (structured addr_*
--    with a legacy_address fallback), not off `companies` -- a business
--    account's company-level address columns (companies.addr_*/
--    address_line1-2/address/postcode, three overlapping generations) are
--    a separate mess, left untouched here; every address field seen live on
--    2026-10-12 is empty regardless (profiles and companies alike), so this
--    doesn't lose anything today. Revisit when companies' addresses are
--    actually populated.
--
-- 2. _issue_invoice: CREATE OR REPLACE, one added check before the figures
--    rules: a draft with no recipient_id whose client_email matches exactly
--    one profile's email (compared case- and whitespace-insensitively) is
--    refused -- that customer is on TradeStone and should have been picked
--    from the search, not left to resolve by email. Everything else in the
--    function is unchanged (pasted verbatim above).

-- ── 1. search_customers ──────────────────────────────────────────────────────
CREATE FUNCTION public.search_customers(p_query text)
RETURNS TABLE (
  profile_id uuid,
  company_id uuid,
  display_name text,
  ts_code text,
  account_type text,
  has_relationship boolean,
  addr_line1 text,
  addr_line2 text,
  addr_city text,
  addr_region text,
  addr_postcode text,
  addr_country text,
  legacy_address text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_query    text := btrim(p_query);
  v_escaped  text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id IN (SELECT acting_contractor_ids())
      AND p.user_type = 'contractor'
      AND coalesce(p.is_active, true)
  ) THEN
    RAISE EXCEPTION 'Only a contractor can search for customers.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_query IS NULL OR length(v_query) < 2 THEN
    RETURN;
  END IF;

  -- Escape ILIKE's own wildcards so a query containing % or _ is matched
  -- literally, not as a pattern -- a query of "%" must not become "match
  -- everything".
  v_escaped := replace(replace(replace(v_query, '\', '\\'), '%', '\%'), '_', '\_');

  -- Exact TS code match: that one account, whoever it is. Address gated on
  -- has_relationship below -- an unrelated account found this way gets a
  -- name and code only.
  IF EXISTS (SELECT 1 FROM public.profiles p WHERE upper(p.ts_profile_code) = upper(v_query)) THEN
    RETURN QUERY
    SELECT
      p.id,
      c.id,
      coalesce(c.name, p.company_name, p.full_name),
      p.ts_profile_code,
      p.user_type::text,
      rel.has_rel,
      CASE WHEN rel.has_rel THEN p.addr_line1 ELSE NULL END,
      CASE WHEN rel.has_rel THEN p.addr_line2 ELSE NULL END,
      CASE WHEN rel.has_rel THEN p.addr_city ELSE NULL END,
      CASE WHEN rel.has_rel THEN p.addr_region ELSE NULL END,
      CASE WHEN rel.has_rel THEN coalesce(p.addr_postcode, p.postcode) ELSE NULL END,
      CASE WHEN rel.has_rel THEN p.addr_country ELSE NULL END,
      CASE WHEN rel.has_rel THEN nullif(p.address, '') ELSE NULL END
    FROM public.profiles p
    LEFT JOIN public.companies c ON c.owner_id = p.id
    CROSS JOIN LATERAL (
      SELECT EXISTS (
        SELECT 1 FROM public.enquiries e WHERE e.customer_id = p.id AND e.contractor_id IN (SELECT acting_contractor_ids())
        UNION ALL
        SELECT 1 FROM public.issued_quotes q WHERE q.recipient_id = p.id AND q.contractor_id IN (SELECT acting_contractor_ids())
        UNION ALL
        SELECT 1 FROM public.jobs j WHERE j.customer_id = p.id AND j.contractor_id IN (SELECT acting_contractor_ids())
        UNION ALL
        SELECT 1 FROM public.invoices i WHERE i.recipient_id = p.id AND i.contractor_id IN (SELECT acting_contractor_ids())
        UNION ALL
        SELECT 1 FROM public.companies cc
          WHERE cc.owner_id = p.id
            AND (
              EXISTS (SELECT 1 FROM public.jobs j2 WHERE j2.company_id = cc.id AND j2.contractor_id IN (SELECT acting_contractor_ids()))
              OR EXISTS (SELECT 1 FROM public.invoices i2 WHERE i2.company_id = cc.id AND i2.contractor_id IN (SELECT acting_contractor_ids()))
              OR EXISTS (SELECT 1 FROM public.enquiries e2 WHERE e2.company_id = cc.id AND e2.contractor_id IN (SELECT acting_contractor_ids()))
            )
      ) AS has_rel
    ) rel
    WHERE upper(p.ts_profile_code) = upper(v_query)
      AND p.id <> auth.uid()
      AND p.user_type IN ('personal', 'business')
      AND coalesce(p.is_active, true)
      AND NOT EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.profile_id = p.id);
    RETURN;
  END IF;

  -- Name match: only accounts the caller already has a relationship with.
  RETURN QUERY
  SELECT
    p.id,
    c.id,
    coalesce(c.name, p.company_name, p.full_name),
    p.ts_profile_code,
    p.user_type::text,
    true,
    p.addr_line1,
    p.addr_line2,
    p.addr_city,
    p.addr_region,
    coalesce(p.addr_postcode, p.postcode),
    p.addr_country,
    nullif(p.address, '')
  FROM public.profiles p
  LEFT JOIN public.companies c ON c.owner_id = p.id
  WHERE (
      p.full_name ILIKE '%' || v_escaped || '%'
      OR c.name ILIKE '%' || v_escaped || '%'
      OR p.company_name ILIKE '%' || v_escaped || '%'
    )
    AND p.id <> auth.uid()
    AND p.user_type IN ('personal', 'business')
    AND coalesce(p.is_active, true)
    AND NOT EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.profile_id = p.id)
    AND (
      EXISTS (SELECT 1 FROM public.enquiries e WHERE e.customer_id = p.id AND e.contractor_id IN (SELECT acting_contractor_ids()))
      OR EXISTS (SELECT 1 FROM public.issued_quotes q WHERE q.recipient_id = p.id AND q.contractor_id IN (SELECT acting_contractor_ids()))
      OR EXISTS (SELECT 1 FROM public.jobs j WHERE j.customer_id = p.id AND j.contractor_id IN (SELECT acting_contractor_ids()))
      OR EXISTS (SELECT 1 FROM public.invoices i WHERE i.recipient_id = p.id AND i.contractor_id IN (SELECT acting_contractor_ids()))
      OR EXISTS (
        SELECT 1 FROM public.companies cc
          WHERE cc.owner_id = p.id
            AND (
              EXISTS (SELECT 1 FROM public.jobs j2 WHERE j2.company_id = cc.id AND j2.contractor_id IN (SELECT acting_contractor_ids()))
              OR EXISTS (SELECT 1 FROM public.invoices i2 WHERE i2.company_id = cc.id AND i2.contractor_id IN (SELECT acting_contractor_ids()))
              OR EXISTS (SELECT 1 FROM public.enquiries e2 WHERE e2.company_id = cc.id AND e2.contractor_id IN (SELECT acting_contractor_ids()))
            )
      )
    )
  LIMIT 10;
END;
$$;

REVOKE ALL ON FUNCTION public.search_customers(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_customers(text) TO authenticated;

-- ── 2. _issue_invoice: refuse a silently-unlinked customer ──────────────────
CREATE OR REPLACE FUNCTION public._issue_invoice(p_invoice_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_inv            public.invoices%ROWTYPE;
  v_contractor     public.profiles%ROWTYPE;
  v_problem        text;
  v_number         integer;
  v_customer_code  text;
  v_supplier_addr  jsonb;
  v_customer_addr  jsonb;
BEGIN
  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found.' USING ERRCODE = 'no_data_found';
  END IF;

  IF v_inv.status <> 'draft' THEN
    RAISE EXCEPTION 'Only a draft invoice can be issued.' USING ERRCODE = 'check_violation';
  END IF;

  -- A draft with no recipient whose email matches a real TradeStone account
  -- was left unlinked by guesswork, not by the customer search -- refuse
  -- rather than issue a snapshot with no recipient_id for a real account
  -- (the INV-0013 bug).
  IF v_inv.recipient_id IS NULL
     AND (SELECT count(*) FROM public.profiles WHERE lower(btrim(email)) = lower(btrim(v_inv.client_email))) = 1 THEN
    RAISE EXCEPTION 'This customer is on TradeStone; pick them from the customer search.' USING ERRCODE = 'check_violation';
  END IF;

  -- Items, subtotal, tax -- the one shared rule set.
  v_problem := public._invoice_figures_problem(
    v_inv.contractor_id, v_inv.items, v_inv.subtotal,
    v_inv.tax_rate, v_inv.tax_amount, v_inv.total
  );
  IF v_problem IS NOT NULL THEN
    RAISE EXCEPTION '%', v_problem USING ERRCODE = 'check_violation';
  END IF;

  -- Due date.
  IF v_inv.due_date < current_date THEN
    RAISE EXCEPTION 'The due date cannot be before today.' USING ERRCODE = 'check_violation';
  END IF;

  -- Snapshot the supplier (the contractor), as things stand today. No phone,
  -- no email -- CLAUDE.md: no phone numbers or email addresses on the
  -- invoice or its PDF, for either party.
  SELECT * INTO v_contractor FROM public.profiles WHERE id = v_inv.contractor_id;

  v_supplier_addr := jsonb_build_object(
    'line1', v_contractor.addr_line1,
    'line2', v_contractor.addr_line2,
    'city', v_contractor.addr_city,
    'region', v_contractor.addr_region,
    'postcode', coalesce(v_contractor.addr_postcode, v_contractor.postcode),
    'country', v_contractor.addr_country,
    'legacy_address', nullif(v_contractor.address, '')
  );

  SELECT ts_profile_code INTO v_customer_code
  FROM public.profiles WHERE id = v_inv.recipient_id;

  v_customer_addr := CASE
    WHEN v_inv.addr_line1 IS NOT NULL OR v_inv.addr_postcode IS NOT NULL THEN
      jsonb_build_object(
        'line1', v_inv.addr_line1, 'line2', v_inv.addr_line2, 'city', v_inv.addr_city,
        'region', v_inv.addr_region, 'postcode', v_inv.addr_postcode, 'country', v_inv.addr_country
      )
    ELSE jsonb_build_object('legacy_address', v_inv.client_address)
  END;

  v_number := next_document_number(v_inv.contractor_id, 'invoice');

  UPDATE public.invoices
  SET invoice_number    = v_number,
      status             = 'sent',
      issued_date        = current_date,
      issued_at          = now(),
      sent_at            = now(),
      supplier_snapshot  = jsonb_build_object(
        'legal_name', v_contractor.full_name,
        'trading_name', v_contractor.company_name,
        'address', v_supplier_addr,
        'country_code', v_contractor.country_code,
        'ts_profile_code', v_contractor.ts_profile_code,
        'vat_status', coalesce((SELECT fs.vat_status FROM public.finance_settings fs WHERE fs.contractor_id = v_inv.contractor_id), 'not_registered'),
        'vat_number', (SELECT fs.vat_number FROM public.finance_settings fs WHERE fs.contractor_id = v_inv.contractor_id)
      ),
      customer_snapshot  = jsonb_build_object(
        'client_name', v_inv.client_name,
        'address', v_customer_addr,
        'ts_profile_code', v_customer_code
      )
  WHERE id = p_invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % was not updated.', p_invoice_id USING ERRCODE = 'no_data_found';
  END IF;

  RETURN v_number;
END;
$$;
