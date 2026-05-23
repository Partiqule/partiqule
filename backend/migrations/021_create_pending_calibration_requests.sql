-- Migration 021 — pending_calibration_requests table
-- Hotfix 2026-05-23: backs the /api/calibration-queue endpoint that
-- collects user-submitted product info when the scoring path returns
-- status="pending_calibration" (Tier 5 generic fallback gate).
--
-- Sara/Paul review these manually and turn high-signal entries into
-- calibration registry entries.
--
-- RLS: service role only — frontend writes via backend endpoint, no
-- direct anon writes.

CREATE TABLE IF NOT EXISTS public.pending_calibration_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id         UUID         NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  product_name    TEXT         NULL,
  product_image_url TEXT       NULL,
  ingredient_text TEXT         NULL,
  product_url     TEXT         NULL,
  notes           TEXT         NULL,
  reviewed        BOOLEAN      NOT NULL DEFAULT FALSE,
  reviewed_at     TIMESTAMPTZ  NULL
);

CREATE INDEX IF NOT EXISTS idx_pending_cal_created_at
  ON public.pending_calibration_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pending_cal_unreviewed
  ON public.pending_calibration_requests (created_at DESC)
  WHERE reviewed = FALSE;

ALTER TABLE public.pending_calibration_requests ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS; this policy is for any future admin
-- dashboard access via authed JWT.
CREATE POLICY pending_cal_admin_read
  ON public.pending_calibration_requests
  FOR SELECT
  USING (auth.jwt() ->> 'email' IN ('paul@partiqule.com', 'sara@partiqule.com'));
