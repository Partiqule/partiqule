-- Links an Apple subscription to one account, and records that the
-- account has used its one free score.
--
-- Run this in the Supabase SQL editor before the new Apple notification
-- handler can match a cancellation to a person. Until it runs, a verified
-- purchase still sets is_subscribed. Cancellations wait in Apple's retry
-- queue if the lookup column is missing (the server answers 503).
-- Existing paid rows are not changed by this statement.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS apple_original_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS free_score_used BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_apple_original_transaction_id_idx
  ON public.profiles (apple_original_transaction_id)
  WHERE apple_original_transaction_id IS NOT NULL;
