-- Migration 022 — ask_timing_telemetry table
-- Phase 2b session 5a (2026-05-27): permanent per-query timing telemetry
-- for the /ask composer pipeline. Backs the launch gate (p95 first-item
-- < 3s, p95 full-response < 8s, timeout rate < 2%) and the
-- /admin/ask-timing-stats endpoint.
--
-- Every /ask request writes exactly one row at terminal time (success,
-- refusal, error, or timeout). Best-effort write — failures don't break
-- the user-facing request.
--
-- RLS: admin emails (paul@partiqule.com, sara@partiqule.com) can read.
-- Service role bypasses RLS for inserts.

CREATE TABLE IF NOT EXISTS public.ask_timing_telemetry (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_id          TEXT         NOT NULL,
  query_type          TEXT         NOT NULL,       -- product | context | knowledge | unclear
  user_id             UUID         NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  pass1_ms            INTEGER      NULL,           -- Pass 1 intent classification
  pass1_5_ms          INTEGER      NULL,           -- Pass 1.5 refinement-question generation
  enriched_pass1_ms   INTEGER      NULL,           -- Re-run Pass 1 on enriched query (Path A leg 2)
  composer_ms         INTEGER      NULL,           -- Composer Sonnet call(s); null if cache hit or not run
  retries             INTEGER      NULL,           -- Composer ai_attempts
  cache_hits          INTEGER      NULL DEFAULT 0, -- Bundle/framing cache hits during the request
  cache_misses        INTEGER      NULL DEFAULT 0, -- Bundle/framing cache misses during the request
  first_item_ms       INTEGER      NULL,           -- request start → first user-visible payload (bundle / item / knowledge)
  total_ms            INTEGER      NOT NULL,       -- request start → terminal event
  status              TEXT         NOT NULL        -- ok | timeout | refused | error
);

CREATE INDEX IF NOT EXISTS idx_ask_timing_created_at
  ON public.ask_timing_telemetry (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ask_timing_status
  ON public.ask_timing_telemetry (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ask_timing_query_type
  ON public.ask_timing_telemetry (query_type, created_at DESC);

ALTER TABLE public.ask_timing_telemetry ENABLE ROW LEVEL SECURITY;

-- Admin read access for the stats endpoint when called via authed JWT.
-- The endpoint also accepts an admin key path that uses the service
-- role client, bypassing RLS entirely.
CREATE POLICY ask_timing_admin_read
  ON public.ask_timing_telemetry
  FOR SELECT
  USING (auth.jwt() ->> 'email' IN ('paul@partiqule.com', 'sara@partiqule.com'));
