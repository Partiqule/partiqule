-- Migration 018: composer audit columns on ask_responses for R5b.3 v2.
--
-- R5b.3 v2 replaces the v1 category-slot bundle with a personalized
-- composer that takes a constrained pool plus user scan history and
-- groups items by relationship (Keep / Swap / Add / Worth knowing /
-- Worth scanning). The composer is wrapped by ask.js for SSE today
-- and by R6 / share extension later.
--
-- These columns measure per request: hallucination rate (dropped_ids),
-- voice gate trigger rate (voice_gate_failures), fallback rate
-- (composition_source), pool coverage (pool_size, pool_ids), section
-- shape that actually shipped (final_section_types, final_product_ids),
-- and personalization signal strength (scan_history_size, ai_attempts).
--
-- Additive change. Existing rows have NULL values in the new columns.
-- All composer fires populate these; non-composer rows leave them NULL.

ALTER TABLE ask_responses
  ADD COLUMN IF NOT EXISTS pool_size            INTEGER,
  ADD COLUMN IF NOT EXISTS pool_ids             TEXT[],
  ADD COLUMN IF NOT EXISTS scan_history_size    INTEGER,
  ADD COLUMN IF NOT EXISTS ai_attempts          INTEGER,
  ADD COLUMN IF NOT EXISTS voice_gate_failures  TEXT[],
  ADD COLUMN IF NOT EXISTS dropped_ids          TEXT[],
  ADD COLUMN IF NOT EXISTS final_section_types  TEXT[],
  ADD COLUMN IF NOT EXISTS final_product_ids    TEXT[],
  ADD COLUMN IF NOT EXISTS composition_source   TEXT;

-- Composition-source-keyed analytics: fallback rate over time, by
-- context, by user. Partial index keeps it cheap since the majority
-- of historical rows are type 1 / type 2 (composition_source NULL).
CREATE INDEX IF NOT EXISTS idx_ask_responses_composition_source
  ON ask_responses(composition_source, created_at DESC)
  WHERE composition_source IS NOT NULL;

-- Voice-gate drilldown: which gates fire most. GIN over the array
-- so queries like `WHERE 'first_person' = ANY(voice_gate_failures)`
-- scan the index instead of the table.
CREATE INDEX IF NOT EXISTS idx_ask_responses_voice_gate
  ON ask_responses USING GIN (voice_gate_failures)
  WHERE voice_gate_failures IS NOT NULL;
