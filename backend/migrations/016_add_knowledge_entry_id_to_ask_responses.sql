-- Migration 016: knowledge_entry_id column on ask_responses for R5b.2.
--
-- The Ask mode type 2 path (knowledge questions like "what is PFAS?")
-- looks up a curated entry from backend/knowledge.js and frames it
-- into voice. The audit log captures which entry was retrieved so
-- spot-checks can correlate framing output to the curated source.
--
-- The existing retrieved_product_ids column continues to carry the
-- intersected scan IDs for type 2 (the user's home matches) — same
-- semantic as type 1's retrieved products, just a different retrieval
-- reason. No schema change there.
--
-- Note: the planned migration number 015 was taken by the
-- handle_new_user search_path fix shipped on 2026-05-14. Using 016.

ALTER TABLE ask_responses
  ADD COLUMN IF NOT EXISTS knowledge_entry_id TEXT;

-- Knowledge-entry-keyed audit lookups: which entries are being asked
-- about, how often, with what framing latency. Partial index keeps
-- it cheap when most rows are type 1 (no knowledge entry).
CREATE INDEX IF NOT EXISTS idx_ask_responses_knowledge_entry
  ON ask_responses(knowledge_entry_id, created_at DESC)
  WHERE knowledge_entry_id IS NOT NULL;
