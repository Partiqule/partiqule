-- Adds webhook-fed subscription state columns to profiles. These are the
-- read source for getSubscriptionState() and the new trial-based enforceScanGate.
-- The Stripe webhook writes status + trial_ends_at on subscription events,
-- and /apple-iap-confirm writes the same fields when an iOS receipt lands.
--
-- Why on profiles instead of a separate table: the webhook already updates
-- profiles.is_subscribed in place, this is a continuation of that pattern.
-- One row per user, no joins.
--
-- subscription_status values mirror Stripe enum: trialing, active, canceled,
-- past_due, incomplete, incomplete_expired, unpaid. NULL means "never had
-- a subscription" (the default for fresh signups).
--
-- trial_ends_at is set only while status='trialing'. Once the trial converts
-- to active, the column is cleared. Frontend reads this to render the
-- "Trial: N days remaining" line in Profile/Settings.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS subscription_status TEXT,
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ;
