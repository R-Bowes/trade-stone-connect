-- Team member resolvers
-- Enables team members to act within their employer's scope.
-- Additive only: no existing policy is modified.

-- Which contractors does the current user act for?
-- Returns the user themselves, plus any employer they are an active team member of.
CREATE OR REPLACE FUNCTION public.acting_contractor_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT auth.uid()
  WHERE auth.uid() IS NOT NULL
  UNION
  SELECT tm.contractor_id
  FROM public.team_members tm
  WHERE tm.profile_id = auth.uid()
    AND tm.status = 'active';
$function$;

-- Which team_members rows IS the current user?
-- Used for assignment lookups.
CREATE OR REPLACE FUNCTION public.my_team_member_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT tm.id
  FROM public.team_members tm
  WHERE tm.profile_id = auth.uid()
    AND tm.status = 'active';
$function$;

GRANT EXECUTE ON FUNCTION public.acting_contractor_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_team_member_ids() TO authenticated;

-- Direct predicate, NOT the helpers above.
-- Both helpers read team_members, so using them here would recurse.
CREATE POLICY "Team members can view their own record"
ON public.team_members
FOR SELECT
USING (profile_id = auth.uid());