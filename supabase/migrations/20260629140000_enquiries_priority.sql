-- 20260629140000_enquiries_priority.sql

-- B2B requests created via BusinessRequestsView need a priority so the resulting
-- job's SLA clock (sla_rules.priority match) can be set correctly downstream.
ALTER TABLE public.enquiries
  ADD COLUMN IF NOT EXISTS priority text
    CHECK (priority IN ('p1','p2','p3','p4'));
