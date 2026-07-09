-- Baseline: capturing dashboard-created (Lovable-era) tables with no prior
-- migration provenance. No-op against the live DB; makes fresh environments
-- reproducible.
--
-- Scope: 32 of the 37 tables identified as having zero CREATE TABLE anywhere
-- in migration history (confirmed by grepping every table in types.ts against
-- supabase/migrations/*.sql, then verified against live pg_catalog/information_schema
-- extracts in supabase/archive/baseline_extraction/).
--
-- DEFERRED (NOT in this migration): assets, service_contracts, service_documents,
-- service_schedules, service_visits. These depend on five native enum types
-- (asset_category, service_contract_status, service_document_type,
-- service_frequency, service_visit_status) whose labels are not visible from
-- information_schema.columns, and three of them (assets, service_contracts,
-- service_schedules, service_visits) use a trigger function, update_updated_at(),
-- that also has zero migration provenance and whose body is unknown. Per house
-- rule ("schema/policy claims must come from the live DB, never inference"),
-- these are held back pending two more read-only extracts:
--   SELECT t.typname, e.enumlabel, e.enumsortorder
--   FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
--   WHERE t.typname IN ('asset_category','service_contract_status',
--     'service_document_type','service_frequency','service_visit_status')
--   ORDER BY t.typname, e.enumsortorder;
--
--   SELECT pg_get_functiondef(p.oid)
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.proname = 'update_updated_at';
--
-- EXCLUDED entirely (separate DROP migration): tenders, tender_responses.
--
-- NOTE — RLS lockout preserved as-is: broadcast_emails, project_change_requests,
-- project_contracts, project_jobs, project_proposals, project_qanda,
-- project_sign_offs, project_snags, project_updates, and proposal_attachments
-- all have RLS enabled live with ZERO policies (deny-all to anon/authenticated;
-- only service_role/superuser can touch them). This migration reproduces that
-- lockout faithfully — it does not add policies that don't exist live. See the
-- findings summary in conversation for the full list of RLS/policy anomalies.

-- ============================================================================
-- 1. TABLES (topologically ordered so in-scope FKs resolve on a fresh DB;
--    CREATE TABLE IF NOT EXISTS no-ops entirely on the live DB where every
--    one of these already exists, constraints included)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.companies (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  email            text,
  phone            text,
  address          text,
  city             text,
  postcode         text,
  industry         text,
  company_size     text,
  owner_id         uuid NOT NULL,
  logo_url         text,
  website          text,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now(),
  address_line1    text,
  address_line2    text,
  contact_email    text,
  contact_phone    text,
  sourcing_policy  text NOT NULL DEFAULT 'approved',
  CONSTRAINT companies_pkey PRIMARY KEY (id),
  CONSTRAINT companies_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES auth.users(id),
  CONSTRAINT companies_company_size_check CHECK (company_size = ANY (ARRAY['1-10','11-50','51-200','201-500','500+'])),
  CONSTRAINT companies_sourcing_policy_check CHECK (sourcing_policy = ANY (ARRAY['approved','one_off','unrestricted']))
);

CREATE TABLE IF NOT EXISTS public.projects (
  id                            uuid NOT NULL DEFAULT gen_random_uuid(),
  posted_by                     uuid NOT NULL,
  title                         text NOT NULL,
  description                   text,
  address_line_1                text,
  address_line_2                text,
  city                          text,
  postcode                      text,
  trade_categories              text[],
  tender_status                 text NOT NULL DEFAULT 'draft',
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  account_type                  text NOT NULL DEFAULT 'personal',
  visibility                    text NOT NULL DEFAULT 'open',
  lead_contractor_id            uuid,
  budget                        numeric,
  budget_revised                numeric,
  budget_visible_to_contractors boolean DEFAULT true,
  deposit_required              boolean DEFAULT false,
  deposit_amount                numeric,
  deposit_percentage            numeric,
  retention_percentage          numeric,
  scoring_criteria              jsonb,
  proposal_deadline             timestamptz,
  qanda_public                  boolean DEFAULT false,
  CONSTRAINT projects_pkey PRIMARY KEY (id),
  CONSTRAINT projects_customer_id_fkey FOREIGN KEY (posted_by) REFERENCES public.profiles(id),
  CONSTRAINT projects_lead_contractor_id_fkey FOREIGN KEY (lead_contractor_id) REFERENCES public.profiles(id),
  CONSTRAINT projects_account_type_check CHECK (account_type = ANY (ARRAY['personal','contractor','business'])),
  CONSTRAINT projects_tender_status_check CHECK (tender_status = ANY (ARRAY['draft','open','closed','awarded','in_delivery','completed'])),
  CONSTRAINT projects_visibility_check CHECK (visibility = ANY (ARRAY['open','restricted']))
);

CREATE TABLE IF NOT EXISTS public.sla_rules (
  id                    uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id            uuid,
  name                  text NOT NULL,
  priority              text NOT NULL,
  description           text,
  response_hours        integer NOT NULL,
  resolution_hours      integer NOT NULL,
  applies_to_trade      text,
  is_active             boolean DEFAULT true,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),
  attendance_hours      integer,
  clock_pausable        boolean NOT NULL DEFAULT true,
  alert_pct             integer NOT NULL DEFAULT 75,
  business_hours_only   boolean NOT NULL DEFAULT false,
  business_hours_start  time DEFAULT '08:00:00',
  business_hours_end    time DEFAULT '18:00:00',
  CONSTRAINT sla_rules_pkey PRIMARY KEY (id),
  CONSTRAINT sla_rules_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  CONSTRAINT sla_rules_priority_check CHECK (priority = ANY (ARRAY['P1','P2','P3','P4']))
);

CREATE TABLE IF NOT EXISTS public.contractor_panel (
  id                uuid NOT NULL DEFAULT gen_random_uuid(),
  company_id        uuid,
  contractor_id     uuid,
  status            text DEFAULT 'pending',
  tier              text DEFAULT 'approved',
  added_by          uuid,
  approved_at       timestamptz,
  notes             text,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),
  prequal_id        uuid,
  prequal_status    text NOT NULL DEFAULT 'not_started',
  can_receive_jobs  boolean NOT NULL DEFAULT true,
  CONSTRAINT contractor_panel_pkey PRIMARY KEY (id),
  CONSTRAINT contractor_panel_company_id_contractor_id_key UNIQUE (company_id, contractor_id),
  CONSTRAINT contractor_panel_added_by_fkey FOREIGN KEY (added_by) REFERENCES auth.users(id),
  CONSTRAINT contractor_panel_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE CASCADE,
  CONSTRAINT contractor_panel_contractor_id_fkey FOREIGN KEY (contractor_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT contractor_panel_prequal_id_fkey FOREIGN KEY (prequal_id) REFERENCES public.panel_prequalification(id) ON DELETE SET NULL,
  CONSTRAINT contractor_panel_prequal_status_check CHECK (prequal_status = ANY (ARRAY['not_started','in_progress','approved','lapsed'])),
  CONSTRAINT contractor_panel_status_check CHECK (status = ANY (ARRAY['pending','approved','suspended','removed'])),
  CONSTRAINT contractor_panel_tier_check CHECK (tier = ANY (ARRAY['preferred','approved','probationary']))
);

CREATE TABLE IF NOT EXISTS public.sla_breaches (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  job_id           uuid,
  sla_rule_id      uuid,
  company_id       uuid,
  contractor_id    uuid,
  breach_type      text,
  due_at           timestamptz NOT NULL,
  breached_at      timestamptz NOT NULL,
  minutes_overdue  integer,
  acknowledged     boolean DEFAULT false,
  acknowledged_at  timestamptz,
  acknowledged_by  uuid,
  notes            text,
  created_at       timestamptz DEFAULT now(),
  CONSTRAINT sla_breaches_pkey PRIMARY KEY (id),
  CONSTRAINT sla_breaches_acknowledged_by_fkey FOREIGN KEY (acknowledged_by) REFERENCES auth.users(id),
  CONSTRAINT sla_breaches_company_id_fkey FOREIGN KEY (company_id) REFERENCES public.companies(id),
  CONSTRAINT sla_breaches_contractor_id_fkey FOREIGN KEY (contractor_id) REFERENCES auth.users(id),
  CONSTRAINT sla_breaches_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE,
  CONSTRAINT sla_breaches_sla_rule_id_fkey FOREIGN KEY (sla_rule_id) REFERENCES public.sla_rules(id),
  CONSTRAINT sla_breaches_breach_type_check CHECK (breach_type = ANY (ARRAY['response','resolution']))
);

CREATE TABLE IF NOT EXISTS public.project_change_requests (
  id                      uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id              uuid NOT NULL,
  submitted_by            uuid NOT NULL,
  description             text NOT NULL,
  cost_impact             numeric,
  timeline_impact_days    integer,
  status                  text NOT NULL DEFAULT 'pending',
  informal_acknowledged   boolean DEFAULT false,
  client_response         text,
  responded_at            timestamptz,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_change_requests_pkey PRIMARY KEY (id),
  CONSTRAINT project_change_requests_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE,
  CONSTRAINT project_change_requests_submitted_by_fkey FOREIGN KEY (submitted_by) REFERENCES public.profiles(id),
  CONSTRAINT project_change_requests_status_check CHECK (status = ANY (ARRAY['pending','approved','rejected']))
);

CREATE TABLE IF NOT EXISTS public.project_proposals (
  id                          uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id                  uuid NOT NULL,
  contractor_id               uuid NOT NULL,
  status                      text NOT NULL DEFAULT 'submitted',
  phases                      jsonb,
  total_cost                  numeric,
  timeline_start               date,
  timeline_end                 date,
  materials_responsibility    text,
  payment_terms               text,
  rejection_reason            text,
  rejection_scores            jsonb,
  weighted_score               numeric,
  version                     integer NOT NULL DEFAULT 1,
  submitted_at                timestamptz DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_proposals_pkey PRIMARY KEY (id),
  CONSTRAINT project_proposals_contractor_id_fkey FOREIGN KEY (contractor_id) REFERENCES public.profiles(id),
  CONSTRAINT project_proposals_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE,
  CONSTRAINT project_proposals_materials_responsibility_check CHECK (materials_responsibility = ANY (ARRAY['contractor','client','mixed'])),
  CONSTRAINT project_proposals_status_check CHECK (status = ANY (ARRAY['submitted','withdrawn','rejected','accepted']))
);

CREATE TABLE IF NOT EXISTS public.project_contracts (
  id                     uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id             uuid NOT NULL,
  version                integer NOT NULL DEFAULT 1,
  document_url           text,
  triggered_by           text NOT NULL,
  change_request_id      uuid,
  signed_by_client       boolean NOT NULL DEFAULT false,
  signed_by_contractor   boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_contracts_pkey PRIMARY KEY (id),
  CONSTRAINT project_contracts_change_request_id_fkey FOREIGN KEY (change_request_id) REFERENCES public.project_change_requests(id),
  CONSTRAINT project_contracts_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE,
  CONSTRAINT project_contracts_triggered_by_check CHECK (triggered_by = ANY (ARRAY['accepted_proposal','change_request']))
);

CREATE TABLE IF NOT EXISTS public.project_members (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL,
  profile_id  uuid NOT NULL,
  role        text NOT NULL DEFAULT 'contractor',
  status      text NOT NULL DEFAULT 'active',
  joined_at   timestamptz DEFAULT now(),
  CONSTRAINT project_members_pkey PRIMARY KEY (id),
  CONSTRAINT project_members_project_id_profile_id_key UNIQUE (project_id, profile_id),
  CONSTRAINT project_members_profile_id_fkey FOREIGN KEY (profile_id) REFERENCES public.profiles(id),
  CONSTRAINT project_members_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.project_events (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL,
  actor_id    uuid NOT NULL,
  event_type  text NOT NULL,
  payload     jsonb DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_events_pkey PRIMARY KEY (id),
  CONSTRAINT project_events_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id),
  CONSTRAINT project_events_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.project_notes (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL,
  author_id   uuid NOT NULL,
  visibility  text NOT NULL DEFAULT 'shared',
  body        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_notes_pkey PRIMARY KEY (id),
  CONSTRAINT project_notes_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id),
  CONSTRAINT project_notes_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.project_updates (
  id           uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL,
  posted_by    uuid NOT NULL,
  update_type  text NOT NULL,
  content      text,
  media_url    text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_updates_pkey PRIMARY KEY (id),
  CONSTRAINT project_updates_posted_by_fkey FOREIGN KEY (posted_by) REFERENCES public.profiles(id),
  CONSTRAINT project_updates_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE,
  CONSTRAINT project_updates_update_type_check CHECK (update_type = ANY (ARRAY['progress','site_note','photo','document']))
);

CREATE TABLE IF NOT EXISTS public.project_qanda (
  id            uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL,
  asked_by      uuid NOT NULL,
  question      text NOT NULL,
  answer        text,
  is_public     boolean NOT NULL DEFAULT false,
  asked_at      timestamptz NOT NULL DEFAULT now(),
  answered_at   timestamptz,
  CONSTRAINT project_qanda_pkey PRIMARY KEY (id),
  CONSTRAINT project_qanda_asked_by_fkey FOREIGN KEY (asked_by) REFERENCES public.profiles(id),
  CONSTRAINT project_qanda_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.project_sign_offs (
  id                   uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id           uuid NOT NULL,
  stage                text NOT NULL,
  signed_off_by        uuid NOT NULL,
  snag_notes           text,
  retention_released   boolean NOT NULL DEFAULT false,
  signed_at            timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_sign_offs_pkey PRIMARY KEY (id),
  CONSTRAINT project_sign_offs_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE,
  CONSTRAINT project_sign_offs_signed_off_by_fkey FOREIGN KEY (signed_off_by) REFERENCES public.profiles(id),
  CONSTRAINT project_sign_offs_stage_check CHECK (stage = ANY (ARRAY['practical_completion','final']))
);

CREATE TABLE IF NOT EXISTS public.project_snags (
  id           uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL,
  raised_by    uuid NOT NULL,
  description  text NOT NULL,
  status       text NOT NULL DEFAULT 'open',
  resolved_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_snags_pkey PRIMARY KEY (id),
  CONSTRAINT project_snags_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE,
  CONSTRAINT project_snags_raised_by_fkey FOREIGN KEY (raised_by) REFERENCES public.profiles(id),
  CONSTRAINT project_snags_status_check CHECK (status = ANY (ARRAY['open','in_progress','resolved']))
);

CREATE TABLE IF NOT EXISTS public.project_jobs (
  id           uuid NOT NULL DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL,
  job_id       uuid NOT NULL,
  phase_title  text,
  phase_order  integer,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_jobs_pkey PRIMARY KEY (id),
  CONSTRAINT project_jobs_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE,
  CONSTRAINT project_jobs_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.proposal_attachments (
  id           uuid NOT NULL DEFAULT gen_random_uuid(),
  proposal_id  uuid NOT NULL,
  file_name    text NOT NULL,
  file_url     text NOT NULL,
  uploaded_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT proposal_attachments_pkey PRIMARY KEY (id),
  CONSTRAINT proposal_attachments_proposal_id_fkey FOREIGN KEY (proposal_id) REFERENCES public.project_proposals(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.payments (
  id                   uuid NOT NULL DEFAULT gen_random_uuid(),
  job_id               uuid,
  invoice_id           uuid,
  payer_id             uuid,
  payee_id             uuid,
  amount               numeric(10,2) NOT NULL,
  platform_fee         numeric(10,2),
  stripe_payment_intent_id  text,
  stripe_transfer_id   text,
  status               text DEFAULT 'pending',
  escrow_released_at   timestamptz,
  released_by          uuid,
  notes                text,
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now(),
  project_id           uuid,
  type                 text DEFAULT 'balance',
  contractor_payout    numeric,
  CONSTRAINT payments_pkey PRIMARY KEY (id),
  CONSTRAINT payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id),
  CONSTRAINT payments_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE,
  CONSTRAINT payments_payee_id_fkey FOREIGN KEY (payee_id) REFERENCES auth.users(id),
  CONSTRAINT payments_payer_id_fkey FOREIGN KEY (payer_id) REFERENCES auth.users(id),
  CONSTRAINT payments_project_id_fkey FOREIGN KEY (project_id) REFERENCES public.projects(id),
  CONSTRAINT payments_released_by_fkey FOREIGN KEY (released_by) REFERENCES auth.users(id),
  CONSTRAINT payments_status_check CHECK (status = ANY (ARRAY['pending','held_in_escrow','released','refunded','failed','disputed']))
);

CREATE TABLE IF NOT EXISTS public.job_conversations (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  job_id           uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  enquiry_id       uuid,
  context          text NOT NULL DEFAULT 'job',
  issued_quote_id  uuid,
  CONSTRAINT job_conversations_pkey PRIMARY KEY (id),
  CONSTRAINT job_conversations_job_id_key UNIQUE (job_id),
  CONSTRAINT job_conversations_enquiry_id_fkey FOREIGN KEY (enquiry_id) REFERENCES public.enquiries(id) ON DELETE SET NULL,
  CONSTRAINT job_conversations_issued_quote_id_fkey FOREIGN KEY (issued_quote_id) REFERENCES public.issued_quotes(id),
  CONSTRAINT job_conversations_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE,
  CONSTRAINT job_conversations_context_check CHECK (context = ANY (ARRAY['enquiry','job','quote'])),
  CONSTRAINT job_conversations_single_context CHECK (((job_id IS NOT NULL)::integer + (enquiry_id IS NOT NULL)::integer + (issued_quote_id IS NOT NULL)::integer) = 1)
);

CREATE TABLE IF NOT EXISTS public.job_messages (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  conversation_id  uuid NOT NULL,
  sender_id        uuid NOT NULL,
  sender_role      text NOT NULL,
  content          text NOT NULL,
  message_type     text NOT NULL DEFAULT 'message',
  read_at          timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_messages_pkey PRIMARY KEY (id),
  CONSTRAINT job_messages_conversation_id_fkey FOREIGN KEY (conversation_id) REFERENCES public.job_conversations(id) ON DELETE CASCADE,
  CONSTRAINT job_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT job_messages_message_type_check CHECK (message_type = ANY (ARRAY['message','milestone'])),
  CONSTRAINT job_messages_sender_role_check CHECK (sender_role = ANY (ARRAY['business','contractor','personal']))
);

CREATE TABLE IF NOT EXISTS public.job_message_notifications (
  id                    uuid NOT NULL DEFAULT gen_random_uuid(),
  message_id            uuid NOT NULL,
  recipient_id          uuid NOT NULL,
  notified_via_email    boolean NOT NULL DEFAULT false,
  notified_via_inapp    boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_message_notifications_pkey PRIMARY KEY (id),
  CONSTRAINT job_message_notifications_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.job_messages(id) ON DELETE CASCADE,
  CONSTRAINT job_message_notifications_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.job_scheduling_proposals (
  id               uuid NOT NULL DEFAULT gen_random_uuid(),
  quote_id         uuid,
  proposed_by      uuid,
  proposed_dates   date[] NOT NULL,
  status           text NOT NULL DEFAULT 'pending',
  confirmed_date   date,
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now(),
  CONSTRAINT job_scheduling_proposals_pkey PRIMARY KEY (id),
  CONSTRAINT job_scheduling_proposals_proposed_by_fkey FOREIGN KEY (proposed_by) REFERENCES public.profiles(id),
  CONSTRAINT job_scheduling_proposals_quote_id_fkey FOREIGN KEY (quote_id) REFERENCES public.issued_quotes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.job_assignments (
  id              uuid NOT NULL DEFAULT gen_random_uuid(),
  job_id          uuid NOT NULL,
  team_member_id  uuid,
  is_contractor   boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_assignments_pkey PRIMARY KEY (id),
  CONSTRAINT job_assignments_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.jobs(id) ON DELETE CASCADE,
  CONSTRAINT job_assignments_team_member_id_fkey FOREIGN KEY (team_member_id) REFERENCES public.team_members(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.profile_widgets (
  id                    uuid NOT NULL DEFAULT gen_random_uuid(),
  contractor_id         uuid NOT NULL,
  widget_key            text NOT NULL,
  is_enabled            boolean NOT NULL DEFAULT true,
  display_order         integer NOT NULL DEFAULT 0,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now(),
  section_instance_id   uuid DEFAULT gen_random_uuid(),
  section_ref_id        uuid,
  meta                  jsonb DEFAULT '{}'::jsonb,
  is_published          boolean NOT NULL DEFAULT false,
  published_order       integer,
  label                 text,
  CONSTRAINT profile_widgets_pkey PRIMARY KEY (id),
  CONSTRAINT profile_widgets_contractor_instance_unique UNIQUE (contractor_id, section_instance_id),
  CONSTRAINT profile_widgets_contractor_id_fkey FOREIGN KEY (contractor_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.admin_users (
  id           uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL,
  email        text NOT NULL,
  full_name    text,
  created_at   timestamptz DEFAULT now(),
  role         text NOT NULL DEFAULT 'admin',
  CONSTRAINT admin_users_pkey PRIMARY KEY (id),
  CONSTRAINT admin_users_user_id_key UNIQUE (user_id),
  CONSTRAINT admin_users_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.broadcast_emails (
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  subject            text NOT NULL,
  body               text NOT NULL,
  cta_label          text,
  cta_url            text,
  audience_type      text NOT NULL,
  audience_filters   jsonb,
  recipient_count    integer,
  scheduled_at       timestamptz,
  sent_at            timestamptz,
  created_by         uuid,
  created_at         timestamptz DEFAULT now(),
  CONSTRAINT broadcast_emails_pkey PRIMARY KEY (id),
  CONSTRAINT broadcast_emails_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.compliance_items (
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  contractor_id      uuid,
  type               text NOT NULL,
  name               text NOT NULL,
  reference_number   text,
  issuing_body       text,
  issued_date        date,
  expiry_date        date NOT NULL,
  document_url       text,
  status             text DEFAULT 'valid',
  alert_sent         boolean DEFAULT false,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now(),
  CONSTRAINT compliance_items_pkey PRIMARY KEY (id),
  CONSTRAINT compliance_items_contractor_id_fkey FOREIGN KEY (contractor_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT compliance_items_status_check CHECK (status = ANY (ARRAY['valid','expiring_soon','expired'])),
  CONSTRAINT compliance_items_type_check CHECK (type = ANY (ARRAY['public_liability','employers_liability','professional_indemnity','gas_safe','niceic','napit','chas','constructionline','dbs_check','rams','other']))
);

CREATE TABLE IF NOT EXISTS public.contractor_availability_overrides (
  id             uuid NOT NULL DEFAULT gen_random_uuid(),
  contractor_id  uuid NOT NULL,
  date           date NOT NULL,
  am_available   boolean NOT NULL DEFAULT false,
  pm_available   boolean NOT NULL DEFAULT false,
  reason         text,
  created_at     timestamptz DEFAULT now(),
  CONSTRAINT contractor_availability_overrides_pkey PRIMARY KEY (id),
  CONSTRAINT contractor_availability_overrides_contractor_id_date_key UNIQUE (contractor_id, date),
  CONSTRAINT contractor_availability_overrides_contractor_id_fkey FOREIGN KEY (contractor_id) REFERENCES public.profiles(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE IF NOT EXISTS public.contractor_credentials (
  id                 uuid NOT NULL DEFAULT gen_random_uuid(),
  contractor_id      uuid NOT NULL,
  name               text NOT NULL,
  issuer             text,
  reference_number   text,
  verified           boolean DEFAULT false,
  display_order      integer DEFAULT 0,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now(),
  CONSTRAINT contractor_credentials_pkey PRIMARY KEY (id),
  CONSTRAINT contractor_credentials_contractor_id_fkey FOREIGN KEY (contractor_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.enquiry_measurements (
  id          uuid NOT NULL DEFAULT gen_random_uuid(),
  enquiry_id  uuid NOT NULL,
  label       text NOT NULL,
  value       text NOT NULL,
  unit        text,
  sort_order  integer DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT enquiry_measurements_pkey PRIMARY KEY (id),
  CONSTRAINT enquiry_measurements_enquiry_id_fkey FOREIGN KEY (enquiry_id) REFERENCES public.enquiries(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.favourites (
  id             uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id        uuid,
  contractor_id  uuid,
  created_at     timestamptz DEFAULT now(),
  CONSTRAINT favourites_pkey PRIMARY KEY (id),
  CONSTRAINT favourites_user_id_contractor_id_key UNIQUE (user_id, contractor_id),
  CONSTRAINT favourites_contractor_id_fkey FOREIGN KEY (contractor_id) REFERENCES public.profiles(id) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT favourites_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE IF NOT EXISTS public.gdpr_erasure_log (
  id             uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL,
  requested_at   timestamptz NOT NULL,
  completed_at   timestamptz,
  performed_by   uuid,
  notes          text,
  created_at     timestamptz DEFAULT now(),
  CONSTRAINT gdpr_erasure_log_pkey PRIMARY KEY (id),
  CONSTRAINT gdpr_erasure_log_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES auth.users(id)
);

-- ============================================================================
-- 2. INDEXES (only the ones not already implied by an inline PK/UNIQUE above)
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_companies_owner_id ON public.companies(owner_id);
CREATE INDEX IF NOT EXISTS idx_contractor_panel_prequal ON public.contractor_panel(prequal_id);
CREATE INDEX IF NOT EXISTS idx_sla_rules_company_id ON public.sla_rules(company_id);
CREATE INDEX IF NOT EXISTS idx_job_conversations_enquiry ON public.job_conversations(enquiry_id) WHERE (enquiry_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_job_messages_conversation ON public.job_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_job_messages_notifications_recipient ON public.job_message_notifications(recipient_id);

-- ============================================================================
-- 3. ROW LEVEL SECURITY — enable on all 32 (matches live: all 37 candidate
--    tables have relrowsecurity = true, none disabled)
-- ============================================================================

ALTER TABLE public.companies                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects                           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_rules                          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_panel                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sla_breaches                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_change_requests            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_proposals                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_contracts                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_events                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_notes                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_updates                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_qanda                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_sign_offs                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_snags                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_jobs                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.proposal_attachments               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments                           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_conversations                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_messages                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_message_notifications          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_scheduling_proposals           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_assignments                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_widgets                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.broadcast_emails                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_items                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_availability_overrides  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contractor_credentials             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enquiry_measurements               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favourites                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gdpr_erasure_log                   ENABLE ROW LEVEL SECURITY;

-- NOTE: broadcast_emails, project_change_requests, project_contracts, project_jobs,
-- project_proposals, project_qanda, project_sign_offs, project_snags,
-- project_updates, proposal_attachments have RLS enabled above but deliberately
-- get ZERO policies below — that matches live (deny-all to anon/authenticated).

-- ============================================================================
-- 4. POLICIES (verbatim from live pg_policies; DROP + CREATE is idempotent)
-- ============================================================================

-- companies
DROP POLICY IF EXISTS "Companies deletable by owner" ON public.companies;
CREATE POLICY "Companies deletable by owner" ON public.companies FOR DELETE
  USING (owner_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid()));

DROP POLICY IF EXISTS "Companies editable by owner" ON public.companies;
CREATE POLICY "Companies editable by owner" ON public.companies FOR UPDATE
  USING (owner_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid()));

DROP POLICY IF EXISTS "Companies insertable by owner" ON public.companies;
CREATE POLICY "Companies insertable by owner" ON public.companies FOR INSERT
  WITH CHECK (owner_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid()));

DROP POLICY IF EXISTS "Companies readable" ON public.companies;
CREATE POLICY "Companies readable" ON public.companies FOR SELECT TO authenticated
  USING (is_company_member(id));

DROP POLICY IF EXISTS "Companies readable by panel contractors" ON public.companies;
CREATE POLICY "Companies readable by panel contractors" ON public.companies FOR SELECT TO authenticated
  USING (id IN (
    SELECT cp.company_id FROM public.contractor_panel cp
    JOIN public.profiles p ON p.id = cp.contractor_id
    WHERE p.user_id = auth.uid()
  ));

-- sla_rules
DROP POLICY IF EXISTS "SLA rules deletable by company owner" ON public.sla_rules;
CREATE POLICY "SLA rules deletable by company owner" ON public.sla_rules FOR DELETE
  USING (company_id IN (
    SELECT c.id FROM public.companies c JOIN public.profiles p ON p.id = c.owner_id
    WHERE p.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "SLA rules insertable by company owner" ON public.sla_rules;
CREATE POLICY "SLA rules insertable by company owner" ON public.sla_rules FOR INSERT
  WITH CHECK (company_id IN (
    SELECT c.id FROM public.companies c JOIN public.profiles p ON p.id = c.owner_id
    WHERE p.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "SLA rules updatable by company owner" ON public.sla_rules;
CREATE POLICY "SLA rules updatable by company owner" ON public.sla_rules FOR UPDATE TO authenticated
  USING (company_id IN (
    SELECT c.id FROM public.companies c JOIN public.profiles p ON p.id = c.owner_id
    WHERE p.user_id = auth.uid()
  ))
  WITH CHECK (company_id IN (
    SELECT c.id FROM public.companies c JOIN public.profiles p ON p.id = c.owner_id
    WHERE p.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "SLA rules visible to company owner" ON public.sla_rules;
CREATE POLICY "SLA rules visible to company owner" ON public.sla_rules FOR SELECT
  USING (company_id IN (
    SELECT c.id FROM public.companies c JOIN public.profiles p ON p.id = c.owner_id
    WHERE p.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "SLA rules visible to panel contractors" ON public.sla_rules;
CREATE POLICY "SLA rules visible to panel contractors" ON public.sla_rules FOR SELECT
  USING (company_id IN (
    SELECT cp.company_id FROM public.contractor_panel cp JOIN public.profiles p ON p.id = cp.contractor_id
    WHERE p.user_id = auth.uid() AND cp.status = 'approved'
  ));

-- contractor_panel
DROP POLICY IF EXISTS "Panel deletable by company owner" ON public.contractor_panel;
CREATE POLICY "Panel deletable by company owner" ON public.contractor_panel FOR DELETE
  USING (added_by IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid()));

DROP POLICY IF EXISTS "Panel insertable by company owner" ON public.contractor_panel;
CREATE POLICY "Panel insertable by company owner" ON public.contractor_panel FOR INSERT
  WITH CHECK (added_by IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid()));

DROP POLICY IF EXISTS "Panel updatable by contractor" ON public.contractor_panel;
CREATE POLICY "Panel updatable by contractor" ON public.contractor_panel FOR UPDATE
  USING (contractor_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid()))
  WITH CHECK (contractor_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid()));

DROP POLICY IF EXISTS "Panel visible to company owner" ON public.contractor_panel;
CREATE POLICY "Panel visible to company owner" ON public.contractor_panel FOR SELECT
  USING (
    added_by IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid())
    OR contractor_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Panel visible to contractor" ON public.contractor_panel;
CREATE POLICY "Panel visible to contractor" ON public.contractor_panel FOR SELECT
  USING (contractor_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid()));

-- sla_breaches
DROP POLICY IF EXISTS "Breaches visible to company owner" ON public.sla_breaches;
CREATE POLICY "Breaches visible to company owner" ON public.sla_breaches FOR SELECT
  USING (company_id IN (
    SELECT c.id FROM public.companies c JOIN public.profiles p ON p.id = c.owner_id
    WHERE p.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Breaches visible to contractor" ON public.sla_breaches;
CREATE POLICY "Breaches visible to contractor" ON public.sla_breaches FOR SELECT
  USING (auth.uid() = contractor_id);

-- project_members
DROP POLICY IF EXISTS "project_members_insert" ON public.project_members;
CREATE POLICY "project_members_insert" ON public.project_members FOR INSERT
  WITH CHECK (project_id IN (
    SELECT projects.id FROM public.projects
    WHERE projects.posted_by IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid())
  ));

DROP POLICY IF EXISTS "project_members_select" ON public.project_members;
CREATE POLICY "project_members_select" ON public.project_members FOR SELECT
  USING (
    project_id IN (
      SELECT projects.id FROM public.projects
      WHERE projects.posted_by IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid())
    )
    OR profile_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "project_members_update" ON public.project_members;
CREATE POLICY "project_members_update" ON public.project_members FOR UPDATE
  USING (project_id IN (
    SELECT projects.id FROM public.projects
    WHERE projects.posted_by IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid())
  ));

-- project_events
DROP POLICY IF EXISTS "project_events_insert" ON public.project_events;
CREATE POLICY "project_events_insert" ON public.project_events FOR INSERT
  WITH CHECK (actor_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid()));

DROP POLICY IF EXISTS "project_events_select" ON public.project_events;
CREATE POLICY "project_events_select" ON public.project_events FOR SELECT
  USING (
    project_id IN (
      SELECT projects.id FROM public.projects
      WHERE projects.posted_by IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid())
    )
    OR project_id IN (
      SELECT project_members.project_id FROM public.project_members
      WHERE project_members.profile_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid())
    )
  );

-- project_notes
DROP POLICY IF EXISTS "project_notes_delete" ON public.project_notes;
CREATE POLICY "project_notes_delete" ON public.project_notes FOR DELETE
  USING (author_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid()));

DROP POLICY IF EXISTS "project_notes_insert" ON public.project_notes;
CREATE POLICY "project_notes_insert" ON public.project_notes FOR INSERT
  WITH CHECK (
    author_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid())
    AND (
      project_id IN (
        SELECT projects.id FROM public.projects
        WHERE projects.posted_by IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid())
      )
      OR project_id IN (
        SELECT project_members.project_id FROM public.project_members
        WHERE project_members.profile_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "project_notes_select" ON public.project_notes;
CREATE POLICY "project_notes_select" ON public.project_notes FOR SELECT
  USING (
    (
      project_id IN (
        SELECT projects.id FROM public.projects
        WHERE projects.posted_by IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid())
      )
      AND visibility = ANY (ARRAY['shared','customer_only'])
    )
    OR (
      project_id IN (
        SELECT project_members.project_id FROM public.project_members
        WHERE project_members.profile_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid())
      )
      AND visibility = ANY (ARRAY['shared','contractor_only'])
    )
    OR author_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "project_notes_update" ON public.project_notes;
CREATE POLICY "project_notes_update" ON public.project_notes FOR UPDATE
  USING (author_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid()));

-- projects
DROP POLICY IF EXISTS "projects_contractor_select" ON public.projects;
CREATE POLICY "projects_contractor_select" ON public.projects FOR SELECT
  USING (id IN (
    SELECT enquiries.project_id FROM public.enquiries
    WHERE enquiries.contractor_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid())
  ));

DROP POLICY IF EXISTS "projects_customer_all" ON public.projects;
CREATE POLICY "projects_customer_all" ON public.projects FOR ALL
  USING (posted_by IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid()))
  WITH CHECK (posted_by IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid()));

-- payments
DROP POLICY IF EXISTS "Payments insertable by payer" ON public.payments;
CREATE POLICY "Payments insertable by payer" ON public.payments FOR INSERT
  WITH CHECK (auth.uid() = payer_id);

DROP POLICY IF EXISTS "Payments visible to payee" ON public.payments;
CREATE POLICY "Payments visible to payee" ON public.payments FOR SELECT
  USING (auth.uid() = payee_id);

DROP POLICY IF EXISTS "Payments visible to payer" ON public.payments;
CREATE POLICY "Payments visible to payer" ON public.payments FOR SELECT
  USING (auth.uid() = payer_id);

-- job_conversations
DROP POLICY IF EXISTS "Participants can insert conversations" ON public.job_conversations;
CREATE POLICY "Participants can insert conversations" ON public.job_conversations FOR INSERT
  WITH CHECK (
    (job_id IS NOT NULL AND job_id IN (
      SELECT j.id FROM public.jobs j JOIN public.profiles p ON (p.id = j.contractor_id OR p.id = j.customer_id)
      WHERE p.user_id = auth.uid()
    ))
    OR (enquiry_id IS NOT NULL AND enquiry_id IN (
      SELECT e.id FROM public.enquiries e JOIN public.profiles p ON (p.id = e.contractor_id OR p.id = e.customer_id)
      WHERE p.user_id = auth.uid()
    ))
    OR (issued_quote_id IS NOT NULL AND issued_quote_id IN (
      SELECT q.id FROM public.issued_quotes q JOIN public.profiles p ON (p.id = q.contractor_id OR p.id = q.recipient_id)
      WHERE p.user_id = auth.uid()
    ))
  );

DROP POLICY IF EXISTS "Participants can update their conversations" ON public.job_conversations;
CREATE POLICY "Participants can update their conversations" ON public.job_conversations FOR UPDATE
  USING (
    (job_id IS NOT NULL AND job_id IN (
      SELECT j.id FROM public.jobs j JOIN public.profiles p ON (p.id = j.contractor_id OR p.id = j.customer_id)
      WHERE p.user_id = auth.uid()
    ))
    OR (enquiry_id IS NOT NULL AND enquiry_id IN (
      SELECT e.id FROM public.enquiries e JOIN public.profiles p ON (p.id = e.contractor_id OR p.id = e.customer_id)
      WHERE p.user_id = auth.uid()
    ))
    OR (issued_quote_id IS NOT NULL AND issued_quote_id IN (
      SELECT q.id FROM public.issued_quotes q JOIN public.profiles p ON (p.id = q.contractor_id OR p.id = q.recipient_id)
      WHERE p.user_id = auth.uid()
    ))
  );

DROP POLICY IF EXISTS "Participants can view their conversations" ON public.job_conversations;
CREATE POLICY "Participants can view their conversations" ON public.job_conversations FOR SELECT
  USING (
    (job_id IS NOT NULL AND job_id IN (
      SELECT j.id FROM public.jobs j JOIN public.profiles p ON (p.id = j.contractor_id OR p.id = j.customer_id)
      WHERE p.user_id = auth.uid()
    ))
    OR (enquiry_id IS NOT NULL AND enquiry_id IN (
      SELECT e.id FROM public.enquiries e JOIN public.profiles p ON (p.id = e.contractor_id OR p.id = e.customer_id)
      WHERE p.user_id = auth.uid()
    ))
    OR (issued_quote_id IS NOT NULL AND issued_quote_id IN (
      SELECT q.id FROM public.issued_quotes q JOIN public.profiles p ON (p.id = q.contractor_id OR p.id = q.recipient_id)
      WHERE p.user_id = auth.uid()
    ))
  );

DROP POLICY IF EXISTS "admin_select_job_conversations" ON public.job_conversations;
CREATE POLICY "admin_select_job_conversations" ON public.job_conversations FOR SELECT
  USING (is_platform_admin());

-- job_messages
DROP POLICY IF EXISTS "Participants can mark messages as read" ON public.job_messages;
CREATE POLICY "Participants can mark messages as read" ON public.job_messages FOR UPDATE
  USING (is_conversation_party(conversation_id));

DROP POLICY IF EXISTS "Participants can send messages" ON public.job_messages;
CREATE POLICY "Participants can send messages" ON public.job_messages FOR INSERT
  WITH CHECK (
    sender_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid())
    AND is_conversation_party(conversation_id)
  );

DROP POLICY IF EXISTS "Participants can view messages in their conversations" ON public.job_messages;
CREATE POLICY "Participants can view messages in their conversations" ON public.job_messages FOR SELECT
  USING (is_conversation_party(conversation_id));

DROP POLICY IF EXISTS "admin_select_job_messages" ON public.job_messages;
CREATE POLICY "admin_select_job_messages" ON public.job_messages FOR SELECT
  USING (is_platform_admin());

-- job_message_notifications
DROP POLICY IF EXISTS "Recipients can view their notifications" ON public.job_message_notifications;
CREATE POLICY "Recipients can view their notifications" ON public.job_message_notifications FOR SELECT
  USING (recipient_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid()));

DROP POLICY IF EXISTS "System can insert notifications" ON public.job_message_notifications;
CREATE POLICY "System can insert notifications" ON public.job_message_notifications FOR INSERT
  WITH CHECK (true);

-- job_scheduling_proposals
DROP POLICY IF EXISTS "Contractor can manage proposals on their quotes" ON public.job_scheduling_proposals;
CREATE POLICY "Contractor can manage proposals on their quotes" ON public.job_scheduling_proposals FOR ALL
  USING (quote_id IN (
    SELECT issued_quotes.id FROM public.issued_quotes
    WHERE issued_quotes.contractor_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid())
  ));

DROP POLICY IF EXISTS "Customer can manage proposals on their quotes" ON public.job_scheduling_proposals;
CREATE POLICY "Customer can manage proposals on their quotes" ON public.job_scheduling_proposals FOR ALL
  USING (quote_id IN (
    SELECT issued_quotes.id FROM public.issued_quotes
    WHERE issued_quotes.recipient_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid())
  ));

-- job_assignments
DROP POLICY IF EXISTS "Contractors manage their own job assignments" ON public.job_assignments;
CREATE POLICY "Contractors manage their own job assignments" ON public.job_assignments FOR ALL
  USING (job_id IN (
    SELECT jobs.id FROM public.jobs
    WHERE jobs.contractor_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid())
  ));

-- profile_widgets
DROP POLICY IF EXISTS "Anyone can read profile widgets" ON public.profile_widgets;
CREATE POLICY "Anyone can read profile widgets" ON public.profile_widgets FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Contractors manage own widgets" ON public.profile_widgets;
CREATE POLICY "Contractors manage own widgets" ON public.profile_widgets FOR ALL
  USING (contractor_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid()))
  WITH CHECK (contractor_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid()));

-- admin_users
DROP POLICY IF EXISTS "Admin users can read own record" ON public.admin_users;
CREATE POLICY "Admin users can read own record" ON public.admin_users FOR SELECT
  USING (user_id = auth.uid());

-- compliance_items
DROP POLICY IF EXISTS "Compliance items visible to panel companies" ON public.compliance_items;
CREATE POLICY "Compliance items visible to panel companies" ON public.compliance_items FOR SELECT
  USING (contractor_id IN (
    SELECT cp.contractor_id FROM public.contractor_panel cp JOIN public.profiles p ON p.id = cp.contractor_id
    WHERE p.user_id = auth.uid() AND cp.status = 'approved'
  ));

DROP POLICY IF EXISTS "compliance_delete" ON public.compliance_items;
CREATE POLICY "compliance_delete" ON public.compliance_items FOR DELETE
  USING (contractor_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid()));

DROP POLICY IF EXISTS "compliance_insert" ON public.compliance_items;
CREATE POLICY "compliance_insert" ON public.compliance_items FOR INSERT
  WITH CHECK (contractor_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid()));

DROP POLICY IF EXISTS "compliance_select" ON public.compliance_items;
CREATE POLICY "compliance_select" ON public.compliance_items FOR SELECT
  USING (contractor_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid()));

-- contractor_availability_overrides
DROP POLICY IF EXISTS "Authenticated users read overrides" ON public.contractor_availability_overrides;
CREATE POLICY "Authenticated users read overrides" ON public.contractor_availability_overrides FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Contractors manage own overrides" ON public.contractor_availability_overrides;
CREATE POLICY "Contractors manage own overrides" ON public.contractor_availability_overrides FOR ALL
  USING (contractor_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid()))
  WITH CHECK (contractor_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid()));

DROP POLICY IF EXISTS "Recipients can block dates for confirmed proposals" ON public.contractor_availability_overrides;
CREATE POLICY "Recipients can block dates for confirmed proposals" ON public.contractor_availability_overrides FOR INSERT
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.schedule_events se JOIN public.issued_quotes q ON q.id = se.quote_id
    WHERE se.contractor_id = contractor_availability_overrides.contractor_id
      AND se.start_time::date = contractor_availability_overrides.date
      AND se.event_type = 'quote_proposal'
      AND se.is_confirmed = true
      AND q.recipient_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid())
  ));

DROP POLICY IF EXISTS "Recipients can update blocks for confirmed proposals" ON public.contractor_availability_overrides;
CREATE POLICY "Recipients can update blocks for confirmed proposals" ON public.contractor_availability_overrides FOR UPDATE
  USING (EXISTS (
    SELECT 1 FROM public.schedule_events se JOIN public.issued_quotes q ON q.id = se.quote_id
    WHERE se.contractor_id = contractor_availability_overrides.contractor_id
      AND se.start_time::date = contractor_availability_overrides.date
      AND se.event_type = 'quote_proposal'
      AND se.is_confirmed = true
      AND q.recipient_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid())
  ));

-- contractor_credentials
DROP POLICY IF EXISTS "Anyone can read credentials" ON public.contractor_credentials;
CREATE POLICY "Anyone can read credentials" ON public.contractor_credentials FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Contractors manage own credentials" ON public.contractor_credentials;
CREATE POLICY "Contractors manage own credentials" ON public.contractor_credentials FOR ALL
  USING (contractor_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid()))
  WITH CHECK (contractor_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid()));

-- enquiry_measurements
DROP POLICY IF EXISTS "enquiry_measurements_delete" ON public.enquiry_measurements;
CREATE POLICY "enquiry_measurements_delete" ON public.enquiry_measurements FOR DELETE
  USING (enquiry_id IN (
    SELECT enquiries.id FROM public.enquiries
    WHERE enquiries.customer_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid())
  ));

DROP POLICY IF EXISTS "enquiry_measurements_insert" ON public.enquiry_measurements;
CREATE POLICY "enquiry_measurements_insert" ON public.enquiry_measurements FOR INSERT
  WITH CHECK (enquiry_id IN (
    SELECT enquiries.id FROM public.enquiries
    WHERE enquiries.customer_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid())
  ));

DROP POLICY IF EXISTS "enquiry_measurements_select" ON public.enquiry_measurements;
CREATE POLICY "enquiry_measurements_select" ON public.enquiry_measurements FOR SELECT
  USING (enquiry_id IN (
    SELECT enquiries.id FROM public.enquiries
    WHERE enquiries.customer_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid())
       OR enquiries.contractor_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid())
  ));

DROP POLICY IF EXISTS "enquiry_measurements_update" ON public.enquiry_measurements;
CREATE POLICY "enquiry_measurements_update" ON public.enquiry_measurements FOR UPDATE
  USING (enquiry_id IN (
    SELECT enquiries.id FROM public.enquiries
    WHERE enquiries.customer_id IN (SELECT profiles.id FROM public.profiles WHERE profiles.user_id = auth.uid())
  ));

-- favourites
DROP POLICY IF EXISTS "Users can manage own favourites" ON public.favourites;
CREATE POLICY "Users can manage own favourites" ON public.favourites FOR ALL
  USING (auth.uid() = user_id);

-- gdpr_erasure_log
-- NOTE: policy name says "Only admins" but the expression only checks
-- performed_by = auth.uid() — it does not verify an admin role. See findings.
DROP POLICY IF EXISTS "Only admins can view erasure log" ON public.gdpr_erasure_log;
CREATE POLICY "Only admins can view erasure log" ON public.gdpr_erasure_log FOR SELECT
  USING (auth.uid() = performed_by);

-- ============================================================================
-- 5. TRIGGERS (only the ones using the already-versioned update_updated_at_column();
--    assets/service_contracts/service_schedules/service_visits use the
--    unversioned update_updated_at() and are deferred along with their tables)
-- ============================================================================

DROP TRIGGER IF EXISTS update_project_change_requests_updated_at ON public.project_change_requests;
CREATE TRIGGER update_project_change_requests_updated_at
  BEFORE UPDATE ON public.project_change_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_project_proposals_updated_at ON public.project_proposals;
CREATE TRIGGER update_project_proposals_updated_at
  BEFORE UPDATE ON public.project_proposals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_project_snags_updated_at ON public.project_snags;
CREATE TRIGGER update_project_snags_updated_at
  BEFORE UPDATE ON public.project_snags
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_projects_updated_at ON public.projects;
CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
