-- Create marketplace listings table
CREATE TABLE public.marketplace_listings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  seller_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  price NUMERIC NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('Materials', 'Equipment', 'Tools')),
  condition TEXT NOT NULL CHECK (condition IN ('New', 'Used - Excellent', 'Used - Good', 'Reclaimed')),
  quantity TEXT NOT NULL,
  location TEXT NOT NULL,
  images TEXT[] DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.marketplace_listings ENABLE ROW LEVEL SECURITY;

-- Anyone can view active listings
CREATE POLICY "Anyone can view active marketplace listings"
ON public.marketplace_listings
FOR SELECT
USING (is_active = true);

-- Sellers can manage their own listings
CREATE POLICY "Sellers can insert their own listings"
ON public.marketplace_listings
FOR INSERT
WITH CHECK (auth.uid() = seller_id);

CREATE POLICY "Sellers can update their own listings"
ON public.marketplace_listings
FOR UPDATE
USING (auth.uid() = seller_id);

CREATE POLICY "Sellers can delete their own listings"
ON public.marketplace_listings
FOR DELETE
USING (auth.uid() = seller_id);

-- Trigger for updated_at
CREATE TRIGGER update_marketplace_listings_updated_at
BEFORE UPDATE ON public.marketplace_listings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();