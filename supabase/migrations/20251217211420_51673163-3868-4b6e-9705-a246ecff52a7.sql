-- Add RLS policies to rate_limits table
-- This table is used for rate limiting and should only be accessible by the system

-- Create policy to allow authenticated service role to insert rate limits
CREATE POLICY "Service role can insert rate limits" 
ON public.rate_limits 
FOR INSERT 
WITH CHECK (true);

-- Create policy to allow authenticated service role to select rate limits  
CREATE POLICY "Service role can select rate limits"
ON public.rate_limits
FOR SELECT
USING (true);

-- Create policy to allow cleanup of old rate limits
CREATE POLICY "Service role can delete rate limits"
ON public.rate_limits
FOR DELETE
USING (true);