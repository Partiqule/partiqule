-- Migration 017: context columns on ask_responses for R5b.3 type 3 audit.
--
-- Type 3 (context bundle) queries land here. context_id captures which
-- backend/contexts.js entry resolved the query. context_categories
-- captures the slugs of every category surfaced in the bundle so spot
-- checks can reconstruct which slots produced products vs went sparse.
--
-- retrieved_product_ids continues to capture all surfaced calibration
-- keys (concatenated across categories for type 3 responses).
--
-- Additive change. Existing rows have NULL values in the new columns.

ALTER TABLE ask_responses
  ADD COLUMN IF NOT EXISTS context_id          TEXT,
  ADD COLUMN IF NOT EXISTS context_categories  TEXT[];

-- Spot-check index for context-specific audit queries. Partial index
-- since most rows (product / knowledge / refusal) have no context_id.
CREATE INDEX IF NOT EXISTS idx_ask_responses_context
  ON ask_responses(context_id, created_at DESC)
  WHERE context_id IS NOT NULL;
