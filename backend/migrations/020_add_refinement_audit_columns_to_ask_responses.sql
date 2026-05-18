-- Migration 020: refinement audit columns on ask_responses for R5b.3 Phase 2a.
--
-- These columns measure refinement adoption per request so the "Will revisit
-- if" trigger from the May 17, 2026 architecture decision is observable:
-- adoption under 20% of eligible queries OR skip rate over 70% would trigger
-- a deferral consideration. Plot weekly.
--
-- refinement_fired         — true when Pass 1 set needs_refinement and the
--                            refinement turn actually executed (Phase 2a
--                            wires the boolean; until Pass 1.5 ships in
--                            session 2 the column will only ever be false
--                            since the refinement turn never runs).
-- refinement_questions_count — number of questions Pass 1.5 generated for
--                            the refinement round (nullable; null when no
--                            refinement).
-- refinement_answered_count — number of questions the user actually
--                            answered (skips excluded; nullable).
-- refinement_skipped_count  — number of questions the user explicitly
--                            skipped (nullable). answered + skipped equals
--                            questions_count when the user completed the
--                            round; can be less when the user navigated
--                            away mid-refinement.
-- dynamic_query            — Phase 2b populates this when the query was
--                            handled via dynamic context expansion rather
--                            than templated context match. Phase 2a leaves
--                            this default false on every row.
--
-- Additive change. Existing rows have default false on the booleans and
-- NULL on the integers. No backfill required.

ALTER TABLE ask_responses
  ADD COLUMN IF NOT EXISTS refinement_fired           BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS refinement_questions_count INTEGER,
  ADD COLUMN IF NOT EXISTS refinement_answered_count  INTEGER,
  ADD COLUMN IF NOT EXISTS refinement_skipped_count   INTEGER,
  ADD COLUMN IF NOT EXISTS dynamic_query              BOOLEAN NOT NULL DEFAULT FALSE;

-- Adoption analytics index. Partial keeps it cheap since most rows
-- (pre-Phase 2a and non-refinement Phase 2a+ rows) have refinement_fired
-- false.
CREATE INDEX IF NOT EXISTS idx_ask_responses_refinement_fired
  ON ask_responses(refinement_fired, created_at DESC)
  WHERE refinement_fired = TRUE;

-- Dynamic query analytics index. Same partial pattern. Populated by
-- Phase 2b; index lives now to avoid a schema change at 2b ship.
CREATE INDEX IF NOT EXISTS idx_ask_responses_dynamic_query
  ON ask_responses(dynamic_query, created_at DESC)
  WHERE dynamic_query = TRUE;
