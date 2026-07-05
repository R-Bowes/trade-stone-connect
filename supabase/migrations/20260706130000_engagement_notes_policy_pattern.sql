-- 20260706130000_engagement_notes_policy_pattern.sql
-- Normalises engagement_notes RLS to the standing two-step profiles
-- pattern. Behaviour identical under the profiles.id = user_id CHECK;
-- the rule exists so no policy depends on remembering the invariant.

DROP POLICY "Contractors manage their own engagement notes" ON public.engagement_notes;
CREATE POLICY "Contractors manage their own engagement notes"
  ON public.engagement_notes FOR ALL
  USING (contractor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK (contractor_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));