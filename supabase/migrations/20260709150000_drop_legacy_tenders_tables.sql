-- Drop tenders / tender_responses: empty, orphaned, zero application code
-- references (grepped src/ — only src/integrations/supabase/types.ts mentions
-- them, which is generated), superseded by the projects/tender_status design
-- (projects.tender_status, project_proposals, project_contracts, etc. — see
-- 20260709140000_baseline_dashboard_created_tables.sql). Never had a CREATE
-- TABLE in migration history either; dashboard-created and abandoned.

DROP TABLE IF EXISTS public.tender_responses CASCADE;
DROP TABLE IF EXISTS public.tenders CASCADE;
