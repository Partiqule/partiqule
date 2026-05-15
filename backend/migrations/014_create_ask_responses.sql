-- Migration 014: ask_responses audit log for R5b.1 Ask mode.
--
-- One row per Ask request — success, refusal, rate-limit, or error.
-- The spot-check surface for hallucination audits per the trust
-- safeguards in partiqule-decision-log.md.
--
-- Backend uses the service role and bypasses RLS for all writes.
-- The self-read policy lets a future "your ask history" surface
-- query directly via the anon key without an admin shim.

CREATE TABLE ask_responses (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  query                     TEXT        NOT NULL,
  normalized_query          TEXT        NOT NULL,
  parsed_intent             JSONB,
  classification_confidence REAL,
  retrieved_product_ids     TEXT[],
  framing_outputs           JSONB,
  final_response            JSONB,
  duration_ms               INTEGER,
  error                     TEXT,
  cached_intent             BOOLEAN     NOT NULL DEFAULT FALSE,
  cached_framings           TEXT[],
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Newest-first spot-check queries.
CREATE INDEX idx_ask_responses_created
  ON ask_responses(created_at DESC);

-- Per-user audit lookups when a future history surface is built.
CREATE INDEX idx_ask_responses_user
  ON ask_responses(user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- Cache-hit analytics: cold paths cluster on cached_intent = false.
CREATE INDEX idx_ask_responses_cache
  ON ask_responses(cached_intent, created_at DESC);

ALTER TABLE ask_responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ask_responses_user_read" ON ask_responses
  FOR SELECT
  USING (user_id = auth.uid());
