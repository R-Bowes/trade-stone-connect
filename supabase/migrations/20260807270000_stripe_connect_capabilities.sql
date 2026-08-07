-- Stripe Connect capability state on contractor profiles.
--
-- Populated by the account.updated webhook handler and by the one-off backfill
-- sync. NULL means "not yet observed" and deliberately gates nothing -- see
-- the fail-open decision below.
--
-- Under destination charges the platform account creates the charge, so the
-- only capability that can block a payment is transfers. payouts_enabled and
-- charges_enabled are recorded for diagnostics and contractor-facing warnings
-- and must never gate acceptance or payment.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_transfers_capability      text,
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled           boolean,
  ADD COLUMN IF NOT EXISTS stripe_charges_enabled           boolean,
  ADD COLUMN IF NOT EXISTS stripe_disabled_reason           text,
  ADD COLUMN IF NOT EXISTS stripe_requirements_currently_due text[],
  ADD COLUMN IF NOT EXISTS stripe_capabilities_updated_at   timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_capabilities_event_created bigint;

COMMENT ON COLUMN public.profiles.stripe_transfers_capability IS
  'Stripe capabilities.transfers: active | pending | inactive. NULL = not yet observed. Anything other than ''active'' blocks payment; NULL does not. No CHECK constraint -- Stripe owns this vocabulary and an unrecognised value must not fail the webhook write.';

COMMENT ON COLUMN public.profiles.stripe_payouts_enabled IS
  'Stripe payouts_enabled. WARNING ONLY -- never gate acceptance or payment on this. False means funds accumulate safely in the contractor Stripe balance; blocking would cost them work over money that is not at risk.';

COMMENT ON COLUMN public.profiles.stripe_charges_enabled IS
  'Stripe charges_enabled. DIAGNOSTIC ONLY -- governs direct charges, which TradeStone does not use. Must gate nothing.';

COMMENT ON COLUMN public.profiles.stripe_disabled_reason IS
  'Stripe requirements.disabled_reason, for the contractor-facing banner.';

COMMENT ON COLUMN public.profiles.stripe_requirements_currently_due IS
  'Stripe requirements.currently_due, so the banner can state what is outstanding. Remediation account links are a separate slice.';

COMMENT ON COLUMN public.profiles.stripe_capabilities_event_created IS
  'event.created of the account.updated event that last wrote these columns. Stripe Account objects carry no update timestamp, so this is the only guard against a delayed event overwriting fresher state. Discard any event whose created is <= this value.';

-- The webhook resolves a profile from the Stripe account id on every
-- account.updated delivery. Unindexed today.
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_account_id
  ON public.profiles (stripe_account_id)
  WHERE stripe_account_id IS NOT NULL;