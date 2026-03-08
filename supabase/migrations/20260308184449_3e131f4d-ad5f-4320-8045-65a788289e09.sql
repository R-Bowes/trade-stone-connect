
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS trade text,
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS working_radius text,
  ADD COLUMN IF NOT EXISTS bio text;
