-- Add foreign key from marketplace_listings to profiles
ALTER TABLE public.marketplace_listings
ADD CONSTRAINT marketplace_listings_seller_id_fkey
FOREIGN KEY (seller_id) REFERENCES public.profiles(user_id) ON DELETE CASCADE;