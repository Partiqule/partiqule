-- Migration 023 — composer per-attempt timings + refinement parent linkage
-- Phase 2b session 5b (2026-06-01).
--
-- NOTE on naming: the session spec called this "per-product timings", but the
-- composer is a SINGLE bundle-composition call (+ sequential voice-gate
-- retries), not N parallel per-product calls. The meaningful granularity is
-- therefore PER ATTEMPT (the call plus each voice-gate/structure retry), which
-- is what we capture here. This directly answers "does the Haiku swap trigger
-- more retries?" — each retry is a full additional model call.
--
-- composer_attempt_timings shape (jsonb array, one entry per AI attempt):
--   [{ "attempt": 1, "model": "claude-haiku-4-5-20251001", "ms": 4200,
--      "status": "voice_gate_retry", "retry_reason": "voice_gate:first_person" },
--    { "attempt": 2, "model": "claude-haiku-4-5-20251001", "ms": 3800,
--      "status": "ok", "retry_reason": null }]
--   status ∈ ok | voice_gate_retry | voice_gate_fail | error
-- Null for fast-path / cache-hit queries where the composer doesn't run.
--
-- parent_request_id (Part 2 — refinement two-row dedupe):
--   /ask writes a row with parent_request_id NULL. /ask/refinement_answer writes
--   a row whose parent_request_id = the originating /ask request_id (looked up
--   from the conversation). /admin/ask-timing-stats rolls child rows up into
--   the parent so a refinement query counts ONCE in percentile math.

ALTER TABLE public.ask_timing_telemetry
  ADD COLUMN IF NOT EXISTS composer_attempt_timings jsonb NULL,
  ADD COLUMN IF NOT EXISTS parent_request_id        text  NULL;

CREATE INDEX IF NOT EXISTS idx_ask_timing_parent
  ON public.ask_timing_telemetry (parent_request_id)
  WHERE parent_request_id IS NOT NULL;
