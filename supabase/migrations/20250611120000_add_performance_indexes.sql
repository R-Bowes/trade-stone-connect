-- Add indexes to improve policy and foreign key performance
CREATE INDEX IF NOT EXISTS quotes_contractor_id_idx ON public.quotes (contractor_id);
CREATE INDEX IF NOT EXISTS quote_form_templates_contractor_id_idx ON public.quote_form_templates (contractor_id);
CREATE INDEX IF NOT EXISTS quote_form_templates_is_active_idx ON public.quote_form_templates (is_active);
CREATE INDEX IF NOT EXISTS team_members_contractor_id_idx ON public.team_members (contractor_id);
CREATE INDEX IF NOT EXISTS timesheets_contractor_id_idx ON public.timesheets (contractor_id);
CREATE INDEX IF NOT EXISTS timesheets_team_member_id_idx ON public.timesheets (team_member_id);
CREATE INDEX IF NOT EXISTS contracts_contractor_id_idx ON public.contracts (contractor_id);
CREATE INDEX IF NOT EXISTS contractor_photos_contractor_id_idx ON public.contractor_photos (contractor_id);
CREATE INDEX IF NOT EXISTS marketplace_listings_seller_id_idx ON public.marketplace_listings (seller_id);
CREATE INDEX IF NOT EXISTS marketplace_listings_is_active_idx ON public.marketplace_listings (is_active);
