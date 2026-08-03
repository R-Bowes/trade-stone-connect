-- Security audit round 3, Fix 2 — extend anonymise_user's PII scrub.
--
-- CRITICAL finding beyond the brief's scope: anonymise_user currently has
-- EXECUTE granted to BOTH anon and authenticated (confirmed via proacl —
-- "{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,
-- service_role=X/postgres}" — never revoked from the default PostgREST
-- grant), and has NO internal authorisation check at all. Any
-- authenticated user — and, since anon also has EXECUTE, potentially any
-- unauthenticated caller — could currently call
-- anonymise_user(<any other user's id>) and destructively scrub that
-- person's profile/CRM/contract data.
--
-- Fix: revoke EXECUTE from anon (blocks unauthenticated callers outright)
-- and add an is_platform_admin() guard inside the body (blocks every
-- non-admin authenticated user). EXECUTE is deliberately left in place for
-- `authenticated` rather than revoked — the function's own closing
-- INSERT logs `performed_by = auth.uid()`, which only means anything if
-- the caller invokes it with THEIR OWN JWT (Postgres role `authenticated`,
-- auth.uid() = the calling admin), the same userClient-forwards-own-token
-- pattern this codebase already uses in accept-quote/index.ts. A bare
-- service-role client (auth.uid() = null) would silently log
-- performed_by = null and defeat the audit trail's whole purpose, so that
-- is NOT the intended calling convention here.
--
-- Scrub coverage: the live function only touched profiles (partial column
-- list), crm_clients, `quotes` (confirmed live: 0 rows — legacy/dead table
-- per CLAUDE.md, this update was a permanent no-op) and `contracts`
-- (confirmed live: 5 real rows, this part was working correctly — kept
-- unchanged). Extended to the tables below, with every column name
-- confirmed against information_schema.columns first — several diverge
-- from the brief's draft (team_members has next_of_kin/utr_number/notes
-- beyond what the brief listed; enquiries needed a customer_id scope the
-- brief's SQL never resolved).

CREATE OR REPLACE FUNCTION anonymise_user(target_user_id uuid)
RETURNS void AS $$
BEGIN
  IF NOT is_platform_admin() THEN
    RAISE EXCEPTION 'Not authorised to perform GDPR erasure';
  END IF;

  UPDATE profiles SET
    full_name = 'Deleted User',
    phone = null,
    address = null,
    avatar_url = null,
    bio = null,
    email = null,
    logo_url = null,
    cover_url = null,
    website = null,
    social_links = null,
    location = null,
    working_radius = null,
    service_area_center_lat = null,
    service_area_center_lng = null,
    updated_at = now()
  WHERE user_id = target_user_id;

  UPDATE crm_clients SET
    name = 'Deleted Contact', email = null, phone = null,
    address = null, updated_at = now()
  WHERE contractor_id = target_user_id;

  -- issued_quotes (the live table — `quotes` is legacy/always-empty,
  -- dropped from this function; see CLAUDE.md)
  UPDATE issued_quotes SET
    client_name = 'Deleted User', client_email = null,
    client_phone = null, client_address = null
  WHERE contractor_id = target_user_id
    OR recipient_id = target_user_id;

  -- contracts (unchanged — this table is live with real rows and the
  -- existing column names were already correct)
  UPDATE contracts SET
    client_name = 'Deleted User', client_email = null,
    client_phone = null, updated_at = now()
  WHERE contractor_id = target_user_id;

  UPDATE invoices SET
    client_name = 'Deleted User', client_email = null,
    client_phone = null, client_address = null
  WHERE contractor_id = target_user_id
    OR recipient_id = target_user_id;

  -- enquiries: customer_name/email/phone are the guest-submitted PII
  -- fields; only scrub when this user was the customer (contractor-side
  -- enquiries don't carry the contractor's own PII in these columns).
  UPDATE enquiries SET
    customer_name = 'Deleted User', customer_email = null,
    customer_phone = null
  WHERE customer_id = target_user_id;

  UPDATE job_reviews SET
    comment = null, reply = null
  WHERE client_id = target_user_id
    OR contractor_id = target_user_id;

  UPDATE service_reviews SET
    free_text = null
  WHERE reviewer_id = target_user_id
    OR contractor_id = target_user_id;

  UPDATE job_notes SET
    content = '[Removed — user data deleted]'
  WHERE author_id = target_user_id;

  UPDATE job_messages SET
    content = '[Removed — user data deleted]'
  WHERE sender_id = target_user_id;

  UPDATE site_contacts SET
    full_name = 'Deleted User', email = null, phone = null
  WHERE user_id = target_user_id;

  -- cooling_off_records: confirmed live — no direct PII columns (only
  -- ids/dates/booleans), the profile scrub above covers the consumer's
  -- name. Deliberately left untouched.

  UPDATE peer_endorsements SET
    endorsement_text = null
  WHERE endorser_id = target_user_id OR endorsed_id = target_user_id;

  UPDATE contractor_documents SET
    title = 'Deleted', description = null, file_name = 'deleted'
  WHERE contractor_id = target_user_id;

  -- team_members: contractor_id is the employer link. Extended beyond the
  -- brief's draft — next_of_kin, utr_number (a UK tax ID) and notes are
  -- all live PII-bearing columns the draft missed.
  UPDATE team_members SET
    full_name = 'Deleted', phone = null, email = null,
    emergency_contact_name = null, emergency_contact_phone = null,
    next_of_kin = null, utr_number = null, notes = null
  WHERE contractor_id = target_user_id;

  -- Storage objects (uploaded documents/photos) are NOT deleted here —
  -- flagged, not implemented. Deleting storage objects tied to a user
  -- needs its own reviewed process (paths aren't uniformly keyed the same
  -- way across every bucket — see the storage-policy audit from an
  -- earlier round) and shouldn't be bundled into this DB-only scrub.

  INSERT INTO gdpr_erasure_log (user_id, requested_at, completed_at, performed_by)
  VALUES (target_user_id, now(), now(), auth.uid());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION anonymise_user(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION anonymise_user(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION anonymise_user(uuid) TO authenticated;
