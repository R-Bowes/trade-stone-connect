-- Allow public viewing of pro contractor profiles
CREATE POLICY "Public can view pro contractor profiles"
ON public.profiles
FOR SELECT
USING (user_type = 'pro');
