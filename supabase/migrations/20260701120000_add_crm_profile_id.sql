-- crm_clients columns at time of migration (information_schema.columns ORDER BY ordinal_position):
-- id, contractor_id, full_name, email, phone, company_name, address, notes, status, source,
-- total_revenue, created_at, updated_at

ALTER TABLE crm_clients ADD COLUMN IF NOT EXISTS profile_id uuid NULL REFERENCES profiles(id);
