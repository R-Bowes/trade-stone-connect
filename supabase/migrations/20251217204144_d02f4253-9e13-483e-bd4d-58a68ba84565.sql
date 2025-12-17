-- Create rate_limits table for server-side rate limiting
CREATE TABLE public.rate_limits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  identifier TEXT NOT NULL,
  action_type TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for efficient lookups
CREATE INDEX idx_rate_limits_identifier_action ON public.rate_limits (identifier, action_type, created_at);

-- Enable RLS (public access for edge function usage)
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Allow inserts from authenticated and anonymous users (edge function uses service role)
CREATE POLICY "Allow rate limit inserts" 
ON public.rate_limits 
FOR INSERT 
WITH CHECK (true);

-- Allow reads for rate limit checking
CREATE POLICY "Allow rate limit reads" 
ON public.rate_limits 
FOR SELECT 
USING (true);

-- Auto-cleanup old entries (older than 1 hour)
CREATE OR REPLACE FUNCTION public.cleanup_old_rate_limits()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.rate_limits 
  WHERE created_at < now() - interval '1 hour';
  RETURN NEW;
END;
$$;

-- Trigger cleanup on insert (lightweight cleanup)
CREATE TRIGGER trigger_cleanup_rate_limits
AFTER INSERT ON public.rate_limits
FOR EACH STATEMENT
EXECUTE FUNCTION public.cleanup_old_rate_limits();